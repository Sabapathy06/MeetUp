import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Check,
  Copy,
  Crown,
  Disc,
  Hand,
  Info,
  LayoutGrid,
  Lock,
  Mail,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  MoreHorizontal,
  PhoneOff,
  Pin,
  PinOff,
  Send,
  Shield,
  Smile,
  Sparkles,
  Subtitles,
  Unlock,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import type { Room as LiveKitRoom } from 'livekit-client';
import { formatDuration, VIRTUAL_BACKGROUNDS } from '../components/BrandLogo';
import { MeetingActivitiesPanel } from '../components/MeetingActivitiesPanel';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import {
  acquireLocalMedia,
  connectLiveKitRoom,
  createAudioLevelMonitor,
  enumerateMediaDevices,
  WebRtcMeshManager,
  type MediaDevicesSnapshot,
  type RemoteStreamEntry,
} from '../lib/mediaEngine';
import {
  hostUpdateParticipant,
  joinRoomPresence,
  leaveRoomPresence,
  resolveWaitingRoomRequest,
  sendRoomChat,
  subscribePresence,
  subscribeRoom,
  subscribeRoomMessages,
  subscribeWaitingRoom,
  updateFirestoreRoom,
  updateOwnPresence,
} from '../lib/roomRealtime';
import type {
  BackgroundEffect,
  EndedMeetingSummary,
  LobbyJoinConfig,
  RoomChatMessage,
  RoomDoc,
  RoomPresence,
  WaitingRoomRequest,
} from '../types/connectmeet';

interface ActiveMeetingScreenProps {
  joinConfig: LobbyJoinConfig;
  onMeetingEnded: (summary: EndedMeetingSummary) => void;
}

type SidebarTab = 'chat' | 'participants' | 'info' | 'activities' | null;

const REACTIONS = ['👍', '👏', '🎉', '❤️', '😂', '🔥'];
const CHAT_EMOJIS = ['👍', '🙌', '🚀', '✅', '💡', '👏', '😄', '❤️'];

function StreamVideoTile({
  stream,
  muted,
  mirror,
  displayName,
  role,
  isMuted,
  cameraEnabled,
  handRaised,
  isActiveSpeaker,
  isPinned,
  isScreenShare,
  reaction,
  backgroundEffect,
  onTogglePin,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  displayName: string;
  role?: string;
  isMuted: boolean;
  cameraEnabled: boolean;
  handRaised?: boolean;
  isActiveSpeaker: boolean;
  isPinned: boolean;
  isScreenShare?: boolean;
  reaction?: string;
  backgroundEffect?: BackgroundEffect;
  onTogglePin: () => void;
}) {
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoElRef.current) {
      videoElRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideo = Boolean(stream && stream.getVideoTracks().length > 0 && (cameraEnabled || isScreenShare));
  const virtualBg = !isScreenShare
    ? VIRTUAL_BACKGROUNDS.find((b) => b.id === backgroundEffect)
    : undefined;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl bg-[#131b2e] border transition-all duration-150 ${
        isActiveSpeaker
          ? 'border-[#10b981] active-speaker-ring'
          : 'border-white/10'
      }`}
    >
      {virtualBg && (
        <img
          src={virtualBg.url}
          alt={virtualBg.label}
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-85"
        />
      )}

      {hasVideo ? (
        <video
          ref={videoElRef}
          autoPlay
          playsInline
          muted={muted}
          className={`relative z-10 h-full w-full ${
            isScreenShare ? 'object-contain bg-black' : 'object-cover'
          } ${mirror && !isScreenShare ? 'scale-x-[-1]' : ''} ${
            !isScreenShare && backgroundEffect === 'blur' ? 'blur-[2px]' : ''
          }`}
        />
      ) : (
        <div className="relative z-10 flex h-full w-full flex-col items-center justify-center bg-[#131b2e]/90 p-4">
          <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#2563eb] to-[#7c3aed] text-xl sm:text-2xl font-bold text-white shadow-lg">
            {displayName.slice(0, 2).toUpperCase()}
          </div>
          {stream && stream.getAudioTracks().length > 0 && (
            <audio
              ref={(el) => {
                if (el && el.srcObject !== stream) el.srcObject = stream;
              }}
              autoPlay
              muted={muted}
            />
          )}
        </div>
      )}

      {/* Floating reaction burst */}
      {reaction && (
        <div className="absolute top-3 left-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/75 backdrop-blur-md border border-white/15 text-xl animate-bounce">
          {reaction}
        </div>
      )}

      {/* Top right indicators (hand raise + pin toggle) */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
        {handRaised && (
          <span
            title="Hand raised"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2563eb] text-white shadow"
          >
            <Hand className="h-4 w-4" />
          </span>
        )}
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={isPinned ? 'Unpin participant' : 'Pin participant'}
          className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md border border-white/15 transition-opacity cursor-pointer ${
            isPinned
              ? 'bg-[#2563eb] text-white opacity-100'
              : 'bg-slate-900/65 text-white opacity-0 group-hover:opacity-100 focus:opacity-100'
          }`}
        >
          {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Measured contrast scrim + participant badge */}
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-3.5 py-2.5 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/75 backdrop-blur-md border border-white/10 px-3 py-1 text-xs font-medium text-white max-w-[80%]">
          {isMuted ? (
            <MicOff className="h-3.5 w-3.5 text-[#ef4444] shrink-0" />
          ) : (
            <Mic className={`h-3.5 w-3.5 shrink-0 ${isActiveSpeaker ? 'text-[#10b981]' : 'text-slate-300'}`} />
          )}
          <span className="truncate">
            {isScreenShare ? `${displayName} (Presenting)` : displayName}
          </span>
          {role === 'host' && <Crown className="h-3 w-3 text-amber-400 shrink-0" />}
        </div>
      </div>
    </div>
  );
}

