import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile as updateFirebaseProfile,
} from 'firebase/auth';
import { api } from '../lib/api';
import { auth, googleAuthProvider } from '../lib/firebase';
import type {
  IntegrationsStatus,
  NotificationRecord,
  UserProfile,
  UserSettings,
} from '../types/connectmeet';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: 'info' | 'success' | 'error';
}

interface AppContextValue {
  firebaseUser: User | null;
  authLoading: boolean;
  profile: UserProfile | null;
  settings: UserSettings | null;
  integrations: IntegrationsStatus | null;
  notifications: NotificationRecord[];
  theme: 'dark' | 'light';
  setTheme: (next: 'dark' | 'light') => void;
  toggleTheme: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (fullName: string, email: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  toasts: ToastItem[];
  pushToast: (title: string, variant?: ToastItem['variant'], description?: string) => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationsStatus | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback(
    (title: string, variant: ToastItem['variant'] = 'info', description?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, description, variant }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const applyThemeClass = useCallback((next: 'dark' | 'light') => {
    const root = document.documentElement;
    if (next === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, []);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme, applyThemeClass]);

  const setTheme = useCallback(
    (next: 'dark' | 'light') => {
      setThemeState(next);
      applyThemeClass(next);
      if (auth.currentUser) {
        api.updateSettings({ theme: next }).catch(() => {
          // Non-blocking preference save
        });
      }
    },
    [applyThemeClass]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const data = await api.getProfile();
      setProfile(data.profile);
      setSettings(data.settings);
      if (data.settings?.theme === 'light' || data.settings?.theme === 'dark') {
        setThemeState(data.settings.theme);
        applyThemeClass(data.settings.theme);
      }
    } catch (error) {
      console.error('Profile sync error:', error);
    }
  }, [applyThemeClass]);

  const refreshNotifications = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const data = await api.listNotifications();
      setNotifications(data.notifications);
    } catch {
      // Handled gracefully
    }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      await api.markNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      pushToast(
        'Could not update notifications',
        'error',
        err instanceof Error ? err.message : undefined
      );
    }
  }, [pushToast]);

  useEffect(() => {
    api
      .getConfigStatus()
      .then(setIntegrations)
      .catch(() => {
        setIntegrations({
          livekit: { configured: false, mode: 'webrtc-fallback' },
          resend: { configured: false },
          gemini: { configured: true },
        });
      });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await refreshProfile();
        await refreshNotifications();
      } else {
        setProfile(null);
        setSettings(null);
        setNotifications([]);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [refreshProfile, refreshNotifications]);

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleAuthProvider);
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        throw new Error(
          'Email/Password sign-in is disabled in your Firebase project. Use Google Sign-In or enable Email/Password under Firebase Console → Authentication → Sign-in method.'
        );
      }
      throw error;
    }
  }, []);

  const registerWithEmail = useCallback(
    async (fullName: string, email: string, password: string) => {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (cred.user) {
          await updateFirebaseProfile(cred.user, { displayName: fullName.trim() });
          await sendEmailVerification(cred.user).catch(() => {});
        }
      } catch (error: unknown) {
        const code = (error as { code?: string })?.code || '';
        if (code === 'auth/operation-not-allowed') {
          throw new Error(
            'Email/Password registration is not enabled in Firebase Console yet. Click "Continue with Google" to sign in immediately, or enable Email/Password in Firebase Authentication settings.'
          );
        }
        throw error;
      }
    },
    []
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setProfile(null);
    setSettings(null);
    setNotifications([]);
    pushToast('Signed out of MeetUp', 'info');
  }, [pushToast]);

  return (
    <AppContext.Provider
      value={{
        firebaseUser,
        authLoading,
        profile,
        settings,
        integrations,
        notifications,
        theme,
        setTheme,
        toggleTheme,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        requestPasswordReset,
        logout,
        refreshProfile,
        refreshNotifications,
        markAllNotificationsRead,
        toasts,
        pushToast,
        dismissToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
