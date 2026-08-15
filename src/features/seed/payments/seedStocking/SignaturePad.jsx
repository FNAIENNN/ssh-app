import { useRef, useEffect, useState, useCallback } from 'react';

export default function SignaturePad({ onSave, value = null, readOnly = false }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokeHistory, setStrokeHistory] = useState([]);
  const [currentStroke, setCurrentStroke] = useState([]);

  // Draw full history on canvas
  const redrawCanvas = useCallback((history) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';

    history.forEach((stroke) => {
      if (stroke.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      ctx.stroke();
    });
  }, []);

  // Sync internal canvas size with container element's bounding rect for pixel-perfect precision
  const syncCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      // Set actual pixel dimensions to match display dimensions
      canvas.width = Math.floor(rect.width);
      canvas.height = Math.floor(rect.height || 160);
      redrawCanvas(strokeHistory);
    }
  }, [redrawCanvas, strokeHistory]);

  useEffect(() => {
    syncCanvasDimensions();
    window.addEventListener('resize', syncCanvasDimensions);
    return () => window.removeEventListener('resize', syncCanvasDimensions);
  }, [syncCanvasDimensions]);

  // Initialize canvas / pre-fill if value passed
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';

    if (value && strokeHistory.length === 0) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = value;
    }
  }, [value]);

  function getPos(e) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Scale mouse/touch coordinates accurately to internal canvas pixel coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function startDrawing(e) {
    if (readOnly) return;
    if (e.touches) e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
    setCurrentStroke([pos]);
  }

  function draw(e) {
    if (!isDrawing || readOnly) return;
    if (e.touches) e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setCurrentStroke((prev) => [...prev, pos]);
  }

  function stopDrawing(e) {
    if (!isDrawing || readOnly) return;
    if (e?.touches) e.preventDefault();
    setIsDrawing(false);
    if (currentStroke.length > 0) {
      const nextHistory = [...strokeHistory, currentStroke];
      setStrokeHistory(nextHistory);
      setCurrentStroke([]);
      if (canvasRef.current && onSave) {
        onSave(canvasRef.current.toDataURL('image/png'));
      }
    }
  }

  // Requirement #2: Undo removes only the last stroke drawn
  function handleUndo() {
    if (readOnly || strokeHistory.length === 0) return;
    const nextHistory = strokeHistory.slice(0, -1);
    setStrokeHistory(nextHistory);
    redrawCanvas(nextHistory);

    if (canvasRef.current && onSave) {
      if (nextHistory.length === 0) {
        onSave(null);
      } else {
        onSave(canvasRef.current.toDataURL('image/png'));
      }
    }
  }

  // Requirement #2: Erase/Clear clears the entire signature
  function handleClear() {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokeHistory([]);
    setCurrentStroke([]);
    if (onSave) onSave(null);
  }

  const hasDrawn = strokeHistory.length > 0 || Boolean(value);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="border-2 border-dashed rounded-[12px] bg-white overflow-hidden relative"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-[160px] touch-none cursor-crosshair block"
        />
        {!hasDrawn && !readOnly && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-text-muted text-xs font-semibold">
            ✍️ Draw supervisor signature here (mouse or touch)
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="flex items-center justify-end gap-2">
          {/* Requirement #2: Undo Button */}
          <button
            type="button"
            onClick={handleUndo}
            disabled={strokeHistory.length === 0}
            className="btn-ghost text-xs font-bold py-1 px-3 border rounded-[8px] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--color-border)', color: '#000000' }}
          >
            <span>↩️</span> Undo Last Stroke
          </button>

          {/* Requirement #2: Erase/Clear Button */}
          <button
            type="button"
            onClick={handleClear}
            disabled={!hasDrawn}
            className="btn-ghost text-xs font-bold py-1 px-3 border rounded-[8px] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--color-border)', color: '#000000' }}
          >
            <span>🗑️</span> Erase / Clear All
          </button>
        </div>
      )}
    </div>
  );
}
