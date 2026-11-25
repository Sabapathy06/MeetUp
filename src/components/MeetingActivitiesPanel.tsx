import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Eraser,
  HelpCircle,
  Layers,
  Loader2,
  Mic,
  MicOff,
  PenTool,
  Send,
  Sparkles,
  ThumbsUp,
  Volume2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { auth } from '../lib/firebase';
import { float32ToPcm16Base64, GaplessPcmPlayer } from '../lib/mediaEngine';
import {
  addWhiteboardStroke,
  askQuestion,
  clearWhiteboard,
  closePoll,
  createPoll,
  markQuestionAnswered,
  subscribePolls,
  subscribeQuestions,
  subscribeWhiteboard,
  toggleUpvoteQuestion,
  updateOwnPresence,
  votePoll,
} from '../lib/roomRealtime';
import type {
  RoomChatMessage,
  RoomPoll,
  RoomQuestion,
  StructuredMeetingSummary,
  WhiteboardStroke,
} from '../types/connectmeet';

interface MeetingActivitiesPanelProps {
  meetingId: string;
  meetingTitle: string;
  roomId: string;
  userId: string;
  displayName: string;
  isHostOrCoHost: boolean;
  currentBreakout: string;
  transcriptText: string;
  chatMessages: RoomChatMessage[];
  onBreakoutChange: (roomName: string) => void;
}

type ActivityTab = 'ai' | 'whiteboard' | 'polls' | 'qa' | 'breakouts';

const BREAKOUT_ROOMS = [
  { id: 'main', label: 'Main Room', desc: 'Primary conference floor' },
  { id: 'design', label: 'Design Studio', desc: 'UI review & visual critique' },
  { id: 'engineering', label: 'Engineering Pod', desc: 'Architecture & technical deep-dive' },
  { id: 'strategy', label: 'Strategy Room', desc: 'Roadmap & stakeholder alignment' },
];

