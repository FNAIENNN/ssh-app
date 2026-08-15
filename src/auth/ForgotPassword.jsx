import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShell from './AuthShell';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { inputStyle, labelStyle, handleFocus, handleBlur } from './authShared';

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    const { error } = await resetPassword(email.trim());
    setBusy(false);
    if (error) {
      toast.error(error.message || 'Could not send reset email');
      return;
    }
    setSent(true);
    toast.success('Password reset link sent');
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="We'll email you a secure reset link"
      footer={
        <span>
          Remembered it?{' '}
          <Link to="/login" className="auth-link">
            Back to login
          </Link>
        </span>
      }
    >
      {sent ? (
        <div
          className="rounded-xl p-5 flex items-start gap-3"
          style={{
            background: 'var(--color-success-bg)',
            border: '1px solid rgba(16,185,129,0.30)',
          }}
        >
          <span className="text-xl mt-px">✓</span>
          <div>
            <p className="text-sm font-semibold text-green-300">Reset email sent</p>
            <p className="text-sm mt-1 text-green-200/80 leading-relaxed">
              If an account exists for <strong className="text-white">{email}</strong>, a reset link
              is on its way. Check your inbox and spam folder.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="auth-form">
          <div className="field-group">
            <label style={labelStyle}>Email address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@hatchery.com"
              style={inputStyle}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </div>
          <button type="submit" disabled={busy} className="btn-primary" style={{ opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
