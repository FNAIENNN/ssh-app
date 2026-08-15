import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from './AuthShell';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { EyeIcon, inputStyle, labelStyle, handleFocus, handleBlur } from './authShared';

export default function SignUp() {
  const { signUp } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  function setField(key, val) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  const passwordsMatch =
    form.confirmPassword.length === 0 || form.password === form.confirmPassword;
  const canSubmit =
    form.password.length >= 6 && passwordsMatch && form.fullName.trim() && form.email.trim();

  async function submit(e) {
    e.preventDefault();
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (!passwordsMatch) {
      toast.error('Passwords do not match');
      return;
    }
    setBusy(true);
    const { data, error } = await signUp({
      email: form.email.trim(),
      password: form.password,
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message || 'Sign up failed');
      return;
    }
    if (data?.user && !data?.session) {
      toast.success('Account created — check your email to confirm.');
      navigate('/login');
    } else {
      toast.success('Welcome to SSH');
      navigate('/sites');
    }
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Hatchery & site staff sign up to manage sites"
      footer={
        <span>
          Already have an account?{' '}
          <Link to="/login" className="auth-link">
            Login
          </Link>
        </span>
      }
    >
      <form onSubmit={submit} className="auth-form">
        {/* Full name */}
        <div className="field-group">
          <label style={labelStyle}>Full name</label>
          <input
            required
            value={form.fullName}
            onChange={(e) => setField('fullName', e.target.value)}
            placeholder="Field Officer"
            style={inputStyle}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>

        {/* Email */}
        <div className="field-group">
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            placeholder="you@hatchery.com"
            style={inputStyle}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>

        {/* Phone */}
        <div className="field-group">
          <label style={labelStyle}>
            Phone <span className="text-white/35 font-normal">(optional)</span>
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setField('phone', e.target.value)}
            placeholder="+91…"
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
              minLength={6}
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
              placeholder="At least 6 characters"
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

        {/* Confirm Password */}
        <div className="field-group">
          <label style={labelStyle}>Confirm password</label>
          <div className="password-wrapper">
            <input
              type={showConfirm ? 'text' : 'password'}
              required
              value={form.confirmPassword}
              onChange={(e) => setField('confirmPassword', e.target.value)}
              placeholder="Re-enter your password"
              style={{
                ...inputStyle,
                paddingRight: 46,
                borderColor: form.confirmPassword.length > 0
                  ? passwordsMatch
                    ? 'var(--color-success)'
                    : 'var(--color-danger)'
                  : 'var(--color-input-border)',
                boxShadow: form.confirmPassword.length > 0
                  ? passwordsMatch
                    ? '0 0 0 3px rgba(16,185,129,0.12)'
                    : '0 0 0 3px rgba(239,68,68,0.12)'
                  : 'none',
              }}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="eye-toggle"
              aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
            >
              <EyeIcon open={showConfirm} />
            </button>
          </div>
          {/* Match feedback */}
          {form.confirmPassword.length > 0 && (
            <p
              className="mt-1.5 text-xs font-semibold flex items-center gap-1"
              style={{
                color: passwordsMatch ? 'var(--color-success-light)' : 'var(--color-danger-light)',
              }}
            >
              <span>{passwordsMatch ? '✓' : '✗'}</span>
              {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
            </p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={busy || !canSubmit}
          className="btn-primary"
          style={{ opacity: busy || !canSubmit ? 0.5 : 1 }}
        >
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
