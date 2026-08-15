import React, { useState, useRef, useEffect } from 'react';

export default function CameraCapture({ mode = 'photo', onCapture, onCancel }) {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const chunksRef = useRef([]);

  useEffect(() => {
    let activeStream = null;
    const startCamera = async () => {
      try {
        const constraints = {
          video: { facingMode: 'environment' },
          audio: mode === 'video'
        };
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = s;
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      } catch (err) {
        console.error('Camera error:', err);
        setError('Camera permission denied or camera not available. Please allow camera access in your browser.');
      }
    };
    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [mode]);

  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    onCapture(dataUrl);
  };

  const startRecording = () => {
    if (!stream) return;
    chunksRef.current = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'video/mp4' });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        onCapture(reader.result);
      };
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-[12px] border border-red-200 space-y-4 shadow-inner">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📷</span>
          <span className="font-bold text-sm leading-snug">{error}</span>
        </div>
        <button type="button" onClick={onCancel} className="btn-ghost w-full text-xs font-black p-3 text-red-800 bg-red-100 rounded-lg hover:bg-red-200 transition">
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="relative rounded-[12px] overflow-hidden bg-black aspect-video flex flex-col justify-center shadow-lg border border-slate-300">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={mode === 'photo' || isRecording}
        className="w-full h-full object-cover"
      />
      
      {isRecording && (
        <div className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1.5 rounded-full text-[10px] font-black flex items-center gap-2 animate-pulse shadow-md tracking-wider">
          <div className="w-2 h-2 bg-white rounded-full"></div>
          {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
        </div>
      )}

      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
        <button 
          type="button"
          onClick={onCancel}
          className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white px-5 py-2.5 rounded-full font-bold text-xs transition border border-white/20"
        >
          Cancel
        </button>

        {mode === 'photo' ? (
          <button 
            type="button"
            onClick={capturePhoto}
            className="bg-white hover:bg-slate-200 text-black px-6 py-2.5 rounded-full font-black text-sm shadow-xl transition active:scale-95 flex items-center gap-2"
          >
            <span className="text-lg">📸</span> Capture
          </button>
        ) : (
          !isRecording ? (
            <button 
              type="button"
              onClick={startRecording}
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-2.5 rounded-full font-black text-sm shadow-xl transition active:scale-95 flex items-center gap-2"
            >
              <div className="w-3 h-3 bg-white rounded-full"></div> Record
            </button>
          ) : (
            <button 
              type="button"
              onClick={stopRecording}
              className="bg-white hover:bg-slate-200 text-red-600 px-6 py-2.5 rounded-full font-black text-sm shadow-xl transition active:scale-95 flex items-center gap-2"
            >
              <div className="w-3 h-3 bg-red-600 rounded-sm"></div> Stop
            </button>
          )
        )}
      </div>
    </div>
  );
}
