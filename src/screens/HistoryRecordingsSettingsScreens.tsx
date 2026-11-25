import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Film,
  Loader2,
  Moon,
  Play,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Volume2,
} from 'lucide-react';
import { formatDuration } from '../components/BrandLogo';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { enumerateMediaDevices, type MediaDevicesSnapshot } from '../lib/mediaEngine';
import type {
  AppScreen,
  EndedMeetingSummary,
  MeetingHistoryRecord,
  MeetingRecord,
  RecordingRecord,
  StructuredMeetingSummary,
} from '../types/connectmeet';

/* ============================================================================
 * SCREEN 12: MEETING HISTORY (with Gemini Summary & Spoken TTS Recap)
 * ========================================================================== */
export function HistoryScreen({
  onEnterLobby,
}: {
  onEnterLobby: (meeting: MeetingRecord) => void;
}) {
  const { pushToast } = useApp();
  const [history, setHistory] = useState<MeetingHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'ended'>('all');
  const [selected, setSelected] = useState<MeetingHistoryRecord | null>(null);
  const [archivedMessages, setArchivedMessages] = useState<
    Array<{ id: number; senderName: string; message: string; createdAt: string }>
  >([]);
  const [notesInput, setNotesInput] = useState('');
  const [generatingAi, setGeneratingAi] = useState(false);
  const [generatingTts, setGeneratingTts] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    api
      .listHistory()
      .then((res) => setHistory(res.history))
      .catch((err) =>
        pushToast('Failed to load meeting history', 'error', err instanceof Error ? err.message : undefined)
      )
      .finally(() => setLoading(false));
  }, [pushToast]);

  const handleSelectRow = async (item: MeetingHistoryRecord) => {
    setSelected(item);
    setAudioUrl(null);
    try {
      const msgRes = await api.listMeetingMessages(item.meetingId);
      setArchivedMessages(msgRes.messages);
    } catch {
      setArchivedMessages([]);
    }
  };

  const handleGenerateSummary = async () => {
    if (!selected) return;
    setGeneratingAi(true);
    try {
      const res = await api.generateAiSummary({
        meetingId: selected.meetingId,
        meetingTitle: selected.meetingTitle,
        transcript: '',
        chatHistory: archivedMessages.map((m) => ({
          senderName: m.senderName,
          message: m.message,
        })),
        manualNotes: notesInput,
      });
      const updated = { ...selected, aiSummary: res.summary };
      setSelected(updated);
      setHistory((prev) => prev.map((h) => (h.id === selected.id ? updated : h)));
      pushToast('AI meeting summary generated', 'success');
    } catch (err) {
      pushToast(
        'Summary unavailable',
        'error',
        err instanceof Error ? err.message : 'Add notes or chat messages first.'
      );
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleGenerateSpokenRecap = async (mode: 'single' | 'dual') => {
    if (!selected?.aiSummary) return;
    setGeneratingTts(true);
    try {
      const s = selected.aiSummary;
      const script = [
        s.executiveSummary,
        s.keyDiscussionPoints.length ? `Key points: ${s.keyDiscussionPoints.join('. ')}.` : '',
        s.actionItems.length
          ? `Action items: ${s.actionItems.map((a) => `${a.task} assigned to ${a.owner}`).join('. ')}.`
          : '',
      ]
        .filter(Boolean)
        .join(' ');
      const res = await api.generateSpokenRecap({
        title: selected.meetingTitle,
        script,
        mode,
      });
      setAudioUrl(`data:${res.mimeType};base64,${res.audioBase64}`);
      pushToast('Spoken audio recap ready', 'success');
    } catch (err) {
      pushToast('Audio recap failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setGeneratingTts(false);
    }
  };

  const filtered = history.filter((h) => {
    if (statusFilter !== 'all' && h.meetingStatus !== statusFilter) return false;
    if (!queryText.trim()) return true;
    const q = queryText.toLowerCase();
    return (
      h.meetingTitle.toLowerCase().includes(q) ||
      h.meetingCode.toLowerCase().includes(q) ||
      h.hostName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Search by title, meeting code, or host..."
            className="w-full rounded-full border border-slate-300 dark:border-white/12 bg-white dark:bg-[#131b2e] pl-10 pr-4 py-2 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
          />
        </div>

        <div className="inline-flex items-center gap-1 rounded-xl bg-slate-200/70 dark:bg-[#131b2e] p-1 border border-slate-200 dark:border-white/8">
          {(['all', 'active', 'ended'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors cursor-pointer ${
                statusFilter === tab
                  ? 'bg-white dark:bg-[#2563eb] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-slate-100 dark:bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <Clock className="h-7 w-7 mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                No matching meetings found
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Join or host a call to record attendance, chat history, and AI summaries here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/6">
              {filtered.map((item) => {
                const isSelected = selected?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectRow(item)}
                    className={`w-full text-left px-5 py-4 flex items-center justify-between gap-4 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#2563eb]/10'
                        : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {item.meetingTitle}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                        {new Date(item.joinedAt).toLocaleString()} · {formatDuration(item.duration)}{' '}
                        · {item.participantCount}{' '}
                        {item.participantCount === 1 ? 'participant' : 'participants'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-xs text-[#2563eb] dark:text-[#b4c5ff]">
                        {item.meetingCode}
                      </p>
                      <p className="text-[11px] text-slate-500 capitalize mt-0.5">
                        {item.aiSummary ? 'AI Summary Ready' : item.meetingStatus}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail & AI Recap Panel */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-6 space-y-5">
          {!selected ? (
            <div className="py-12 text-center">
              <Sparkles className="h-7 w-7 mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Select a meeting
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Inspect participant counts, archived chat, AI summaries, and spoken audio recaps.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                    {selected.meetingTitle}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    Host: {selected.hostName} · Duration: {formatDuration(selected.duration)}
                  </p>
                </div>
                {selected.meetingStatus !== 'ended' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await api.lookupMeeting(selected.meetingCode);
                      onEnterLobby(res.meeting);
                    }}
                    className="rounded-full bg-[#2563eb] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 cursor-pointer shrink-0"
                  >
                    Rejoin
                  </button>
                )}
              </div>

              {/* AI Summary Output */}
              {selected.aiSummary ? (
                <div className="space-y-4 border-t border-slate-200 dark:border-white/8 pt-4">
                  <div>
                    <p className="text-xs font-semibold text-[#2563eb] dark:text-[#b4c5ff] mb-1">
                      Executive Summary
                    </p>
                    <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                      {selected.aiSummary.executiveSummary}
                    </p>
                  </div>

                  {selected.aiSummary.keyDiscussionPoints.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white mb-1">
                        Key Discussion Points
                      </p>
                      <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                        {selected.aiSummary.keyDiscussionPoints.map((pt, idx) => (
                          <li key={idx}>{pt}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selected.aiSummary.actionItems.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white mb-1.5">
                        Action Items
                      </p>
                      <div className="space-y-1.5">
                        {selected.aiSummary.actionItems.map((act, idx) => (
                          <div
                            key={idx}
                            className="rounded-xl bg-slate-50 dark:bg-[#0b1326]/70 px-3 py-2 text-xs"
                          >
                            <p className="font-medium text-slate-900 dark:text-white">{act.task}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              Owner: {act.owner} · Priority: {act.priority}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Spoken Audio Recap (Gemini 3.8 Flash TTS) */}
                  <div className="border-t border-slate-200 dark:border-white/8 pt-4 space-y-2.5">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Volume2 className="h-3.5 w-3.5 text-[#7c3aed]" />
                      Spoken Audio Recap (Gemini TTS)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={generatingTts}
                        onClick={() => handleGenerateSpokenRecap('single')}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#7c3aed] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 disabled:opacity-60 cursor-pointer"
                      >
                        {generatingTts ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        Single-Voice Briefing
                      </button>
                      <button
                        type="button"
                        disabled={generatingTts}
                        onClick={() => handleGenerateSpokenRecap('dual')}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 dark:border-white/15 px-3.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-60 cursor-pointer"
                      >
                        Dual-Host Audio Recap
                      </button>
                    </div>
                    {audioUrl && (
                      <audio controls src={audioUrl} className="w-full h-9 mt-2" />
                    )}
                  </div>
                </div>
              ) : (
                <div className="border-t border-slate-200 dark:border-white/8 pt-4 space-y-3">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Generate structured notes and action items from archived chat (
                    {archivedMessages.length} messages) plus any meeting notes below.
                  </p>
                  <textarea
                    rows={3}
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Optional notes or key discussion takeaways..."
                    className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={generatingAi}
                    onClick={handleGenerateSummary}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#2563eb] px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-60 cursor-pointer"
                  >
                    {generatingAi ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {generatingAi ? 'Generating AI Summary...' : 'Generate AI Summary & Action Items'}
                  </button>
                </div>
              )}

              {/* Archived Chat Messages */}
              {archivedMessages.length > 0 && (
                <div className="border-t border-slate-200 dark:border-white/8 pt-4">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white mb-2">
                    Archived Chat ({archivedMessages.length})
                  </p>
                  <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                    {archivedMessages.map((m) => (
                      <div key={m.id} className="text-xs">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {m.senderName}:{' '}
                        </span>
                        <span className="text-slate-600 dark:text-slate-300">{m.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * SCREEN 13: RECORDINGS (LiveKit Egress Cloud Recording Management)
 * ========================================================================== */
export function RecordingsScreen() {
  const { pushToast } = useApp();
  const [recordings, setRecordings] = useState<RecordingRecord[]>([]);
  const [egressConfigured, setEgressConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<RecordingRecord | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    api
      .listRecordings()
      .then((res) => {
        setRecordings(res.recordings);
        setEgressConfigured(res.egressConfigured);
      })
      .catch((err) =>
        pushToast('Failed to load recordings', 'error', err instanceof Error ? err.message : undefined)
      )
      .finally(() => setLoading(false));
  }, [pushToast]);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteRecording(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
      if (playing?.id === id) setPlaying(null);
      setConfirmDeleteId(null);
      pushToast('Recording deleted', 'info');
    } catch (err) {
      pushToast('Delete failed', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-6">
      {!egressConfigured && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
          <h3 className="font-display text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
            LiveKit Egress Configuration Required for Cloud Recording
          </h3>
          <p className="text-xs text-amber-800 dark:text-amber-100/80 leading-relaxed">
            Server-side meeting recordings use LiveKit Room Composite Egress. Configure{' '}
            <span className="font-mono">LIVEKIT_URL</span>,{' '}
            <span className="font-mono">LIVEKIT_API_KEY</span>, and{' '}
            <span className="font-mono">LIVEKIT_API_SECRET</span> in Settings &gt; Secrets with a
            cloud storage output bucket to capture and archive MP4 meeting recordings.
          </p>
        </div>
      )}

      {playing && playing.recordingUrl && (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#131b2e] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {playing.title}
            </h3>
            <button
              type="button"
              onClick={() => setPlaying(null)}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Close player
            </button>
          </div>
          <video controls src={playing.recordingUrl} className="w-full max-h-[420px] rounded-xl bg-black" />
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-100 dark:bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : recordings.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Film className="h-8 w-8 mx-auto text-slate-400 mb-3" />
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-1">
              No cloud recordings yet
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              When a host starts LiveKit Egress recording during a meeting, completed recordings
              appear here for streaming playback, download, and management.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/6">
            {recordings.map((rec) => (
              <div
                key={rec.id}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {rec.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    {new Date(rec.createdAt).toLocaleString()} · {formatDuration(rec.duration)} ·{' '}
                    <span className="capitalize">{rec.status}</span> ·{' '}
                    <span className="font-mono">{rec.meetingCode}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {rec.recordingUrl && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPlaying(rec)}
                        className="inline-flex items-center gap-1 rounded-full bg-[#2563eb] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 cursor-pointer"
                      >
                        <Play className="h-3 w-3" />
                        Play
                      </button>
                      <a
                        href={rec.recordingUrl}
                        download
                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 dark:border-white/12 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
                      >
                        <Download className="h-3 w-3" />
                        Download
                      </a>
                    </>
                  )}

                  {confirmDeleteId === rec.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDelete(rec.id)}
                        className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs text-slate-500 px-2 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(rec.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * SCREEN 14: USER SETTINGS
 * ========================================================================== */
export function SettingsScreen() {
  const {
    profile,
    settings,
    firebaseUser,
    theme,
    setTheme,
    refreshProfile,
    requestPasswordReset,
    pushToast,
  } = useApp();

  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl || '');
  const [language, setLanguage] = useState(settings?.language || 'en');
  const [cameraPref, setCameraPref] = useState(settings?.cameraPreference || 'default');
  const [micPref, setMicPref] = useState(settings?.microphonePreference || 'default');
  const [speakerPref, setSpeakerPref] = useState(settings?.speakerPreference || 'default');
  const [notifPrefs, setNotifPrefs] = useState(
    settings?.notificationPreferences || {
      emailInvites: true,
      meetingReminders: true,
      chatSounds: true,
      recordingReady: true,
    }
  );
  const [privacyPrefs, setPrivacyPrefs] = useState(
    settings?.privacyPreferences || {
      autoMuteOnJoin: false,
      autoCamOffOnJoin: false,
      waitingRoomByDefault: false,
    }
  );
  const [devices, setDevices] = useState<MediaDevicesSnapshot>({
    cameras: [],
    microphones: [],
    speakers: [],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName);
      setAvatarUrl(profile.avatarUrl || '');
    }
    if (settings) {
      setLanguage(settings.language);
      setCameraPref(settings.cameraPreference);
      setMicPref(settings.microphonePreference);
      setSpeakerPref(settings.speakerPreference);
      setNotifPrefs(settings.notificationPreferences);
      setPrivacyPrefs(settings.privacyPreferences);
    }
  }, [profile, settings]);

  useEffect(() => {
    enumerateMediaDevices().then(setDevices).catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await Promise.all([
        api.updateProfile({
          fullName: fullName.trim(),
          avatarUrl: avatarUrl.trim() || null,
        }),
        api.updateSettings({
          theme,
          language,
          cameraPreference: cameraPref,
          microphonePreference: micPref,
          speakerPreference: speakerPref,
          notificationPreferences: notifPrefs,
          privacyPreferences: privacyPrefs,
        }),
      ]);
      await refreshProfile();
      pushToast('Settings saved to your profile', 'success');
    } catch (err) {
      pushToast('Could not save settings', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="max-w-3xl space-y-6">
      {/* Profile */}
      <section className="rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-6 space-y-4">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Profile Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-4 py-2 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Email (verified)
            </label>
            <input
              type="email"
              disabled
              value={profile?.email || firebaseUser?.email || ''}
              className="w-full rounded-xl border border-slate-200 dark:border-white/8 bg-slate-100 dark:bg-[#0b1326]/40 px-4 py-2 text-sm text-slate-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Profile image URL
          </label>
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-4 py-2 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
          />
        </div>
      </section>

      {/* Appearance & Language */}
      <section className="rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-6 space-y-4">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Appearance & Language
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              Theme
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                  theme === 'dark'
                    ? 'border-[#2563eb] bg-[#2563eb]/15 text-[#2563eb] dark:text-[#b4c5ff]'
                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Moon className="h-4 w-4" />
                Luminous Dark
              </button>
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                  theme === 'light'
                    ? 'border-[#2563eb] bg-[#2563eb]/15 text-[#2563eb]'
                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Sun className="h-4 w-4" />
                Light Mode
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              Interface Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
            >
              <option value="en">English (US)</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="ja">日本語</option>
            </select>
          </div>
        </div>
      </section>

      {/* Audio & Video Hardware */}
      <section className="rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Audio, Video & Connected Devices
          </h3>
          <button
            type="button"
            onClick={() => enumerateMediaDevices().then(setDevices)}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#2563eb] dark:text-[#b4c5ff] hover:underline cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh devices
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Default camera
            </label>
            <select
              value={cameraPref}
              onChange={(e) => setCameraPref(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-3 py-2 text-xs text-slate-900 dark:text-white"
            >
              <option value="default">System Default</option>
              {devices.cameras.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Default microphone
            </label>
            <select
              value={micPref}
              onChange={(e) => setMicPref(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-3 py-2 text-xs text-slate-900 dark:text-white"
            >
              <option value="default">System Default</option>
              {devices.microphones.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Microphone ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Default speaker
            </label>
            <select
              value={speakerPref}
              onChange={(e) => setSpeakerPref(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-3 py-2 text-xs text-slate-900 dark:text-white"
            >
              <option value="default">System Default</option>
              {devices.speakers.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Speaker ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Notifications, Privacy & Security */}
      <section className="rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Notifications
            </h3>
            {(
              [
                ['emailInvites', 'Email invitations'],
                ['meetingReminders', 'Meeting reminders'],
                ['chatSounds', 'In-meeting chat chimes'],
                ['recordingReady', 'Recording ready alerts'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={notifPrefs[key]}
                  onChange={(e) => setNotifPrefs((p) => ({ ...p, [key]: e.target.checked }))}
                  className="rounded border-slate-300 text-[#2563eb]"
                />
              </label>
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Privacy Defaults
            </h3>
            {(
              [
                ['autoMuteOnJoin', 'Mute microphone when entering lobby'],
                ['autoCamOffOnJoin', 'Turn camera off when entering lobby'],
                ['waitingRoomByDefault', 'Enable waiting room on new meetings'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={privacyPrefs[key]}
                  onChange={(e) => setPrivacyPrefs((p) => ({ ...p, [key]: e.target.checked }))}
                  className="rounded border-slate-300 text-[#2563eb]"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-white/8 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <Shield className="h-4 w-4 text-emerald-500" />
            <span>Authenticated via Firebase Security ({firebaseUser?.providerData?.[0]?.providerId || 'google.com'})</span>
          </div>
          {profile?.email && (
            <button
              type="button"
              onClick={async () => {
                await requestPasswordReset(profile.email).catch(() => {});
                pushToast('Password reset email requested', 'info');
              }}
              className="text-xs font-medium text-[#2563eb] dark:text-[#b4c5ff] hover:underline cursor-pointer"
            >
              Send password reset email
            </button>
          )}
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[#2563eb] px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-60 cursor-pointer"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </form>
  );
}

/* ============================================================================
 * SCREEN 15: MEETING ENDED
 * ========================================================================== */
export function MeetingEndedScreen({
  ended,
  onNavigate,
  onRejoin,
}: {
  ended: EndedMeetingSummary;
  onNavigate: (screen: AppScreen) => void;
  onRejoin: (meeting: MeetingRecord) => void;
}) {
  const { pushToast } = useApp();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [summary, setSummary] = useState<StructuredMeetingSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);

  const handleFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ended.historyId) {
      setFeedbackSent(true);
      pushToast('Thank you for your feedback', 'success');
      return;
    }
    try {
      await api.submitFeedback(ended.historyId, rating, comment);
      setFeedbackSent(true);
      pushToast('Feedback saved', 'success');
    } catch (err) {
      pushToast('Could not submit feedback', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleQuickSummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await api.generateAiSummary({
        meetingId: ended.meeting.id,
        meetingTitle: ended.meeting.title,
        transcript: ended.transcriptText,
        chatHistory: ended.chatMessages,
      });
      setSummary(res.summary);
      pushToast('AI recap generated and saved to History', 'success');
    } catch (err) {
      pushToast('Summary unavailable', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setLoadingSummary(false);
    }
  };

  const handlePlayAudioBriefing = async () => {
    if (!summary) return;
    setLoadingAudio(true);
    try {
      const res = await api.generateSpokenRecap({
        title: ended.meeting.title,
        script: `${summary.executiveSummary} ${summary.smartNotes}`,
        mode: 'single',
      });
      setAudioUrl(`data:${res.mimeType};base64,${res.audioBase64}`);
    } catch (err) {
      pushToast('Audio recap failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setLoadingAudio(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b1326] text-slate-900 dark:text-[#dae2fd] flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#131b2e] p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {ended.endedByHost ? 'Meeting ended for everyone' : 'You left the meeting'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {ended.meeting.title} · Duration:{' '}
            <span className="font-mono tabular-nums font-semibold">
              {formatDuration(ended.durationSeconds)}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="rounded-full bg-[#2563eb] px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors cursor-pointer"
          >
            Return to Dashboard
          </button>
          {!ended.endedByHost && (
            <button
              type="button"
              onClick={() => onRejoin(ended.meeting)}
              className="rounded-full border border-slate-300 dark:border-white/15 px-5 py-2.5 text-sm font-semibold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              Rejoin Call
            </button>
          )}
          <button
            type="button"
            disabled={loadingSummary}
            onClick={handleQuickSummary}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-4 py-2.5 text-sm font-semibold text-[#7c3aed] dark:text-[#d2bbff] hover:bg-[#7c3aed]/20 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loadingSummary ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            AI Recap
          </button>
        </div>

        {summary && (
          <div className="rounded-xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#0b1326]/70 p-4 space-y-3">
            <p className="text-xs font-semibold text-[#2563eb] dark:text-[#b4c5ff]">
              AI Meeting Summary
            </p>
            <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
              {summary.executiveSummary}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={loadingAudio}
                onClick={handlePlayAudioBriefing}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#7c3aed] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 cursor-pointer"
              >
                <Volume2 className="h-3.5 w-3.5" />
                {loadingAudio ? 'Synthesizing...' : 'Listen to Spoken Recap'}
              </button>
            </div>
            {audioUrl && <audio controls src={audioUrl} className="w-full h-9" />}
          </div>
        )}

        {/* Call Quality Feedback */}
        <div className="border-t border-slate-200 dark:border-white/8 pt-5">
          {feedbackSent ? (
            <p className="text-center text-xs text-emerald-600 dark:text-[#4edea3] font-medium">
              Thank you—your call quality rating has been recorded.
            </p>
          ) : (
            <form onSubmit={handleFeedback} className="space-y-3">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 text-center">
                How was your audio and video quality?
              </p>
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    aria-label={`Rate ${star} stars`}
                    className="p-1 cursor-pointer"
                  >
                    <Star
                      className={`h-6 w-6 ${
                        star <= rating
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300 dark:text-slate-600'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Optional feedback..."
                  className="flex-1 rounded-full border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-4 py-2 text-xs text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-full border border-slate-300 dark:border-white/15 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                >
                  Submit
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
