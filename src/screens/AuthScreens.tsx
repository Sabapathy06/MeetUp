import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Mail, User } from 'lucide-react';
import { ConnectMeetLogo } from '../components/BrandLogo';
import { useApp } from '../context/AppContext';
import type { AppScreen } from '../types/connectmeet';

interface AuthScreenProps {
  mode: 'login' | 'register';
  onNavigate: (screen: AppScreen) => void;
  onAuthenticated: () => void;
}

export function AuthScreens({ mode, onNavigate, onAuthenticated }: AuthScreenProps) {
  const { signInWithGoogle, signInWithEmail, registerWithEmail, requestPasswordReset, pushToast } =
    useApp();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      pushToast('Signed in with Google', 'success');
      onAuthenticated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (forgotMode) {
      if (!email.trim()) {
        setError('Enter your account email to receive a reset link.');
        return;
      }
      setLoading(true);
      try {
        await requestPasswordReset(email);
        setResetSent(true);
        pushToast('Password reset link sent', 'success');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unable to send reset email.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    if (mode === 'register') {
      if (!fullName.trim()) {
        setError('Please enter your full name.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      if (!acceptedTerms) {
        setError('Please accept the Terms of Service and Privacy Policy to continue.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmail(email, password);
        pushToast('Welcome back to MeetUp', 'success');
      } else {
        await registerWithEmail(fullName, email, password);
        pushToast(
          'Account created',
          'success',
          'Verification email sent—check your inbox to confirm your address.'
        );
      }
      onAuthenticated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b1326] text-slate-900 dark:text-[#dae2fd] flex flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <button
          type="button"
          onClick={() => onNavigate('landing')}
          className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] rounded-lg"
        >
          <ConnectMeetLogo />
        </button>
        <button
          type="button"
          onClick={() => onNavigate('landing')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#131b2e] p-8">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mb-1.5">
              {forgotMode
                ? 'Reset your password'
                : mode === 'login'
                  ? 'Sign in to MeetUp'
                  : 'Create your MeetUp account'}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {forgotMode
                ? 'Enter your email address and we will send password recovery instructions.'
                : mode === 'login'
                  ? 'Access your scheduled rooms, meeting history, and live collaboration tools.'
                  : 'Start hosting HD video calls and scheduling team meetings in seconds.'}
            </p>
          </div>

          {!forgotMode && (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={handleGoogle}
                className="w-full flex items-center justify-center gap-3 rounded-full border border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-[#171f33] px-5 py-3 text-sm font-semibold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#222a3d] transition-colors disabled:opacity-60 cursor-pointer"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {mode === 'login' ? 'Continue with Google' : 'Sign up with Google'}
              </button>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                <span className="text-xs text-slate-400">or with email</span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
              </div>
            </>
          )}

          {error && (
            <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-700 dark:text-rose-200 leading-relaxed">
              {error}
            </div>
          )}

          {resetSent && forgotMode && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Password reset email sent. Check your inbox and spam folder.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && !forgotMode && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Full name
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Rivera"
                    className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Work or personal email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                />
              </div>
            </div>

            {!forgotMode && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 pl-10 pr-10 py-2.5 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'register' && !forgotMode && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Confirm password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                />
              </div>
            )}

            {mode === 'login' && !forgotMode && (
              <div className="flex items-center justify-between text-xs">
                <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-300 text-[#2563eb] focus:ring-[#2563eb]"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotMode(true);
                    setError(null);
                    setResetSent(false);
                  }}
                  className="font-medium text-[#2563eb] dark:text-[#b4c5ff] hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {mode === 'register' && !forgotMode && (
              <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-[#2563eb] focus:ring-[#2563eb]"
                />
                <span>
                  I agree to the MeetUp Terms of Service and acknowledge privacy handling for
                  meeting records.
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#2563eb] px-5 py-3 text-sm font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {loading
                ? 'Please wait...'
                : forgotMode
                  ? 'Send Reset Link'
                  : mode === 'login'
                    ? 'Sign in'
                    : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
            {forgotMode ? (
              <button
                type="button"
                onClick={() => {
                  setForgotMode(false);
                  setError(null);
                }}
                className="font-semibold text-[#2563eb] dark:text-[#b4c5ff] hover:underline cursor-pointer"
              >
                Return to sign in
              </button>
            ) : mode === 'login' ? (
              <>
                New to MeetUp?{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('register')}
                  className="font-semibold text-[#2563eb] dark:text-[#b4c5ff] hover:underline cursor-pointer"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="font-semibold text-[#2563eb] dark:text-[#b4c5ff] hover:underline cursor-pointer"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
