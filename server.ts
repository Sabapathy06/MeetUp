import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  createInvitation,
  createMeeting,
  createNotification,
  createRecordingRecord,
  createScheduledMeeting,
  deleteRecordingRecord,
  deleteScheduledMeeting,
  getMeetingByCode,
  getMeetingById,
  getOrCreateProfile,
  getProfileWithSettings,
  getRecordingByEgressId,
  isUserMeetingMember,
  listMeetingInvitations,
  listMeetingMessages,
  listScheduledMeetings,
  listUserMeetingHistory,
  listUserNotifications,
  listUserRecentMeetings,
  listUserRecordings,
  markAllNotificationsRead,
  recordParticipantJoin,
  recordParticipantLeave,
  saveMeetingFeedback,
  saveMeetingSummary,
  saveMessageToDb,
  updateMeeting,
  updateProfile,
  updateScheduledMeeting,
  updateUserSettings,
} from './src/db/repository.ts';
import { AuthRequest, requireAuth } from './src/middleware/auth.ts';
import {
  attachGeminiLiveBridge,
  generateMeetingSummary,
  generateSpokenRecap,
} from './src/server/gemini.ts';
import {
  checkRateLimit,
  getIntegrationsStatus,
  hashPasscode,
  mintLiveKitToken,
  removeLiveKitParticipant,
  sendMeetingInvitationEmail,
  startLiveKitRecording,
  stopLiveKitRecording,
  verifyPasscode,
} from './src/server/integrations.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));

  const httpServer = http.createServer(app);
  attachGeminiLiveBridge(httpServer);

  // Health & public integration status (never leaks secret values)
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get('/api/config/status', (_req, res) => {
    res.json(getIntegrationsStatus());
  });

  // Sync & fetch authenticated user profile + settings
  app.get('/api/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = req.user!.email || `${uid}@meetup.local`;
      await getOrCreateProfile(uid, email, req.user!.name, req.user!.picture || null);
      const data = await getProfileWithSettings(uid);
      res.json(data);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load profile' });
    }
  });

  app.put('/api/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const { fullName, avatarUrl } = req.body as { fullName?: string; avatarUrl?: string | null };
      if (fullName !== undefined && (typeof fullName !== 'string' || fullName.trim().length < 1 || fullName.length > 80)) {
        res.status(400).json({ error: 'Full name must be between 1 and 80 characters.' });
        return;
      }
      if (avatarUrl && typeof avatarUrl === 'string' && !/^https?:\/\//i.test(avatarUrl) && !avatarUrl.startsWith('/')) {
        res.status(400).json({ error: 'Avatar URL must use http(s) or a valid asset path.' });
        return;
      }
      const updated = await updateProfile(uid, {
        fullName: fullName?.trim(),
        avatarUrl: avatarUrl === undefined ? undefined : avatarUrl,
      });
      res.json({ profile: updated });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update profile' });
    }
  });

  app.put('/api/settings', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const body = req.body as {
        theme?: string;
        language?: string;
        cameraPreference?: string;
        microphonePreference?: string;
        speakerPreference?: string;
        notificationPreferences?: Record<string, boolean>;
        privacyPreferences?: Record<string, boolean>;
      };
      const updated = await updateUserSettings(uid, body);
      res.json({ settings: updated });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update settings' });
    }
  });

  // Meetings CRUD & Joining
  app.get('/api/meetings', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const list = await listUserRecentMeetings(uid);
      res.json({ meetings: list });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch meetings' });
    }
  });

  app.post('/api/meetings', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      if (!checkRateLimit(`create-meeting:${uid}`, 30, 60_000)) {
        res.status(429).json({ error: 'Too many meeting creation requests. Please wait a moment.' });
        return;
      }
      const email = req.user!.email || `${uid}@meetup.local`;
      await getOrCreateProfile(uid, email, req.user!.name, req.user!.picture || null);

      const { title, description, isPrivate, passcode, status, meetingCode } = req.body as {
        title?: string;
        description?: string;
        isPrivate?: boolean;
        passcode?: string;
        status?: 'active' | 'scheduled';
        meetingCode?: string;
      };

      const passwordHash =
        passcode && passcode.trim().length > 0 ? hashPasscode(passcode.trim()) : null;

      const created = await createMeeting({
        hostId: uid,
        title: (title || 'Instant Meeting').slice(0, 140),
        description: (description || '').slice(0, 1000),
        isPrivate: Boolean(isPrivate),
        passwordHash,
        status: status === 'scheduled' ? 'scheduled' : 'active',
        meetingCode: meetingCode?.trim().toLowerCase() || undefined,
      });

      res.status(201).json({ meeting: created });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create meeting' });
    }
  });

  app.get('/api/meetings/lookup/:code', requireAuth, async (req: AuthRequest, res) => {
    try {
      const rawCode = String(req.params.code || '').trim();
      if (!rawCode || rawCode.length > 64) {
        res.status(400).json({ error: 'Enter a valid meeting ID or link.' });
        return;
      }
      const meeting = await getMeetingByCode(rawCode);
      if (!meeting) {
        res.status(404).json({ error: 'Meeting not found. Check the code and try again.' });
        return;
      }
      res.json({
        meeting: {
          id: meeting.id,
          meetingCode: meeting.meetingCode,
          title: meeting.title,
          description: meeting.description,
          hostId: meeting.hostId,
          hostName: meeting.hostName,
          roomName: meeting.roomName,
          isPrivate: meeting.isPrivate,
          isLocked: meeting.isLocked,
          requiresPasscode: Boolean(meeting.passwordHash),
          allowChat: meeting.allowChat,
          allowScreenShare: meeting.allowScreenShare,
          status: meeting.status,
          createdAt: meeting.createdAt,
          endedAt: meeting.endedAt,
        },
      });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to validate meeting' });
    }
  });

  app.post('/api/meetings/:id/join', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const meetingId = req.params.id;
      const email = req.user!.email || `${uid}@meetup.local`;
      const profile = await getOrCreateProfile(uid, email, req.user!.name, req.user!.picture || null);

      const meeting = await getMeetingById(meetingId);
      if (!meeting) {
        res.status(404).json({ error: 'Meeting not found.' });
        return;
      }
      if (meeting.status === 'ended') {
        res.status(410).json({ error: 'This meeting has already ended.' });
        return;
      }

      const isHost = meeting.hostId === uid;
      const { displayName, passcode, isMuted, cameraEnabled, admitted } = req.body as {
        displayName?: string;
        passcode?: string;
        isMuted?: boolean;
        cameraEnabled?: boolean;
        admitted?: boolean;
      };

      if (!isHost && meeting.isLocked && !admitted) {
        res.status(403).json({ error: 'This meeting is currently locked by the host.' });
        return;
      }

      if (!isHost && meeting.passwordHash) {
        if (!passcode || !verifyPasscode(passcode, meeting.passwordHash)) {
          res.status(403).json({ error: 'Incorrect meeting passcode.', passcodeRequired: true });
          return;
        }
      }

      const safeDisplayName = (displayName || profile.fullName || 'Participant').trim().slice(0, 80);
      const joinRecord = await recordParticipantJoin({
        meetingId: meeting.id,
        userId: uid,
        displayName: safeDisplayName,
        role: isHost ? 'host' : 'participant',
        isMuted: Boolean(isMuted),
        cameraEnabled: cameraEnabled !== false,
      });

      const livekit = await mintLiveKitToken({
        roomName: meeting.roomName,
        identity: uid,
        name: safeDisplayName,
        isHostOrCoHost: isHost,
      });

      res.json({
        meeting: {
          id: meeting.id,
          meetingCode: meeting.meetingCode,
          title: meeting.title,
          description: meeting.description,
          hostId: meeting.hostId,
          hostName: meeting.hostName,
          roomName: meeting.roomName,
          isPrivate: meeting.isPrivate,
          isLocked: meeting.isLocked,
          allowChat: meeting.allowChat,
          allowScreenShare: meeting.allowScreenShare,
          status: meeting.status,
        },
        role: isHost ? 'host' : 'participant',
        historyId: joinRecord.historyId,
        livekit,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to join meeting' });
    }
  });

  app.post('/api/meetings/:id/leave', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const { historyId, durationSeconds } = req.body as {
        historyId?: number;
        durationSeconds?: number;
      };
      await recordParticipantLeave({
        meetingId: req.params.id,
        userId: uid,
        historyId,
        durationSeconds,
      });
      res.json({ ok: true });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to leave meeting' });
    }
  });

  app.patch('/api/meetings/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const meeting = await getMeetingById(req.params.id);
      if (!meeting) {
        res.status(404).json({ error: 'Meeting not found.' });
        return;
      }
      if (meeting.hostId !== uid) {
        res.status(403).json({ error: 'Only the host can update meeting settings.' });
        return;
      }
      const { title, description, isPrivate, isLocked, allowChat, allowScreenShare, status } =
        req.body as {
          title?: string;
          description?: string;
          isPrivate?: boolean;
          isLocked?: boolean;
          allowChat?: boolean;
          allowScreenShare?: boolean;
          status?: string;
        };

      const updated = await updateMeeting(meeting.id, {
        ...(title !== undefined ? { title: title.slice(0, 140) } : {}),
        ...(description !== undefined ? { description: description.slice(0, 1000) } : {}),
        ...(isPrivate !== undefined ? { isPrivate: Boolean(isPrivate) } : {}),
        ...(isLocked !== undefined ? { isLocked: Boolean(isLocked) } : {}),
        ...(allowChat !== undefined ? { allowChat: Boolean(allowChat) } : {}),
        ...(allowScreenShare !== undefined ? { allowScreenShare: Boolean(allowScreenShare) } : {}),
        ...(status === 'ended' ? { status: 'ended', endedAt: new Date() } : {}),
      });
      res.json({ meeting: updated });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update meeting' });
    }
  });

  app.post('/api/meetings/:id/remove-participant', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const meeting = await getMeetingById(req.params.id);
      if (!meeting || meeting.hostId !== uid) {
        res.status(403).json({ error: 'Only the meeting host can remove participants.' });
        return;
      }
      const { participantUserId } = req.body as { participantUserId?: string };
      if (!participantUserId) {
        res.status(400).json({ error: 'participantUserId is required.' });
        return;
      }
      await removeLiveKitParticipant(meeting.roomName, participantUserId).catch(() => false);
      await recordParticipantLeave({ meetingId: meeting.id, userId: participantUserId });
      res.json({ ok: true });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to remove participant' });
    }
  });

  // Archive chat messages to PostgreSQL
  app.get('/api/meetings/:id/messages', requireAuth, async (req: AuthRequest, res) => {
    try {
      const allowed = await isUserMeetingMember(req.params.id, req.user!.uid);
      if (!allowed) {
        res.status(403).json({ error: 'Access denied to meeting messages.' });
        return;
      }
      const list = await listMeetingMessages(req.params.id);
      res.json({ messages: list });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch messages' });
    }
  });

  app.post('/api/meetings/:id/messages', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const allowed = await isUserMeetingMember(req.params.id, uid);
      if (!allowed) {
        res.status(403).json({ error: 'Join the meeting before posting messages.' });
        return;
      }
      const { message, senderName, messageType } = req.body as {
        message?: string;
        senderName?: string;
        messageType?: string;
      };
      if (!message || !message.trim()) {
        res.status(400).json({ error: 'Message cannot be empty.' });
        return;
      }
      const saved = await saveMessageToDb({
        meetingId: req.params.id,
        senderId: uid,
        senderName: (senderName || req.user!.name || 'Participant').slice(0, 80),
        message: message.trim().slice(0, 2000),
        messageType: messageType || 'text',
      });
      res.status(201).json({ message: saved });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save message' });
    }
  });

  // Scheduled Meetings & Invitations
  app.get('/api/schedules', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await listScheduledMeetings(req.user!.uid, req.user!.email);
      res.json({ schedules: list });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load schedules' });
    }
  });

  app.post('/api/schedules', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = req.user!.email || `${uid}@meetup.local`;
      const profile = await getOrCreateProfile(uid, email, req.user!.name, req.user!.picture || null);

      const {
        title,
        description,
        scheduledAt,
        duration,
        timezone,
        recurringRule,
        isPrivate,
        passcode,
        inviteEmails,
      } = req.body as {
        title?: string;
        description?: string;
        scheduledAt?: string;
        duration?: number;
        timezone?: string;
        recurringRule?: string;
        isPrivate?: boolean;
        passcode?: string;
        inviteEmails?: string[];
      };

      if (!title || !title.trim() || !scheduledAt) {
        res.status(400).json({ error: 'Title and scheduled date/time are required.' });
        return;
      }

      const parsedDate = new Date(scheduledAt);
      if (Number.isNaN(parsedDate.getTime())) {
        res.status(400).json({ error: 'Invalid scheduled date/time.' });
        return;
      }

      const meeting = await createMeeting({
        hostId: uid,
        title: title.trim().slice(0, 140),
        description: (description || '').trim().slice(0, 1000),
        isPrivate: Boolean(isPrivate),
        passwordHash: passcode && passcode.trim() ? hashPasscode(passcode.trim()) : null,
        status: 'scheduled',
      });

      const schedule = await createScheduledMeeting({
        hostId: uid,
        meetingId: meeting.id,
        title: meeting.title,
        description: meeting.description,
        scheduledAt: parsedDate,
        duration: Math.min(480, Math.max(15, Number(duration) || 60)),
        timezone: (timezone || 'UTC').slice(0, 64),
        recurringRule: ['none', 'daily', 'weekly', 'monthly'].includes(recurringRule || '')
          ? (recurringRule as string)
          : 'none',
      });

      const appBaseUrl =
        process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const joinUrl = `${appBaseUrl}/?join=${meeting.meetingCode}`;

      const invitationResults: Array<{ email: string; status: string; note: string }> = [];
      const uniqueEmails = Array.from(
        new Set(
          (inviteEmails || [])
            .map((e) => e.trim().toLowerCase())
            .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        )
      ).slice(0, 25);

      for (const recipientEmail of uniqueEmails) {
        const delivery = await sendMeetingInvitationEmail({
          to: recipientEmail,
          senderName: profile.fullName,
          meetingTitle: meeting.title,
          meetingCode: meeting.meetingCode,
          joinUrl,
          scheduledAt: parsedDate.toUTCString(),
          description: meeting.description,
        });
        await createInvitation({
          meetingId: meeting.id,
          senderId: uid,
          recipientEmail,
          invitationStatus: delivery.status,
        });
        invitationResults.push({
          email: recipientEmail,
          status: delivery.status,
          note: delivery.note,
        });
      }

      await createNotification({
        userId: uid,
        title: 'Meeting scheduled',
        message: `"${meeting.title}" scheduled for ${parsedDate.toLocaleString()} (ID: ${meeting.meetingCode}).`,
        notificationType: 'reminder',
      });

      res.status(201).json({
        schedule: {
          ...schedule,
          meetingCode: meeting.meetingCode,
          roomName: meeting.roomName,
          isPrivate: meeting.isPrivate,
          status: meeting.status,
          hostName: profile.fullName,
        },
        meeting,
        invitations: invitationResults,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to schedule meeting' });
    }
  });

  app.put('/api/schedules/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const { title, description, scheduledAt, duration, timezone, recurringRule } = req.body as {
        title?: string;
        description?: string;
        scheduledAt?: string;
        duration?: number;
        timezone?: string;
        recurringRule?: string;
      };
      const updated = await updateScheduledMeeting(req.params.id, uid, {
        ...(title !== undefined ? { title: title.trim().slice(0, 140) } : {}),
        ...(description !== undefined ? { description: description.trim().slice(0, 1000) } : {}),
        ...(scheduledAt ? { scheduledAt: new Date(scheduledAt) } : {}),
        ...(duration !== undefined ? { duration: Math.min(480, Math.max(15, Number(duration))) } : {}),
        ...(timezone !== undefined ? { timezone: timezone.slice(0, 64) } : {}),
        ...(recurringRule !== undefined ? { recurringRule } : {}),
      });
      if (!updated) {
        res.status(404).json({ error: 'Scheduled meeting not found.' });
        return;
      }
      res.json({ schedule: updated });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update schedule' });
    }
  });

  app.delete('/api/schedules/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const deleted = await deleteScheduledMeeting(req.params.id, req.user!.uid);
      if (!deleted) {
        res.status(404).json({ error: 'Scheduled meeting not found.' });
        return;
      }
      res.json({ ok: true });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to cancel schedule' });
    }
  });

  // Standalone invitations endpoint
  app.post('/api/meetings/:id/invitations', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      if (!checkRateLimit(`invite:${uid}`, 20, 60_000)) {
        res.status(429).json({ error: 'Invitation rate limit reached. Try again shortly.' });
        return;
      }
      const meeting = await getMeetingById(req.params.id);
      if (!meeting) {
        res.status(404).json({ error: 'Meeting not found.' });
        return;
      }
      const allowed = await isUserMeetingMember(meeting.id, uid);
      if (!allowed) {
        res.status(403).json({ error: 'Only meeting hosts or participants can send invitations.' });
        return;
      }
      const { recipientEmail } = req.body as { recipientEmail?: string };
      if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) {
        res.status(400).json({ error: 'Enter a valid recipient email address.' });
        return;
      }

      const appBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const joinUrl = `${appBaseUrl}/?join=${meeting.meetingCode}`;

      const delivery = await sendMeetingInvitationEmail({
        to: recipientEmail.trim().toLowerCase(),
        senderName: req.user!.name || 'MeetUp Host',
        meetingTitle: meeting.title,
        meetingCode: meeting.meetingCode,
        joinUrl,
        description: meeting.description,
      });

      const record = await createInvitation({
        meetingId: meeting.id,
        senderId: uid,
        recipientEmail: recipientEmail.trim().toLowerCase(),
        invitationStatus: delivery.status,
      });

      res.status(201).json({ invitation: record, delivery });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to send invitation' });
    }
  });

  app.get('/api/meetings/:id/invitations', requireAuth, async (req: AuthRequest, res) => {
    try {
      const allowed = await isUserMeetingMember(req.params.id, req.user!.uid);
      if (!allowed) {
        res.status(403).json({ error: 'Access denied to meeting invitations.' });
        return;
      }
      const list = await listMeetingInvitations(req.params.id);
      res.json({ invitations: list });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch invitations' });
    }
  });

  // Meeting History & Feedback
  app.get('/api/history', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await listUserMeetingHistory(req.user!.uid);
      res.json({ history: list });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load history' });
    }
  });

  app.post('/api/history/:id/feedback', requireAuth, async (req: AuthRequest, res) => {
    try {
      const historyId = Number(req.params.id);
      const { rating, comment } = req.body as { rating?: number; comment?: string };
      if (!historyId || !rating || rating < 1 || rating > 5) {
        res.status(400).json({ error: 'Provide a rating between 1 and 5.' });
        return;
      }
      const updated = await saveMeetingFeedback(historyId, req.user!.uid, rating, comment || '');
      res.json({ history: updated });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save feedback' });
    }
  });

  // Recordings (LiveKit Egress only — honest server-side integration)
  app.get('/api/recordings', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await listUserRecordings(req.user!.uid);
      res.json({
        recordings: list,
        egressConfigured: getIntegrationsStatus().livekit.configured,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load recordings' });
    }
  });

  app.post('/api/recordings/start', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const { meetingId } = req.body as { meetingId?: string };
      if (!meetingId) {
        res.status(400).json({ error: 'meetingId is required.' });
        return;
      }
      const meeting = await getMeetingById(meetingId);
      if (!meeting || meeting.hostId !== uid) {
        res.status(403).json({ error: 'Only the host can start server-side meeting recording.' });
        return;
      }

      const egress = await startLiveKitRecording(meeting.roomName);
      if (!egress.supported) {
        res.status(503).json({
          error: egress.reason,
          egressConfigured: false,
        });
        return;
      }

      const record = await createRecordingRecord({
        meetingId: meeting.id,
        hostId: uid,
        egressId: egress.egressId,
        title: `${meeting.title} Recording`,
        storagePath: egress.storagePath,
        status: 'recording',
      });

      res.status(201).json({ recording: record });
    } catch (error: unknown) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to start LiveKit Egress recording',
      });
    }
  });

  app.post('/api/recordings/:egressId/stop', requireAuth, async (req: AuthRequest, res) => {
    try {
      const rec = await getRecordingByEgressId(req.params.egressId);
      if (!rec || rec.hostId !== req.user!.uid) {
        res.status(403).json({ error: 'Only the recording host can stop this recording.' });
        return;
      }
      const ok = await stopLiveKitRecording(req.params.egressId);
      res.json({ ok });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to stop recording' });
    }
  });

  app.delete('/api/recordings/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const deleted = await deleteRecordingRecord(req.params.id, req.user!.uid);
      if (!deleted) {
        res.status(404).json({ error: 'Recording not found.' });
        return;
      }
      res.json({ ok: true });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete recording' });
    }
  });

  // Notifications
  app.get('/api/notifications', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await listUserNotifications(req.user!.uid);
      res.json({ notifications: list });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load notifications' });
    }
  });

  app.post('/api/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
    try {
      await markAllNotificationsRead(req.user!.uid);
      res.json({ ok: true });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update notifications' });
    }
  });

  // Gemini AI Routes (Server-Side Only)
  app.post('/api/ai/summary', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      if (!checkRateLimit(`ai-summary:${uid}`, 15, 60_000)) {
        res.status(429).json({ error: 'AI rate limit reached. Please wait a minute.' });
        return;
      }
      const { meetingId, meetingTitle, transcript, chatHistory, manualNotes } = req.body as {
        meetingId?: string;
        meetingTitle?: string;
        transcript?: string;
        chatHistory?: Array<{ senderName: string; message: string }>;
        manualNotes?: string;
      };

      let resolvedChat = chatHistory || [];
      if (meetingId && resolvedChat.length === 0) {
        const allowed = await isUserMeetingMember(meetingId, uid);
        if (allowed) {
          const dbMessages = await listMeetingMessages(meetingId);
          resolvedChat = dbMessages.map((m) => ({
            senderName: m.senderName,
            message: m.message,
          }));
        }
      }

      const summary = await generateMeetingSummary({
        meetingTitle: meetingTitle || 'MeetUp Session',
        transcript: transcript || '',
        chatHistory: resolvedChat,
        manualNotes: manualNotes || '',
      });

      if (meetingId) {
        await saveMeetingSummary(meetingId, uid, summary as unknown as Record<string, unknown>);
      }

      res.json({ summary });
    } catch (error: unknown) {
      console.error('AI summary error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to generate AI meeting summary.',
      });
    }
  });

  app.post('/api/ai/tts', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      if (!checkRateLimit(`ai-tts:${uid}`, 15, 60_000)) {
        res.status(429).json({ error: 'TTS rate limit reached. Please wait a minute.' });
        return;
      }
      const { title, script, mode, voiceName } = req.body as {
        title?: string;
        script?: string;
        mode?: 'single' | 'dual';
        voiceName?: string;
      };

      if (!script || !script.trim()) {
        res.status(400).json({ error: 'Summary text is required for spoken recap.' });
        return;
      }

      const audio = await generateSpokenRecap({
        title: title || 'MeetUp Recap',
        script,
        mode: mode === 'dual' ? 'dual' : 'single',
        voiceName,
      });

      res.json(audio);
    } catch (error: unknown) {
      console.error('AI TTS error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to generate spoken recap.',
      });
    }
  });

  // Mount Vite middleware in development or serve dist in production
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`MeetUp server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal error starting MeetUp server:', err);
  process.exit(1);
});
