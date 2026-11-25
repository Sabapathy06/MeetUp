import { Room, RoomEvent, Track } from 'livekit-client';
import { sendWebRtcSignal, subscribeIncomingWebRtcSignals } from './roomRealtime';

export interface MediaDevicesSnapshot {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
}

export async function enumerateMediaDevices(): Promise<MediaDevicesSnapshot> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { cameras: [], microphones: [], speakers: [] };
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: devices.filter((d) => d.kind === 'videoinput'),
    microphones: devices.filter((d) => d.kind === 'audioinput'),
    speakers: devices.filter((d) => d.kind === 'audiooutput'),
  };
}

export async function acquireLocalMedia(opts: {
  video: boolean;
  audio: boolean;
  cameraDeviceId?: string;
  micDeviceId?: string;
}): Promise<{ stream: MediaStream | null; error: string | null }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      stream: null,
      error: 'Camera and microphone access requires a secure browser context (HTTPS or localhost).',
    };
  }
  if (!opts.video && !opts.audio) {
    return { stream: null, error: null };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: opts.video
        ? opts.cameraDeviceId && opts.cameraDeviceId !== 'default'
          ? { deviceId: { ideal: opts.cameraDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } }
        : false,
      audio: opts.audio
        ? opts.micDeviceId && opts.micDeviceId !== 'default'
          ? { deviceId: { ideal: opts.micDeviceId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true }
        : false,
    });
    return { stream, error: null };
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return {
        stream: null,
        error: 'Camera or microphone permission was denied. Allow access in your browser address bar and retry.',
      };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        stream: null,
        error: 'No camera or microphone hardware was detected on this device.',
      };
    }
    return {
      stream: null,
      error: err instanceof Error ? err.message : 'Unable to access camera or microphone.',
    };
  }
}

export function createAudioLevelMonitor(
  stream: MediaStream | null,
  onLevel: (level: number) => void
): () => void {
  if (!stream || stream.getAudioTracks().length === 0) {
    onLevel(0);
    return () => {};
  }
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    let rafId = 0;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i];
      const avg = sum / data.length / 255;
      onLevel(avg);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      source.disconnect();
      ctx.close().catch(() => {});
    };
  } catch {
    return () => {};
  }
}

// LiveKit SFU Connector
export interface RemoteStreamEntry {
  userId: string;
  stream: MediaStream;
  isScreenShare: boolean;
}

export async function connectLiveKitRoom(opts: {
  url: string;
  token: string;
  cameraEnabled: boolean;
  micEnabled: boolean;
  onRemoteStreamsChange: (streams: RemoteStreamEntry[]) => void;
  onActiveSpeakersChange: (speakerIds: string[]) => void;
  onConnectionStateChange: (state: string) => void;
}): Promise<Room> {
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
  });

  const rebuildStreams = () => {
    const list: RemoteStreamEntry[] = [];
    room.remoteParticipants.forEach((participant) => {
      const camTracks: MediaStreamTrack[] = [];
      const screenTracks: MediaStreamTrack[] = [];

      participant.trackPublications.forEach((pub) => {
        if (!pub.track?.mediaStreamTrack) return;
        if (pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) {
          screenTracks.push(pub.track.mediaStreamTrack);
        } else {
          camTracks.push(pub.track.mediaStreamTrack);
        }
      });

      if (camTracks.length > 0) {
        list.push({
          userId: participant.identity,
          stream: new MediaStream(camTracks),
          isScreenShare: false,
        });
      }
      if (screenTracks.length > 0) {
        list.push({
          userId: participant.identity,
          stream: new MediaStream(screenTracks),
          isScreenShare: true,
        });
      }
    });
    opts.onRemoteStreamsChange(list);
  };

  room.on(RoomEvent.TrackSubscribed, rebuildStreams);
  room.on(RoomEvent.TrackUnsubscribed, rebuildStreams);
  room.on(RoomEvent.ParticipantDisconnected, rebuildStreams);
  room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
    opts.onActiveSpeakersChange(speakers.map((s) => s.identity));
  });
  room.on(RoomEvent.ConnectionStateChanged, (state) => {
    opts.onConnectionStateChange(String(state));
  });

  await room.connect(opts.url, opts.token);
  await room.localParticipant.setMicrophoneEnabled(opts.micEnabled).catch(() => {});
  await room.localParticipant.setCameraEnabled(opts.cameraEnabled).catch(() => {});
  rebuildStreams();
  return room;
}