export function ActiveMeetingScreen({
  joinConfig,
  onMeetingEnded,
}: ActiveMeetingScreenProps) {
  const { firebaseUser, profile, pushToast } = useApp();
  const userId = firebaseUser!.uid;
  const roomId = joinConfig.meeting.roomName;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const joinedAtRef = useRef<number>(Date.now());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const liveKitRoomRef = useRef<LiveKitRoom | null>(null);
  const meshRef = useRef<WebRtcMeshManager | null>(null);
  const speechRecRef = useRef<{ stop: () => void } | null>(null);

  const [roomDoc, setRoomDoc] = useState<RoomDoc | null>(null);
  const [presenceList, setPresenceList] = useState<RoomPresence[]>([]);
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [waitingRequests, setWaitingRequests] = useState<WaitingRoomRequest[]>([]);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamEntry[]>([]);

  const [micEnabled, setMicEnabled] = useState(joinConfig.micEnabled);
  const [cameraEnabled, setCameraEnabled] = useState(joinConfig.cameraEnabled);
  const [cameraDeviceId, setCameraDeviceId] = useState(joinConfig.cameraDeviceId);
  const [micDeviceId, setMicDeviceId] = useState(joinConfig.micDeviceId);
  const [backgroundEffect, setBackgroundEffect] = useState<BackgroundEffect>(
    joinConfig.backgroundEffect
  );
  const [handRaised, setHandRaised] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionLine, setCaptionLine] = useState('');
  const [transcriptLines, setTranscriptLines] = useState<string[]>([]);
  const [activeSpeakers, setActiveSpeakers] = useState<string[]>([]);
  const [localSpeaking, setLocalSpeaking] = useState(false);

  const [layoutMode, setLayoutMode] = useState<'grid' | 'speaker'>('grid');
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(null);
  const [unreadChat, setUnreadChat] = useState(0);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [leaveMenuOpen, setLeaveMenuOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentBreakout, setCurrentBreakout] = useState('main');
  const [activeRecordingEgressId, setActiveRecordingEgressId] = useState<string | null>(null);

  const [chatInput, setChatInput] = useState('');
  const [showEmojiRow, setShowEmojiRow] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [devices, setDevices] = useState<MediaDevicesSnapshot>({
    cameras: [],
    microphones: [],
    speakers: [],
  });

  const isHost = joinConfig.meeting.hostId === userId;
  const isCoHost = Boolean(roomDoc?.coHostIds?.includes(userId));
  const isHostOrCoHost = isHost || isCoHost;

  const finishAndExit = async (endedByHost: boolean) => {
    const durationSeconds = Math.floor((Date.now() - joinedAtRef.current) / 1000);
    // Clean up media & realtime
    try {
      speechRecRef.current?.stop();
    } catch {}
    liveKitRoomRef.current?.disconnect();
    meshRef.current?.destroy();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());

    await leaveRoomPresence(roomId, userId).catch(() => {});
    await api
      .leaveMeeting(joinConfig.meeting.id, {
        historyId: joinConfig.historyId,
        durationSeconds,
      })
      .catch(() => {});

    onMeetingEnded({
      meeting: joinConfig.meeting,
      durationSeconds,
      historyId: joinConfig.historyId,
      endedByHost,
      transcriptText: transcriptLines.join('\n'),
      chatMessages: messages.map((m) => ({ senderName: m.senderName, message: m.body })),
    });
  };

  // Timer tick
  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - joinedAtRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Initialize media + LiveKit OR WebRTC fallback + Firestore presence
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const { stream } = await acquireLocalMedia({
        video: joinConfig.cameraEnabled,
        audio: joinConfig.micEnabled,
        cameraDeviceId: joinConfig.cameraDeviceId,
        micDeviceId: joinConfig.micDeviceId,
      });

      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      enumerateMediaDevices().then(setDevices).catch(() => {});

      await joinRoomPresence({
        roomId,
        userId,
        displayName: joinConfig.displayName,
        avatarUrl: profile?.avatarUrl || null,
        role: isHost ? 'host' : 'participant',
        isMuted: !joinConfig.micEnabled,
        cameraEnabled: joinConfig.cameraEnabled,
        isScreenSharing: false,
      }).catch(() => {});

      // Connect LiveKit if configured, else Firestore-signaled WebRTC mesh
      if (joinConfig.livekit?.configured && joinConfig.livekit.url && joinConfig.livekit.token) {
        try {
          const lkRoom = await connectLiveKitRoom({
            url: joinConfig.livekit.url,
            token: joinConfig.livekit.token,
            cameraEnabled: joinConfig.cameraEnabled,
            micEnabled: joinConfig.micEnabled,
            onRemoteStreamsChange: setRemoteStreams,
            onActiveSpeakersChange: setActiveSpeakers,
            onConnectionStateChange: () => {},
          });
          liveKitRoomRef.current = lkRoom;
        } catch (err) {
          pushToast(
            'LiveKit fallback active',
            'info',
            err instanceof Error ? err.message : 'Switched to direct WebRTC.'
          );
          const mesh = new WebRtcMeshManager(roomId, userId, setRemoteStreams);
          mesh.start(stream);
          meshRef.current = mesh;
        }
      } else {
        const mesh = new WebRtcMeshManager(roomId, userId, setRemoteStreams);
        mesh.start(stream);
        meshRef.current = mesh;
      }

      if (joinConfig.startWithScreenShare) {
        toggleScreenShare();
      }
    };

    init();

    return () => {
      cancelled = true;
      try {
        speechRecRef.current?.stop();
      } catch {}
      liveKitRoomRef.current?.disconnect();
      meshRef.current?.destroy();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      leaveRoomPresence(roomId, userId).catch(() => {});
    };
  }, []);

  // Local audio level monitor for active speaker glow
  useEffect(() => {
    const cleanup = createAudioLevelMonitor(micEnabled ? localStream : null, (lvl) => {
      setLocalSpeaking(lvl > 0.14);
    });
    return cleanup;
  }, [localStream, micEnabled]);

  // Subscribe Firestore Room, Presence, Chat, and Waiting Room
  useEffect(() => {
    const unsubRoom = subscribeRoom(roomId, (docData) => {
      setRoomDoc(docData);
      if (docData?.status === 'ended') {
        finishAndExit(true);
      }
    });

    const unsubPresence = subscribePresence(roomId, (list) => {
      setPresenceList(list);
      const mine = list.find((p) => p.userId === userId);
      if (mine?.kicked) {
        pushToast('You were removed from the meeting by the host', 'error');
        finishAndExit(false);
        return;
      }
      if (mine?.muteRequested && micEnabled) {
        setMicEnabled(false);
        localStreamRef.current?.getAudioTracks().forEach((t) => {
          t.enabled = false;
        });
        liveKitRoomRef.current?.localParticipant.setMicrophoneEnabled(false).catch(() => {});
        updateOwnPresence(roomId, userId, { isMuted: true, muteRequested: false }).catch(() => {});
        pushToast('Host muted your microphone', 'info');
      }
    });

    const unsubChat = subscribeRoomMessages(roomId, (msgs) => {
      setMessages((prev) => {
        if (sidebarTab !== 'chat' && msgs.length > prev.length && prev.length > 0) {
          setUnreadChat((c) => c + (msgs.length - prev.length));
        }
        return msgs;
      });
    });

    const unsubWaiting = isHost
      ? subscribeWaitingRoom(roomId, userId, (reqs) => {
          setWaitingRequests(reqs.filter((r) => r.status === 'pending'));
        })
      : () => {};

    return () => {
      unsubRoom();
      unsubPresence();
      unsubChat();
      unsubWaiting();
    };
  }, [roomId, userId, isHost, sidebarTab]);

  // Keep WebRTC mesh peers synchronized with active presence
  useEffect(() => {
    if (!meshRef.current) return;
    const sameBreakoutIds = presenceList
      .filter((p) => (p.breakoutRoom || 'main') === currentBreakout)
      .map((p) => p.userId);
    meshRef.current.syncPeers(sameBreakoutIds);
  }, [presenceList, currentBreakout]);

  // Live Captions via Web Speech API
  useEffect(() => {
    if (!captionsEnabled) {
      try {
        speechRecRef.current?.stop();
      } catch {}
      speechRecRef.current = null;
      setCaptionLine('');
      return;
    }

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;

    if (!SpeechRec) {
      pushToast('Live browser captions are not supported in this browser', 'info');
      setCaptionsEnabled(false);
      return;
    }

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const line = `${joinConfig.displayName}: ${text.trim()}`;
          setTranscriptLines((prev) => [...prev.slice(-150), line]);
          setCaptionLine(line);
        } else {
          interim += text;
        }
      }
      if (interim) {
        setCaptionLine(`${joinConfig.displayName}: ${interim}`);
      }
    };
    rec.onerror = () => {};
    try {
      rec.start();
      speechRecRef.current = rec;
    } catch {
      setCaptionsEnabled(false);
    }

    return () => {
      try {
        rec.stop();
      } catch {}
    };
  }, [captionsEnabled, joinConfig.displayName, pushToast]);

  const toggleMic = async () => {
    const next = !micEnabled;
    if (next && (!localStreamRef.current || localStreamRef.current.getAudioTracks().length === 0)) {
      const { stream, error } = await acquireLocalMedia({
        video: cameraEnabled,
        audio: true,
        cameraDeviceId,
        micDeviceId,
      });
      if (error || !stream) {
        pushToast('Microphone unavailable', 'error', error || undefined);
        return;
      }
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = stream;
      setLocalStream(stream);
      meshRef.current?.updateLocalStream(stream);
    } else {
      localStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = next;
      });
    }
    setMicEnabled(next);
    liveKitRoomRef.current?.localParticipant.setMicrophoneEnabled(next).catch(() => {});
    updateOwnPresence(roomId, userId, { isMuted: !next }).catch(() => {});
  };

  const toggleCamera = async () => {
    const next = !cameraEnabled;
    if (next && (!localStreamRef.current || localStreamRef.current.getVideoTracks().length === 0)) {
      const { stream, error } = await acquireLocalMedia({
        video: true,
        audio: micEnabled,
        cameraDeviceId,
        micDeviceId,
      });
      if (error || !stream) {
        pushToast('Camera unavailable', 'error', error || undefined);
        return;
      }
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = stream;
      setLocalStream(stream);
      meshRef.current?.updateLocalStream(stream);
    } else {
      localStreamRef.current?.getVideoTracks().forEach((t) => {
        t.enabled = next;
      });
    }
    setCameraEnabled(next);
    liveKitRoomRef.current?.localParticipant.setCameraEnabled(next).catch(() => {});
    updateOwnPresence(roomId, userId, { cameraEnabled: next }).catch(() => {});
  };

  const switchHardware = async (nextCam: string, nextMic: string) => {
    setCameraDeviceId(nextCam);
    setMicDeviceId(nextMic);
    const { stream, error } = await acquireLocalMedia({
      video: cameraEnabled,
      audio: micEnabled,
      cameraDeviceId: nextCam,
      micDeviceId: nextMic,
    });
    if (error || !stream) {
      pushToast('Could not switch device', 'error', error || undefined);
      return;
    }
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = stream;
    setLocalStream(stream);
    meshRef.current?.updateLocalStream(stream);
    pushToast('Media device updated', 'success');
  };

  const toggleScreenShare = async () => {
    if (roomDoc?.allowScreenShare === false && !isHostOrCoHost) {
      pushToast('Screen sharing is currently restricted by the host', 'info');
      return;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      liveKitRoomRef.current?.localParticipant.setScreenShareEnabled(false).catch(() => {});
      updateOwnPresence(roomId, userId, { isScreenSharing: false }).catch(() => {});
      return;
    }

    try {
      if (liveKitRoomRef.current) {
        await liveKitRoomRef.current.localParticipant.setScreenShareEnabled(true);
      }
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      screenStreamRef.current = display;
      setScreenStream(display);
      updateOwnPresence(roomId, userId, { isScreenSharing: true }).catch(() => {});
      display.getVideoTracks()[0].onended = () => {
        screenStreamRef.current = null;
        setScreenStream(null);
        liveKitRoomRef.current?.localParticipant.setScreenShareEnabled(false).catch(() => {});
        updateOwnPresence(roomId, userId, { isScreenSharing: false }).catch(() => {});
      };
    } catch {
      // User dismissed screen picker
    }
  };

  const toggleHandRaise = async () => {
    const next = !handRaised;
    setHandRaised(next);
    await updateOwnPresence(roomId, userId, { handRaised: next }).catch(() => {});
  };

  const sendReaction = async (emoji: string) => {
    setReactionsOpen(false);
    await updateOwnPresence(roomId, userId, {
      reaction: emoji,
      reactionAt: Date.now(),
    }).catch(() => {});
    window.setTimeout(() => {
      updateOwnPresence(roomId, userId, { reaction: '', reactionAt: 0 }).catch(() => {});
    }, 3500);
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    if (roomDoc?.allowChat === false && !isHostOrCoHost) {
      pushToast('Chat is currently disabled by the host', 'info');
      return;
    }
    const text = chatInput.trim();
    setChatInput('');
    try {
      await sendRoomChat(roomId, userId, joinConfig.displayName, text, 'text');
      api
        .archiveMessage(joinConfig.meeting.id, {
          message: text,
          senderName: joinConfig.displayName,
          messageType: 'text',
        })
        .catch(() => {});
    } catch (err) {
      pushToast('Could not send message', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleToggleLock = async () => {
    const next = !roomDoc?.isLocked;
    await updateFirestoreRoom(roomId, { isLocked: next }).catch(() => {});
    await api.updateMeeting(joinConfig.meeting.id, { isLocked: next }).catch(() => {});
    pushToast(next ? 'Meeting locked' : 'Meeting unlocked', 'info');
  };

  const handleToggleRoomPerm = async (field: 'allowChat' | 'allowScreenShare') => {
    const next = !(roomDoc?.[field] ?? true);
    await updateFirestoreRoom(roomId, { [field]: next }).catch(() => {});
    await api.updateMeeting(joinConfig.meeting.id, { [field]: next }).catch(() => {});
    pushToast('Participant permissions updated', 'info');
  };

  const handleToggleCoHost = async (target: RoomPresence) => {
    const current = roomDoc?.coHostIds || [];
    const promote = !current.includes(target.userId);
    const nextIds = promote
      ? [...current, target.userId].slice(0, 10)
      : current.filter((id) => id !== target.userId);
    await updateFirestoreRoom(roomId, { coHostIds: nextIds }).catch(() => {});
    await hostUpdateParticipant(roomId, target.userId, {
      role: promote ? 'co_host' : 'participant',
    }).catch(() => {});
    pushToast(
      promote ? `${target.displayName} promoted to Co-Host` : `${target.displayName} is now a Participant`,
      'info'
    );
  };

  const handleRemoveParticipant = async (target: RoomPresence) => {
    await hostUpdateParticipant(roomId, target.userId, { kicked: true }).catch(() => {});
    await api.removeParticipant(joinConfig.meeting.id, target.userId).catch(() => {});
    pushToast(`${target.displayName} removed from meeting`, 'info');
  };

  const handleEndForEveryone = async () => {
    await updateFirestoreRoom(roomId, { status: 'ended' }).catch(() => {});
    await api.updateMeeting(joinConfig.meeting.id, { status: 'ended' }).catch(() => {});
    await finishAndExit(true);
  };

  const handleToggleRecording = async () => {
    setMoreOpen(false);
    if (activeRecordingEgressId) {
      await api.stopRecording(activeRecordingEgressId).catch(() => {});
      setActiveRecordingEgressId(null);
      pushToast('Cloud recording stopped', 'info');
      return;
    }
    try {
      const res = await api.startRecording(joinConfig.meeting.id);
      setActiveRecordingEgressId(res.recording.egressId || res.recording.id);
      pushToast('LiveKit Egress cloud recording started', 'success');
    } catch (err) {
      pushToast(
        'Cloud recording unavailable',
        'error',
        err instanceof Error ? err.message : 'Configure LiveKit Egress in Secrets to record.'
      );
    }
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleCopyInvite = async () => {
    await navigator.clipboard
      .writeText(`${window.location.origin}/?join=${joinConfig.meeting.meetingCode}`)
      .catch(() => {});
    setCopiedCode(true);
    pushToast('Meeting link copied', 'success');
    window.setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleInviteEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSendingInvite(true);
    try {
      const res = await api.sendInvitation(joinConfig.meeting.id, inviteEmail.trim());
      pushToast('Invitation sent', 'success', res.delivery.note);
      setInviteEmail('');
    } catch (err) {
      pushToast('Invite failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setSendingInvite(false);
    }
  };

  // Build visible video tiles for current breakout room
  const visibleParticipants = useMemo(() => {
    const others = presenceList.filter(
      (p) => p.userId !== userId && (p.breakoutRoom || 'main') === currentBreakout
    );
    const selfTile = {
      id: userId,
      userId,
      displayName: `${joinConfig.displayName} (You)`,
      role: isHost ? 'host' : isCoHost ? 'co_host' : 'participant',
      stream: localStream,
      isMuted: !micEnabled,
      cameraEnabled,
      handRaised,
      isActiveSpeaker: localSpeaking || activeSpeakers.includes(userId),
      isScreenShare: false,
      mirror: true,
      reaction: presenceList.find((p) => p.userId === userId)?.reaction,
      backgroundEffect,
    };

    const peerTiles = others.map((p) => {
      const remote = remoteStreams.find((r) => r.userId === p.userId && !r.isScreenShare);
      return {
        id: p.userId,
        userId: p.userId,
        displayName: p.displayName,
        role: p.role,
        stream: remote?.stream || null,
        isMuted: p.isMuted,
        cameraEnabled: p.cameraEnabled,
        handRaised: p.handRaised,
        isActiveSpeaker: activeSpeakers.includes(p.userId),
        isScreenShare: false,
        mirror: false,
        reaction: p.reaction,
        backgroundEffect: 'none' as BackgroundEffect,
      };
    });

    return [selfTile, ...peerTiles];
  }, [
    presenceList,
    userId,
    currentBreakout,
    joinConfig.displayName,
    isHost,
    isCoHost,
    localStream,
    micEnabled,
    cameraEnabled,
    handRaised,
    localSpeaking,
    activeSpeakers,
    backgroundEffect,
    remoteStreams,
  ]);

  // Active screen share spotlight (local or remote)
  const activeScreenTile = useMemo(() => {
    if (screenStream) {
      return {
        id: 'local-screen',
        displayName: joinConfig.displayName,
        stream: screenStream,
      };
    }
    const remoteScreen = remoteStreams.find((r) => r.isScreenShare);
    if (remoteScreen) {
      const peer = presenceList.find((p) => p.userId === remoteScreen.userId);
      return {
        id: `screen-${remoteScreen.userId}`,
        displayName: peer?.displayName || 'Presenter',
        stream: remoteScreen.stream,
      };
    }
    return null;
  }, [screenStream, joinConfig.displayName, remoteStreams, presenceList]);

  const spotlightTile = useMemo(() => {
    if (pinnedId) {
      return visibleParticipants.find((t) => t.id === pinnedId) || null;
    }
    if (layoutMode === 'speaker') {
      return (
        visibleParticipants.find((t) => t.isActiveSpeaker) || visibleParticipants[0] || null
      );
    }
    return null;
  }, [pinnedId, layoutMode, visibleParticipants]);

  const gridColsClass =
    visibleParticipants.length <= 1
      ? 'grid-cols-1 max-w-4xl mx-auto'
      : visibleParticipants.length === 2
        ? 'grid-cols-1 md:grid-cols-2'
        : visibleParticipants.length <= 4
          ? 'grid-cols-1 sm:grid-cols-2'
          : 'grid-cols-2 lg:grid-cols-3';

  return (
    <div
      ref={containerRef}
      className="h-screen w-screen overflow-hidden bg-[#090d16] text-[#dae2fd] flex flex-col select-none"
    >
      {/* Top Translucent Meeting Header */}
      <header className="h-14 px-4 sm:px-6 flex items-center justify-between gap-4 border-b border-white/8 bg-[#0b1326]/85 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="font-display text-sm sm:text-base font-semibold text-white truncate">
            {roomDoc?.title || joinConfig.meeting.title}
          </h1>
          <span className="hidden sm:inline text-white/25" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            onClick={handleCopyInvite}
            className="hidden sm:inline-flex items-center gap-1.5 font-mono text-xs text-[#b4c5ff] hover:text-white cursor-pointer"
          >
            <span>{joinConfig.meeting.meetingCode}</span>
            {copiedCode ? <Check className="h-3.5 w-3.5 text-[#10b981]" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {currentBreakout !== 'main' && (
            <span className="text-xs font-medium text-[#d2bbff] capitalize">
              · {currentBreakout} breakout
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {activeRecordingEgressId && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 border border-rose-500/40 px-2.5 py-1 text-[11px] font-semibold text-rose-300">
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              REC
            </span>
          )}
          <span className="hidden md:inline text-xs text-slate-400">
            {joinConfig.livekit?.configured ? 'LiveKit SFU' : 'WebRTC P2P'}
          </span>
          <span className="font-mono text-xs text-slate-300 tabular-nums">
            {formatDuration(elapsedSeconds)}
          </span>
          <button
            type="button"
            onClick={() => setLayoutMode((m) => (m === 'grid' ? 'speaker' : 'grid'))}
            title={layoutMode === 'grid' ? 'Switch to Speaker View' : 'Switch to Grid View'}
            className="p-2 rounded-full bg-white/8 hover:bg-white/15 text-slate-200 cursor-pointer"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleToggleFullscreen}
            title="Toggle Fullscreen"
            className="p-2 rounded-full bg-white/8 hover:bg-white/15 text-slate-200 cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Center Stage + Collapsible 360px Sidebar */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Video Stage */}
        <main className="flex-1 min-w-0 p-4 pb-24 flex flex-col justify-center overflow-hidden relative">
          {activeScreenTile ? (
            <div className="h-full flex flex-col lg:flex-row gap-3 min-h-0">
              <div className="flex-1 min-h-0">
                <StreamVideoTile
                  stream={activeScreenTile.stream}
                  muted
                  displayName={activeScreenTile.displayName}
                  isMuted={false}
                  cameraEnabled
                  isActiveSpeaker={false}
                  isPinned={false}
                  isScreenShare
                  onTogglePin={() => {}}
                />
              </div>
              <div className="flex lg:flex-col gap-2.5 lg:w-60 overflow-auto shrink-0">
                {visibleParticipants.map((tile) => (
                  <div key={tile.id} className="w-44 lg:w-full aspect-video shrink-0">
                    <StreamVideoTile
                      stream={tile.stream}
                      muted={tile.id === userId}
                      mirror={tile.mirror}
                      displayName={tile.displayName}
                      role={tile.role}
                      isMuted={tile.isMuted}
                      cameraEnabled={tile.cameraEnabled}
                      handRaised={tile.handRaised}
                      isActiveSpeaker={tile.isActiveSpeaker}
                      isPinned={pinnedId === tile.id}
                      reaction={tile.reaction}
                      backgroundEffect={tile.backgroundEffect}
                      onTogglePin={() => setPinnedId((p) => (p === tile.id ? null : tile.id))}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : spotlightTile ? (
            <div className="h-full flex flex-col lg:flex-row gap-3 min-h-0">
              <div className="flex-1 min-h-0">
                <StreamVideoTile
                  stream={spotlightTile.stream}
                  muted={spotlightTile.id === userId}
                  mirror={spotlightTile.mirror}
                  displayName={spotlightTile.displayName}
                  role={spotlightTile.role}
                  isMuted={spotlightTile.isMuted}
                  cameraEnabled={spotlightTile.cameraEnabled}
                  handRaised={spotlightTile.handRaised}
                  isActiveSpeaker={spotlightTile.isActiveSpeaker}
                  isPinned={pinnedId === spotlightTile.id}
                  reaction={spotlightTile.reaction}
                  backgroundEffect={spotlightTile.backgroundEffect}
                  onTogglePin={() =>
                    setPinnedId((p) => (p === spotlightTile.id ? null : spotlightTile.id))
                  }
                />
              </div>
              {visibleParticipants.length > 1 && (
                <div className="flex lg:flex-col gap-2.5 lg:w-60 overflow-auto shrink-0">
                  {visibleParticipants
                    .filter((t) => t.id !== spotlightTile.id)
                    .map((tile) => (
                      <div key={tile.id} className="w-44 lg:w-full aspect-video shrink-0">
                        <StreamVideoTile
                          stream={tile.stream}
                          muted={tile.id === userId}
                          mirror={tile.mirror}
                          displayName={tile.displayName}
                          role={tile.role}
                          isMuted={tile.isMuted}
                          cameraEnabled={tile.cameraEnabled}
                          handRaised={tile.handRaised}
                          isActiveSpeaker={tile.isActiveSpeaker}
                          isPinned={pinnedId === tile.id}
                          reaction={tile.reaction}
                          backgroundEffect={tile.backgroundEffect}
                          onTogglePin={() => setPinnedId((p) => (p === tile.id ? null : tile.id))}
                        />
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <div className={`grid ${gridColsClass} gap-3.5 w-full h-full max-h-[82vh] auto-rows-fr`}>
              {visibleParticipants.map((tile) => (
                <StreamVideoTile
                  key={tile.id}
                  stream={tile.stream}
                  muted={tile.id === userId}
                  mirror={tile.mirror}
                  displayName={tile.displayName}
                  role={tile.role}
                  isMuted={tile.isMuted}
                  cameraEnabled={tile.cameraEnabled}
                  handRaised={tile.handRaised}
                  isActiveSpeaker={tile.isActiveSpeaker}
                  isPinned={pinnedId === tile.id}
                  reaction={tile.reaction}
                  backgroundEffect={tile.backgroundEffect}
                  onTogglePin={() => setPinnedId((p) => (p === tile.id ? null : tile.id))}
                />
              ))}
            </div>
          )}

          {/* Live Captions Banner */}
          {captionsEnabled && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 max-w-2xl w-[90%] rounded-xl bg-black/75 backdrop-blur-md border border-white/10 px-4 py-2.5 text-center text-sm text-white">
              {captionLine || 'Listening for speech...'}
            </div>
          )}

          {/* Waiting Room Host Alert Toast */}
          {isHost && waitingRequests.length > 0 && sidebarTab !== 'participants' && (
            <button
              type="button"
              onClick={() => setSidebarTab('participants')}
              className="absolute top-4 right-4 z-30 flex items-center gap-2 rounded-full bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white shadow-lg hover:bg-blue-600 cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" />
              {waitingRequests.length} waiting to join · Review
            </button>
          )}
        </main>

        {/* Docked 360px Right Sidebar (Full Drawer on Mobile) */}
        {sidebarTab && (
          <aside className="fixed inset-0 z-40 md:static md:w-[360px] md:shrink-0 bg-white dark:bg-[#131b2e] text-slate-900 dark:text-[#dae2fd] border-l border-slate-200 dark:border-white/10 flex flex-col">
            <div className="h-14 px-4 border-b border-slate-200 dark:border-white/8 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1">
                {(
                  [
                    ['participants', 'People'],
                    ['chat', 'Chat'],
                    ['activities', 'Activities'],
                    ['info', 'Info'],
                  ] as Array<[Exclude<SidebarTab, null>, string]>
                ).map(([tabId, label]) => (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => {
                      setSidebarTab(tabId);
                      if (tabId === 'chat') setUnreadChat(0);
                    }}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      sidebarTab === tabId
                        ? 'bg-[#2563eb]/15 text-[#2563eb] dark:text-[#b4c5ff]'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSidebarTab(null)}
                aria-label="Close sidebar"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* SCREEN 9: MEETING CHAT */}
            {sidebarTab === 'chat' && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                      Messages sent here are visible to everyone in the call and archived to
                      Meeting History.
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMe = msg.senderId === userId;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                            <span className="font-medium">{isMe ? 'You' : msg.senderName}</span>
                            <span className="tabular-nums">
                              {msg.createdAt.toLocaleTimeString(undefined, {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed break-words ${
                              isMe
                                ? 'bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white'
                                : 'bg-slate-100 dark:bg-[#1e293b] text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {msg.body}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {showEmojiRow && (
                  <div className="px-4 py-2 border-t border-slate-200 dark:border-white/8 flex items-center justify-between">
                    {CHAT_EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setChatInput((v) => `${v}${em}`)}
                        className="text-base hover:scale-125 transition-transform cursor-pointer"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={handleSendChat}
                  className="p-3 border-t border-slate-200 dark:border-white/8 flex items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() => setShowEmojiRow((v) => !v)}
                    aria-label="Insert emoji"
                    className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                  >
                    <Smile className="h-4 w-4" />
                  </button>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={roomDoc?.allowChat === false && !isHostOrCoHost}
                    placeholder={
                      roomDoc?.allowChat === false && !isHostOrCoHost
                        ? 'Chat disabled by host'
                        : 'Send a message...'
                    }
                    className="flex-1 rounded-full border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none"
                  />
                  <button
                    type="submit"
                    aria-label="Send message"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2563eb] text-white hover:bg-blue-600 cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              </div>
            )}

            {/* SCREEN 10: PARTICIPANTS & WAITING ROOM */}
            {sidebarTab === 'participants' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {/* Waiting Room Queue */}
                {isHost && waitingRequests.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[#2563eb] dark:text-[#b4c5ff]">
                      Waiting Room ({waitingRequests.length})
                    </p>
                    <div className="space-y-2">
                      {waitingRequests.map((req) => (
                        <div
                          key={req.id}
                          className="rounded-xl border border-[#2563eb]/30 bg-[#2563eb]/10 p-3 flex items-center justify-between gap-2"
                        >
                          <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {req.displayName}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => resolveWaitingRoomRequest(roomId, req.userId, 'admitted')}
                              className="rounded-full bg-[#10b981] px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
                            >
                              Admit
                            </button>
                            <button
                              type="button"
                              onClick={() => resolveWaitingRoomRequest(roomId, req.userId, 'denied')}
                              className="rounded-full bg-rose-500/20 px-2.5 py-1 text-[11px] font-semibold text-rose-500 cursor-pointer"
                            >
                              Deny
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active Roster */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    In Call ({presenceList.length || 1})
                  </p>
                  <div className="space-y-2">
                    {presenceList.map((p) => (
                      <div
                        key={p.userId}
                        className="rounded-xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#0b1326]/50 p-3 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                            <span>
                              {p.displayName} {p.userId === userId ? '(You)' : ''}
                            </span>
                            {p.handRaised && <Hand className="h-3.5 w-3.5 text-[#2563eb]" />}
                          </p>
                          <p className="text-[11px] text-slate-500 capitalize">
                            {p.role === 'co_host' ? 'Co-Host' : p.role}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {p.isMuted ? (
                            <MicOff className="h-3.5 w-3.5 text-rose-500" />
                          ) : (
                            <Mic className="h-3.5 w-3.5 text-emerald-500" />
                          )}
                          {p.cameraEnabled ? (
                            <Camera className="h-3.5 w-3.5 text-slate-400" />
                          ) : (
                            <CameraOff className="h-3.5 w-3.5 text-slate-500" />
                          )}

                          {isHostOrCoHost && p.userId !== userId && p.role !== 'host' && (
                            <>
                              <button
                                type="button"
                                title="Request mute"
                                onClick={() =>
                                  hostUpdateParticipant(roomId, p.userId, { muteRequested: true })
                                }
                                className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 cursor-pointer"
                              >
                                <MicOff className="h-3.5 w-3.5" />
                              </button>
                              {isHost && (
                                <button
                                  type="button"
                                  title={p.role === 'co_host' ? 'Remove Co-Host' : 'Make Co-Host'}
                                  onClick={() => handleToggleCoHost(p)}
                                  className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-amber-500 cursor-pointer"
                                >
                                  <Crown className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                title="Remove participant"
                                onClick={() => handleRemoveParticipant(p)}
                                className="p-1 rounded-lg hover:bg-rose-500/15 text-rose-500 cursor-pointer"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ACTIVITIES TAB (AI Voice, Whiteboard, Polls, Q&A, Breakouts) */}
            {sidebarTab === 'activities' && (
              <div className="flex-1 min-h-0">
                <MeetingActivitiesPanel
                  meetingId={joinConfig.meeting.id}
                  meetingTitle={joinConfig.meeting.title}
                  roomId={roomId}
                  userId={userId}
                  displayName={joinConfig.displayName}
                  isHostOrCoHost={isHostOrCoHost}
                  currentBreakout={currentBreakout}
                  transcriptText={transcriptLines.join('\n')}
                  chatMessages={messages}
                  onBreakoutChange={setCurrentBreakout}
                />
              </div>
            )}

            {/* MEETING INFO & HOST CONTROLS TAB */}
            {sidebarTab === 'info' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Joining Details
                  </p>
                  <div className="rounded-xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#0b1326]/60 p-3 space-y-2">
                    <p className="font-mono text-xs text-slate-700 dark:text-slate-200 break-all">
                      {window.location.origin}/?join={joinConfig.meeting.meetingCode}
                    </p>
                    <button
                      type="button"
                      onClick={handleCopyInvite}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563eb] dark:text-[#b4c5ff] hover:underline cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy joining link
                    </button>
                  </div>
                </div>

                <form onSubmit={handleInviteEmail} className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                    <Mail className="h-3.5 w-3.5" />
                    Invite by email
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="colleague@company.com"
                      className="flex-1 rounded-full border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-[#0b1326]/70 px-3.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sendingInvite}
                      className="rounded-full bg-[#2563eb] px-3.5 py-1.5 text-xs font-semibold text-white cursor-pointer"
                    >
                      Send
                    </button>
                  </div>
                </form>

                {isHostOrCoHost && (
                  <div className="space-y-3 border-t border-slate-200 dark:border-white/8 pt-4">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-[#2563eb]" />
                      Host Security & Permissions
                    </p>

                    <button
                      type="button"
                      onClick={handleToggleLock}
                      className="w-full flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 px-3.5 py-2.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        {roomDoc?.isLocked ? (
                          <Lock className="h-4 w-4 text-amber-500" />
                        ) : (
                          <Unlock className="h-4 w-4 text-emerald-500" />
                        )}
                        Lock meeting entry
                      </span>
                      <span className="font-semibold">
                        {roomDoc?.isLocked ? 'Locked' : 'Open'}
                      </span>
                    </button>

                    <label className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 px-3.5 py-2.5 text-xs font-medium cursor-pointer">
                      <span>Allow participant chat</span>
                      <input
                        type="checkbox"
                        checked={roomDoc?.allowChat ?? true}
                        onChange={() => handleToggleRoomPerm('allowChat')}
                        className="rounded border-slate-300 text-[#2563eb]"
                      />
                    </label>

                    <label className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 px-3.5 py-2.5 text-xs font-medium cursor-pointer">
                      <span>Allow participant screen share</span>
                      <input
                        type="checkbox"
                        checked={roomDoc?.allowScreenShare ?? true}
                        onChange={() => handleToggleRoomPerm('allowScreenShare')}
                        className="rounded border-slate-300 text-[#2563eb]"
                      />
                    </label>

                    {isHost && (
                      <button
                        type="button"
                        onClick={handleEndForEveryone}
                        className="w-full rounded-full bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
                      >
                        End Meeting for Everyone
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Floating Center-Anchored Frosted Glass Control Bar Dock */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-[96vw]">
        {/* Reactions Popover */}
        {reactionsOpen && (
          <div className="mb-2.5 mx-auto w-fit flex items-center gap-2 rounded-full glass-dock border border-white/15 px-4 py-2">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => sendReaction(emoji)}
                className="text-xl hover:scale-125 transition-transform cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* More Options Popover */}
        {moreOpen && (
          <div className="mb-2.5 mx-auto w-72 rounded-2xl glass-dock border border-white/15 p-4 space-y-3 text-xs text-white">
            <div className="flex items-center justify-between">
              <span className="font-semibold">More Controls</span>
              <button type="button" onClick={() => setMoreOpen(false)} className="cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {isHost && (
              <button
                type="button"
                onClick={handleToggleRecording}
                className="w-full flex items-center gap-2 rounded-xl bg-white/8 hover:bg-white/15 px-3 py-2 font-medium cursor-pointer"
              >
                <Disc className={`h-4 w-4 ${activeRecordingEgressId ? 'text-rose-500' : 'text-slate-300'}`} />
                {activeRecordingEgressId ? 'Stop Cloud Recording' : 'Start LiveKit Cloud Recording'}
              </button>
            )}

            <div className="space-y-1">
              <p className="text-[11px] text-slate-400">Background effect</p>
              <div className="flex flex-wrap gap-1.5">
                {(['none', 'blur', 'office', 'skyline', 'studio'] as BackgroundEffect[]).map((bg) => (
                  <button
                    key={bg}
                    type="button"
                    onClick={() => setBackgroundEffect(bg)}
                    className={`rounded-full px-2.5 py-1 text-[11px] capitalize cursor-pointer ${
                      backgroundEffect === bg ? 'bg-[#2563eb] text-white' : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {bg}
                  </button>
                ))}
              </div>
            </div>

            {devices.cameras.length > 0 && (
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Switch camera</label>
                <select
                  value={cameraDeviceId}
                  onChange={(e) => switchHardware(e.target.value, micDeviceId)}
                  className="w-full rounded-lg bg-[#0b1326] border border-white/15 px-2 py-1.5 text-[11px]"
                >
                  {devices.cameras.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {devices.microphones.length > 0 && (
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Switch microphone</label>
                <select
                  value={micDeviceId}
                  onChange={(e) => switchHardware(cameraDeviceId, e.target.value)}
                  className="w-full rounded-lg bg-[#0b1326] border border-white/15 px-2 py-1.5 text-[11px]"
                >
                  {devices.microphones.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Microphone ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Host Leave / End Call Choice Popover */}
        {leaveMenuOpen && (
          <div className="mb-2.5 ml-auto w-56 rounded-2xl glass-dock border border-white/15 p-2 space-y-1 text-xs">
            <button
              type="button"
              onClick={() => finishAndExit(false)}
              className="w-full rounded-xl px-3 py-2.5 text-left font-medium text-white hover:bg-white/10 cursor-pointer"
            >
              Leave call only
            </button>
            {isHost && (
              <button
                type="button"
                onClick={handleEndForEveryone}
                className="w-full rounded-xl bg-rose-600 px-3 py-2.5 text-left font-semibold text-white hover:bg-rose-700 cursor-pointer"
              >
                End meeting for everyone
              </button>
            )}
          </div>
        )}

        {/* Control Bar Pill */}
        <div className="glass-dock rounded-full border border-white/12 px-3 py-2 flex items-center gap-1.5 sm:gap-2.5 overflow-x-auto">
          <button
            type="button"
            onClick={toggleMic}
            title={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
            className={`flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
              micEnabled ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-[#ef4444] text-white'
            }`}
          >
            {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>

          <button
            type="button"
            onClick={toggleCamera}
            title={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
            className={`flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
              cameraEnabled ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-[#ef4444] text-white'
            }`}
          >
            {cameraEnabled ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
          </button>

          <button
            type="button"
            onClick={() => setCaptionsEnabled((v) => !v)}
            title="Toggle Live Captions"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
              captionsEnabled ? 'bg-[#2563eb] text-white' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Subtitles className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={toggleScreenShare}
            title={screenStream ? 'Stop presenting' : 'Present screen'}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
              screenStream ? 'bg-[#2563eb] text-white' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <MonitorUp className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={toggleHandRaise}
            title={handRaised ? 'Lower hand' : 'Raise hand'}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
              handRaised ? 'bg-[#2563eb] text-white' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Hand className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setReactionsOpen((v) => !v)}
            title="Send Reaction"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
          >
            <Smile className="h-4 w-4" />
          </button>

          <div className="h-6 w-px bg-white/15 mx-0.5 shrink-0" />

          <button
            type="button"
            onClick={() => {
              setSidebarTab((t) => (t === 'chat' ? null : 'chat'));
              setUnreadChat(0);
            }}
            title="Meeting Chat"
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
              sidebarTab === 'chat'
                ? 'bg-[#2563eb] text-white'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            {unreadChat > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#2563eb] px-1 text-[10px] font-bold text-white tabular-nums">
                {unreadChat}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSidebarTab((t) => (t === 'participants' ? null : 'participants'))}
            title="Participants"
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
              sidebarTab === 'participants'
                ? 'bg-[#2563eb] text-white'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Users className="h-4 w-4" />
            {waitingRequests.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white tabular-nums">
                {waitingRequests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSidebarTab((t) => (t === 'activities' ? null : 'activities'))}
            title="Activities & AI Co-Pilot"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
              sidebarTab === 'activities'
                ? 'bg-[#7c3aed] text-white'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Sparkles className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setSidebarTab((t) => (t === 'info' ? null : 'info'))}
            title="Meeting Info & Security"
            className={`hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
              sidebarTab === 'info'
                ? 'bg-[#2563eb] text-white'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Info className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            title="More Options"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => (isHost ? setLeaveMenuOpen((v) => !v) : finishAndExit(false))}
            title="Leave Call"
            className="ml-1 flex h-11 sm:h-12 px-4 sm:px-5 shrink-0 items-center justify-center gap-2 rounded-full bg-[#ef4444] text-white font-semibold text-xs hover:bg-rose-600 transition-colors cursor-pointer"
          >
            <PhoneOff className="h-4 w-4" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </div>
    </div>
  );
}
