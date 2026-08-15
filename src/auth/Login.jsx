import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from './AuthShell';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { EyeIcon, inputStyle, labelStyle, handleFocus, handleBlur } from './authShared';

export default function Login() {
  const { signIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) {
      toast.error(error.message || 'Sign in failed');
      return;
    }
    toast.success('Welcome back');
    navigate('/sites');
  }

  async function enterDemo() {
    setBusy(true);
    const { error } = await signIn('demo@oryxen.io', 'demo');
    setBusy(false);
    if (error) {
      toast.error(error.message || 'Could not start demo');
      return;
    }
    toast.success('Demo session started');
    navigate('/sites');
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your SSH hatchery workspace"
      footer={
        <span>
          New here?{' '}
          <Link to="/signup" className="auth-link">
            Create an account
          </Link>
        </span>
      }
    >
      <form onSubmit={submit} className="auth-form">
        {/* Email */}
        <div className="field-group">
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@hatchery.com"
            style={inputStyle}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>

        {/* Password */}
        <div className="field-group">
          <label style={labelStyle}>Password</label>
          <div className="password-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ ...inputStyle, paddingRight: 46 }}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="eye-toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
        </div>

        {/* Forgot password link */}
        <div className="text-right -mt-2">
          <Link to="/forgot-password" className="text-xs font-semibold text-white/45 hover:text-white/75 transition-colors">
            Forgot password?
          </Link>
        </div>

        {/* Submit button */}
        <button type="submit" disabled={busy} className="btn-primary" style={{ opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Signing in…' : 'Login'}
        </button>
      </form>

      {/* Divider */}
      <div className="auth-divider">
        <span className="divider-line" />
        <span className="text-[11px] uppercase tracking-widest text-white/25">or</span>
        <span className="divider-line" />
      </div>

      {/* Demo button */}
      <button onClick={enterDemo} disabled={busy} className="btn-ghost">
        ▶ Try the demo
      </button>
      <p className="mt-3 text-center text-[11px] text-white/30">
        Demo data loads automatically — no account needed.
      </p>
    </AuthShell>
  );
}