const STROKE_COLORS = ['#2563eb', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#ffffff'];

export function MeetingActivitiesPanel({
  meetingId,
  meetingTitle,
  roomId,
  userId,
  displayName,
  isHostOrCoHost,
  currentBreakout,
  transcriptText,
  chatMessages,
  onBreakoutChange,
}: MeetingActivitiesPanelProps) {
  const { pushToast } = useApp();
  const [subTab, setSubTab] = useState<ActivityTab>('ai');

  // AI Co-Pilot (Gemini Live Voice + Gemini 4 Summary + Gemini 3.8 TTS)
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveConnecting, setLiveConnecting] = useState(false);
  const [liveVoice, setLiveVoice] = useState<'Zephyr' | 'Kore' | 'Puck' | 'Fenrir' | 'Charon'>('Zephyr');
  const [liveLog, setLiveLog] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([]);
  const [livePrompt, setLivePrompt] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playerRef = useRef<GaplessPcmPlayer | null>(null);

  const [manualNotes, setManualNotes] = useState('');
  const [aiSummary, setAiSummary] = useState<StructuredMeetingSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [loadingTts, setLoadingTts] = useState(false);

  // Polls, Q&A, Whiteboard state
  const [polls, setPolls] = useState<RoomPoll[]>([]);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptionsRaw, setPollOptionsRaw] = useState('Yes, No, Need more info');

  const [questions, setQuestions] = useState<RoomQuestion[]>([]);
  const [questionInput, setQuestionInput] = useState('');

  const [strokes, setStrokes] = useState<WhiteboardStroke[]>([]);
  const [strokeColor, setStrokeColor] = useState('#2563eb');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const currentPointsRef = useRef<number[]>([]);

  useEffect(() => {
    const u1 = subscribePolls(roomId, setPolls);
    const u2 = subscribeQuestions(roomId, setQuestions);
    const u3 = subscribeWhiteboard(roomId, setStrokes);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [roomId]);

  // Redraw whiteboard whenever strokes update
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokes.forEach((s) => {
      if (s.points.length < 4) return;
      ctx.beginPath();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(s.points[0], s.points[1]);
      for (let i = 2; i < s.points.length; i += 2) {
        ctx.lineTo(s.points[i], s.points[i + 1]);
      }
      ctx.stroke();
    });
  }, [strokes, subTab]);

  // Clean up Gemini Live voice bridge on unmount
  const stopLiveVoice = () => {
    try {
      processorRef.current?.disconnect();
      inputCtxRef.current?.close().catch(() => {});
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      wsRef.current?.close();
      playerRef.current?.close();
    } catch {
      // Ignore cleanup errors
    }
    processorRef.current = null;
    inputCtxRef.current = null;
    micStreamRef.current = null;
    wsRef.current = null;
    playerRef.current = null;
    setLiveConnected(false);
    setLiveConnecting(false);
  };

  useEffect(() => {
    return () => stopLiveVoice();
  }, []);

  const startLiveVoice = async () => {
    if (!auth.currentUser) return;
    setLiveConnecting(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws/ai-live?token=${encodeURIComponent(idToken)}&title=${encodeURIComponent(meetingTitle)}&voice=${liveVoice}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      const player = new GaplessPcmPlayer();
      playerRef.current = player;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      micStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      inputCtxRef.current = inputCtx;

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      ws.onopen = () => {
        source.connect(processor);
        processor.connect(inputCtx.destination);
      };

      processor.onaudioprocess = (ev) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const base64 = float32ToPcm16Base64(ev.inputBuffer.getChannelData(0));
        ws.send(JSON.stringify({ audio: base64 }));
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as {
          status?: string;
          audio?: string;
          interrupted?: boolean;
          inputTranscript?: string;
          outputTranscript?: string;
          error?: string;
        };
        if (msg.status === 'connected') {
          setLiveConnected(true);
          setLiveConnecting(false);
          pushToast('Gemini Live voice co-pilot connected', 'success');
        }
        if (msg.audio) {
          player.enqueue(msg.audio);
        }
        if (msg.interrupted) {
          player.interrupt();
        }
        if (msg.inputTranscript) {
          setLiveLog((prev) => [...prev.slice(-20), { role: 'user', text: msg.inputTranscript! }]);
        }
        if (msg.outputTranscript) {
          setLiveLog((prev) => [...prev.slice(-20), { role: 'ai', text: msg.outputTranscript! }]);
        }
        if (msg.error) {
          pushToast('Gemini Live error', 'error', msg.error);
          stopLiveVoice();
        }
      };

      ws.onerror = () => {
        pushToast('Voice co-pilot connection interrupted', 'error');
        stopLiveVoice();
      };

      ws.onclose = () => {
        setLiveConnected(false);
        setLiveConnecting(false);
      };
    } catch (err) {
      pushToast(
        'Could not start Gemini Live voice',
        'error',
        err instanceof Error ? err.message : undefined
      );
      stopLiveVoice();
    }
  };

  const sendTextToLive = (e: React.FormEvent) => {
    e.preventDefault();
    if (!livePrompt.trim() || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ text: livePrompt.trim() }));
    setLiveLog((prev) => [...prev.slice(-20), { role: 'user', text: livePrompt.trim() }]);
    setLivePrompt('');
  };

  const handleGenerateNotes = async () => {
    setLoadingSummary(true);
    try {
      const res = await api.generateAiSummary({
        meetingId,
        meetingTitle,
        transcript: transcriptText,
        chatHistory: chatMessages.map((m) => ({ senderName: m.senderName, message: m.body })),
        manualNotes,
      });
      setAiSummary(res.summary);
      pushToast('AI meeting notes generated', 'success');
    } catch (err) {
      pushToast('AI notes unavailable', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleSpeakSummary = async () => {
    if (!aiSummary) return;
    setLoadingTts(true);
    try {
      const res = await api.generateSpokenRecap({
        title: meetingTitle,
        script: `${aiSummary.executiveSummary} ${aiSummary.smartNotes}`,
        mode: 'single',
        voiceName: liveVoice,
      });
      setTtsAudioUrl(`data:${res.mimeType};base64,${res.audioBase64}`);
    } catch (err) {
      pushToast('Spoken briefing failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setLoadingTts(false);
    }
  };

  // Whiteboard pointer handlers
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * canvas.width,
      ((e.clientY - rect.top) / rect.height) * canvas.height,
    ];
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    const [x, y] = getCanvasCoords(e);
    currentPointsRef.current = [Math.round(x), Math.round(y)];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !canvasRef.current) return;
    const [x, y] = getCanvasCoords(e);
    const pts = currentPointsRef.current;
    const prevX = pts[pts.length - 2];
    const prevY = pts[pts.length - 1];
    pts.push(Math.round(x), Math.round(y));

    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const handlePointerUp = async () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const pts = currentPointsRef.current;
    currentPointsRef.current = [];
    if (pts.length >= 4) {
      await addWhiteboardStroke(roomId, userId, strokeColor, strokeWidth, pts).catch(() => {});
    }
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    const opts = pollOptionsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!pollQuestion.trim() || opts.length < 2) {
      pushToast('Provide a question and at least 2 comma-separated options', 'error');
      return;
    }
    await createPoll(roomId, userId, displayName, pollQuestion, opts);
    setPollQuestion('');
    pushToast('Poll launched', 'success');
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionInput.trim()) return;
    await askQuestion(roomId, userId, displayName, questionInput);
    setQuestionInput('');
  };

  const handleSwitchBreakout = async (roomKey: string) => {
    await updateOwnPresence(roomId, userId, { breakoutRoom: roomKey });
    onBreakoutChange(roomKey);
    pushToast(`Switched to ${BREAKOUT_ROOMS.find((b) => b.id === roomKey)?.label || roomKey}`, 'info');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sub-navigation bar */}
      <div className="grid grid-cols-5 gap-1 p-2 border-b border-slate-200 dark:border-white/8">
        {(
          [
            ['ai', 'AI', Sparkles],
            ['whiteboard', 'Board', PenTool],
            ['polls', 'Polls', BarChart3],
            ['qa', 'Q&A', HelpCircle],
            ['breakouts', 'Rooms', Layers],
          ] as Array<[ActivityTab, string, React.ComponentType<{ className?: string }>]>
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition-colors cursor-pointer ${
              subTab === id
                ? 'bg-[#2563eb]/15 text-[#2563eb] dark:text-[#b4c5ff]'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 1. AI VOICE CO-PILOT & SUMMARY */}
        {subTab === 'ai' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#7c3aed]/25 bg-[#7c3aed]/8 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Gemini Live Voice Co-Pilot
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Real-time voice Q&A during your call
                  </p>
                </div>
                <select
                  value={liveVoice}
                  disabled={liveConnected}
                  onChange={(e) => setLiveVoice(e.target.value as typeof liveVoice)}
                  aria-label="Co-pilot voice"
                  className="rounded-lg border border-slate-300 dark:border-white/12 bg-white dark:bg-[#0b1326] px-2 py-1 text-[11px] text-slate-800 dark:text-white"
                >
                  <option value="Zephyr">Zephyr</option>
                  <option value="Kore">Kore</option>
                  <option value="Puck">Puck</option>
                  <option value="Fenrir">Fenrir</option>
                  <option value="Charon">Charon</option>
                </select>
              </div>

              <button
                type="button"
                disabled={liveConnecting}
                onClick={liveConnected ? stopLiveVoice : startLiveVoice}
                className={`w-full inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer ${
                  liveConnected
                    ? 'bg-[#ef4444] hover:bg-rose-600'
                    : 'bg-gradient-to-r from-[#2563eb] to-[#7c3aed] hover:brightness-110'
                }`}
              >
                {liveConnecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : liveConnected ? (
                  <MicOff className="h-3.5 w-3.5" />
                ) : (
                  <Mic className="h-3.5 w-3.5" />
                )}
                {liveConnecting
                  ? 'Connecting Voice Session...'
                  : liveConnected
                    ? 'End Voice Co-Pilot'
                    : 'Start Live Voice Conversation'}
              </button>

              {liveConnected && (
                <form onSubmit={sendTextToLive} className="flex gap-1.5">
                  <input
                    type="text"
                    value={livePrompt}
                    onChange={(e) => setLivePrompt(e.target.value)}
                    placeholder="Ask co-pilot by text..."
                    className="flex-1 rounded-full border border-slate-300 dark:border-white/12 bg-white dark:bg-[#0b1326]/80 px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-[#2563eb] p-1.5 text-white cursor-pointer"
                    aria-label="Send to voice co-pilot"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              )}

              {liveLog.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1.5 pt-1">
                  {liveLog.map((entry, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed ${
                        entry.role === 'user'
                          ? 'bg-slate-200/70 dark:bg-white/8 text-slate-800 dark:text-slate-200'
                          : 'bg-[#2563eb]/15 text-slate-900 dark:text-[#dae2fd]'
                      }`}
                    >
                      <span className="font-semibold">
                        {entry.role === 'user' ? 'You: ' : 'Co-Pilot: '}
                      </span>
                      {entry.text}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Structured Notes & Action Items + Spoken Briefing */}
            <div className="rounded-xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#0b1326]/60 p-3.5 space-y-3">
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                Smart Notes & Action Items
              </p>
              <textarea
                rows={3}
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="Jot down key points (combined with live chat & captions for AI extraction)..."
                className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-white dark:bg-[#131b2e] px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-[#2563eb] focus:outline-none resize-none"
              />
              <button
                type="button"
                disabled={loadingSummary}
                onClick={handleGenerateNotes}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-60 cursor-pointer"
              >
                {loadingSummary ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {loadingSummary ? 'Synthesizing...' : 'Generate AI Summary'}
              </button>

              {aiSummary && (
                <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-white/8">
                  <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                    {aiSummary.executiveSummary}
                  </p>
                  {aiSummary.actionItems.length > 0 && (
                    <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                      {aiSummary.actionItems.map((item, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <span>
                            <strong>{item.owner}:</strong> {item.task}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    disabled={loadingTts}
                    onClick={handleSpeakSummary}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-3 py-1.5 text-[11px] font-semibold text-[#7c3aed] dark:text-[#d2bbff] cursor-pointer"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    {loadingTts ? 'Creating Audio...' : 'Play Spoken Briefing'}
                  </button>
                  {ttsAudioUrl && <audio controls src={ttsAudioUrl} className="w-full h-8" />}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. COLLABORATIVE WHITEBOARD */}
        {subTab === 'whiteboard' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {STROKE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setStrokeColor(c)}
                    aria-label={`Color ${c}`}
                    className={`h-5 w-5 rounded-full border cursor-pointer ${
                      strokeColor === c ? 'ring-2 ring-offset-1 ring-[#2563eb]' : 'border-white/20'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  aria-label="Stroke width"
                  className="rounded-lg border border-slate-300 dark:border-white/12 bg-white dark:bg-[#0b1326] px-1.5 py-1 text-[11px]"
                >
                  <option value={2}>Fine</option>
                  <option value={4}>Medium</option>
                  <option value={8}>Bold</option>
                </select>
                <button
                  type="button"
                  onClick={() => clearWhiteboard(roomId).catch(() => {})}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-white/12 px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                >
                  <Eraser className="h-3 w-3" />
                  Clear
                </button>
              </div>
            </div>
            <canvas
              ref={canvasRef}
              width={320}
              height={360}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-[#0f172a] touch-none cursor-crosshair"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Strokes sync live across everyone in this room ({strokes.length} strokes).
            </p>
          </div>
        )}

        {/* 3. LIVE POLLS */}
        {subTab === 'polls' && (
          <div className="space-y-4">
            <form
              onSubmit={handleCreatePoll}
              className="rounded-xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#0b1326]/60 p-3 space-y-2.5"
            >
              <input
                type="text"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Ask a poll question..."
                className="w-full rounded-lg border border-slate-300 dark:border-white/12 bg-white dark:bg-[#131b2e] px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
              <input
                type="text"
                value={pollOptionsRaw}
                onChange={(e) => setPollOptionsRaw(e.target.value)}
                placeholder="Options (comma separated)"
                className="w-full rounded-lg border border-slate-300 dark:border-white/12 bg-white dark:bg-[#131b2e] px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
              <button
                type="submit"
                className="w-full rounded-full bg-[#2563eb] py-1.5 text-xs font-semibold text-white hover:bg-blue-600 cursor-pointer"
              >
                Launch Poll
              </button>
            </form>

            {polls.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-6">No polls launched yet.</p>
            ) : (
              <div className="space-y-3">
                {polls.map((poll) => {
                  const totalVotes = Object.keys(poll.votes || {}).length;
                  const myVote = poll.votes?.[userId];
                  return (
                    <div
                      key={poll.id}
                      className="rounded-xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#0b1326]/50 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">
                          {poll.question}
                        </p>
                        {!poll.isClosed && (isHostOrCoHost || poll.creatorId === userId) && (
                          <button
                            type="button"
                            onClick={() => closePoll(roomId, poll.id)}
                            className="text-[11px] text-rose-500 hover:underline shrink-0 cursor-pointer"
                          >
                            Close
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {poll.options.map((opt, idx) => {
                          const count = Object.values(poll.votes || {}).filter(
                            (v) => v === idx
                          ).length;
                          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                          const selected = myVote === idx;
                          return (
                            <button
                              key={idx}
                              type="button"
                              disabled={poll.isClosed}
                              onClick={() => votePoll(roomId, poll.id, poll.votes || {}, userId, idx)}
                              className={`relative w-full text-left overflow-hidden rounded-lg border px-3 py-1.5 text-xs transition-colors cursor-pointer disabled:cursor-default ${
                                selected
                                  ? 'border-[#2563eb] text-slate-900 dark:text-white'
                                  : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              <span
                                className="absolute inset-y-0 left-0 bg-[#2563eb]/18 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                              <span className="relative flex items-center justify-between">
                                <span>{opt}</span>
                                <span className="font-mono text-[11px] tabular-nums">{pct}%</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} ·{' '}
                        {poll.isClosed ? 'Closed' : 'Open'}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 4. LIVE Q&A */}
        {subTab === 'qa' && (
          <div className="space-y-4">
            <form onSubmit={handleAskQuestion} className="flex gap-2">
              <input
                type="text"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                placeholder="Ask a question..."
                className="flex-1 rounded-full border border-slate-300 dark:border-white/12 bg-white dark:bg-[#0b1326]/70 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-full bg-[#2563eb] px-3.5 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                Ask
              </button>
            </form>

            {questions.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-6">No questions submitted yet.</p>
            ) : (
              <div className="space-y-2.5">
                {questions
                  .slice()
                  .sort((a, b) => b.upvoterIds.length - a.upvoterIds.length)
                  .map((q) => {
                    const upvoted = q.upvoterIds.includes(userId);
                    return (
                      <div
                        key={q.id}
                        className="rounded-xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#0b1326]/50 p-3 space-y-2"
                      >
                        <p className="text-xs text-slate-900 dark:text-white leading-relaxed">
                          {q.text}
                        </p>
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>{q.authorName}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                toggleUpvoteQuestion(roomId, q.id, q.upvoterIds, userId)
                              }
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 cursor-pointer ${
                                upvoted
                                  ? 'bg-[#2563eb]/20 text-[#2563eb] dark:text-[#b4c5ff]'
                                  : 'hover:bg-slate-100 dark:hover:bg-white/5'
                              }`}
                            >
                              <ThumbsUp className="h-3 w-3" />
                              <span className="tabular-nums">{q.upvoterIds.length}</span>
                            </button>
                            {(isHostOrCoHost || q.authorId === userId) && (
                              <button
                                type="button"
                                onClick={() => markQuestionAnswered(roomId, q.id, !q.answered)}
                                className={`font-medium cursor-pointer ${
                                  q.answered ? 'text-emerald-500' : 'hover:text-slate-900 dark:hover:text-white'
                                }`}
                              >
                                {q.answered ? 'Answered' : 'Mark answered'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* 5. BREAKOUT ROOMS */}
        {subTab === 'breakouts' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Move into a focused breakout session with teammates. You can return to the Main Room
              at any time.
            </p>
            <div className="space-y-2">
              {BREAKOUT_ROOMS.map((room) => {
                const active = (currentBreakout || 'main') === room.id;
                return (
                  <div
                    key={room.id}
                    className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${
                      active
                        ? 'border-[#7c3aed] bg-[#7c3aed]/12'
                        : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b1326]/50'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">
                        {room.label}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{room.desc}</p>
                    </div>
                    <button
                      type="button"
                      disabled={active}
                      onClick={() => handleSwitchBreakout(room.id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold cursor-pointer ${
                        active
                          ? 'bg-[#7c3aed] text-white cursor-default'
                          : 'border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:border-[#7c3aed]'
                      }`}
                    >
                      {active ? 'Joined' : 'Join'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
