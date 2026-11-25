import { auth } from './firebase';
import type {
  IntegrationsStatus,
  MeetingHistoryRecord,
  MeetingRecord,
  NotificationRecord,
  RecordingRecord,
  ScheduledMeetingRecord,
  StructuredMeetingSummary,
  UserProfile,
  UserSettings,
} from '../types/connectmeet';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in to continue.');
  }
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function requestJson<T>(url: string, options: RequestInit = {}, authenticated = true): Promise<T> {
  const headers: Record<string, string> = authenticated
    ? await getAuthHeaders()
    : { 'Content-Type': 'application/json' };

  const res = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  getConfigStatus: () => requestJson<IntegrationsStatus>('/api/config/status', {}, false),

  getProfile: () =>
    requestJson<{ profile: UserProfile | null; settings: UserSettings | null }>('/api/profile'),

  updateProfile: (body: { fullName?: string; avatarUrl?: string | null }) =>
    requestJson<{ profile: UserProfile }>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  updateSettings: (body: Partial<UserSettings>) =>
    requestJson<{ settings: UserSettings }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  listMeetings: () => requestJson<{ meetings: MeetingRecord[] }>('/api/meetings'),

  createMeeting: (body: {
    title: string;
    description?: string;
    isPrivate?: boolean;
    passcode?: string;
    status?: 'active' | 'scheduled';
    meetingCode?: string;
  }) =>
    requestJson<{ meeting: MeetingRecord }>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  lookupMeeting: (code: string) =>
    requestJson<{ meeting: MeetingRecord }>(`/api/meetings/lookup/${encodeURIComponent(code)}`),

  joinMeeting: (
    meetingId: string,
    body: {
      displayName: string;
      passcode?: string;
      isMuted: boolean;
      cameraEnabled: boolean;
      admitted?: boolean;
    }
  ) =>
    requestJson<{
      meeting: MeetingRecord;
      role: 'host' | 'co_host' | 'participant';
      historyId: number;
      livekit: {
        configured: boolean;
        mode: 'livekit' | 'webrtc-fallback';
        url: string | null;
        token: string | null;
      };
    }>(`/api/meetings/${encodeURIComponent(meetingId)}/join`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  leaveMeeting: (meetingId: string, body: { historyId?: number; durationSeconds?: number }) =>
    requestJson<{ ok: boolean }>(`/api/meetings/${encodeURIComponent(meetingId)}/leave`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateMeeting: (
    meetingId: string,
    body: Partial<
      Pick<
        MeetingRecord,
        'title' | 'description' | 'isPrivate' | 'isLocked' | 'allowChat' | 'allowScreenShare' | 'status'
      >
    >
  ) =>
    requestJson<{ meeting: MeetingRecord }>(`/api/meetings/${encodeURIComponent(meetingId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  removeParticipant: (meetingId: string, participantUserId: string) =>
    requestJson<{ ok: boolean }>(
      `/api/meetings/${encodeURIComponent(meetingId)}/remove-participant`,
      {
        method: 'POST',
        body: JSON.stringify({ participantUserId }),
      }
    ),

  archiveMessage: (
    meetingId: string,
    body: { message: string; senderName: string; messageType?: string }
  ) =>
    requestJson<{ message: unknown }>(`/api/meetings/${encodeURIComponent(meetingId)}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listMeetingMessages: (meetingId: string) =>
    requestJson<{
      messages: Array<{
        id: number;
        senderId: string;
        senderName: string;
        message: string;
        messageType: string;
        createdAt: string;
      }>;
    }>(`/api/meetings/${encodeURIComponent(meetingId)}/messages`),

  listSchedules: () => requestJson<{ schedules: ScheduledMeetingRecord[] }>('/api/schedules'),

  createSchedule: (body: {
    title: string;
    description?: string;
    scheduledAt: string;
    duration: number;
    timezone: string;
    recurringRule: string;
    isPrivate?: boolean;
    passcode?: string;
    inviteEmails?: string[];
  }) =>
    requestJson<{
      schedule: ScheduledMeetingRecord;
      meeting: MeetingRecord;
      invitations: Array<{ email: string; status: string; note: string }>;
    }>('/api/schedules', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateSchedule: (
    id: string,
    body: {
      title?: string;
      description?: string;
      scheduledAt?: string;
      duration?: number;
      timezone?: string;
      recurringRule?: string;
    }
  ) =>
    requestJson<{ schedule: ScheduledMeetingRecord }>(`/api/schedules/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteSchedule: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/schedules/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  sendInvitation: (meetingId: string, recipientEmail: string) =>
    requestJson<{
      invitation: unknown;
      delivery: { sent: boolean; status: string; note: string };
    }>(`/api/meetings/${encodeURIComponent(meetingId)}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ recipientEmail }),
    }),

  listHistory: () => requestJson<{ history: MeetingHistoryRecord[] }>('/api/history'),

  submitFeedback: (historyId: number, rating: number, comment: string) =>
    requestJson<{ history: MeetingHistoryRecord }>(`/api/history/${historyId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    }),

  listRecordings: () =>
    requestJson<{ recordings: RecordingRecord[]; egressConfigured: boolean }>('/api/recordings'),

  startRecording: (meetingId: string) =>
    requestJson<{ recording: RecordingRecord }>('/api/recordings/start', {
      method: 'POST',
      body: JSON.stringify({ meetingId }),
    }),

  stopRecording: (egressId: string) =>
    requestJson<{ ok: boolean }>(`/api/recordings/${encodeURIComponent(egressId)}/stop`, {
      method: 'POST',
    }),

  deleteRecording: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/recordings/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  listNotifications: () => requestJson<{ notifications: NotificationRecord[] }>('/api/notifications'),

  markNotificationsRead: () =>
    requestJson<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' }),

  generateAiSummary: (body: {
    meetingId?: string;
    meetingTitle: string;
    transcript: string;
    chatHistory?: Array<{ senderName: string; message: string }>;
    manualNotes?: string;
  }) =>
    requestJson<{ summary: StructuredMeetingSummary }>('/api/ai/summary', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  generateSpokenRecap: (body: {
    title: string;
    script: string;
    mode?: 'single' | 'dual';
    voiceName?: string;
  }) =>
    requestJson<{ audioBase64: string; mimeType: string }>('/api/ai/tts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
