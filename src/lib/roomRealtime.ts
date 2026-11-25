import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  getDocs,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import type {
  MeetingRecord,
  RoomChatMessage,
  RoomDoc,
  RoomPoll,
  RoomPresence,
  RoomQuestion,
  WaitingRoomRequest,
  WhiteboardStroke,
} from '../types/connectmeet';

function makeDocId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function ensureFirestoreRoom(meeting: MeetingRecord): Promise<void> {
  if (!auth.currentUser) return;
  const roomId = meeting.roomName;
  const path = `rooms/${roomId}`;
  const ref = doc(db, 'rooms', roomId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists() && meeting.hostId === auth.currentUser.uid) {
      await setDoc(ref, {
        roomId,
        meetingCode: meeting.meetingCode,
        title: meeting.title.slice(0, 140),
        hostId: meeting.hostId,
        coHostIds: [],
        status: 'active',
        isLocked: Boolean(meeting.isLocked),
        isPrivate: Boolean(meeting.isPrivate),
        allowChat: meeting.allowChat !== false,
        allowScreenShare: meeting.allowScreenShare !== false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeRoom(roomId: string, onUpdate: (room: RoomDoc | null) => void) {
  const path = `rooms/${roomId}`;
  return onSnapshot(
    doc(db, 'rooms', roomId),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      onUpdate(snap.data() as RoomDoc);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function updateFirestoreRoom(
  roomId: string,
  updates: Partial<
    Pick<
      RoomDoc,
      'title' | 'coHostIds' | 'status' | 'isLocked' | 'isPrivate' | 'allowChat' | 'allowScreenShare' | 'activeSpeakerId'
    >
  >
) {
  const path = `rooms/${roomId}`;
  try {
    await updateDoc(doc(db, 'rooms', roomId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function joinRoomPresence(input: {
  roomId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  role: 'host' | 'co_host' | 'participant';
  isMuted: boolean;
  cameraEnabled: boolean;
  isScreenSharing?: boolean;
}) {
  const path = `rooms/${input.roomId}/presence/${input.userId}`;
  try {
    const payload: Record<string, unknown> = {
      roomId: input.roomId,
      userId: input.userId,
      displayName: input.displayName.slice(0, 80),
      role: input.role,
      isMuted: input.isMuted,
      cameraEnabled: input.cameraEnabled,
      isScreenSharing: Boolean(input.isScreenSharing),
      handRaised: false,
      kicked: false,
      muteRequested: false,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.avatarUrl) {
      payload.avatarUrl = input.avatarUrl.slice(0, 500);
    }
    await setDoc(doc(db, 'rooms', input.roomId, 'presence', input.userId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateOwnPresence(
  roomId: string,
  userId: string,
  updates: Partial<
    Pick<
      RoomPresence,
      | 'displayName'
      | 'isMuted'
      | 'cameraEnabled'
      | 'isScreenSharing'
      | 'handRaised'
      | 'reaction'
      | 'reactionAt'
      | 'breakoutRoom'
      | 'muteRequested'
    >
  >
) {
  const path = `rooms/${roomId}/presence/${userId}`;
  try {
    await updateDoc(doc(db, 'rooms', roomId, 'presence', userId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function hostUpdateParticipant(
  roomId: string,
  targetUserId: string,
  updates: Partial<Pick<RoomPresence, 'role' | 'kicked' | 'muteRequested' | 'breakoutRoom'>>
) {
  const path = `rooms/${roomId}/presence/${targetUserId}`;
  try {
    await updateDoc(doc(db, 'rooms', roomId, 'presence', targetUserId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function leaveRoomPresence(roomId: string, userId: string) {
  const path = `rooms/${roomId}/presence/${userId}`;
  try {
    await deleteDoc(doc(db, 'rooms', roomId, 'presence', userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribePresence(roomId: string, onUpdate: (list: RoomPresence[]) => void) {
  const path = `rooms/${roomId}/presence`;
  const q = query(collection(db, 'rooms', roomId, 'presence'), where('roomId', '==', roomId));
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(snap.docs.map((d) => d.data() as RoomPresence));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function sendRoomChat(
  roomId: string,
  senderId: string,
  senderName: string,
  body: string,
  messageType: 'text' | 'system' | 'ai_note' = 'text'
) {
  const messageId = makeDocId('msg');
  const path = `rooms/${roomId}/messages/${messageId}`;
  try {
    await setDoc(doc(db, 'rooms', roomId, 'messages', messageId), {
      roomId,
      senderId,
      senderName: senderName.slice(0, 80),
      body: body.trim().slice(0, 2000),
      messageType,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeRoomMessages(
  roomId: string,
  onUpdate: (messages: RoomChatMessage[]) => void
) {
  const path = `rooms/${roomId}/messages`;
  const q = query(
    collection(db, 'rooms', roomId, 'messages'),
    where('roomId', '==', roomId),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(
        snap.docs.map((d) => {
          const data = d.data() as {
            roomId: string;
            senderId: string;
            senderName: string;
            body: string;
            messageType: 'text' | 'system' | 'ai_note';
            createdAt?: { toDate?: () => Date };
          };
          return {
            id: d.id,
            roomId: data.roomId,
            senderId: data.senderId,
            senderName: data.senderName,
            body: data.body,
            messageType: data.messageType,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          };
        })
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function requestWaitingRoomEntry(
  roomId: string,
  hostId: string,
  userId: string,
  displayName: string
) {
  const path = `rooms/${roomId}/waiting_room/${userId}`;
  try {
    await setDoc(doc(db, 'rooms', roomId, 'waiting_room', userId), {
      roomId,
      hostId,
      userId,
      displayName: displayName.slice(0, 80),
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function resolveWaitingRoomRequest(
  roomId: string,
  userId: string,
  status: 'admitted' | 'denied'
) {
  const path = `rooms/${roomId}/waiting_room/${userId}`;
  try {
    await updateDoc(doc(db, 'rooms', roomId, 'waiting_room', userId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeWaitingRoom(
  roomId: string,
  hostId: string,
  onUpdate: (requests: WaitingRoomRequest[]) => void
) {
  const path = `rooms/${roomId}/waiting_room`;
  const q = query(
    collection(db, 'rooms', roomId, 'waiting_room'),
    where('roomId', '==', roomId),
    where('hostId', '==', hostId)
  );
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<WaitingRoomRequest, 'id'>),
        }))
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeOwnWaitingStatus(
  roomId: string,
  userId: string,
  onUpdate: (req: WaitingRoomRequest | null) => void
) {
  const path = `rooms/${roomId}/waiting_room/${userId}`;
  return onSnapshot(
    doc(db, 'rooms', roomId, 'waiting_room', userId),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      onUpdate({ id: snap.id, ...(snap.data() as Omit<WaitingRoomRequest, 'id'>) });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

// Polls
export async function createPoll(
  roomId: string,
  creatorId: string,
  creatorName: string,
  question: string,
  options: string[]
) {
  const pollId = makeDocId('poll');
  const path = `rooms/${roomId}/polls/${pollId}`;
  const cleanOptions = options.map((o) => o.trim().slice(0, 120)).filter(Boolean).slice(0, 6);
  try {
    await setDoc(doc(db, 'rooms', roomId, 'polls', pollId), {
      roomId,
      creatorId,
      creatorName: creatorName.slice(0, 80),
      question: question.trim().slice(0, 300),
      options: cleanOptions,
      votes: {},
      isClosed: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function votePoll(
  roomId: string,
  pollId: string,
  currentVotes: Record<string, number>,
  userId: string,
  optionIndex: number
) {
  const path = `rooms/${roomId}/polls/${pollId}`;
  try {
    await updateDoc(doc(db, 'rooms', roomId, 'polls', pollId), {
      votes: { ...currentVotes, [userId]: optionIndex },
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function closePoll(roomId: string, pollId: string) {
  const path = `rooms/${roomId}/polls/${pollId}`;
  try {
    await updateDoc(doc(db, 'rooms', roomId, 'polls', pollId), {
      isClosed: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribePolls(roomId: string, onUpdate: (polls: RoomPoll[]) => void) {
  const path = `rooms/${roomId}/polls`;
  const q = query(
    collection(db, 'rooms', roomId, 'polls'),
    where('roomId', '==', roomId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RoomPoll, 'id'>) })));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// Q&A
export async function askQuestion(
  roomId: string,
  authorId: string,
  authorName: string,
  text: string
) {
  const qId = makeDocId('qa');
  const path = `rooms/${roomId}/questions/${qId}`;
  try {
    await setDoc(doc(db, 'rooms', roomId, 'questions', qId), {
      roomId,
      authorId,
      authorName: authorName.slice(0, 80),
      text: text.trim().slice(0, 600),
      upvoterIds: [],
      answered: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function toggleUpvoteQuestion(
  roomId: string,
  questionId: string,
  currentUpvoters: string[],
  userId: string
) {
  const path = `rooms/${roomId}/questions/${questionId}`;
  const exists = currentUpvoters.includes(userId);
  const next = exists
    ? currentUpvoters.filter((u) => u !== userId)
    : [...currentUpvoters, userId].slice(0, 50);
  try {
    await updateDoc(doc(db, 'rooms', roomId, 'questions', questionId), {
      upvoterIds: next,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markQuestionAnswered(roomId: string, questionId: string, answered: boolean) {
  const path = `rooms/${roomId}/questions/${questionId}`;
  try {
    await updateDoc(doc(db, 'rooms', roomId, 'questions', questionId), {
      answered,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeQuestions(roomId: string, onUpdate: (list: RoomQuestion[]) => void) {
  const path = `rooms/${roomId}/questions`;
  const q = query(
    collection(db, 'rooms', roomId, 'questions'),
    where('roomId', '==', roomId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RoomQuestion, 'id'>) })));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// Collaborative Whiteboard
export async function addWhiteboardStroke(
  roomId: string,
  authorId: string,
  color: string,
  width: number,
  points: number[]
) {
  if (points.length < 2) return;
  const strokeId = makeDocId('wb');
  const path = `rooms/${roomId}/whiteboard/${strokeId}`;
  try {
    await setDoc(doc(db, 'rooms', roomId, 'whiteboard', strokeId), {
      roomId,
      authorId,
      color: color.slice(0, 24),
      width: Math.min(32, Math.max(1, width)),
      points: points.slice(0, 600),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function clearWhiteboard(roomId: string) {
  const path = `rooms/${roomId}/whiteboard`;
  try {
    const q = query(collection(db, 'rooms', roomId, 'whiteboard'), where('roomId', '==', roomId));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeWhiteboard(roomId: string, onUpdate: (strokes: WhiteboardStroke[]) => void) {
  const path = `rooms/${roomId}/whiteboard`;
  const q = query(
    collection(db, 'rooms', roomId, 'whiteboard'),
    where('roomId', '==', roomId),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WhiteboardStroke, 'id'>) })));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// WebRTC Fallback Signaling
export async function sendWebRtcSignal(input: {
  roomId: string;
  fromUserId: string;
  toUserId: string;
  signalType: 'offer' | 'answer' | 'ice';
  payload: string;
}) {
  const signalId = makeDocId('sig');
  const path = `rooms/${input.roomId}/signals/${signalId}`;
  try {
    await setDoc(doc(db, 'rooms', input.roomId, 'signals', signalId), {
      roomId: input.roomId,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      signalType: input.signalType,
      payload: input.payload.slice(0, 24000),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeIncomingWebRtcSignals(
  roomId: string,
  userId: string,
  onSignal: (signal: {
    id: string;
    fromUserId: string;
    signalType: 'offer' | 'answer' | 'ice';
    payload: string;
  }) => void
) {
  const path = `rooms/${roomId}/signals`;
  const q = query(
    collection(db, 'rooms', roomId, 'signals'),
    where('roomId', '==', roomId),
    where('toUserId', '==', userId)
  );
  const seen = new Set<string>();
  return onSnapshot(
    q,
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added' && !seen.has(change.doc.id)) {
          seen.add(change.doc.id);
          const data = change.doc.data() as {
            fromUserId: string;
            signalType: 'offer' | 'answer' | 'ice';
            payload: string;
          };
          onSignal({ id: change.doc.id, ...data });
          deleteDoc(change.doc.ref).catch(() => {});
        }
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
