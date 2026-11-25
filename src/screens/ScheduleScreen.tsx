import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Copy,
  Edit3,
  Mail,
  Play,
  Repeat,
  Shield,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { ensureFirestoreRoom } from '../lib/roomRealtime';
import type { MeetingRecord, ScheduledMeetingRecord } from '../types/connectmeet';

interface ScheduleScreenProps {
  onEnterLobby: (meeting: MeetingRecord) => void;
}

const TIMEZONES = [
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function ScheduleScreen({ onEnterLobby }: ScheduleScreenProps) {
  const { pushToast, integrations, refreshNotifications } = useApp();
  const uniqueTimezones = Array.from(new Set(TIMEZONES));

  const defaultDate = new Date(Date.now() + 3600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const initialDateStr = `${defaultDate.getFullYear()}-${pad(defaultDate.getMonth() + 1)}-${pad(defaultDate.getDate())}`;
  const initialTimeStr = `${pad(defaultDate.getHours())}:00`;

  const [schedules, setSchedules] = useState<ScheduledMeetingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(initialDateStr);
  const [time, setTime] = useState(initialTimeStr);
  const [duration, setDuration] = useState(60);
  const [timezone, setTimezone] = useState(uniqueTimezones[0]);
  const [recurringRule, setRecurringRule] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  const [isPrivate, setIsPrivate] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [inviteEmailsRaw, setInviteEmailsRaw] = useState('');

  const loadSchedules = async () => {
    try {
      const res = await api.listSchedules();
      setSchedules(res.schedules);
    } catch (err) {
      pushToast('Failed to load scheduled meetings', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setDate(initialDateStr);
    setTime(initialTimeStr);
    setDuration(60);
    setRecurringRule('none');
    setIsPrivate(false);
    setPasscode('');
    setInviteEmailsRaw('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      pushToast('Enter a meeting title', 'error');
      return;
    }
    const iso = new Date(`${date}T${time}`).toISOString();
    setSaving(true);
    try {
      if (editingId) {
        await api.updateSchedule(editingId, {
          title: title.trim(),
          description: description.trim(),
          scheduledAt: iso,
          duration,
          timezone,
          recurringRule,
        });
        pushToast('Scheduled meeting updated', 'success');
      } else {
        const inviteEmails = inviteEmailsRaw
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const res = await api.createSchedule({
          title: title.trim(),
          description: description.trim(),
          scheduledAt: iso,
          duration,
          timezone,
          recurringRule,
          isPrivate,
          passcode: passcode.trim() || undefined,
          inviteEmails,
        });
        await ensureFirestoreRoom(res.meeting).catch(() => {});
        const sentCount = res.invitations.filter((i) => i.status === 'sent').length;
        const msg =
          inviteEmails.length > 0
            ? sentCount > 0
              ? `Meeting scheduled and ${sentCount} email invite(s) sent via Resend.`
              : `Meeting scheduled and ${res.invitations.length} invite(s) saved. Copy link to share.`
            : `Meeting scheduled (Code: ${res.meeting.meetingCode}).`;
        pushToast('Meeting scheduled', 'success', msg);
        refreshNotifications();
      }
      resetForm();
      await loadSchedules();
    } catch (err) {
      pushToast('Could not save schedule', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: ScheduledMeetingRecord) => {
    const d = new Date(item.scheduledAt);
    setEditingId(item.id);
    setTitle(item.title);
    setDescription(item.description);
    setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setDuration(item.duration);
    setTimezone(item.timezone || uniqueTimezones[0]);
    setRecurringRule(item.recurringRule);
  };

  const handleCancelSchedule = async (id: string) => {
    try {
      await api.deleteSchedule(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      pushToast('Scheduled meeting canceled', 'info');
    } catch (err) {
      pushToast('Cancel failed', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleJoin = async (code: string) => {
    try {
      const res = await api.lookupMeeting(code);
      await ensureFirestoreRoom(res.meeting).catch(() => {});
      onEnterLobby(res.meeting);
    } catch (err) {
      pushToast('Unable to join room', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Schedule Form */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            {editingId ? 'Edit Scheduled Meeting' : 'Schedule a Meeting'}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Cancel edit
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Meeting title
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Weekly Engineering Sync"
            className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Description / Agenda
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Share agenda notes or preparation links"
            className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-4 py-2 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Date
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Start time
            </label>
            <input
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
            >
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
              <option value={90}>90 min</option>
              <option value={120}>2 hours</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Time zone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
            >
              {uniqueTimezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Recurrence
            </label>
            <select
              value={recurringRule}
              onChange={(e) =>
                setRecurringRule(e.target.value as 'none' | 'daily' | 'weekly' | 'monthly')
              }
              className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
            >
              <option value="none">One-time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        {!editingId && (
          <>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <Mail className="h-3.5 w-3.5" />
                Participant email invitations (comma separated)
              </label>
              <input
                type="text"
                value={inviteEmailsRaw}
                onChange={(e) => setInviteEmailsRaw(e.target.value)}
                placeholder="alex@company.com, maya@company.com"
                className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
              />
              {integrations && !integrations.resend.configured && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Invitations are saved to PostgreSQL with shareable links. Add{' '}
                  <span className="font-mono">RESEND_API_KEY</span> in Secrets to dispatch emails
                  automatically.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center pt-1">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="rounded border-slate-300 text-[#2563eb]"
                />
                <Shield className="h-3.5 w-3.5 text-[#2563eb]" />
                Waiting room required
              </label>
              <input
                type="text"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Optional passcode"
                className="rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
              />
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-full bg-[#2563eb] px-5 py-3 text-sm font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-60 cursor-pointer"
        >
          {saving
            ? 'Saving...'
            : editingId
              ? 'Save Schedule Changes'
              : 'Save Meeting & Send Invitations'}
        </button>
      </form>

      {/* Scheduled List */}
      <div className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/8 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Your Calendar
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {schedules.length} {schedules.length === 1 ? 'event' : 'events'}
          </span>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-20 rounded-xl bg-slate-100 dark:bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : schedules.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Calendar className="h-7 w-7 mx-auto text-slate-400 mb-2" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              No scheduled meetings yet
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Use the form on the left to schedule a one-time or recurring meeting.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/6">
            {schedules.map((item) => (
              <div key={item.id} className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {item.title}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      {new Date(item.scheduledAt).toLocaleString()} · {item.duration} min ·{' '}
                      {item.timezone}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                      <span className="font-mono text-[#2563eb] dark:text-[#b4c5ff]">
                        {item.meetingCode}
                      </span>
                      {item.recurringRule !== 'none' && (
                        <span className="inline-flex items-center gap-1 capitalize">
                          <Repeat className="h-3 w-3" />
                          {item.recurringRule}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {item.description && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {item.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleJoin(item.meetingCode)}
                    className="inline-flex items-center gap-1 rounded-full bg-[#2563eb] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 cursor-pointer"
                  >
                    <Play className="h-3 w-3" />
                    Start / Join
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(`${window.location.origin}/?join=${item.meetingCode}`)
                        .catch(() => {});
                      pushToast('Invite link copied', 'success');
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-white/12 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                  >
                    <Copy className="h-3 w-3" />
                    Copy Link
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-white/12 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                  >
                    <Edit3 className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCancelSchedule(item.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
