import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Check,
  Clock,
  Copy,
  KeyRound,
  Link2,
  Play,
  Plus,
  Video,
} from 'lucide-react';
import { formatDuration } from '../components/BrandLogo';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { ensureFirestoreRoom } from '../lib/roomRealtime';
import type {
  AppScreen,
  MeetingHistoryRecord,
  MeetingRecord,
  ScheduledMeetingRecord,
} from '../types/connectmeet';

interface DashboardScreenProps {
  onNavigate: (screen: AppScreen) => void;
  onEnterLobby: (meeting: MeetingRecord) => void;
  onQuickJoinCode: (code: string) => void;
}

export function DashboardScreen({
  onNavigate,
  onEnterLobby,
  onQuickJoinCode,
}: DashboardScreenProps) {
  const { profile, firebaseUser, pushToast } = useApp();
  const [schedules, setSchedules] = useState<ScheduledMeetingRecord[]>([]);
  const [history, setHistory] = useState<MeetingHistoryRecord[]>([]);
  const [recentMeetings, setRecentMeetings] = useState<MeetingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickCode, setQuickCode] = useState('');
  const [copiedPersonal, setCopiedPersonal] = useState(false);
  const [startingInstant, setStartingInstant] = useState(false);
  const [nowTime, setNowTime] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNowTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([api.listSchedules(), api.listHistory(), api.listMeetings()])
      .then(([schedRes, histRes, meetRes]) => {
        if (!active) return;
        setSchedules(schedRes.schedules);
        setHistory(histRes.history);
        setRecentMeetings(meetRes.meetings);
      })
      .catch((err) => {
        if (active) {
          pushToast('Could not load dashboard data', 'error', err instanceof Error ? err.message : undefined);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pushToast]);

  const displayName = profile?.fullName || firebaseUser?.displayName || 'there';
  const personalCode = profile?.personalMeetingCode || 'personal-room';
  const personalLink = `${window.location.origin}/?join=${personalCode}`;

  const handleCopyPersonal = async () => {
    await navigator.clipboard.writeText(personalLink).catch(() => {});
    setCopiedPersonal(true);
    pushToast('Personal meeting link copied', 'success');
    window.setTimeout(() => setCopiedPersonal(false), 2000);
  };

  const handleStartPersonalRoom = async () => {
    setStartingInstant(true);
    try {
      // Lookup or create personal room
      try {
        const existing = await api.lookupMeeting(personalCode);
        if (existing.meeting.status !== 'ended') {
          await ensureFirestoreRoom(existing.meeting);
          onEnterLobby(existing.meeting);
          return;
        }
      } catch {
        // Create new room if not yet created
      }
      const created = await api.createMeeting({
        title: `${displayName}'s Personal Room`,
        description: 'Always-ready personal meeting room',
        meetingCode: personalCode,
      });
      await ensureFirestoreRoom(created.meeting);
      onEnterLobby(created.meeting);
    } catch (err) {
      // If personal code existed and ended, create a fresh instant room
      try {
        const created = await api.createMeeting({
          title: `${displayName}'s Instant Meeting`,
        });
        await ensureFirestoreRoom(created.meeting);
        onEnterLobby(created.meeting);
      } catch (innerErr) {
        pushToast(
          'Unable to start room',
          'error',
          innerErr instanceof Error ? innerErr.message : err instanceof Error ? err.message : undefined
        );
      }
    } finally {
      setStartingInstant(false);
    }
  };

  const handleQuickJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCode.trim()) {
      onNavigate('join-meeting');
      return;
    }
    onQuickJoinCode(quickCode.trim());
  };

  const handleJoinScheduled = async (code: string) => {
    try {
      const res = await api.lookupMeeting(code);
      await ensureFirestoreRoom(res.meeting).catch(() => {});
      onEnterLobby(res.meeting);
    } catch (err) {
      pushToast('Unable to open meeting', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const upcomingSchedules = schedules.filter(
    (s) => new Date(s.scheduledAt).getTime() >= Date.now() - 3600_000
  );

  return (
    <div className="space-y-8">
      {/* Greeting & Live Clock */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#2563eb] dark:text-[#b4c5ff] mb-1">
            {nowTime.toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Welcome back, {displayName.split(' ')[0]}
          </h2>
        </div>
        <div className="font-mono text-2xl font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
          {nowTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* Primary Action Trio */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <button
          type="button"
          onClick={() => onNavigate('new-meeting')}
          className="group text-left rounded-2xl border border-blue-500/20 bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] p-6 text-white hover:brightness-105 transition-all cursor-pointer"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 mb-5">
            <Video className="h-5 w-5 text-white" />
          </div>
          <h3 className="font-display text-lg font-semibold mb-1">New Meeting</h3>
          <p className="text-xs text-blue-100 leading-relaxed">
            Launch an instant HD room, generate a link for later, or invite guests right away.
          </p>
        </button>

        <div className="rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-6 flex flex-col justify-between">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#7c3aed]/12 text-[#7c3aed] dark:text-[#d2bbff] mb-4">
              <KeyRound className="h-5 w-5" />
            </div>
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-1">
              Join with a Code
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Paste a meeting ID or full invite URL to enter the lobby.
            </p>
          </div>
          <form onSubmit={handleQuickJoin} className="flex items-center gap-2">
            <input
              type="text"
              value={quickCode}
              onChange={(e) => setQuickCode(e.target.value)}
              placeholder="abc-defg-hij"
              className="flex-1 min-w-0 rounded-full border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-3.5 py-2 text-xs font-mono text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
            >
              Join
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('schedule')}
          className="group text-left rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-6 hover:border-[#2563eb]/40 transition-colors cursor-pointer"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-[#4edea3] mb-5">
            <Calendar className="h-5 w-5" />
          </div>
          <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-1">
            Schedule a Meeting
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Set recurring calls, pick timezones, configure privacy, and email participant invites.
          </p>
        </button>
      </div>

      {/* Personal Meeting Link Strip */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563eb]/12 text-[#2563eb] dark:text-[#b4c5ff] shrink-0">
            <Link2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Personal Meeting Link
            </p>
            <p className="font-mono text-sm text-slate-900 dark:text-white truncate">
              {personalLink}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyPersonal}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 dark:border-white/12 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            {copiedPersonal ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedPersonal ? 'Copied' : 'Copy Link'}
          </button>
          <button
            type="button"
            disabled={startingInstant}
            onClick={handleStartPersonalRoom}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <Play className="h-3.5 w-3.5" />
            {startingInstant ? 'Opening...' : 'Start Room'}
          </button>
        </div>
      </div>

      {/* Upcoming Meetings + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/8">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Upcoming Meetings
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('schedule')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#2563eb] dark:text-[#b4c5ff] hover:underline cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Schedule
            </button>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-14 rounded-xl bg-slate-100 dark:bg-white/5 animate-pulse"
                />
              ))}
            </div>
          ) : upcomingSchedules.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                No upcoming scheduled meetings
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Plan your next team standup or client walkthrough with automatic invite links.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('schedule')}
                className="rounded-full bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-600 transition-colors cursor-pointer"
              >
                Schedule Meeting
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/6">
              {upcomingSchedules.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {item.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      {new Date(item.scheduledAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {item.duration} min · <span className="font-mono">{item.meetingCode}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard
                          .writeText(`${window.location.origin}/?join=${item.meetingCode}`)
                          .catch(() => {});
                        pushToast('Meeting link copied', 'success');
                      }}
                      className="rounded-full border border-slate-200 dark:border-white/12 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                    >
                      Copy Link
                    </button>
                    <button
                      type="button"
                      onClick={() => handleJoinScheduled(item.meetingCode)}
                      className="rounded-full bg-[#2563eb] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 transition-colors cursor-pointer"
                    >
                      Join
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/8">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Recent Meetings
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#2563eb] dark:text-[#b4c5ff] hover:underline cursor-pointer"
            >
              View history
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 rounded-xl bg-slate-100 dark:bg-white/5 animate-pulse"
                />
              ))}
            </div>
          ) : history.length === 0 && recentMeetings.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Clock className="h-6 w-6 mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                No past sessions yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Meetings you create or join appear here with duration and AI recaps.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/6">
              {(history.length > 0
                ? history.slice(0, 5).map((h) => ({
                    key: `h-${h.id}`,
                    title: h.meetingTitle,
                    code: h.meetingCode,
                    meta: `${new Date(h.joinedAt).toLocaleDateString()} · ${formatDuration(h.duration)} · ${h.participantCount} ${h.participantCount === 1 ? 'participant' : 'participants'}`,
                    canJoin: h.meetingStatus !== 'ended',
                  }))
                : recentMeetings.slice(0, 5).map((m) => ({
                    key: `m-${m.id}`,
                    title: m.title,
                    code: m.meetingCode,
                    meta: `${new Date(m.createdAt).toLocaleDateString()} · ${m.status}`,
                    canJoin: m.status !== 'ended',
                  }))
              ).map((row) => (
                <div
                  key={row.key}
                  className="px-6 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {row.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      {row.meta}
                    </p>
                  </div>
                  {row.canJoin ? (
                    <button
                      type="button"
                      onClick={() => handleJoinScheduled(row.code)}
                      className="rounded-full border border-slate-200 dark:border-white/12 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#2563eb] hover:text-[#2563eb] cursor-pointer shrink-0"
                    >
                      Rejoin
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigate('history')}
                      className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer shrink-0"
                    >
                      Details
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
