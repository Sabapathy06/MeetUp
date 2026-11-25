import { and, desc, eq, gte, or, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from './index.ts';
import {
  invitations,
  meetingHistory,
  meetings,
  messages,
  notifications,
  participants,
  profiles,
  recordings,
  scheduledMeetings,
  userSettings,
} from './schema.ts';

function generateMeetingCode(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const seg = (len: number) =>
    Array.from(crypto.randomBytes(len))
      .map((b) => letters[b % letters.length])
      .join('');
  return `${seg(3)}-${seg(4)}-${seg(3)}`;
}

export async function getOrCreateProfile(
  uid: string,
  email: string,
  fullName?: string,
  avatarUrl?: string | null
) {
  try {
    const safeName = (fullName && fullName.trim()) || email.split('@')[0] || 'MeetUp User';
    const personalCode = generateMeetingCode();

    const [profile] = await db
      .insert(profiles)
      .values({
        id: uid,
        email,
        fullName: safeName,
        avatarUrl: avatarUrl || null,
        personalMeetingCode: personalCode,
      })
      .onConflictDoUpdate({
        target: profiles.id,
        set: {
          email,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Ensure default settings row exists
    await db
      .insert(userSettings)
      .values({ userId: uid })
      .onConflictDoNothing({ target: userSettings.userId });

    return profile;
  } catch (error) {
    console.error('Database query failed (getOrCreateProfile):', error);
    throw new Error('Failed to synchronize user profile.', { cause: error });
  }
}

export async function getProfileWithSettings(uid: string) {
  try {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, uid)).limit(1);
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, uid))
      .limit(1);
    return { profile: profile || null, settings: settings || null };
  } catch (error) {
    console.error('Database query failed (getProfileWithSettings):', error);
    throw new Error('Failed to load profile settings.', { cause: error });
  }
}

export async function updateProfile(
  uid: string,
  updates: { fullName?: string; avatarUrl?: string | null }
) {
  try {
    const [updated] = await db
      .update(profiles)
      .set({
        ...(updates.fullName !== undefined ? { fullName: updates.fullName } : {}),
        ...(updates.avatarUrl !== undefined ? { avatarUrl: updates.avatarUrl } : {}),
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, uid))
      .returning();
    return updated || null;
  } catch (error) {
    console.error('Database query failed (updateProfile):', error);
    throw new Error('Failed to update profile.', { cause: error });
  }
}

export async function updateUserSettings(
  uid: string,
  updates: {
    theme?: string;
    language?: string;
    cameraPreference?: string;
    microphonePreference?: string;
    speakerPreference?: string;
    notificationPreferences?: Record<string, boolean>;
    privacyPreferences?: Record<string, boolean>;
  }
) {
  try {
    const [updated] = await db
      .insert(userSettings)
      .values({
        userId: uid,
        theme: updates.theme ?? 'dark',
        language: updates.language ?? 'en',
        cameraPreference: updates.cameraPreference ?? 'default',
        microphonePreference: updates.microphonePreference ?? 'default',
        speakerPreference: updates.speakerPreference ?? 'default',
        notificationPreferences: updates.notificationPreferences ?? {
          emailInvites: true,
          meetingReminders: true,
          chatSounds: true,
          recordingReady: true,
        },
        privacyPreferences: updates.privacyPreferences ?? {
          autoMuteOnJoin: false,
          autoCamOffOnJoin: false,
          waitingRoomByDefault: false,
        },
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          ...(updates.theme !== undefined ? { theme: updates.theme } : {}),
          ...(updates.language !== undefined ? { language: updates.language } : {}),
          ...(updates.cameraPreference !== undefined
            ? { cameraPreference: updates.cameraPreference }
            : {}),
          ...(updates.microphonePreference !== undefined
            ? { microphonePreference: updates.microphonePreference }
            : {}),
          ...(updates.speakerPreference !== undefined
            ? { speakerPreference: updates.speakerPreference }
            : {}),
          ...(updates.notificationPreferences !== undefined
            ? { notificationPreferences: updates.notificationPreferences }
            : {}),
          ...(updates.privacyPreferences !== undefined
            ? { privacyPreferences: updates.privacyPreferences }
            : {}),
          updatedAt: new Date(),
        },
      })
      .returning();
    return updated;
  } catch (error) {
    console.error('Database query failed (updateUserSettings):', error);
    throw new Error('Failed to update user settings.', { cause: error });
  }
}

