import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';

/**
 * Profile avatar menu (PRD §6).
 * Logout is confirm-to-act (confirm dialog), per the spec.
 */
export default function ProfileMenu() {
  const { user, profile, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function doLogout() {
    setConfirmOpen(false);
    setOpen(false);
    const { error } = await signOut();
    if (error) toast.error(error.message);
    else toast.success('Signed out');
    navigate('/login');
  }

  const initials = (profile?.full_name || user?.email || 'U')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  const role = profile?.role ?? 'field';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 p-1 pr-2 rounded-full hover:bg-white/10"
      >
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          {initials || 'U'}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-12 z-50 w-64 p-3 animate-in"
          style={{
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.65)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-pop)',
          }}
        >
          <div className="flex items-center gap-3 pb-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <span
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
                boxShadow: '0 2px 8px rgba(26,26,46,0.25)',
              }}
            >
              {initials || 'U'}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                {profile?.full_name || 'User'}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                {user?.email}
              </p>
            </div>
          </div>

          <div className="py-2">
            <span
              className="chip"
              style={{
                background: 'var(--color-info-bg)',
                color: 'var(--color-info)',
                textTransform: 'capitalize',
                border: '1px solid rgba(37,99,235,0.15)',
              }}
            >
              {role}
            </span>
          </div>

          <button
            onClick={() => setConfirmOpen(true)}
            className="w-full text-left px-3 py-2 rounded-[8px] text-sm font-semibold transition"
            style={{ color: 'var(--color-danger)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-danger-bg)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            ⏻ Logout
          </button>
        </div>
      )}

      {confirmOpen && (
        <ConfirmDialog
          title="Logout?"
          message="You'll need to sign in again to access SSH."
          confirmLabel="Logout"
          danger
          onCancel={() => setConfirmOpen(false)}
          onConfirm={doLogout}
        />
      )}
    </div>
  );
}

/** Reusable confirm dialog (used here + elsewhere for irreversible actions). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: 'rgba(11,18,32,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.70)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-glass)',
        }}
      >
        <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{message}</p>
        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancel}
            className="btn flex-1"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={danger ? 'btn-danger flex-1' : 'btn-primary flex-1'}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
