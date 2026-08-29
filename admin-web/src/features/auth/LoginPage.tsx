import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { loginWithPassword } from '@/features/auth/api';
import { useAuth } from '@/lib/auth-context';
import { toApiError } from '@/lib/errors';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();

  // Where the guard bounced them from, and anything the previous screen wants said (a completed
  // password reset, for instance).
  const state = location.state as { from?: string; notice?: string } | null;
  const destination = state?.from ?? '/home';

  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [notice] = useState<string | null>(state?.notice ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Browsers fill saved credentials straight into the DOM without firing an input event React can
  // hear, so the state behind the button stayed empty and Sign in sat greyed out over two visibly
  // filled fields until the user clicked or typed something. Read the fields back for the first
  // couple of seconds and adopt whatever the browser put there.
  //
  // Only a field the user has not touched is adopted, so this can never fight someone typing: the
  // moment a real keystroke lands, state and the DOM agree and there is nothing left to copy.
  const typed = useRef(false);

  useEffect(() => {
    const adopt = () => {
      const form = formRef.current;
      if (!form || typed.current) return true; // nothing more to watch for

      const filled = (name: string) =>
        (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '';

      const filledMobile = filled('mobile').replace(/\D/g, '').slice(0, 10);
      const filledPassword = filled('password');

      if (filledMobile) setMobile(filledMobile);
      if (filledPassword) setPassword(filledPassword);

      // Keep watching until both halves have arrived: the two fields are not always filled in the
      // same tick, and stopping at the first would leave the second one behind again.
      return filledMobile !== '' && filledPassword !== '';
    };

    if (adopt()) return;

    // Autofill can land a beat after mount — and after a chooser, several beats — so this keeps
    // looking briefly rather than reading once and giving up.
    const timer = window.setInterval(() => {
      if (adopt()) window.clearInterval(timer);
    }, 120);
    const stop = window.setTimeout(() => window.clearInterval(timer), 2500);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, []);

  const mobileValid = /^[6-9]\d{9}$/.test(mobile);
  const canSubmit = mobileValid && password.length > 0 && !busy;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      signIn(await loginWithPassword(mobile, password));
      navigate(destination, { replace: true });
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use your registered mobile number"
      footer={
        <>
          Don&apos;t have access? <Link to="/register" className="font-semibold text-navy-600 hover:underline">Register</Link>{' '}
          or contact your administrator.
        </>
      }
    >
      {/* A real form, so the browser offers to fill it and Enter submits from either field. */}
      <form ref={formRef} className="space-y-4" onSubmit={handleSubmit}>
        <TextField
          label="Mobile number"
          name="mobile"
          value={mobile}
          onChange={(event) => {
            typed.current = true;
            setMobile(event.target.value.replace(/\D/g, '').slice(0, 10));
          }}
          placeholder="10-digit mobile number"
          inputMode="numeric"
          autoComplete="tel-national"
          hint="Prefixed with +91"
        />

        {notice && <Alert tone="info">{notice}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}

        <TextField
          label="Password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => {
            typed.current = true;
            setPassword(event.target.value);
          }}
          autoComplete="current-password"
        />

        <Button type="submit" fullWidth loading={busy} disabled={!canSubmit}>
          Sign in
        </Button>

        <div className="text-center text-sm">
          <Link to="/forgot-password" className="font-semibold text-navy-600 hover:underline">
            Forgot password?
          </Link>
        </div>

        <div className="flex items-center justify-center gap-2 rounded-lg border border-line bg-navy-50/70 py-2.5 text-xs font-medium text-navy-700">
          <span aria-hidden>🔒</span> Secure login
        </div>
      </form>
    </AuthLayout>
  );
}
