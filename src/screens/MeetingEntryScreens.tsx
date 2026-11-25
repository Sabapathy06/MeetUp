import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Check,
  Copy,
  Link2,
  Lock,
  Mail,
  Shield,
  Video,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { ensureFirestoreRoom } from '../lib/roomRealtime';
import type { AppScreen, MeetingRecord } from '../types/connectmeet';

interface NewMeetingScreenProps {
  onNavigate: (screen: AppScreen) => void;
  onEnterLobby: (meeting: MeetingRecord) => void;
}

export function NewMeetingScreen({ onNavigate, onEnterLobby }: NewMeetingScreenProps) {
  const { pushToast, settings } = useApp();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(
    Boolean(settings?.privacyPreferences?.waitingRoomByDefault)
  );
  const [passcode, setPasscode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [createdForLater, setCreatedForLater] = useState<MeetingRecord | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);

  const createInstant = async () => {
    setSubmitting(true);
    try {
      const res = await api.createMeeting({
        title: title.trim() || 'Instant Meeting',
        description: description.trim(),
        isPrivate,
        passcode: passcode.trim() || undefined,
        status: 'active',
      });
      await ensureFirestoreRoom(res.meeting);
      onEnterLobby(res.meeting);
    } catch (err) {
      pushToast('Failed to start instant meeting', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const createForLater = async () => {
    setSubmitting(true);
    try {
      const res = await api.createMeeting({
        title: title.trim() || 'Team Sync Meeting',
        description: description.trim(),
        isPrivate,
        passcode: passcode.trim() || undefined,
        status: 'active',
      });
      await ensureFirestoreRoom(res.meeting);
      setCreatedForLater(res.meeting);
      pushToast('Shareable meeting link generated', 'success');
    } catch (err) {
      pushToast('Failed to create meeting link', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async (code: string) => {
    const url = `${window.location.origin}/?join=${code}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    pushToast('Meeting link copied to clipboard', 'success');
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdForLater || !inviteEmail.trim()) return;
    setSendingInvite(true);
    try {
      const res = await api.sendInvitation(createdForLater.id, inviteEmail.trim());
      pushToast('Invitation recorded', 'success', res.delivery.note);
      setInviteEmail('');
    } catch (err) {
      pushToast('Invitation failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setSendingInvite(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white mb-1">
          Start or Prepare a Meeting
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Choose how you want to launch your room, configure optional waiting-room privacy, and
          share your unique meeting code.
        </p>
      </div>

      {/* Shared Room Configuration */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Meeting title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Q4 Product Architecture Review"
              className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Optional room passcode
            </label>
            <input
              type="text"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Leave blank for open link access"
              className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Agenda or description (optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Topics, deliverables, or links to review during the call"
            className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
          />
        </div>

        <label className="inline-flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="rounded border-slate-300 text-[#2563eb] focus:ring-[#2563eb]"
          />
          <Shield className="h-4 w-4 text-[#2563eb]" />
          <span>Enable waiting room (guests must ask host to join)</span>
        </label>
      </div>

      {/* Three Meeting Options */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#131b2e] p-6 flex flex-col justify-between">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb]/15 text-[#2563eb] dark:text-[#b4c5ff] mb-4">
              <Video className="h-5 w-5" />
            </div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-1.5">
              1. Create an instant meeting
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              Generate a live room immediately and proceed straight to the camera & audio lobby.
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={createInstant}
            className="w-full rounded-full bg-[#2563eb] px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {submitting ? 'Creating...' : 'Start Instant Meeting'}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#131b2e] p-6 flex flex-col justify-between">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#7c3aed]/15 text-[#7c3aed] dark:text-[#d2bbff] mb-4">
              <Link2 className="h-5 w-5" />
            </div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-1.5">
              2. Create a meeting for later
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              Reserve a unique meeting ID and shareable join link you can send to attendees now.
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={createForLater}
            className="w-full rounded-full border border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-[#171f33] px-4 py-2.5 text-xs font-semibold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#222a3d] transition-colors disabled:opacity-60 cursor-pointer"
          >
            Generate Link
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#131b2e] p-6 flex flex-col justify-between">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-[#4edea3] mb-4">
              <Calendar className="h-5 w-5" />
            </div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-1.5">
              3. Schedule in calendar
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              Pick a future date, duration, timezone, recurrence rule, and batch email invites.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('schedule')}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-[#171f33] px-4 py-2.5 text-xs font-semibold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#222a3d] transition-colors cursor-pointer"
          >
            Open Scheduler
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Created for Later Result Card */}
      {createdForLater && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-[#131b2e] p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-600 dark:text-[#4edea3] mb-0.5">
                Meeting Link Ready
              </p>
              <h4 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {createdForLater.title}
              </h4>
            </div>
            <span className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-200">
              ID: {createdForLater.meetingCode}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              readOnly
              value={`${window.location.origin}/?join=${createdForLater.meetingCode}`}
              className="flex-1 rounded-xl border border-slate-300 dark:border-white/12 bg-white dark:bg-[#0b1326]/70 px-3.5 py-2 text-xs font-mono text-slate-700 dark:text-slate-200"
            />
            <button
              type="button"
              onClick={() => handleCopy(createdForLater.meetingCode)}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-600 cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy Link'}
            </button>
          </div>

          <form onSubmit={handleSendInvite} className="flex flex-col sm:flex-row gap-2 pt-1">
            <div className="relative flex-1">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Invite participant by email..."
                className="w-full rounded-full border border-slate-300 dark:border-white/12 bg-white dark:bg-[#0b1326]/70 pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={sendingInvite}
              className="rounded-full border border-slate-300 dark:border-white/15 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
            >
              {sendingInvite ? 'Sending...' : 'Send Invite'}
            </button>
          </form>

          <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/8">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
            >
              Return to Dashboard
            </button>
            <button
              type="button"
              onClick={() => onEnterLobby(createdForLater)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563eb] dark:text-[#b4c5ff] hover:underline cursor-pointer"
            >
              Enter Lobby Now
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface JoinMeetingScreenProps {
  initialCode?: string;
  onEnterLobby: (meeting: MeetingRecord, passcode?: string) => void;
}

export function JoinMeetingScreen({ initialCode = '', onEnterLobby }: JoinMeetingScreenProps) {
  const [input, setInput] = useState(initialCode);
  const [passcode, setPasscode] = useState('');
  const [validating, setValidating] = useState(false);
  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const extractCode = (raw: string): string => {
    const trimmed = raw.trim();
    try {
      if (trimmed.includes('://')) {
        const u = new URL(trimmed);
        const param = u.searchParams.get('join');
        if (param) return param.trim();
        const segs = u.pathname.split('/').filter(Boolean);
        return segs[segs.length - 1] || trimmed;
      }
    } catch {
      // Not a URL
    }
    return trimmed;
  };

  const validateCode = async (rawValue: string) => {
    const code = extractCode(rawValue);
    if (!code) {
      setError('Enter a meeting ID or paste an invite link.');
      return;
    }
    setValidating(true);
    setError(null);
    setMeeting(null);
    try {
      const res = await api.lookupMeeting(code);
      setMeeting(res.meeting);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Meeting could not be found.');
    } finally {
      setValidating(false);
    }
  };

  useEffect(() => {
    if (initialCode) {
      validateCode(initialCode);
    }
  }, [initialCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    validateCode(input);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white mb-1">
          Join a Meeting
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Enter a MeetUp meeting code (e.g. <span className="font-mono">abc-defg-hij</span>)
          or paste a full invite link to validate room details before entering.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-6 space-y-4"
      >
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Meeting ID or invite link
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="abc-defg-hij or https://..."
              className="flex-1 rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-4 py-2.5 text-sm font-mono text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
            />
            <button
              type="submit"
              disabled={validating}
              className="rounded-full bg-[#2563eb] px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {validating ? 'Checking...' : 'Validate Meeting'}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-700 dark:text-rose-200">
            {error}
          </div>
        )}
      </form>

      {meeting && (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#131b2e] p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-[#2563eb] dark:text-[#b4c5ff] mb-1">
                Verified Meeting · <span className="font-mono">{meeting.meetingCode}</span>
              </p>
              <h3 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
                {meeting.title}
              </h3>
              {meeting.description && (
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  {meeting.description}
                </p>
              )}
            </div>
            <span
              className={`text-xs font-semibold capitalize ${
                meeting.status === 'ended'
                  ? 'text-rose-500'
                  : 'text-emerald-600 dark:text-[#4edea3]'
              }`}
            >
              {meeting.status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>Host: {meeting.hostName || 'MeetUp Host'}</span>
            <span aria-hidden="true">·</span>
            <span>{meeting.isPrivate ? 'Waiting room enabled' : 'Direct entry'}</span>
            {meeting.isLocked && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-500 font-medium">Room locked</span>
              </>
            )}
          </div>

          {meeting.requiresPasscode && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <Lock className="h-3.5 w-3.5" />
                Room passcode required
              </label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter meeting passcode"
                className="w-full max-w-xs rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-4 py-2 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
              />
            </div>
          )}

          <div className="pt-2 flex items-center justify-end">
            <button
              type="button"
              disabled={meeting.status === 'ended'}
              onClick={() => onEnterLobby(meeting, passcode.trim() || undefined)}
              className="inline-flex items-center gap-2 rounded-full bg-[#2563eb] px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {meeting.status === 'ended' ? 'Meeting Ended' : 'Continue to Pre-Join Lobby'}
              {meeting.status !== 'ended' && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
