import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useESP32Scale — Real-time hook for connecting to an ESP32-based Auto Weighing Machine.
 * Supports:
 *   1. WebSocket (ws://ip:port or http stream)
 *   2. Web Serial API (Chrome USB CP2102/CH340 serial connection)
 *   3. Web Bluetooth API (BLE GATT scale device)
 *   4. Built-in ESP32 Simulator (works out-of-the-box in browser test mode)
 */
export function useESP32Scale(onWeightCaptured = null) {
  const [status, setStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'connected' | 'error'
  const [connectionMode, setConnectionMode] = useState('simulator'); // 'simulator' | 'websocket' | 'serial' | 'bluetooth'
  const [ipAddress, setIpAddress] = useState('192.168.4.1');
  const [port, setPort] = useState('81');

  const [liveWeight, setLiveWeight] = useState(0);
  const [isStable, setIsStable] = useState(false);
  const [tareWeight, setTareWeight] = useState(0);
  const [unit, setUnit] = useState('KG');
  const [autoCapture, setAutoCapture] = useState(true);
  const [lastCapturedWeight, setLastCapturedWeight] = useState(null);
  const [logs, setLogs] = useState([]);

  const wsRef = useRef(null);
  const serialPortRef = useRef(null);
  const serialReaderRef = useRef(null);
  const bleDeviceRef = useRef(null);
  const simIntervalRef = useRef(null);
  const stableTimerRef = useRef(null);
  const autoCaptureTriggeredRef = useRef(false);

  const addLog = useCallback((msg) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 19)]);
  }, []);

  // Net weight calculated live
  const netWeight = Math.max(0, Math.round((liveWeight - tareWeight) * 100) / 100);

  // Auto capture logic when weight becomes stable
  useEffect(() => {
    if (!autoCapture || !isStable || netWeight <= 0 || status !== 'connected') {
      autoCaptureTriggeredRef.current = false;
      return;
    }

    if (autoCaptureTriggeredRef.current) return;

    stableTimerRef.current = setTimeout(() => {
      if (isStable && netWeight > 0 && !autoCaptureTriggeredRef.current) {
        autoCaptureTriggeredRef.current = true;
        setLastCapturedWeight(netWeight);
        addLog(`Auto captured weight: ${netWeight} KG`);
        onWeightCaptured?.(netWeight);
      }
    }, 1200);

    return () => {
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
    };
  }, [isStable, netWeight, autoCapture, status, onWeightCaptured, addLog]);

  // Clean up all connections on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  const disconnect = useCallback(() => {
    if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    if (serialReaderRef.current) {
      try { serialReaderRef.current.cancel(); } catch {}
      serialReaderRef.current = null;
    }
    if (serialPortRef.current) {
      try { serialPortRef.current.close(); } catch {}
      serialPortRef.current = null;
    }
    if (bleDeviceRef.current && bleDeviceRef.current.gatt.connected) {
      try { bleDeviceRef.current.gatt.disconnect(); } catch {}
      bleDeviceRef.current = null;
    }
    setStatus('disconnected');
    setIsStable(false);
    addLog('Scale disconnected');
  }, [addLog]);

  // Connect to ESP32 Simulator
  const connectSimulator = useCallback(() => {
    disconnect();
    setStatus('connecting');
    addLog('Connecting to ESP32 Scale Simulator...');

    setTimeout(() => {
      setStatus('connected');
      addLog('Connected to ESP32 Scale Simulator (Ready)');
      setLiveWeight(0);
      setIsStable(true);

      // Simulates minor scale noise when weight is on
      simIntervalRef.current = setInterval(() => {
        setLiveWeight((prev) => {
          if (prev <= 0) return 0;
          // random minor noise ± 0.05
          const noise = (Math.random() - 0.5) * 0.04;
          return Math.max(0, Math.round((prev + noise) * 100) / 100);
        });
      }, 500);
    }, 600);
  }, [disconnect, addLog]);

  // Connect via WebSocket
  const connectWebSocket = useCallback((targetIp = ipAddress, targetPort = port) => {
    disconnect();
    setStatus('connecting');
    const wsUrl = `ws://${targetIp}:${targetPort}`;
    addLog(`Connecting to ESP32 WebSocket: ${wsUrl}`);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        addLog(`Connected to ESP32 scale at ${wsUrl}`);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.weight !== undefined) {
            setLiveWeight(Number(data.weight) || 0);
            setIsStable(Boolean(data.stable ?? true));
          }
        } catch {
          // Parse raw text like "25.40 KG STABLE"
          const match = String(event.data).match(/([\d.]+)/);
          if (match) {
            setLiveWeight(Number(match[1]));
            setIsStable(event.data.toLowerCase().includes('stable'));
          }
        }
      };

      ws.onerror = (err) => {
        addLog(`WebSocket error: ${err.message || 'Connection failed'}`);
        setStatus('error');
      };

      ws.onclose = () => {
        addLog('WebSocket connection closed');
        setStatus('disconnected');
      };
    } catch (err) {
      addLog(`Failed to create WebSocket: ${err.message}`);
      setStatus('error');
    }
  }, [disconnect, ipAddress, port, addLog]);

  // Connect via Web Serial (USB)
  const connectSerial = useCallback(async () => {
    if (!('serial' in navigator)) {
      addLog('Web Serial API is not supported in this browser (Use Chrome or Edge)');
      setStatus('error');
      return;
    }
    disconnect();
    setStatus('connecting');
    try {
      const portObj = await navigator.serial.requestPort();
      await portObj.open({ baudRate: 115200 });
      serialPortRef.current = portObj;
      setStatus('connected');
      addLog('ESP32 Serial scale connected');

      const decoder = new TextDecoderStream();
      portObj.readable.pipeTo(decoder.writable);
      const reader = decoder.readable.getReader();
      serialReaderRef.current = reader;

      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep partial line
          for (const line of lines) {
            const match = line.match(/([\d.]+)/);
            if (match) {
              setLiveWeight(Number(match[1]));
              setIsStable(line.toLowerCase().includes('stable') || !line.toLowerCase().includes('unstable'));
            }
          }
        }
      }
    } catch (err) {
      addLog(`Serial connection error: ${err.message}`);
      setStatus('error');
    }
  }, [disconnect, addLog]);

  // Connect via Web Bluetooth (BLE)
  const connectBluetooth = useCallback(async () => {
    if (!('bluetooth' in navigator)) {
      addLog('Web Bluetooth API is not supported in this browser');
      setStatus('error');
      return;
    }
    disconnect();
    setStatus('connecting');
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['0000181d-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455'],
      });
      bleDeviceRef.current = device;
      const server = await device.gatt.connect();
      setStatus('connected');
      addLog(`Bluetooth scale connected: ${device.name || 'ESP32 Scale'}`);
    } catch (err) {
      addLog(`Bluetooth error: ${err.message}`);
      setStatus('error');
    }
  }, [disconnect, addLog]);

  // Master Connect function
  const connect = useCallback((mode = connectionMode, opts = {}) => {
    setConnectionMode(mode);
    if (mode === 'simulator') connectSimulator();
    else if (mode === 'websocket') connectWebSocket(opts.ip || ipAddress, opts.port || port);
    else if (mode === 'serial') connectSerial();
    else if (mode === 'bluetooth') connectBluetooth();
  }, [connectionMode, connectSimulator, connectWebSocket, connectSerial, connectBluetooth, ipAddress, port]);

  // Actions
  const tareScale = useCallback(() => {
    setTareWeight(liveWeight);
    addLog(`Tare set to ${liveWeight} KG`);
  }, [liveWeight, addLog]);

  const zeroScale = useCallback(() => {
    setLiveWeight(0);
    setTareWeight(0);
    setIsStable(true);
    addLog('Scale zeroed');
  }, [addLog]);

  const simulateWeight = useCallback((weightKgs) => {
    setIsStable(false);
    setLiveWeight(weightKgs);
    addLog(`Placed basket on scale (${weightKgs} KG)`);
    // Settle scale after 1 second
    setTimeout(() => {
      setIsStable(true);
      addLog(`Scale settled at ${weightKgs} KG (STABLE)`);
    }, 1000);
  }, [addLog]);

  const triggerManualCapture = useCallback(() => {
    if (netWeight <= 0) return;
    setLastCapturedWeight(netWeight);
    addLog(`Manually captured weight: ${netWeight} KG`);
    onWeightCaptured?.(netWeight);
  }, [netWeight, onWeightCaptured, addLog]);

  return {
    status,
    connectionMode,
    ipAddress,
    setIpAddress,
    port,
    setPort,
    liveWeight,
    netWeight,
    tareWeight,
    isStable,
    unit,
    autoCapture,
    setAutoCapture,
    lastCapturedWeight,
    logs,
    connect,
    disconnect,
    tareScale,
    zeroScale,
    simulateWeight,
    triggerManualCapture,
  };
}
