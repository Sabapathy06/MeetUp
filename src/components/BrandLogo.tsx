import React from 'react';

export function ConnectMeetLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        width="30"
        height="30"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="cmBrandGrad" x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2563EB" />
            <stop offset="1" stopColor="#7C3AED" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="28" height="28" rx="9" fill="url(#cmBrandGrad)" />
        <rect x="7.5" y="10.5" width="11.5" height="11" rx="3" fill="white" fillOpacity="0.96" />
        <path
          d="M20.5 13.7L24.7 11.2C25.35 10.8 26.2 11.27 26.2 12.04V19.96C26.2 20.73 25.35 21.2 24.7 20.8L20.5 18.3V13.7Z"
          fill="#DBEAFE"
        />
      </svg>
      {!compact && (
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
          MeetUp
        </span>
      )}
    </span>
  );
}

export const VIRTUAL_BACKGROUNDS = [
  {
    id: 'office' as const,
    label: 'Modern Office',
    url: '/src/assets/images/bg_virtual_office_1795618382356.jpg',
  },
  {
    id: 'skyline' as const,
    label: 'Twilight Skyline',
    url: '/src/assets/images/bg_virtual_skyline_1795618399409.jpg',
  },
  {
    id: 'studio' as const,
    label: 'Acoustic Studio',
    url: '/src/assets/images/bg_virtual_studio_1795618384365.jpg',
  },
];

export const HERO_CONFERENCE_IMAGE = '/src/assets/images/hero_conference_room_1795618388105.jpg';

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(mins)}:${pad(secs)}`;
}
