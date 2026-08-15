import { useState } from 'react';

/**
 * ESP32ScaleConnector — Digital readout and live controller component for
 * ESP32 Auto Weighing Machine integration.
 */
export default function ESP32ScaleConnector({ scale }) {
  const [showConfig, setShowConfig] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const {
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
    autoCapture,
    setAutoCapture,
    logs,
    connect,
    disconnect,
    tareScale,
    zeroScale,
    simulateWeight,
    triggerManualCapture,
  } = scale;

  return (
    <div
      className="rounded-[16px] p-5 shadow-card relative overflow-hidden transition-all"
      style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        color: '#FFFFFF',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-700/60 pb-3 mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-lg"
            style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA' }}
          >
            ⚖️
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-wide flex items-center gap-2">
              ESP32 Auto Weighing Machine
              <span
                className="text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase"
                style={{
                  background:
                    status === 'connected'
                      ? 'rgba(16, 185, 129, 0.2)'
                      : status === 'connecting'
                      ? 'rgba(245, 158, 11, 0.2)'
                      : 'rgba(239, 68, 68, 0.2)',
                  color:
                    status === 'connected'
                      ? '#34D399'
                      : status === 'connecting'
                      ? '#FBBF24'
                      : '#F87171',
                  border: `1px solid ${
                    status === 'connected'
                      ? '#10B981'
                      : status === 'connecting'
                      ? '#F59E0B'
                      : '#EF4444'
                  }`,
                }}
              >
                ● {status}
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Mode: <span className="text-slate-200 capitalize">{connectionMode}</span>
              {connectionMode === 'websocket' && ` (${ipAddress}:${port})`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 transition"
          >
            ⚙️ Config
          </button>
          <button
            type="button"
            onClick={() => setShowLogs(!showLogs)}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 transition"
          >
            📋 Logs
          </button>
        </div>
      </div>

      {/* Config Drawer */}
      {showConfig && (
        <div className="mb-4 p-4 rounded-xl bg-slate-900/90 border border-slate-700 space-y-3">
          <p className="text-xs font-bold text-slate-300">Select ESP32 Connection Mode:</p>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'simulator', label: 'Simulator', icon: '🎮' },
              { id: 'websocket', label: 'WiFi (WS)', icon: '📶' },
              { id: 'serial', label: 'USB Serial', icon: '🔌' },
              { id: 'bluetooth', label: 'Bluetooth', icon: '📡' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => connect(m.id)}
                className={`py-2 px-1 rounded-lg border text-center transition flex flex-col items-center gap-1 ${
                  connectionMode === m.id
                    ? 'bg-blue-600/30 border-blue-500 text-blue-300 font-bold'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="text-base">{m.icon}</span>
                <span className="text-[10px]">{m.label}</span>
              </button>
            ))}
          </div>

          {connectionMode === 'websocket' && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
              <div className="col-span-2">
                <label className="text-[10px] text-slate-400 block mb-1">ESP32 IP Address</label>
                <input
                  type="text"
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  placeholder="e.g. 192.168.4.1"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Port</label>
                <input
                  type="text"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="81"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <button
                type="button"
                onClick={() => connect('websocket', { ip: ipAddress, port })}
                className="col-span-3 mt-1 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold text-white transition"
              >
                Connect WebSocket
              </button>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={autoCapture}
                onChange={(e) => setAutoCapture(e.target.checked)}
                className="w-4 h-4 accent-blue-500"
              />
              Auto-add weight row when scale is stable (&gt; 1.2s)
            </label>
            {status === 'connected' ? (
              <button
                type="button"
                onClick={disconnect}
                className="text-xs px-3 py-1 bg-red-600/30 text-red-300 border border-red-500 rounded-lg font-bold hover:bg-red-600/50"
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={() => connect(connectionMode)}
                className="text-xs px-3 py-1 bg-emerald-600/30 text-emerald-300 border border-emerald-500 rounded-lg font-bold hover:bg-emerald-600/50"
              >
                Connect
              </button>
            )}
          </div>
        </div>
      )}

      {/* Logs Drawer */}
      {showLogs && (
        <div className="mb-4 p-3 rounded-xl bg-slate-950 border border-slate-800 max-h-36 overflow-y-auto font-mono text-[10px] text-slate-400 space-y-1">
          {logs.length === 0 ? (
            <p>No activity logs yet.</p>
          ) : (
            logs.map((l, idx) => (
              <div key={idx} className="border-b border-slate-900 pb-0.5">
                {l}
              </div>
            ))
          )}
        </div>
      )}

      {/* Main Digital Scale Display */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* LED Weight Readout */}
        <div className="md:col-span-7 bg-slate-950/80 rounded-2xl p-4 border border-slate-800 flex items-center justify-between relative overflow-hidden">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-1">
              NET WEIGHT
            </span>
            <div className="flex items-baseline gap-2">
              <span
                className="text-4xl md:text-5xl font-black font-mono tracking-tight"
                style={{
                  color: isStable ? '#34D399' : '#FBBF24',
                  textShadow: isStable
                    ? '0 0 20px rgba(52, 211, 153, 0.4)'
                    : '0 0 20px rgba(251, 191, 36, 0.4)',
                }}
              >
                {netWeight.toFixed(2)}
              </span>
              <span className="text-sm font-bold text-slate-400">KG</span>
            </div>
            {tareWeight > 0 && (
              <span className="text-[10px] text-slate-400 block mt-1">
                Gross: {liveWeight.toFixed(2)} KG | Tare: -{tareWeight.toFixed(2)} KG
              </span>
            )}
          </div>

          {/* Stability & Capture Badge */}
          <div className="flex flex-col items-end gap-2">
            <span
              className="text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5"
              style={{
                background: isStable ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                color: isStable ? '#34D399' : '#FBBF24',
                border: `1px solid ${isStable ? '#10B981' : '#F59E0B'}`,
              }}
            >
              {isStable ? '✓ STABLE' : '⏳ WEIGHING'}
            </span>

            <button
              type="button"
              disabled={netWeight <= 0}
              onClick={triggerManualCapture}
              className="px-3 py-1.5 rounded-xl text-xs font-extrabold transition shadow-lg flex items-center gap-1"
              style={{
                background:
                  netWeight > 0
                    ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                    : 'rgba(255,255,255,0.1)',
                color: netWeight > 0 ? '#FFFFFF' : '#94A3B8',
              }}
            >
              ➕ Capture Weight
            </button>
          </div>
        </div>

        {/* Quick Scale Action Controls */}
        <div className="md:col-span-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={tareScale}
            className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition flex flex-col items-center gap-1"
          >
            <span>⚖️ TARE</span>
            <span className="text-[10px] text-slate-400 font-normal">Deduct Crate Box</span>
          </button>

          <button
            type="button"
            onClick={zeroScale}
            className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition flex flex-col items-center gap-1"
          >
            <span>0️⃣ ZERO</span>
            <span className="text-[10px] text-slate-400 font-normal">Reset Calibration</span>
          </button>
        </div>
      </div>

      {/* Simulator helper buttons (Only when in simulator or test mode) */}
      {connectionMode === 'simulator' && (
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-[11px] text-slate-400 font-semibold">
            <span>🎮 Test Simulator:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: 'Crate (22.50 kg)', kg: 22.5 },
              { label: 'Basket (25.00 kg)', kg: 25.0 },
              { label: 'Heavy Basket (28.40 kg)', kg: 28.4 },
            ].map((btn, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => simulateWeight(btn.kg)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-700/60 font-semibold transition"
              >
                + {btn.label}
              </button>
            ))}
            <button
              type="button"
              onClick={zeroScale}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200"
            >
              Clear Basket
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
