import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { adminAuth } from '../lib/firebase-admin.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Configure it in Settings > Secrets to use AI features.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
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

export async function generateMeetingSummary(input: {
  meetingTitle: string;
  transcript: string;
  chatHistory: Array<{ senderName: string; message: string }>;
  manualNotes?: string;
}): Promise<StructuredMeetingSummary> {
  const ai = getAiClient();

  const chatBlock = input.chatHistory
    .slice(-100)
    .map((m) => `${m.senderName}: ${m.message}`)
    .join('\n');

  const combinedContext = [
    `Meeting Title: ${input.meetingTitle}`,
    input.transcript ? `\nLive Transcript / Captions:\n${input.transcript}` : '',
    chatBlock ? `\nMeeting Chat Messages:\n${chatBlock}` : '',
    input.manualNotes ? `\nHost Notes:\n${input.manualNotes}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (!combinedContext.trim() || (!input.transcript && !chatBlock && !input.manualNotes)) {
    throw new Error(
      'Add meeting notes, enable live captions, or send chat messages before generating an AI summary.'
    );
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Analyze this MeetUp session context and produce a concise, accurate, executive meeting intelligence report strictly grounded in the provided notes, captions, and chat.\n\n${combinedContext}`,
    config: {
      systemInstruction:
        'You are MeetUp AI Meeting Assistant. Extract factual summaries, key points, decisions, and concrete action items only from the supplied context without inventing details.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executiveSummary: {
            type: Type.STRING,
            description: '2-3 sentence concise executive overview of the meeting.',
          },
          keyDiscussionPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Bullet list of main topics discussed.',
          },
          decisionsMade: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Concrete agreements or decisions reached.',
          },
          actionItems: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                task: { type: Type.STRING },
                owner: { type: Type.STRING },
                priority: { type: Type.STRING },
              },
            },
            description: 'Follow-up tasks with owner and priority (High, Medium, Low).',
          },
          smartNotes: {
            type: Type.STRING,
            description: 'Clean structured notes paragraph suitable for sharing with attendees.',
          },
        },
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as Partial<StructuredMeetingSummary>;

  return {
    executiveSummary: parsed.executiveSummary || 'Summary generated from session context.',
    keyDiscussionPoints: Array.isArray(parsed.keyDiscussionPoints)
      ? parsed.keyDiscussionPoints
      : [],
    decisionsMade: Array.isArray(parsed.decisionsMade) ? parsed.decisionsMade : [],
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
    smartNotes: parsed.smartNotes || '',
  };
}

export async function generateSpokenRecap(input: {
  title: string;
  script: string;
  mode?: 'single' | 'dual';
  voiceName?: string;
}): Promise<{ audioBase64: string; mimeType: string }> {
  const ai = getAiClient();
  const cleanScript = input.script.trim().slice(0, 3500);
  if (!cleanScript) {
    throw new Error('Recap text is required to synthesize audio.');
  }

  if (input.mode === 'dual') {
    const hostLine = `Alex: Here is the executive audio recap for ${input.title}. ${cleanScript.slice(0, 1400)}`;
    const cohostLine = `Sam: Thanks Alex. To highlight the key next steps, make sure every owner reviews their assigned follow-ups from this meeting.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: hostLine,
              speechMetadata: {
                speaker: 'Alex',
                style: 'Clear, calm executive briefing host',
              },
            },
            {
              text: cohostLine,
              speechMetadata: {
                speaker: 'Sam',
                style: 'Articulate, supportive meeting analyst',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: 'Alex',
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
              },
              {
                speaker: 'Sam',
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
              },
            ],
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error('Gemini TTS returned no audio data.');
    }
    return { audioBase64: base64Audio, mimeType: 'audio/wav' };
  }

  const selectedVoice = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].includes(
    input.voiceName || ''
  )
    ? (input.voiceName as string)
    : 'Kore';

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Meeting recap for ${input.title}. ${cleanScript}`,
            speechMetadata: {
              style: 'Clear, professional executive assistant reading a concise meeting briefing',
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: selectedVoice },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('Gemini TTS returned no audio data.');
  }
  return { audioBase64: base64Audio, mimeType: 'audio/wav' };
}

export function attachGeminiLiveBridge(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', 'http://localhost');
    if (url.pathname === '/ws/ai-live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket, req) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const token = url.searchParams.get('token');
    const meetingTitle = (url.searchParams.get('title') || 'MeetUp Session').slice(0, 120);
    const voice = url.searchParams.get('voice') || 'Zephyr';

    if (!token) {
      clientWs.send(JSON.stringify({ error: 'Authentication token required.' }));
      clientWs.close(4401, 'Unauthorized');
      return;
    }

    try {
      await adminAuth.verifyIdToken(token);
    } catch {
      clientWs.send(JSON.stringify({ error: 'Invalid authentication token.' }));
      clientWs.close(4401, 'Unauthorized');
      return;
    }

    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;

    try {
      const ai = getAiClient();
      const validVoice = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].includes(voice)
        ? voice
        : 'Zephyr';

      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: validVoice } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: `You are MeetUp Live Voice Co-Pilot assisting participants during the meeting "${meetingTitle}". Keep spoken replies concise, direct, and helpful (under 3 sentences unless asked for detail). Help brainstorm ideas, clarify action items, and answer questions clearly.`,
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ status: 'connected' }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(JSON.stringify({ inputTranscript: content.inputTranscription.text }));
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ outputTranscript: content.outputTranscription.text })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }
          },
          onerror: (err: unknown) => {
            console.error('Gemini Live session error:', err);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  error: err instanceof Error ? err.message : 'Live AI connection error.',
                })
              );
            }
          },
          onclose: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ status: 'closed' }));
            }
          },
        },
      });
    } catch (error) {
      console.error('Failed to connect Gemini Live:', error);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : 'Unable to connect to Gemini Live voice session.',
          })
        );
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (raw) => {
      if (!liveSession) return;
      try {
        const parsed = JSON.parse(raw.toString()) as {
          audio?: string;
          text?: string;
        };
        if (parsed.audio) {
          liveSession.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (parsed.text) {
          liveSession.sendRealtimeInput({
            text: parsed.text.slice(0, 2000),
          });
        }
      } catch (err) {
        console.error('Failed to forward Live API message:', err);
      }
    });

    clientWs.on('close', () => {
      try {
        liveSession?.close();
      } catch {
        // Ignore close errors on teardown
      }
    });
  });
}
