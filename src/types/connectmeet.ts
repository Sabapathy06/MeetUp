export type AppScreen =
  | 'landing'
  | 'login'
  | 'register'
  | 'dashboard'
  | 'new-meeting'
  | 'join-meeting'
  | 'lobby'
  | 'active-meeting'
  | 'schedule'
  | 'history'
  | 'recordings'
  | 'settings'
  | 'meeting-ended';

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  personalMeetingCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  id: number;
  userId: string;
  theme: 'dark' | 'light';
  language: string;
  cameraPreference: string;
  microphonePreference: string;
  speakerPreference: string;
  notificationPreferences: {
    emailInvites: boolean;
    meetingReminders: boolean;
    chatSounds: boolean;
    recordingReady: boolean;
  };
  privacyPreferences: {
    autoMuteOnJoin: boolean;
    autoCamOffOnJoin: boolean;
    waitingRoomByDefault: boolean;
  };
}

export interface IntegrationsStatus {
  livekit: {
    configured: boolean;
    mode: 'livekit' | 'webrtc-fallback';
  };
  resend: {
    configured: boolean;
  };
  gemini: {
    configured: boolean;
  };
}

export interface MeetingRecord {
  id: string;
  meetingCode: string;
  title: string;
  description: string;
  hostId: string;
  hostName?: string;
  roomName: string;
  isPrivate: boolean;
  isLocked: boolean;
  requiresPasscode?: boolean;
  allowChat: boolean;
  allowScreenShare: boolean;
  status: 'active' | 'scheduled' | 'ended';
  createdAt: string;
  endedAt?: string | null;
}

export interface ScheduledMeetingRecord {
  id: string;
  hostId: string;
  meetingId: string;
  meetingCode: string;
  roomName: string;
  title: string;
  description: string;
  scheduledAt: string;
  duration: number;
  timezone: string;
  recurringRule: 'none' | 'daily' | 'weekly' | 'monthly';
  isPrivate: boolean;
  status: string;
  hostName: string;
  createdAt: string;
}

export interface StructuredMeetingSummary {
  executiveSummary: string;
  keyDiscussionPoints: string[];
  decisionsMade: string[];
  actionItems: Array<{
    task: string;
    owner: string;
    priority: string;
  }>;
  smartNotes: string;
}

export interface MeetingHistoryRecord {
  id: number;
  meetingId: string;
  userId: string;
  joinedAt: string;
  leftAt: string | null;
  duration: number;
  meetingTitle: string;
  meetingCode: string;
  meetingStatus: string;
  hostId: string;
  hostName: string;
  participantCount: number;
  aiSummary?: StructuredMeetingSummary | null;
  feedbackRating?: number | null;
  feedbackComment?: string | null;
}

export interface RecordingRecord {
  id: string;
  meetingId: string;
  hostId: string;
  egressId: string | null;
  title: string;
  meetingTitle: string;
  meetingCode: string;
  recordingUrl: string | null;
  storagePath: string;
  duration: number;
  status: 'recording' | 'processing' | 'ready' | 'failed';
  createdAt: string;
}

export interface NotificationRecord {
  id: number;
  userId: string;
  title: string;
  message: string;
  notificationType: string;
  isRead: boolean;
  createdAt: string;
}

export type BackgroundEffect = 'none' | 'blur' | 'office' | 'skyline' | 'studio';

export interface LobbyJoinConfig {
  meeting: MeetingRecord;
  displayName: string;
  cameraEnabled: boolean;
  micEnabled: boolean;
  cameraDeviceId: string;
  micDeviceId: string;
  speakerDeviceId: string;
  backgroundEffect: BackgroundEffect;
  startWithScreenShare: boolean;
  passcode?: string;
  historyId?: number;
  role: 'host' | 'co_host' | 'participant';
  livekit?: {
    configured: boolean;
    mode: 'livekit' | 'webrtc-fallback';
    url: string | null;
    token: string | null;
  };
}

export interface RoomDoc {
  roomId: string;
  meetingCode: string;
  title: string;
  hostId: string;
  coHostIds: string[];
  status: 'active' | 'ended';
  isLocked: boolean;
  isPrivate: boolean;
  allowChat: boolean;
  allowScreenShare: boolean;
  activeSpeakerId?: string;
}

export interface RoomPresence {
  roomId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  role: 'host' | 'co_host' | 'participant';
  isMuted: boolean;
  cameraEnabled: boolean;
  isScreenSharing: boolean;
  handRaised: boolean;
  reaction?: string;
  reactionAt?: number;
  breakoutRoom?: string;
  kicked: boolean;
  muteRequested: boolean;
}

export interface RoomChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  body: string;
  messageType: 'text' | 'system' | 'ai_note';
  createdAt: Date;
}

export interface WaitingRoomRequest {
  id: string;
  roomId: string;
  hostId: string;
  userId: string;
  displayName: string;
  status: 'pending' | 'admitted' | 'denied';
}

export interface RoomPoll {
  id: string;
  roomId: string;
  creatorId: string;
  creatorName: string;
  question: string;
  options: string[];
  votes: Record<string, number>;
  isClosed: boolean;
}

export interface RoomQuestion {
  id: string;
  roomId: string;
  authorId: string;
  authorName: string;
  text: string;
  upvoterIds: string[];
  answered: boolean;
}

export interface WhiteboardStroke {
  id: string;
  roomId: string;
  authorId: string;
  color: string;
  width: number;
  points: number[];
}

export interface EndedMeetingSummary {
  meeting: MeetingRecord;
  durationSeconds: number;
  historyId?: number;
  endedByHost: boolean;
  transcriptText: string;
  chatMessages: Array<{ senderName: string; message: string }>;
}
