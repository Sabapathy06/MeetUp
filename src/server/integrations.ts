import crypto from 'node:crypto';
import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
} from 'livekit-server-sdk';
import { Resend } from 'resend';

// Cryptographic passcode hashing (scrypt)
export function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasscode(passcode: string, storedHash: string): boolean {
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(passcode, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

// Simple in-memory sliding-window rate limiter
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= maxRequests) {
    return false;
  }
  bucket.count += 1;
  return true;
}

// External integration status
export function getIntegrationsStatus() {
  const livekitConfigured = Boolean(
    process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET
  );
  const resendConfigured = Boolean(process.env.RESEND_API_KEY);
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);

  return {
    livekit: {
      configured: livekitConfigured,
      mode: livekitConfigured ? 'livekit' : 'webrtc-fallback',
    },
    resend: {
      configured: resendConfigured,
    },
    gemini: {
      configured: geminiConfigured,
    },
  };
}

// LiveKit token minting
export async function mintLiveKitToken(input: {
  roomName: string;
  identity: string;
  name: string;
  isHostOrCoHost: boolean;
  canPublish?: boolean;
}) {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!url || !apiKey || !apiSecret) {
    return {
      configured: false as const,
      mode: 'webrtc-fallback' as const,
      url: null,
      token: null,
    };
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: input.identity,
    name: input.name,
    ttl: '4h',
  });

  at.addGrant({
    roomJoin: true,
    room: input.roomName,
    canPublish: input.canPublish ?? true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: input.isHostOrCoHost,
  });

  const token = await at.toJwt();
  return {
    configured: true as const,
    mode: 'livekit' as const,
    url,
    token,
  };
}

function getLiveKitHttpUrl(): string | null {
  const raw = process.env.LIVEKIT_URL;
  if (!raw) return null;
  return raw.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');
}

export async function removeLiveKitParticipant(roomName: string, identity: string) {
  const httpUrl = getLiveKitHttpUrl();
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!httpUrl || !apiKey || !apiSecret) return false;

  const client = new RoomServiceClient(httpUrl, apiKey, apiSecret);
  await client.removeParticipant(roomName, identity);
  return true;
}

export async function startLiveKitRecording(roomName: string) {
  const httpUrl = getLiveKitHttpUrl();
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!httpUrl || !apiKey || !apiSecret) {
    return {
      supported: false as const,
      reason:
        'LiveKit Egress requires LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET plus configured cloud storage egress.',
    };
  }

  const egressClient = new EgressClient(httpUrl, apiKey, apiSecret);
  const storagePath = `recordings/${roomName}-${Date.now()}.mp4`;
  const info = await egressClient.startRoomCompositeEgress(roomName, {
    file: new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: storagePath,
    }),
  });

  return {
    supported: true as const,
    egressId: info.egressId,
    storagePath,
  };
}

export async function stopLiveKitRecording(egressId: string) {
  const httpUrl = getLiveKitHttpUrl();
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!httpUrl || !apiKey || !apiSecret) return false;

  const egressClient = new EgressClient(httpUrl, apiKey, apiSecret);
  await egressClient.stopEgress(egressId);
  return true;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Resend Email Integration
export async function sendMeetingInvitationEmail(input: {
  to: string;
  senderName: string;
  meetingTitle: string;
  meetingCode: string;
  joinUrl: string;
  scheduledAt?: string;
  description?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      sent: false,
      status: 'pending' as const,
      note: 'RESEND_API_KEY not configured; invitation saved with shareable link.',
    };
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL || 'MeetUp <onboarding@resend.dev>';
  const safeTitle = escapeHtml(input.meetingTitle);
  const safeSender = escapeHtml(input.senderName);
  const safeDesc = escapeHtml(input.description || '');
  const safeCode = escapeHtml(input.meetingCode);
  const safeScheduled = input.scheduledAt ? escapeHtml(input.scheduledAt) : '';
  const safeJoinUrl = /^https?:\/\//i.test(input.joinUrl) ? escapeHtml(input.joinUrl) : '#';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #0b1326; color: #dae2fd; border-radius: 16px;">
      <h2 style="margin: 0 0 8px; color: #ffffff;">MeetUp Invitation</h2>
      <p style="margin: 0 0 16px; color: #c3c6d7;">${safeSender} invited you to join <strong>${safeTitle}</strong>.</p>
      ${safeScheduled ? `<p style="margin: 0 0 12px; color: #b4c5ff;"><strong>When:</strong> ${safeScheduled}</p>` : ''}
      ${safeDesc ? `<p style="margin: 0 0 16px; color: #c3c6d7;">${safeDesc}</p>` : ''}
      <p style="margin: 0 0 20px; font-family: monospace; color: #4edea3;">Meeting ID: ${safeCode}</p>
      <a href="${safeJoinUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 999px; font-weight: 600;">Join Meeting</a>
    </div>
  `;

  try {
    await resend.emails.send({
      from,
      to: [input.to],
      subject: `MeetUp Invite: ${safeTitle}`,
      html,
    });
    return { sent: true, status: 'sent' as const, note: 'Email invitation delivered via Resend.' };
  } catch (error) {
    console.error('Resend email delivery error:', error);
    return {
      sent: false,
      status: 'pending' as const,
      note: 'Invitation saved; email delivery requires a verified Resend sender domain.',
    };
  }
}
