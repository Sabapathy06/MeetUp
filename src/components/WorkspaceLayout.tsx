import React, { useState } from 'react';
import {
  Bell,
  Calendar,
  Clock,
  Film,
  Home,
  LogIn,
  LogOut,
  Menu,
  Moon,
  PlusCircle,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { ConnectMeetLogo } from './BrandLogo';
import { useApp } from '../context/AppContext';
import type { AppScreen } from '../types/connectmeet';

interface WorkspaceLayoutProps {
  activeScreen: AppScreen;
  title: string;
  onNavigate: (screen: AppScreen) => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{ screen: AppScreen; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { screen: 'dashboard', label: 'Dashboard', icon: Home },
  { screen: 'new-meeting', label: 'New Meeting', icon: PlusCircle },
  { screen: 'join-meeting', label: 'Join Meeting', icon: LogIn },
  { screen: 'schedule', label: 'Schedule', icon: Calendar },
  { screen: 'history', label: 'History', icon: Clock },
  { screen: 'recordings', label: 'Recordings', icon: Film },
  { screen: 'settings', label: 'Settings', icon: Settings },
];

export function WorkspaceLayout({
  activeScreen,
  title,
  onNavigate,
  children,
}: WorkspaceLayoutProps) {
  const {
    profile,
    firebaseUser,
    theme,
    toggleTheme,
    notifications,
    markAllNotificationsRead,
    logout,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const displayName = profile?.fullName || firebaseUser?.displayName || 'MeetUp User';
  const email = profile?.email || firebaseUser?.email || '';
  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleNav = (screen: AppScreen) => {
    onNavigate(screen);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b1326] text-slate-900 dark:text-[#dae2fd] flex">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 dark:border-white/8 bg-white dark:bg-[#0e162a]">
        <div className="flex items-center h-16 px-6 border-b border-slate-200 dark:border-white/8">
          <button
            type="button"
            onClick={() => handleNav('dashboard')}
            className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] rounded-lg"
          >
            <ConnectMeetLogo />
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ screen, label, icon: Icon }) => {
            const active = activeScreen === screen;
            return (
              <button
                key={screen}
                type="button"
                onClick={() => handleNav(screen)}
                className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-[#2563eb]/12 text-[#2563eb] dark:bg-[#2563eb]/20 dark:text-[#b4c5ff]'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 dark:border-white/8 p-4">
          <button
            type="button"
            onClick={() => handleNav('settings')}
            className="w-full flex items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            {profile?.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="h-9 w-9 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#2563eb] to-[#7c3aed] text-xs font-bold text-white shrink-0">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {displayName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{email}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => logout().then(() => onNavigate('landing'))}
            className="mt-2 w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-72 max-w-[85vw] bg-white dark:bg-[#0e162a] border-r border-slate-200 dark:border-white/10 flex flex-col h-full">
            <div className="flex items-center justify-between h-16 px-5 border-b border-slate-200 dark:border-white/8">
              <ConnectMeetLogo />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map(({ screen, label, icon: Icon }) => {
                const active = activeScreen === screen;
                return (
                  <button
                    key={screen}
                    type="button"
                    onClick={() => handleNav(screen)}
                    className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#2563eb]/12 text-[#2563eb] dark:bg-[#2563eb]/20 dark:text-[#b4c5ff]'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 border-b border-slate-200 dark:border-white/8 bg-white/85 dark:bg-[#0b1326]/85 backdrop-blur-xl px-5 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-white truncate">
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#131b2e] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#1e2942] transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                aria-label="Notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#131b2e] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#1e2942] transition-colors cursor-pointer"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#2563eb] px-1 text-[10px] font-bold text-white tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 mt-2 z-20 w-80 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#131b2e] shadow-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/8">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        Notifications
                      </span>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={() => markAllNotificationsRead()}
                          className="text-xs font-medium text-[#2563eb] dark:text-[#b4c5ff] hover:underline cursor-pointer"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-white/6">
                      {notifications.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                          No notifications yet.
                        </p>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            className={`px-4 py-3 ${n.isRead ? 'opacity-70' : 'bg-[#2563eb]/5'}`}
                          >
                            <p className="text-xs font-semibold text-slate-900 dark:text-white">
                              {n.title}
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                              {n.message}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleNav('new-meeting')}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              New Meeting
            </button>
          </div>
        </header>

        <main className="flex-1 mx-auto w-full max-w-6xl px-5 lg:px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
