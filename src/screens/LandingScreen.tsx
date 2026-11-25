import React, { useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Keyboard,
  Lock,
  Mic,
  MonitorUp,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  Volume2,
} from 'lucide-react';
import { ConnectMeetLogo, HERO_CONFERENCE_IMAGE } from '../components/BrandLogo';
import type { AppScreen } from '../types/connectmeet';

interface LandingScreenProps {
  isAuthenticated: boolean;
  onNavigate: (screen: AppScreen) => void;
  onQuickJoinCode: (code: string) => void;
}

export function LandingScreen({
  isAuthenticated,
  onNavigate,
  onQuickJoinCode,
}: LandingScreenProps) {
  const [joinInput, setJoinInput] = useState('');

  const handleStartMeeting = () => {
    if (isAuthenticated) {
      onNavigate('new-meeting');
    } else {
      onNavigate('login');
    }
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinInput.trim();
    if (!cleaned) {
      onNavigate(isAuthenticated ? 'join-meeting' : 'login');
      return;
    }
    onQuickJoinCode(cleaned);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b1326] text-slate-900 dark:text-[#dae2fd] flex flex-col">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-white/8 bg-white/85 dark:bg-[#0b1326]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-4">
          <button
            type="button"
            onClick={() => onNavigate('landing')}
            className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] rounded-lg"
          >
            <ConnectMeetLogo />
          </button>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#capabilities"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#collaboration"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Collaboration
            </a>
            <a
              href="#security"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Security
            </a>
            <button
              type="button"
              onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'login')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isAuthenticated ? 'Dashboard' : 'Sign in'}
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleStartMeeting}
              className="rounded-full bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#2563eb]"
            >
              {isAuthenticated ? 'Open Workspace' : 'Start Meeting'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Split Section */}
        <section className="mx-auto max-w-7xl px-6 pt-14 pb-20 lg:pt-20 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-sm font-medium text-[#2563eb] dark:text-[#b4c5ff] mb-4">
                HD Video Conferencing · Real-Time Collaboration · Gemini Voice Co-Pilot
              </p>
              <h1
                className="font-display text-4xl sm:text-5xl lg:text-[54px] font-bold tracking-tight text-slate-900 dark:text-white leading-[1.08] mb-6"
                style={{ textWrap: 'balance' }}
              >
                Video meetings engineered for calm, decisive teams.
              </h1>
              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl mb-8">
                Launch HD rooms in one click, collaborate with shared whiteboards, polls, and live
                chat, enforce host waiting-room security, and turn every conversation into
                structured notes and spoken audio briefings.
              </p>

              {/* Primary Action Row */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
                <button
                  type="button"
                  onClick={handleStartMeeting}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2563eb] px-6 py-3.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Video className="h-4 w-4" />
                  Start a Meeting
                </button>

                <form onSubmit={handleJoinSubmit} className="flex flex-1 items-center gap-2">
                  <div className="relative flex-1">
                    <Keyboard className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={joinInput}
                      onChange={(e) => setJoinInput(e.target.value)}
                      placeholder="Enter meeting code or link"
                      aria-label="Meeting code or link"
                      className="w-full rounded-full border border-slate-300 dark:border-white/12 bg-white dark:bg-[#131b2e] pl-10 pr-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-[#2563eb] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-full border border-slate-300 dark:border-white/15 bg-white dark:bg-[#171f33] px-5 py-3 text-sm font-semibold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-[#222a3d] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Join
                  </button>
                </form>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                <span>No downloads required</span>
                <span aria-hidden="true">·</span>
                <span>LiveKit SFU & WebRTC ready</span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => onNavigate('register')}
                  className="text-[#2563eb] dark:text-[#b4c5ff] font-medium hover:underline cursor-pointer"
                >
                  Create a free account
                </button>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-full min-h-[320px] lg:min-h-[440px] w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-[#131b2e]">
                <img
                  src={HERO_CONFERENCE_IMAGE}
                  alt="MeetUp executive collaboration studio"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#060e20]/85 via-[#060e20]/20 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-[#b4c5ff] mb-1">
                      Luminous Immersion Interface
                    </p>
                    <p className="font-display text-lg font-semibold text-white">
                      Adaptive grids, active-speaker rings, and floating frosted controls.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate(isAuthenticated ? 'schedule' : 'register')}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 px-4 py-2 text-xs font-semibold text-white hover:bg-white/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Schedule a room
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities Asymmetric Bento Grid */}
        <section
          id="capabilities"
          className="border-t border-slate-200/80 dark:border-white/8 py-20"
        >
          <div className="mx-auto max-w-7xl px-6">
            <div className="max-w-2xl mb-12">
              <h2
                className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white mb-4"
                style={{ textWrap: 'balance' }}
              >
                Everything required for live meetings, zero clutter.
              </h2>
              <p className="text-slate-600 dark:text-slate-300">
                Built around real browser media streams, PostgreSQL meeting records, and instant
                room synchronization across desktop and mobile viewports.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
              <div className="md:col-span-4 rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-8">
                <MonitorUp className="h-6 w-6 text-[#2563eb] mb-5" />
                <h3 className="font-display text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  01. Adaptive HD Video & Screen Sharing
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                  Switch smoothly between responsive participant grids, speaker spotlight, pinned
                  feeds, and full-screen presentations. Pre-join lobbies verify your camera,
                  microphone, speaker output, and background blur before entering the call.
                </p>
              </div>

              <div className="md:col-span-2 rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-8">
                <Users className="h-6 w-6 text-[#7c3aed] mb-5" />
                <h3 className="font-display text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  02. Host Controls
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Admit guests from waiting rooms, lock active sessions, assign co-hosts, request
                  mutes, or end the meeting for everyone in one click.
                </p>
              </div>

              <div
                id="collaboration"
                className="md:col-span-3 rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-8"
              >
                <Sparkles className="h-6 w-6 text-[#10b981] mb-5" />
                <h3 className="font-display text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  03. Live Collaboration Toolkit
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Engage teams without leaving the call: synchronized meeting chat, emoji
                  reactions, raised-hand queues, live polls, upvoted Q&A, breakout rooms, and a
                  multi-user collaborative whiteboard.
                </p>
              </div>

              <div className="md:col-span-3 rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-8">
                <div className="flex items-center gap-3 mb-5">
                  <Mic className="h-6 w-6 text-[#2563eb]" />
                  <Volume2 className="h-6 w-6 text-[#7c3aed]" />
                </div>
                <h3 className="font-display text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  04. Optional Gemini Voice Co-Pilot & Spoken Recaps
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Talk directly with an in-meeting voice assistant, extract structured key
                  decisions and action items from your session, and listen to synthesized spoken
                  briefings whenever you review meeting history.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Security & Scheduling Proof Section */}
        <section
          id="security"
          className="border-t border-slate-200/80 dark:border-white/8 py-20"
        >
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              <div className="lg:col-span-5">
                <h2
                  className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-4"
                  style={{ textWrap: 'balance' }}
                >
                  Built with verified identity and strict room governance.
                </h2>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
                  Every API route verifies signed Firebase ID tokens on the server, meeting
                  passcodes use salted cryptographic hashing, and real-time room access is enforced
                  by strict database security rules.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'register')}
                  className="inline-flex items-center gap-2 rounded-full bg-[#2563eb] px-6 py-3 text-sm font-semibold text-white hover:bg-blue-600 transition-colors cursor-pointer"
                >
                  {isAuthenticated ? 'Go to Dashboard' : 'Create Your Account'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-6">
                  <ShieldCheck className="h-5 w-5 text-[#10b981] mb-3" />
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-1.5">
                    Server-Verified Access
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Private secrets and room tokens are minted strictly on the server—never exposed
                    to the browser.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-6">
                  <Lock className="h-5 w-5 text-[#2563eb] mb-3" />
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-1.5">
                    Waiting Room & Lock
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Restrict sensitive rooms with passcodes, require host admission, or lock entry
                    mid-call.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#131b2e] p-6">
                  <Calendar className="h-5 w-5 text-[#7c3aed] mb-3" />
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-1.5">
                    Durable Scheduling
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Schedules, email invitations, chat archives, and meeting histories persist in
                    PostgreSQL.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200/80 dark:border-white/8 py-10">
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500 dark:text-slate-400">
          <ConnectMeetLogo />
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => onNavigate('register')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Register
            </button>
            <button
              type="button"
              onClick={handleStartMeeting}
              className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Start a Meeting
            </button>
          </div>
          <p className="text-xs">© {new Date().getFullYear()} MeetUp</p>
        </div>
      </footer>
    </div>
  );
}
