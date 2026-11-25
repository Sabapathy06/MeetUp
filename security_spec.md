# ConnectMeet Firestore Security Specification

## Data Invariants
1. **Default-Deny Baseline**: Every path outside explicit room collections denies all reads and writes.
2. **Verified Identity**: All Firestore operations require an authenticated Firebase user with `email_verified == true`.
3. **No Room Scraping**: Top-level `/rooms` collection forbids `list`; rooms are accessed strictly by validated `roomId` (`get`).
4. **Master Gate & Terminal State Lock**: Once a room transitions to `status == 'ended'`, no non-admin updates or new chat/poll/stroke mutations are permitted.
5. **Identity Integrity & Immutability**: Authors cannot spoof `hostId`, `userId`, `senderId`, `authorId`, `creatorId`, or `fromUserId`, and cannot mutate `createdAt` or creator fields after creation.
6. **Temporal & Volumetric Integrity**: Every string and array enforces explicit `.size()` bounds and server `request.time` validation to prevent payload exhaustion.
7. **PII Isolation**: User emails, settings, and private credentials live exclusively in Cloud SQL PostgreSQL behind verified Firebase Admin Express middleware, never in public Firestore docs.

## Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Room Read**: `GET /rooms/abc-defg-hij` with `auth == null`.
2. **Unverified Email Write**: `CREATE /rooms/abc-defg-hij` with `email_verified: false`.
3. **Room Enumeration Scrape**: `LIST /rooms` attempting to enumerate active rooms.
4. **Shadow Field Injection**: `CREATE /rooms/abc-defg-hij/messages/m1` adding unauthorized `isAdmin: true` ghost key.
5. **ID Poisoning**: `CREATE /rooms/../../../etc` or 1.5KB room ID string failing `isValidId()`.
6. **Identity Spoofing**: `CREATE /rooms/abc-defg-hij/messages/m2` setting `senderId` to another user's UID.
7. **Host Takeover**: Non-host updating `hostId` or `isLocked` on `/rooms/abc-defg-hij`.
8. **Terminal State Bypass**: Updating `/rooms/abc-defg-hij` after `status == 'ended'`.
9. **Client Timestamp Forgery**: Creating a chat message with backdated `createdAt` != `request.time`.
10. **Payload Exhaustion**: Sending a 50KB chat body or 1000-element whiteboard `points` array.
11. **Waiting Room Self-Admission**: Requester updating their own `waiting_room/{uid}` `status` from `pending` to `admitted`.
12. **Signal Interception**: Third-party reading `signals/{id}` where neither `fromUserId` nor `toUserId` matches `request.auth.uid`.
