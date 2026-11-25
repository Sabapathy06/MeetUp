import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// 1. User profiles (keyed by Firebase Auth UID for zero-join ownership checks)
export const profiles = pgTable('profiles', {
  id: text('id').primaryKey(), // Firebase UID
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  avatarUrl: text('avatar_url'),
  personalMeetingCode: text('personal_meeting_code').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. Meetings
export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    meetingCode: text('meeting_code').notNull().unique(),
    title: text('title').notNull(),
    description: text('description').default('').notNull(),
    hostId: text('host_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    roomName: text('room_name').notNull().unique(),
    passwordHash: text('password_hash'),
    isPrivate: boolean('is_private').default(false).notNull(),
    isLocked: boolean('is_locked').default(false).notNull(),
    allowChat: boolean('allow_chat').default(true).notNull(),
    allowScreenShare: boolean('allow_screen_share').default(true).notNull(),
    status: text('status').default('active').notNull(), // active | scheduled | ended
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_meetings_host_id').on(table.hostId),
    index('idx_meetings_status').on(table.status),
  ]
);

// 3. Participants
export const participants = pgTable(
  'participants',
  {
    id: serial('id').primaryKey(),
    meetingId: uuid('meeting_id')
      .references(() => meetings.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    displayName: text('display_name').notNull(),
    role: text('role').default('participant').notNull(), // host | co_host | participant
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    isMuted: boolean('is_muted').default(false).notNull(),
    cameraEnabled: boolean('camera_enabled').default(true).notNull(),
  },
  (table) => [
    index('idx_participants_meeting_id').on(table.meetingId),
    index('idx_participants_user_id').on(table.userId),
  ]
);

// 4. Messages (durable PostgreSQL archive of meeting chat & AI notes)
export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    meetingId: uuid('meeting_id')
      .references(() => meetings.id, { onDelete: 'cascade' })
      .notNull(),
    senderId: text('sender_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    senderName: text('sender_name').notNull(),
    message: text('message').notNull(),
    messageType: text('message_type').default('text').notNull(), // text | system | ai_note | caption
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_messages_meeting_id').on(table.meetingId)]
);

// 5. Scheduled Meetings
export const scheduledMeetings = pgTable(
  'scheduled_meetings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    hostId: text('host_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    description: text('description').default('').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    duration: integer('duration').default(60).notNull(), // minutes
    timezone: text('timezone').default('UTC').notNull(),
    recurringRule: text('recurring_rule').default('none').notNull(), // none | daily | weekly | monthly
    meetingId: uuid('meeting_id')
      .references(() => meetings.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_scheduled_meetings_host_id').on(table.hostId),
    index('idx_scheduled_meetings_scheduled_at').on(table.scheduledAt),
  ]
);

// 6. Invitations
export const invitations = pgTable(
  'invitations',
  {
    id: serial('id').primaryKey(),
    meetingId: uuid('meeting_id')
      .references(() => meetings.id, { onDelete: 'cascade' })
      .notNull(),
    senderId: text('sender_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    recipientEmail: text('recipient_email').notNull(),
    invitationStatus: text('invitation_status').default('pending').notNull(), // pending | sent | accepted | declined
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_invitations_meeting_id').on(table.meetingId),
    index('idx_invitations_recipient').on(table.recipientEmail),
  ]
);

// 7. Meeting History (with optional AI summary JSON & user feedback)
export const meetingHistory = pgTable(
  'meeting_history',
  {
    id: serial('id').primaryKey(),
    meetingId: uuid('meeting_id')
      .references(() => meetings.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    duration: integer('duration').default(0).notNull(), // seconds
    aiSummary: jsonb('ai_summary'),
    feedbackRating: integer('feedback_rating'),
    feedbackComment: text('feedback_comment'),
  },
  (table) => [
    index('idx_meeting_history_user_id').on(table.userId),
    index('idx_meeting_history_meeting_id').on(table.meetingId),
  ]
);

// 8. Recordings (LiveKit Egress metadata & verified cloud storage paths)
export const recordings = pgTable(
  'recordings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    meetingId: uuid('meeting_id')
      .references(() => meetings.id, { onDelete: 'cascade' })
      .notNull(),
    hostId: text('host_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    egressId: text('egress_id'),
    title: text('title').notNull(),
    recordingUrl: text('recording_url'),
    storagePath: text('storage_path').notNull(),
    duration: integer('duration').default(0).notNull(), // seconds
    status: text('status').default('processing').notNull(), // recording | processing | ready | failed
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_recordings_meeting_id').on(table.meetingId),
    index('idx_recordings_host_id').on(table.hostId),
  ]
);

// 9. Notifications
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    notificationType: text('notification_type').default('system').notNull(), // invite | reminder | recording | system
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_notifications_user_id').on(table.userId)]
);

// 10. User Settings
export const userSettings = pgTable('user_settings', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  theme: text('theme').default('dark').notNull(), // dark | light
  language: text('language').default('en').notNull(),
  cameraPreference: text('camera_preference').default('default').notNull(),
  microphonePreference: text('microphone_preference').default('default').notNull(),
  speakerPreference: text('speaker_preference').default('default').notNull(),
  notificationPreferences: jsonb('notification_preferences')
    .default({
      emailInvites: true,
      meetingReminders: true,
      chatSounds: true,
      recordingReady: true,
    })
    .notNull(),
  privacyPreferences: jsonb('privacy_preferences')
    .default({
      autoMuteOnJoin: false,
      autoCamOffOnJoin: false,
      waitingRoomByDefault: false,
    })
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Drizzle Relations
export const profilesRelations = relations(profiles, ({ many, one }) => ({
  hostedMeetings: many(meetings),
  participations: many(participants),
  scheduledMeetings: many(scheduledMeetings),
  history: many(meetingHistory),
  notifications: many(notifications),
  settings: one(userSettings, {
    fields: [profiles.id],
    references: [userSettings.userId],
  }),
}));

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  host: one(profiles, {
    fields: [meetings.hostId],
    references: [profiles.id],
  }),
  participants: many(participants),
  messages: many(messages),
  invitations: many(invitations),
  recordings: many(recordings),
}));
