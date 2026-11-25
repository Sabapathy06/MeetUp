---
name: Luminous Immersion
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#c3c6d7'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#8d90a0'
  outline-variant: '#434655'
  surface-tint: '#b4c5ff'
  primary: '#b4c5ff'
  on-primary: '#002a78'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#0053db'
  secondary: '#d2bbff'
  on-secondary: '#3f008e'
  secondary-container: '#6001d1'
  on-secondary-container: '#c9aeff'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#007d55'
  on-tertiary-container: '#bdffdb'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#eaddff'
  secondary-fixed-dim: '#d2bbff'
  on-secondary-fixed: '#25005a'
  on-secondary-fixed-variant: '#5a00c6'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style
The design system targets high-performance professionals, distributed enterprise teams, and technical collaborators who demand both computational capability and visual calm. It delivers the immediacy and directness of Google Meet paired with the structured depth and operational control of advanced conferencing platforms.

The aesthetic fuses sleek dark-mode immersion with subtle glassmorphism and refined, high-contrast UI geometry. By default, the interface reduces cognitive fatigue during prolonged virtual presence: chrome retreats into deep, luminous charcoal backdrops, allowing video tiles and shared workspaces to take absolute precedence. Crisp electric blues and saturated violets communicate active state and interactive potential, while purposeful emerald indicators signify stable connections and vocal activity without visual clutter.

## Colors
The palette is built around an immersive, low-luminance canvas engineered to maximize contrast against multi-stream video feeds.

- **Primary (`#2563EB`)**: Electric Blue powers key actions, primary toggles, active screen share indicators, and high-visibility interaction cues.
- **Secondary (`#7C3AED`)**: Deep Violet drives co-presence highlights, collaborative whiteboard tools, breakout room contexts, and subtle gradient pairings with Primary.
- **Tertiary (`#10B981`)**: Emerald Green serves functional telemetry: active speaker indicators, lossless audio waves, microphone responsiveness, and verified connection health.
- **Neutral (`#0F172A`)**: Midnight Slate anchors the background hierarchy. Surfaces layer from pure canvas tone (`#0B0F19`) into translucent elevated overlays (`rgba(30, 41, 59, 0.7)`).
- **Semantics**: Rose (`#EF4444`) is dedicated strictly to critical call teardown, muted safety alerts, and recording status.

## Typography
Plus Jakarta Sans commands headlines, meeting titles, room setup banners, and modal headers, delivering contemporary geometric warmth without sacrificing authority. 

Inter handles all high-density informational contexts: live chat, transcription streams, participant rosters, telemetry readouts, and control labels. Its neutral geometry ensures instantaneous decipherability across micro-badges, latency stats, and rapid conversational feeds.

## Layout & Spacing
The layout employs an adaptive fluid grid optimized for dynamic multi-stream video tiles and docked sidebars.

- **In-Meeting Canvas**: Fluid aspect-ratio grid calculated dynamically based on total participant count (`1:1`, `4:3`, or `16:9` tile scaling) bounded by standard gutters.
- **Docked Collapsible Rails**: Chat, participant panels, and administrative telemetry lock to a fixed 360px panel on desktop, reflowing into full-screen drawer overlays below 768px.
- **Control Bar Dock**: Center-anchored floating pill layout maintained across all viewports with fixed spacing, adapting icon-only modes for mobile viewports below 480px.
- **Breakpoints**: Mobile (`<768px`), Tablet (`768px - 1024px`), Desktop (`>1024px`).

## Elevation & Depth
Depth is constructed through frosted glassmorphism, translucent charcoal planes, and luminous active boundary rings rather than standard directional drop shadows.

- **Level 0 (Canvas)**: Solid deep tone `#090D16`.
- **Level 1 (Video Tiles & Panels)**: `#131B2E` with `backdrop-filter: blur(16px)` and a subtle `1px` translucent border (`rgba(255, 255, 255, 0.08)`).
- **Level 2 (Floating Nav & Call Bars)**: `rgba(15, 23, 42, 0.75)` with `backdrop-filter: blur(24px)`, bounded by a `1px` rim border (`rgba(255, 255, 255, 0.12)`) and an ambient glow shadow: `0 8px 32px rgba(0, 0, 0, 0.45)`.
- **Active State Glow**: Focused tiles and speaker borders dispense with elevation shadows in favor of a crisp `2px` outer ring in `#10B981` paired with a soft `0 0 16px rgba(16, 185, 129, 0.35)` luminous halo.

## Shapes
The shape hierarchy emphasizes continuous, softened curvature that mitigates the clinical edge of traditional enterprise tools:

- Standard cards, video tiles, dialog modals, and side sheets adopt smooth curvature (`rounded-2xl` / `1rem` on container edges).
- Action buttons, input wrappers, participant chips, and floating control anchors utilize fully circular or pill contours (`rounded-full` / `9999px`) to maintain clarity and touch targets during live sessions.

## Components

### Control Bar & Pill Buttons
- The bottom utility bar floats as a unified frosted pill.
- Primary media toggles (Microphone, Camera) feature 48px round or rounded-full buttons. Normal state: translucent slate background (`rgba(255, 255, 255, 0.08)`). Muted/Off state: solid rose accent (`#EF4444`) with white iconography.
- Active actions (Raise Hand, Share Screen) shift to Electric Blue (`#2563EB`) fills with subtle outer radiance.

### Video Tiles & Participant Containers
- Wrapped in `rounded-2xl` contours with an internal clipping mask.
- Base border: `1px solid rgba(255, 255, 255, 0.08)`.
- Active Speaker: Dynamically transforms border to `2px solid #10B981` with responsive audio-reactive waveforms positioned in the tile label.
- Participant badge anchors to bottom-left with glass pill backdrop (`rgba(15, 23, 42, 0.7)`), displaying user name, mic state, and pin icon.

### Form Inputs & Chat Panels
- Input containers feature pill or rounded-xl geometry with dark charcoal fills (`rgba(15, 23, 42, 0.6)`), recessed inner borders, and high-contrast placeholder text. Focus triggers an electric blue edge (`#2563EB`) and 2px offset ring.
- Chat bubbles differentiate peers (`#1E293B`) from self-messages (gradient transition from `#2563EB` to `#7C3AED`).

### Telemetry & Status Indicators
- Network quality meters (bitrate, ping, packet loss) utilize 3-tier micro-bars in the top-right corner of participant cells or sidebars: Green (`#10B981`), Amber (`#F59E0B`), and Red (`#EF4444`).
- Recording and live broadcast badges use pill containers with a pulsing scarlet dot.