// Multi-peer WebRTC Fallback Manager (signaled over Firestore)
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export class WebRtcMeshManager {
  private peers = new Map<string, RTCPeerConnection>();
  private remoteStreams = new Map<string, MediaStream>();
  private unsubscribeSignals: (() => void) | null = null;
  private localStream: MediaStream | null = null;

  constructor(
    private roomId: string,
    private userId: string,
    private onRemoteStreamsChange: (streams: RemoteStreamEntry[]) => void
  ) {}

  start(localStream: MediaStream | null) {
    this.localStream = localStream;
    this.unsubscribeSignals = subscribeIncomingWebRtcSignals(
      this.roomId,
      this.userId,
      (sig) => {
        this.handleSignal(sig.fromUserId, sig.signalType, sig.payload).catch((err) => {
          console.error('WebRTC signal error:', err);
        });
      }
    );
  }

  updateLocalStream(nextStream: MediaStream | null) {
    this.localStream = nextStream;
    const tracks = nextStream ? nextStream.getTracks() : [];
    this.peers.forEach((pc) => {
      const senders = pc.getSenders();
      tracks.forEach((track) => {
        const match = senders.find((s) => s.track?.kind === track.kind);
        if (match) {
          match.replaceTrack(track).catch(() => {});
        } else if (nextStream) {
          pc.addTrack(track, nextStream);
        }
      });
    });
  }

  syncPeers(participantUserIds: string[]) {
    const activeSet = new Set(participantUserIds.filter((id) => id !== this.userId));

    // Clean up departed peers
    for (const [peerId, pc] of this.peers.entries()) {
      if (!activeSet.has(peerId)) {
        pc.close();
        this.peers.delete(peerId);
        this.remoteStreams.delete(peerId);
      }
    }

    // Establish connections with new peers (deterministic initiator: lexicographically smaller UID)
    activeSet.forEach((peerId) => {
      if (!this.peers.has(peerId)) {
        const isInitiator = this.userId < peerId;
        this.createPeer(peerId, isInitiator);
      }
    });

    this.emitStreams();
  }

  private createPeer(peerId: string, initiator: boolean): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peers.set(peerId, pc);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        if (this.localStream) {
          pc.addTrack(track, this.localStream);
        }
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendWebRtcSignal({
          roomId: this.roomId,
          fromUserId: this.userId,
          toUserId: peerId,
          signalType: 'ice',
          payload: JSON.stringify(event.candidate.toJSON()),
        }).catch(() => {});
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      this.remoteStreams.set(peerId, stream);
      this.emitStreams();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.remoteStreams.delete(peerId);
        this.emitStreams();
      }
    };

    if (initiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          if (pc.localDescription) {
            return sendWebRtcSignal({
              roomId: this.roomId,
              fromUserId: this.userId,
              toUserId: peerId,
              signalType: 'offer',
              payload: JSON.stringify(pc.localDescription),
            });
          }
        })
        .catch(() => {});
    }

    return pc;
  }

  private async handleSignal(
    fromUserId: string,
    signalType: 'offer' | 'answer' | 'ice',
    payload: string
  ) {
    let pc = this.peers.get(fromUserId);
    if (!pc) {
      pc = this.createPeer(fromUserId, false);
    }

    const parsed = JSON.parse(payload);
    if (signalType === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(parsed));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendWebRtcSignal({
        roomId: this.roomId,
        fromUserId: this.userId,
        toUserId: fromUserId,
        signalType: 'answer',
        payload: JSON.stringify(answer),
      });
    } else if (signalType === 'answer') {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(parsed));
      }
    } else if (signalType === 'ice') {
      await pc.addIceCandidate(new RTCIceCandidate(parsed)).catch(() => {});
    }
  }

  private emitStreams() {
    const entries: RemoteStreamEntry[] = [];
    this.remoteStreams.forEach((stream, userId) => {
      entries.push({ userId, stream, isScreenShare: false });
    });
    this.onRemoteStreamsChange(entries);
  }

  destroy() {
    this.unsubscribeSignals?.();
    this.unsubscribeSignals = null;
    this.peers.forEach((pc) => pc.close());
    this.peers.clear();
    this.remoteStreams.clear();
  }
}

// Gemini Live API PCM16 audio encoding & 24kHz gapless playback
export function float32ToPcm16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export class GaplessPcmPlayer {
  private ctx: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];

  enqueue(base64Pcm24k: string) {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ sampleRate: 24000 });
      this.nextStartTime = this.ctx.currentTime;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const binary = atob(base64Pcm24k);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i += 1) {
      float32[i] = int16[i] / 32768;
    }

    const audioBuffer = this.ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(float32, 0);

    const source = this.ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.ctx.destination);

    const startAt = Math.max(this.ctx.currentTime, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + audioBuffer.duration;
    this.activeSources.push(source);
    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source);
    };
  }

  interrupt() {
    this.activeSources.forEach((s) => {
      try {
        s.stop();
      } catch {
        // Ignore
      }
    });
    this.activeSources = [];
    if (this.ctx) {
      this.nextStartTime = this.ctx.currentTime;
    }
  }

  close() {
    this.interrupt();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
