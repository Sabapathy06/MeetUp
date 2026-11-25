/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState } from 'react';
import { CheckCircle2, Info, X, AlertCircle } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { AppProvider, useApp } from './context/AppContext';
import { ActiveMeetingScreen } from './screens/ActiveMeetingScreen';
import { AuthScreens } from './screens/AuthScreens';
import { DashboardScreen } from './screens/DashboardScreen';
import {
  HistoryScreen,
  MeetingEndedScreen,
  RecordingsScreen,
  SettingsScreen,
} from './screens/HistoryRecordingsSettingsScreens';
import { LandingScreen } from './screens/LandingScreen';
import { JoinMeetingScreen, NewMeetingScreen } from './screens/MeetingEntryScreens';
import { PreJoinLobbyScreen } from './screens/PreJoinLobbyScreen';
import { ScheduleScreen } from './screens/ScheduleScreen';
import type {
  AppScreen,
  EndedMeetingSummary,
  LobbyJoinConfig,
  MeetingRecord,
} from './types/connectmeet';

const PROTECTED_SCREENS = new Set<AppScreen>([
  'dashboard',
  'new-meeting',
  'join-meeting',
  'lobby',
  'active-meeting',
  'schedule',
  'history',
  'recordings',
  'settings',
  'meeting-ended',
]);

function ToastContainer() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-xl border px-4 py-3 shadow-lg backdrop-blur-xl flex items-start gap-2.5 text-xs ${
            t.variant === 'error'
              ? 'border-rose-500/40 bg-rose-950/90 text-rose-100'
              : t.variant === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-100'
                : 'border-white/15 bg-[#131b2e]/95 text-[#dae2fd]'
          }`}
        >
          {t.variant === 'error' ? (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
          ) : t.variant === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <Info className="h-4 w-4 text-[#b4c5ff] shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{t.title}</p>
            {t.description && <p className="opacity-85 mt-0.5 leading-relaxed">{t.description}</p>}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss notification"
            className="opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function ConnectMeetRouter() {
  const { firebaseUser, authLoading } = useApp();
  const [screen, setScreen] = useState<AppScreen>('landing');
  const [pendingJoinCode, setPendingJoinCode] = useState<string>('');
  const [lobbyMeeting, setLobbyMeeting] = useState<MeetingRecord | null>(null);
  const [lobbyPasscode, setLobbyPasscode] = useState<string>('');
  const [activeJoinConfig, setActiveJoinConfig] = useState<LobbyJoinConfig | null>(null);
  const [endedSummary, setEndedSummary] = useState<EndedMeetingSummary | null>(null);

  // Detect ?join=<code> deep link on arrival
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinParam = params.get('join');
    if (joinParam) {
      setPendingJoinCode(joinParam.trim());
    }
  }, []);

  // Automatically direct authenticated users with a pending ?join link to Join Meeting
  useEffect(() => {
    if (authLoading) return;
    if (firebaseUser && pendingJoinCode && (screen === 'landing' || screen === 'login' || screen === 'register')) {
      setScreen('join-meeting');
    } else if (firebaseUser && (screen === 'login' || screen === 'register')) {
      setScreen('dashboard');
    } else if (!firebaseUser && PROTECTED_SCREENS.has(screen)) {
      setScreen('login');
    }
  }, [firebaseUser, authLoading, pendingJoinCode, screen]);

  const navigate = (next: AppScreen) => {
    if (!firebaseUser && PROTECTED_SCREENS.has(next)) {
      setScreen('login');
      return;
    }
    setScreen(next);
  };

  const handleQuickJoinCode = (code: string) => {
    setPendingJoinCode(code);
    if (firebaseUser) {
      setScreen('join-meeting');
    } else {
      setScreen('login');
    }
  };

  const handleEnterLobby = (meeting: MeetingRecord, passcode?: string) => {
    setLobbyMeeting(meeting);
    setLobbyPasscode(passcode || '');
    setScreen('lobby');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0b1326] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[#2563eb] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (screen === 'landing') {
    return (
      <LandingScreen
        isAuthenticated={Boolean(firebaseUser)}
        onNavigate={navigate}
        onQuickJoinCode={handleQuickJoinCode}
      />
    );
  }

  if (screen === 'login' || screen === 'register') {
    return (
      <AuthScreens
        mode={screen}
        onNavigate={navigate}
        onAuthenticated={() => {
          setScreen(pendingJoinCode ? 'join-meeting' : 'dashboard');
        }}
      />
    );
  }

  if (screen === 'lobby' && lobbyMeeting) {
    return (
      <PreJoinLobbyScreen
        meeting={lobbyMeeting}
        initialPasscode={lobbyPasscode}
        onBack={() => setScreen('dashboard')}
        onJoinReady={(config) => {
          setActiveJoinConfig(config);
          setScreen('active-meeting');
        }}
      />
    );
  }

  if (screen === 'active-meeting' && activeJoinConfig) {
    return (
      <ActiveMeetingScreen
        joinConfig={activeJoinConfig}
        onMeetingEnded={(summary) => {
          setActiveJoinConfig(null);
          setEndedSummary(summary);
          setScreen('meeting-ended');
        }}
      />
    );
  }

  if (screen === 'meeting-ended' && endedSummary) {
    return (
      <MeetingEndedScreen
        ended={endedSummary}
        onNavigate={(next) => {
          setEndedSummary(null);
          navigate(next);
        }}
        onRejoin={(meeting) => {
          setEndedSummary(null);
          handleEnterLobby(meeting);
        }}
      />
    );
  }

  // Authenticated Workspace Shell (Dashboard, New Meeting, Join, Schedule, History, Recordings, Settings)
  const screenTitles: Record<string, string> = {
    dashboard: 'Dashboard',
    'new-meeting': 'New Meeting',
    'join-meeting': 'Join Meeting',
    schedule: 'Meeting Schedule',
    history: 'Meeting History',
    recordings: 'Cloud Recordings',
    settings: 'Account & Preferences',
  };

  return (
    <WorkspaceLayout
      activeScreen={screen}
      title={screenTitles[screen] || 'MeetUp'}
      onNavigate={navigate}
    >
      {screen === 'dashboard' && (
        <DashboardScreen
          onNavigate={navigate}
          onEnterLobby={handleEnterLobby}
          onQuickJoinCode={handleQuickJoinCode}
        />
      )}
      {screen === 'new-meeting' && (
        <NewMeetingScreen onNavigate={navigate} onEnterLobby={handleEnterLobby} />
      )}
      {screen === 'join-meeting' && (
        <JoinMeetingScreen
          initialCode={pendingJoinCode}
          onEnterLobby={(m, pass) => {
            setPendingJoinCode('');
            handleEnterLobby(m, pass);
          }}
        />
      )}
      {screen === 'schedule' && <ScheduleScreen onEnterLobby={handleEnterLobby} />}
      {screen === 'history' && <HistoryScreen onEnterLobby={handleEnterLobby} />}
      {screen === 'recordings' && <RecordingsScreen />}
      {screen === 'settings' && <SettingsScreen />}
    </WorkspaceLayout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <ToastContainer />
        <ConnectMeetRouter />
      </AppProvider>
    </ErrorBoundary>
  );
}