export async function createMeeting(input: {
  hostId: string;
  title: string;
  description?: string;
  isPrivate?: boolean;
  passwordHash?: string | null;
  status?: 'active' | 'scheduled';
  meetingCode?: string;
}) {
  try {
    const code = input.meetingCode || generateMeetingCode();
    const roomName = `cm-${code}-${crypto.randomBytes(2).toString('hex')}`;
    const [created] = await db
      .insert(meetings)
      .values({
        meetingCode: code,
        title: input.title.trim() || 'Instant Meeting',
        description: (input.description || '').trim(),
        hostId: input.hostId,
        roomName,
        isPrivate: Boolean(input.isPrivate),
        passwordHash: input.passwordHash || null,
        status: input.status || 'active',
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed (createMeeting):', error);
    throw new Error('Failed to create meeting.', { cause: error });
  }
}

export async function getMeetingByCode(code: string) {
  try {
    const normalized = code.trim().toLowerCase();
    const [row] = await db
      .select({
        meeting: meetings,
        hostName: profiles.fullName,
        hostEmail: profiles.email,
      })
      .from(meetings)
      .innerJoin(profiles, eq(meetings.hostId, profiles.id))
      .where(or(eq(meetings.meetingCode, normalized), eq(meetings.roomName, normalized)))
      .limit(1);
    return row ? { ...row.meeting, hostName: row.hostName, hostEmail: row.hostEmail } : null;
  } catch (error) {
    console.error('Database query failed (getMeetingByCode):', error);
    throw new Error('Failed to look up meeting.', { cause: error });
  }
}

export async function getMeetingById(id: string) {
  try {
    const [row] = await db
      .select({
        meeting: meetings,
        hostName: profiles.fullName,
      })
      .from(meetings)
      .innerJoin(profiles, eq(meetings.hostId, profiles.id))
      .where(eq(meetings.id, id))
      .limit(1);
    return row ? { ...row.meeting, hostName: row.hostName } : null;
  } catch (error) {
    console.error('Database query failed (getMeetingById):', error);
    throw new Error('Failed to load meeting details.', { cause: error });
  }
}

export async function updateMeeting(
  meetingId: string,
  updates: {
    title?: string;
    description?: string;
    isPrivate?: boolean;
    isLocked?: boolean;
    allowChat?: boolean;
    allowScreenShare?: boolean;
    status?: string;
    endedAt?: Date | null;
  }
) {
  try {
    const [updated] = await db
      .update(meetings)
      .set(updates)
      .where(eq(meetings.id, meetingId))
      .returning();
    return updated || null;
  } catch (error) {
    console.error('Database query failed (updateMeeting):', error);
    throw new Error('Failed to update meeting.', { cause: error });
  }
}

export async function listUserRecentMeetings(userId: string) {
  try {
    const rows = await db
      .select({
        meeting: meetings,
        hostName: profiles.fullName,
      })
      .from(meetings)
      .innerJoin(profiles, eq(meetings.hostId, profiles.id))
      .where(eq(meetings.hostId, userId))
      .orderBy(desc(meetings.createdAt))
      .limit(25);
    return rows.map((r) => ({ ...r.meeting, hostName: r.hostName }));
  } catch (error) {
    console.error('Database query failed (listUserRecentMeetings):', error);
    throw new Error('Failed to load meetings.', { cause: error });
  }
}

export async function recordParticipantJoin(input: {
  meetingId: string;
  userId: string;
  displayName: string;
  role: 'host' | 'co_host' | 'participant';
  isMuted: boolean;
  cameraEnabled: boolean;
}) {
  try {
    const [participant] = await db
      .insert(participants)
      .values({
        meetingId: input.meetingId,
        userId: input.userId,
        displayName: input.displayName,
        role: input.role,
        isMuted: input.isMuted,
        cameraEnabled: input.cameraEnabled,
      })
      .returning();

    const [historyRow] = await db
      .insert(meetingHistory)
      .values({
        meetingId: input.meetingId,
        userId: input.userId,
        joinedAt: new Date(),
        duration: 0,
      })
      .returning();

    return { participant, historyId: historyRow.id };
  } catch (error) {
    console.error('Database query failed (recordParticipantJoin):', error);
    throw new Error('Failed to record meeting join.', { cause: error });
  }
}

export async function recordParticipantLeave(input: {
  meetingId: string;
  userId: string;
  historyId?: number;
  durationSeconds?: number;
}) {
  try {
    const now = new Date();
    await db
      .update(participants)
      .set({ leftAt: now })
      .where(and(eq(participants.meetingId, input.meetingId), eq(participants.userId, input.userId)));

    if (input.historyId) {
      await db
        .update(meetingHistory)
        .set({
          leftAt: now,
          duration: Math.max(0, Math.floor(input.durationSeconds || 0)),
        })
        .where(and(eq(meetingHistory.id, input.historyId), eq(meetingHistory.userId, input.userId)));
    }
  } catch (error) {
    console.error('Database query failed (recordParticipantLeave):', error);
    throw new Error('Failed to update leave timestamp.', { cause: error });
  }
}

export async function saveMessageToDb(input: {
  meetingId: string;
  senderId: string;
  senderName: string;
  message: string;
  messageType?: string;
}) {
  try {
    const [saved] = await db
      .insert(messages)
      .values({
        meetingId: input.meetingId,
        senderId: input.senderId,
        senderName: input.senderName,
        message: input.message.slice(0, 2000),
        messageType: input.messageType || 'text',
      })
      .returning();
    return saved;
  } catch (error) {
    console.error('Database query failed (saveMessageToDb):', error);
    throw new Error('Failed to archive message.', { cause: error });
  }
}

export async function listMeetingMessages(meetingId: string) {
  try {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.meetingId, meetingId))
      .orderBy(messages.createdAt);
  } catch (error) {
    console.error('Database query failed (listMeetingMessages):', error);
    throw new Error('Failed to load meeting messages.', { cause: error });
  }
}

