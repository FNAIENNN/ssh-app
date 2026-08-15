/**
 * Shared styles, icons, and handlers for all auth pages.
 * Keeps the design system DRY and consistent.
 */

/* ---------- Eye Icon ---------- */
export function EyeIcon({ open }) {
  const base =
    'w-[18px] h-[18px] transition-transform duration-200';
  return open ? (
    <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/>
    </svg>
  ) : (
    <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

/* ---------- Shared Styles ---------- */
export const inputStyle = {
  background: 'var(--color-input-bg)',
  border: '1px solid var(--color-input-border)',
  borderRadius: 'var(--radius-sm)',
  color: '#fff',
  padding: '13px 16px',
  fontSize: 14,
  width: '100%',
  outline: 'none',
  transition: 'border-color var(--ease-smooth), box-shadow var(--ease-smooth)',
  WebkitAppearance: 'none',
};

export const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  marginBottom: 7,
  letterSpacing: '0.01em',
};

/* ---------- Shared Event Handlers ---------- */
export function handleFocus(e) {
  e.target.style.borderColor = 'var(--color-border-active)';
  e.target.style.boxShadow = 'var(--shadow-input-focus)';
}

export function handleBlur(e) {
  e.target.style.borderColor = 'var(--color-input-border)';
  e.target.style.boxShadow = 'none';
}
