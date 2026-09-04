import { useEffect, useRef, useState } from 'react';

/**
 * Lightweight camera capture for packing / van-plan photo & video evidence.
 * Props: mode = 'photo' | 'video', onCapture(dataUrl), onCancel()
 */
export default function CameraCapture({ mode = 'photo', onCapture, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: mode === 'video',
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        setError(err?.message || 'Camera access denied');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [mode]);

  function capturePhoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture?.(canvas.toDataURL('image/jpeg', 0.85));
  }

  function startVideo() {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const rec = new MediaRecorder(stream);
    recorderRef.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const reader = new FileReader();
      reader.onloadend = () => onCapture?.(reader.result);
      reader.readAsDataURL(blob);
    };
    rec.start();
    setRecording(true);
  }

  function stopVideo() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <div className="space-y-3 p-3 rounded-[12px] border" style={{ borderColor: 'var(--color-border)' }}>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-64 rounded-[12px] bg-slate-900" />
      )}
      <div className="flex gap-2">
        {mode === 'photo' ? (
          <button type="button" className="btn-primary flex-1" onClick={capturePhoto} disabled={!!error}>
            Capture Photo
          </button>
        ) : recording ? (
          <button type="button" className="btn-primary flex-1" onClick={stopVideo}>
            Stop Recording
          </button>
        ) : (
          <button type="button" className="btn-primary flex-1" onClick={startVideo} disabled={!!error}>
            Start Video
          </button>
        )}
        <button type="button" className="btn-ghost flex-1" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