export async function createScheduledMeeting(input: {
  hostId: string;
  meetingId: string;
  title: string;
  description: string;
  scheduledAt: Date;
  duration: number;
  timezone: string;
  recurringRule: string;
}) {
  try {
    const [created] = await db
      .insert(scheduledMeetings)
      .values({
        hostId: input.hostId,
        meetingId: input.meetingId,
        title: input.title,
        description: input.description,
        scheduledAt: input.scheduledAt,
        duration: input.duration,
        timezone: input.timezone,
        recurringRule: input.recurringRule,
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed (createScheduledMeeting):', error);
    throw new Error('Failed to schedule meeting.', { cause: error });
  }
}

export async function listScheduledMeetings(userId: string, userEmail?: string) {
  try {
    const rows = await db
      .select({
        schedule: scheduledMeetings,
        meetingCode: meetings.meetingCode,
        roomName: meetings.roomName,
        isPrivate: meetings.isPrivate,
        status: meetings.status,
        hostName: profiles.fullName,
      })
      .from(scheduledMeetings)
      .innerJoin(meetings, eq(scheduledMeetings.meetingId, meetings.id))
      .innerJoin(profiles, eq(scheduledMeetings.hostId, profiles.id))
      .where(eq(scheduledMeetings.hostId, userId))
      .orderBy(scheduledMeetings.scheduledAt);

    // Also include scheduled meetings where the user was invited by email
    let invitedRows: typeof rows = [];
    if (userEmail) {
      invitedRows = await db
        .select({
          schedule: scheduledMeetings,
          meetingCode: meetings.meetingCode,
          roomName: meetings.roomName,
          isPrivate: meetings.isPrivate,
          status: meetings.status,
          hostName: profiles.fullName,
        })
        .from(invitations)
        .innerJoin(meetings, eq(invitations.meetingId, meetings.id))
        .innerJoin(scheduledMeetings, eq(scheduledMeetings.meetingId, meetings.id))
        .innerJoin(profiles, eq(scheduledMeetings.hostId, profiles.id))
        .where(
          and(
            eq(invitations.recipientEmail, userEmail.toLowerCase()),
            gte(scheduledMeetings.scheduledAt, new Date(Date.now() - 86400000))
          )
        );
    }

    const byId = new Map<string, (typeof rows)[number]>();
    for (const r of [...rows, ...invitedRows]) {
      byId.set(r.schedule.id, r);
    }

    return Array.from(byId.values())
      .sort((a, b) => a.schedule.scheduledAt.getTime() - b.schedule.scheduledAt.getTime())
      .map((r) => ({
        ...r.schedule,
        meetingCode: r.meetingCode,
        roomName: r.roomName,
        isPrivate: r.isPrivate,
        status: r.status,
        hostName: r.hostName,
      }));
  } catch (error) {
    console.error('Database query failed (listScheduledMeetings):', error);
    throw new Error('Failed to fetch scheduled meetings.', { cause: error });
  }
}

export async function updateScheduledMeeting(
  scheduleId: string,
  hostId: string,
  updates: {
    title?: string;
    description?: string;
    scheduledAt?: Date;
    duration?: number;
    timezone?: string;
    recurringRule?: string;
  }
) {
  try {
    const [updated] = await db
      .update(scheduledMeetings)
      .set(updates)
      .where(and(eq(scheduledMeetings.id, scheduleId), eq(scheduledMeetings.hostId, hostId)))
      .returning();
    return updated || null;
  } catch (error) {
    console.error('Database query failed (updateScheduledMeeting):', error);
    throw new Error('Failed to update scheduled meeting.', { cause: error });
  }
}

export async function deleteScheduledMeeting(scheduleId: string, hostId: string) {
  try {
    const [deleted] = await db
      .delete(scheduledMeetings)
      .where(and(eq(scheduledMeetings.id, scheduleId), eq(scheduledMeetings.hostId, hostId)))
      .returning();
    return deleted || null;
  } catch (error) {
    console.error('Database query failed (deleteScheduledMeeting):', error);
    throw new Error('Failed to cancel scheduled meeting.', { cause: error });
  }
}

export async function createInvitation(input: {
  meetingId: string;
  senderId: string;
  recipientEmail: string;
  invitationStatus: string;
}) {
  try {
    const [created] = await db
      .insert(invitations)
      .values({
        meetingId: input.meetingId,
        senderId: input.senderId,
        recipientEmail: input.recipientEmail.trim().toLowerCase(),
        invitationStatus: input.invitationStatus,
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed (createInvitation):', error);
    throw new Error('Failed to save invitation.', { cause: error });
  }
}

export async function listMeetingInvitations(meetingId: string) {
  try {
    return await db
      .select()
      .from(invitations)
      .where(eq(invitations.meetingId, meetingId))
      .orderBy(desc(invitations.createdAt));
  } catch (error) {
    console.error('Database query failed (listMeetingInvitations):', error);
    throw new Error('Failed to list invitations.', { cause: error });
  }
}

export async function listUserMeetingHistory(userId: string) {
  try {
    const rows = await db
      .select({
        history: meetingHistory,
        meetingTitle: meetings.title,
        meetingCode: meetings.meetingCode,
        meetingStatus: meetings.status,
        hostId: meetings.hostId,
        hostName: profiles.fullName,
        participantCount: sql<number>`(SELECT COUNT(DISTINCT user_id)::int FROM participants WHERE participants.meeting_id = ${meetings.id})`,
      })
      .from(meetingHistory)
      .innerJoin(meetings, eq(meetingHistory.meetingId, meetings.id))
      .innerJoin(profiles, eq(meetings.hostId, profiles.id))
      .where(eq(meetingHistory.userId, userId))
      .orderBy(desc(meetingHistory.joinedAt))
      .limit(50);

    return rows.map((r) => ({
      ...r.history,
      meetingTitle: r.meetingTitle,
      meetingCode: r.meetingCode,
      meetingStatus: r.meetingStatus,
      hostId: r.hostId,
      hostName: r.hostName,
      participantCount: r.participantCount || 1,
    }));
  } catch (error) {
    console.error('Database query failed (listUserMeetingHistory):', error);
    throw new Error('Failed to fetch meeting history.', { cause: error });
  }
}

export async function saveMeetingSummary(
  meetingId: string,
  userId: string,
  summaryPayload: Record<string, unknown>
) {
  try {
    const [existingRow] = await db
      .select()
      .from(meetingHistory)
      .where(and(eq(meetingHistory.meetingId, meetingId), eq(meetingHistory.userId, userId)))
      .orderBy(desc(meetingHistory.joinedAt))
      .limit(1);

    if (existingRow) {
      const [updated] = await db
        .update(meetingHistory)
        .set({ aiSummary: summaryPayload })
        .where(eq(meetingHistory.id, existingRow.id))
        .returning();
      return updated;
    }

    const [inserted] = await db
      .insert(meetingHistory)
      .values({
        meetingId,
        userId,
        aiSummary: summaryPayload,
        duration: 0,
      })
      .returning();
    return inserted;
  } catch (error) {
    console.error('Database query failed (saveMeetingSummary):', error);
    throw new Error('Failed to save AI meeting summary.', { cause: error });
  }
}

export async function saveMeetingFeedback(
  historyId: number,
  userId: string,
  rating: number,
  comment: string
) {
  try {
    const [updated] = await db
      .update(meetingHistory)
      .set({
        feedbackRating: Math.min(5, Math.max(1, Math.round(rating))),
        feedbackComment: comment.slice(0, 1000),
      })
      .where(and(eq(meetingHistory.id, historyId), eq(meetingHistory.userId, userId)))
      .returning();
    return updated || null;
  } catch (error) {
    console.error('Database query failed (saveMeetingFeedback):', error);
    throw new Error('Failed to submit feedback.', { cause: error });
  }
}

export async function listUserRecordings(userId: string) {
  try {
    const rows = await db
      .select({
        recording: recordings,
        meetingTitle: meetings.title,
        meetingCode: meetings.meetingCode,
      })
      .from(recordings)
      .innerJoin(meetings, eq(recordings.meetingId, meetings.id))
      .where(eq(recordings.hostId, userId))
      .orderBy(desc(recordings.createdAt));

    return rows.map((r) => ({
      ...r.recording,
      meetingTitle: r.meetingTitle,
      meetingCode: r.meetingCode,
    }));
  } catch (error) {
    console.error('Database query failed (listUserRecordings):', error);
    throw new Error('Failed to fetch recordings.', { cause: error });
  }
}

export async function createRecordingRecord(input: {
  meetingId: string;
  hostId: string;
  egressId?: string | null;
  title: string;
  recordingUrl?: string | null;
  storagePath: string;
  duration?: number;
  status?: string;
}) {
  try {
    const [created] = await db
      .insert(recordings)
      .values({
        meetingId: input.meetingId,
        hostId: input.hostId,
        egressId: input.egressId || null,
        title: input.title,
        recordingUrl: input.recordingUrl || null,
        storagePath: input.storagePath,
        duration: input.duration || 0,
        status: input.status || 'recording',
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed (createRecordingRecord):', error);
    throw new Error('Failed to create recording entry.', { cause: error });
  }
}

export async function isUserMeetingMember(meetingId: string, userId: string): Promise<boolean> {
  try {
    const [meetingRow] = await db
      .select({ hostId: meetings.hostId })
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .limit(1);
    if (!meetingRow) return false;
    if (meetingRow.hostId === userId) return true;

    const [participantRow] = await db
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.meetingId, meetingId), eq(participants.userId, userId)))
      .limit(1);
    return Boolean(participantRow);
  } catch (error) {
    console.error('Database query failed (isUserMeetingMember):', error);
    return false;
  }
}

export async function getRecordingByEgressId(egressId: string) {
  try {
    const [row] = await db
      .select()
      .from(recordings)
      .where(eq(recordings.egressId, egressId))
      .limit(1);
    return row || null;
  } catch (error) {
    console.error('Database query failed (getRecordingByEgressId):', error);
    return null;
  }
}

export async function deleteRecordingRecord(recordingId: string, hostId: string) {
  try {
    const [deleted] = await db
      .delete(recordings)
      .where(and(eq(recordings.id, recordingId), eq(recordings.hostId, hostId)))
      .returning();
    return deleted || null;
  } catch (error) {
    console.error('Database query failed (deleteRecordingRecord):', error);
    throw new Error('Failed to delete recording.', { cause: error });
  }
}

export async function createNotification(input: {
  userId: string;
  title: string;
  message: string;
  notificationType?: string;
}) {
  try {
    const [created] = await db
      .insert(notifications)
      .values({
        userId: input.userId,
        title: input.title,
        message: input.message,
        notificationType: input.notificationType || 'system',
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed (createNotification):', error);
    throw new Error('Failed to create notification.', { cause: error });
  }
}

export async function listUserNotifications(userId: string) {
  try {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(30);
  } catch (error) {
    console.error('Database query failed (listUserNotifications):', error);
    throw new Error('Failed to load notifications.', { cause: error });
  }
}

export async function markAllNotificationsRead(userId: string) {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  } catch (error) {
    console.error('Database query failed (markAllNotificationsRead):', error);
    throw new Error('Failed to update notifications.', { cause: error });
  }
}
