import { LogoMark } from './LogoMark';

/**
 * Premium glassmorphic auth shell with animated ambient backdrop.
 * Deep navy gradient + subtle floating orbs + frosted glass card.
 */
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{
        background:
          'linear-gradient(160deg, #0B1A30 0%, #0F2340 25%, #0A1628 55%, #061020 100%)',
      }}
    >
      {/* Floating ambient orbs */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Top-left warm orb */}
        <div
          className="absolute rounded-full blur-3xl animate-pulse"
          style={{
            width: 'clamp(400px, 50vw, 700px)',
            height: 'clamp(400px, 50vw, 700px)',
            top: '-15%',
            left: '-10%',
            background:
              'radial-gradient(circle, rgba(233,69,96,0.13) 0%, rgba(233,69,96,0.04) 40%, transparent 70%)',
            animationDuration: '8s',
          }}
        />
        {/* Bottom-right cool orb */}
        <div
          className="absolute rounded-full blur-3xl animate-pulse"
          style={{
            width: 'clamp(350px, 45vw, 600px)',
            height: 'clamp(350px, 45vw, 600px)',
            bottom: '-12%',
            right: '-8%',
            background:
              'radial-gradient(circle, rgba(37,99,235,0.10) 0%, rgba(37,99,235,0.03) 45%, transparent 70%)',
            animationDuration: '10s',
            animationDelay: '1s',
          }}
        />
        {/* Center-subtle accent dot */}
        <div
          className="absolute rounded-full blur-2xl"
          style={{
            width: 300,
            height: 300,
            top: '40%',
            left: '55%',
            background:
              'radial-gradient(circle, rgba(79,195,247,0.06) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* --- Brand Header --- */}
      <div className="flex flex-col items-center text-center mb-7 z-10">
        <div
          className="transition-transform duration-500 hover:scale-105"
          style={{ filter: 'drop-shadow(0 8px 24px rgba(233,69,96,0.25))' }}
        >
          <LogoMark size={72} />
        </div>
        <div className="mt-5 flex items-baseline gap-1.5">
          <h1 className="text-3xl font-extrabold text-white tracking-tight select-none">
            Aqua
          </h1>
          <span className="text-3xl font-light text-[#4FC3F7] tracking-tight select-none">
            SSH
          </span>
        </div>
        <div
          className="mt-3 px-4 py-1.5 rounded-full select-none"
          style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <p className="text-[11px] text-white/55 tracking-widest uppercase">
            Site Management &middot; Simplified
          </p>
        </div>
      </div>

      {/* --- Glassmorphic Card --- */}
      <div
        className="relative z-10 w-full max-w-[420px] p-8 mx-4 md:mx-0 overflow-hidden"
        style={{
          background: 'var(--auth-surface-card)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid var(--color-border-glass)',
          borderRadius: '24px',
          boxShadow:
            '0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      >
        {/* Subtle top shine */}
        <div
          aria-hidden="true"
          className="absolute top-0 left-1/2 -translate-x-1/2 w-3/5 h-px rounded-full"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
          }}
        />

        {/* Card header */}
        <div className="mb-7 pb-5 border-b border-white/8">
          <h2 className="text-2xl font-extrabold text-white tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm mt-1.5 text-white/55 font-medium leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {/* Content slot */}
        {children}

        {/* Footer slot */}
        {footer && (
          <div className="mt-7 pt-5 border-t border-white/6 text-center text-sm text-white/50 font-medium">
            {footer}
          </div>
        )}
      </div>

      {/* Bottom copyright */}
      <p className="absolute bottom-5 text-[11px] text-white/30 select-none tracking-wide">
        &copy; {new Date().getFullYear()} Oryxen
      </p>
    </div>
  );
}