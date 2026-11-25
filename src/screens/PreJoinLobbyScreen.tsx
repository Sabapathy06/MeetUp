import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  Lock,
  Mic,
  MicOff,
  MonitorUp,
  RefreshCw,
  Shield,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { ConnectMeetLogo, VIRTUAL_BACKGROUNDS } from '../components/BrandLogo';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import {
  acquireLocalMedia,
  createAudioLevelMonitor,
  enumerateMediaDevices,
  type MediaDevicesSnapshot,
} from '../lib/mediaEngine';
import {
  ensureFirestoreRoom,
  requestWaitingRoomEntry,
  subscribeOwnWaitingStatus,
} from '../lib/roomRealtime';
import type {
  BackgroundEffect,
  LobbyJoinConfig,
  MeetingRecord,
} from '../types/connectmeet';

interface PreJoinLobbyScreenProps {
  meeting: MeetingRecord;
  initialPasscode?: string;
  onBack: () => void;
  onJoinReady: (config: LobbyJoinConfig) => void;
}

export function PreJoinLobbyScreen({
  meeting,
  initialPasscode = '',
  onBack,
  onJoinReady,
}: PreJoinLobbyScreenProps) {
  const { profile, settings, firebaseUser, pushToast } = useApp();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const isHost = firebaseUser?.uid === meeting.hostId;

  const [displayName, setDisplayName] = useState(
    profile?.fullName || firebaseUser?.displayName || 'Participant'
  );
  const [passcode, setPasscode] = useState(initialPasscode);
  const [cameraEnabled, setCameraEnabled] = useState(
    !(settings?.privacyPreferences?.autoCamOffOnJoin ?? false)
  );
  const [micEnabled, setMicEnabled] = useState(
    !(settings?.privacyPreferences?.autoMuteOnJoin ?? false)
  );
  const [cameraDeviceId, setCameraDeviceId] = useState(settings?.cameraPreference || 'default');
  const [micDeviceId, setMicDeviceId] = useState(settings?.microphonePreference || 'default');
  const [speakerDeviceId, setSpeakerDeviceId] = useState(settings?.speakerPreference || 'default');
  const [backgroundEffect, setBackgroundEffect] = useState<BackgroundEffect>('none');
  const [devices, setDevices] = useState<MediaDevicesSnapshot>({
    cameras: [],
    microphones: [],
    speakers: [],
  });
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [joining, setJoining] = useState(false);
  const [waitingStatus, setWaitingStatus] = useState<'idle' | 'pending' | 'denied'>('idle');
  const [pendingScreenShare, setPendingScreenShare] = useState(false);

  const stopPreview = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const loadPreview = async () => {
    stopPreview();
    setMediaError(null);
    const { stream, error } = await acquireLocalMedia({
      video: cameraEnabled,
      audio: micEnabled,
      cameraDeviceId,
      micDeviceId,
    });
    if (error) {
      setMediaError(error);
    }
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    const devSnap = await enumerateMediaDevices().catch(() => ({
      cameras: [],
      microphones: [],
      speakers: [],
    }));
    setDevices(devSnap);
  };

  useEffect(() => {
    loadPreview();
    return () => stopPreview();
  }, [cameraEnabled, micEnabled, cameraDeviceId, micDeviceId]);

  useEffect(() => {
    const cleanup = createAudioLevelMonitor(
      micEnabled ? streamRef.current : null,
      (lvl) => setAudioLevel(lvl)
    );
    return cleanup;
  }, [micEnabled, mediaError, cameraEnabled, micDeviceId]);

  // Listen for waiting room admission if guest asked to join
  useEffect(() => {
    if (waitingStatus !== 'pending' || !firebaseUser) return;
    const unsub = subscribeOwnWaitingStatus(meeting.roomName, firebaseUser.uid, (req) => {
      if (!req) return;
      if (req.status === 'admitted') {
        completeJoin(pendingScreenShare, true);
      } else if (req.status === 'denied') {
        setWaitingStatus('denied');
        pushToast('Host declined the join request', 'error');
      }
    });
    return () => unsub();
  }, [waitingStatus, firebaseUser, meeting.roomName, pendingScreenShare]);

  const completeJoin = async (startWithScreenShare: boolean, admitted = false) => {
    setJoining(true);
    try {
      if (isHost) {
        await ensureFirestoreRoom(meeting);
      }
      const res = await api.joinMeeting(meeting.id, {
        displayName: displayName.trim() || 'Participant',
        passcode: passcode.trim() || undefined,
        isMuted: !micEnabled,
        cameraEnabled,
        admitted,
      });

      stopPreview();
      onJoinReady({
        meeting: res.meeting,
        displayName: displayName.trim() || 'Participant',
        cameraEnabled,
        micEnabled,
        cameraDeviceId,
        micDeviceId,
        speakerDeviceId,
        backgroundEffect,
        startWithScreenShare,
        passcode: passcode.trim() || undefined,
        historyId: res.historyId,
        role: res.role,
        livekit: res.livekit,
      });
    } catch (err) {
      pushToast('Cannot join meeting', 'error', err instanceof Error ? err.message : undefined);
      setWaitingStatus('idle');
    } finally {
      setJoining(false);
    }
  };

  const handlePrimaryAction = async (startWithScreenShare = false) => {
    if (!displayName.trim()) {
      pushToast('Enter your display name', 'error');
      return;
    }

    const needsApproval = !isHost && (meeting.isPrivate || meeting.isLocked);
    if (needsApproval && waitingStatus !== 'pending') {
      if (!firebaseUser) return;
      setPendingScreenShare(startWithScreenShare);
      setWaitingStatus('pending');
      try {
        await requestWaitingRoomEntry(
          meeting.roomName,
          meeting.hostId,
          firebaseUser.uid,
          displayName.trim()
        );
        pushToast('Waiting for host approval', 'info');
      } catch (err) {
        setWaitingStatus('idle');
        pushToast(
          'Could not contact waiting room',
          'error',
          err instanceof Error ? err.message : undefined
        );
      }
      return;
    }

    await completeJoin(startWithScreenShare, false);
  };

  const activeVirtualBg = VIRTUAL_BACKGROUNDS.find((b) => b.id === backgroundEffect);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b1326] text-slate-900 dark:text-[#dae2fd] flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/8">
        <ConnectMeetLogo />
        <button
          type="button"
          onClick={() => {
            stopPreview();
            onBack();
          }}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to workspace
        </button>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-8 lg:py-12 flex items-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full items-start">
          {/* Left: Live Video Preview & Controls */}
          <div className="lg:col-span-7 space-y-4">
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-[#0f172a]">
              {activeVirtualBg && (
                <img
                  src={activeVirtualBg.url}
                  alt={activeVirtualBg.label}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 h-full w-full object-cover opacity-85"
                />
              )}

              {cameraEnabled && !mediaError ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`relative z-10 h-full w-full object-cover scale-x-[-1] transition-all ${
                    backgroundEffect === 'blur'
                      ? 'blur-[2px]'
                      : activeVirtualBg
                        ? 'opacity-90 mix-blend-normal'
                        : ''
                  }`}
                />
              ) : (
                <div className="relative z-10 flex h-full w-full flex-col items-center justify-center bg-[#131b2e]/90 p-6 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#2563eb] to-[#7c3aed] text-2xl font-bold text-white mb-3">
                    {displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="text-sm font-medium text-white">
                    {mediaError ? 'Camera preview unavailable' : 'Camera is turned off'}
                  </p>
                  {mediaError && (
                    <p className="text-xs text-slate-300 mt-1 max-w-sm">{mediaError}</p>
                  )}
                </div>
              )}

              {/* Bottom Scrim & Live Mic Meter + Media Toggle Buttons */}
              <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-5 flex items-end justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <span className="rounded-full bg-slate-900/75 backdrop-blur-md px-3 py-1 text-xs font-medium text-white border border-white/10">
                    {displayName || 'Participant'}
                  </span>
                  {micEnabled && (
                    <div
                      className="flex items-end gap-0.5 h-4 px-2 py-1 rounded-full bg-slate-900/75 border border-white/10"
                      aria-label="Live microphone level"
                    >
                      {[0.12, 0.25, 0.4, 0.55].map((thresh, idx) => (
                        <span
                          key={idx}
                          className={`w-1 rounded-full transition-all duration-75 ${
                            audioLevel >= thresh ? 'bg-[#10b981]' : 'bg-white/25'
                          }`}
                          style={{ height: `${Math.min(100, Math.max(25, audioLevel * 180 + idx * 14))}%` }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setMicEnabled((v) => !v)}
                    aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
                    className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors cursor-pointer ${
                      micEnabled
                        ? 'bg-white/15 backdrop-blur-md text-white hover:bg-white/25 border border-white/15'
                        : 'bg-[#ef4444] text-white hover:bg-rose-600'
                    }`}
                  >
                    {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCameraEnabled((v) => !v)}
                    aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
                    className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors cursor-pointer ${
                      cameraEnabled
                        ? 'bg-white/15 backdrop-blur-md text-white hover:bg-white/25 border border-white/15'
                        : 'bg-[#ef4444] text-white hover:bg-rose-600'
                    }`}
                  >
                    {cameraEnabled ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </div>

            {mediaError && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>You can still join audio-only or listen-only, or retry hardware access.</span>
                </div>
                <button
                  type="button"
                  onClick={loadPreview}
                  className="inline-flex items-center gap-1 font-semibold underline shrink-0 cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              </div>
            )}

            {/* Background Blur & Virtual Backgrounds */}
            <div className="rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <Sparkles className="h-3.5 w-3.5 text-[#7c3aed]" />
                Visual Effects & Virtual Backgrounds
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['none', 'None'],
                    ['blur', 'Soft Blur'],
                    ...VIRTUAL_BACKGROUNDS.map((b) => [b.id, b.label] as const),
                  ] as Array<[BackgroundEffect, string]>
                ).map(([effectId, label]) => (
                  <button
                    key={effectId}
                    type="button"
                    onClick={() => setBackgroundEffect(effectId)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      backgroundEffect === effectId
                        ? 'bg-[#2563eb] text-white'
                        : 'border border-slate-200 dark:border-white/12 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Hardware Device Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-3">
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  <Camera className="h-3.5 w-3.5" />
                  Camera
                </label>
                <select
                  value={cameraDeviceId}
                  onChange={(e) => setCameraDeviceId(e.target.value)}
                  className="w-full bg-transparent text-xs font-medium text-slate-900 dark:text-white focus:outline-none truncate"
                >
                  <option value="default" className="dark:bg-[#131b2e]">Default Camera</option>
                  {devices.cameras.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId} className="dark:bg-[#131b2e]">
                      {d.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-3">
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  <Mic className="h-3.5 w-3.5" />
                  Microphone
                </label>
                <select
                  value={micDeviceId}
                  onChange={(e) => setMicDeviceId(e.target.value)}
                  className="w-full bg-transparent text-xs font-medium text-slate-900 dark:text-white focus:outline-none truncate"
                >
                  <option value="default" className="dark:bg-[#131b2e]">Default Microphone</option>
                  {devices.microphones.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId} className="dark:bg-[#131b2e]">
                      {d.label || `Microphone ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-3">
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  <Volume2 className="h-3.5 w-3.5" />
                  Speaker
                </label>
                <select
                  value={speakerDeviceId}
                  onChange={(e) => setSpeakerDeviceId(e.target.value)}
                  className="w-full bg-transparent text-xs font-medium text-slate-900 dark:text-white focus:outline-none truncate"
                >
                  <option value="default" className="dark:bg-[#131b2e]">Default Speaker</option>
                  {devices.speakers.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId} className="dark:bg-[#131b2e]">
                      {d.label || `Speaker ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Right: Meeting Details & Join Controls */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#131b2e] p-7 space-y-6">
            <div>
              <p className="text-xs font-mono text-[#2563eb] dark:text-[#b4c5ff] mb-1">
                {meeting.meetingCode}
              </p>
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mb-1.5">
                {meeting.title}
              </h1>
              {meeting.description && (
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {meeting.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>Host: {meeting.hostName || 'MeetUp Host'}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5 text-emerald-500" />
                  {isHost ? 'You are the host' : meeting.isPrivate ? 'Waiting room active' : 'Ready to join'}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Your display name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
                />
              </div>

              {!isHost && meeting.requiresPasscode && (
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    <Lock className="h-3.5 w-3.5" />
                    Meeting passcode
                  </label>
                  <input
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Enter passcode"
                    className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
                  />
                </div>
              )}
            </div>

            {waitingStatus === 'pending' ? (
              <div className="rounded-xl border border-[#2563eb]/30 bg-[#2563eb]/10 p-4 text-center space-y-2">
                <Clock className="h-6 w-6 mx-auto text-[#2563eb] animate-pulse" />
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Waiting for host to admit you...
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  You will automatically enter the room once the host approves your request.
                </p>
              </div>
            ) : waitingStatus === 'denied' ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-center space-y-2">
                <p className="text-sm font-semibold text-rose-600 dark:text-rose-300">
                  Admission request declined
                </p>
                <button
                  type="button"
                  onClick={() => setWaitingStatus('idle')}
                  className="text-xs font-semibold underline cursor-pointer"
                >
                  Request again
                </button>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                <button
                  type="button"
                  disabled={joining}
                  onClick={() => handlePrimaryAction(false)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#2563eb] px-6 py-3 text-sm font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {joining
                    ? 'Connecting...'
                    : !isHost && (meeting.isPrivate || meeting.isLocked)
                      ? 'Ask to Join'
                      : 'Join Now'}
                </button>

                <button
                  type="button"
                  disabled={joining}
                  onClick={() => handlePrimaryAction(true)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-[#171f33] px-6 py-3 text-sm font-semibold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-[#222a3d] transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <MonitorUp className="h-4 w-4 text-[#2563eb]" />
                  Present Screen
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
