import { useEffect, useState } from 'react';
import { LogoMark } from './LogoMark';

/**
 * Cinematic splash screen with pulsing logo, wordmark reveal,
 * and a glowing progress bar. Fades out gracefully when done.
 */
export default function Splash({ onDone, duration = 2400 }) {
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      // Ease-out progress curve for a natural feel
      const raw = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - raw, 3);
      setProgress(eased * 100);

      if (elapsed >= duration) {
        clearInterval(tick);
        setLeaving(true);
        setTimeout(() => {
          setVisible(false);
          onDone?.();
        }, 400);
      }
    }, 32);
    return () => clearInterval(tick);
  }, [duration, onDone]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity duration-400 overflow-hidden"
      style={{
        opacity: leaving ? 0 : 1,
        background:
          'linear-gradient(150deg, #080E1A 0%, #0F1B30 30%, #0A1628 60%, #060D18 100%)',
      }}
    >
      {/* Ambient glow behind logo */}
      <div
        aria-hidden="true"
        className="absolute rounded-full blur-3xl"
        style={{
          width: 320,
          height: 320,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -55%)',
          background:
            'radial-gradient(circle, rgba(233,69,96,0.18) 0%, rgba(233,69,96,0.04) 45%, transparent 70%)',
        }}
      />

      {/* Logo with heartbeat pulse */}
      <div
        className="relative z-10"
        style={{
          animation: 'splashPulse 2.2s ease-in-out infinite',
        }}
      >
        <LogoMark size={88} />
      </div>

      {/* Wordmark */}
      <h1
        className="mt-6 text-[2.6rem] font-extrabold text-white relative z-10 select-none"
        style={{ letterSpacing: '0.35em' }}
      >
        AQUA
      </h1>
      <p
        className="mt-2 text-[11px] uppercase relative z-10 select-none"
        style={{ letterSpacing: '0.4em', color: 'rgba(255,255,255,0.35)' }}
      >
        SSH Management
      </p>

      {/* Glowing progress track */}
      <div
        className="mt-14 relative z-10"
        style={{
          width: 240,
          height: 4,
          borderRadius: 'var(--radius-full)',
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: 'var(--radius-full)',
            width: `${progress}%`,
            background:
              'linear-gradient(90deg, #E94560 0%, #ff6b8a 50%, #E94560 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.8s linear infinite',
            boxShadow: '0 0 16px rgba(233,69,96,0.55), 0 0 40px rgba(233,69,96,0.20)',
            transition: 'width 120ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>

      {/* Inline keyframes (scoped via style tag injection is fine for splash) */}
      <style>{`
        @keyframes splashPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
