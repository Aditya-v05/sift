import { loadFont as loadSerif } from '@remotion/google-fonts/InstrumentSerif';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as loadSans } from '@remotion/google-fonts/SchibstedGrotesk';
import React, { type ReactNode } from 'react';
import {
  AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';

/*
 * Demo videos edited from real screen recordings. Each recording is a Story (below): which stretches to use,
 * where the camera looks, the captions, the cards, and any text drawn over the recording. The first story is the
 * landing page demo: a real screen recording of Sift on usepylon.com (public/clean.mp4, made from the raw
 * recording with the revealed email blurred and Chrome's own buttons painted over; see README.md), cut into
 * three moments, with a camera that follows the panel and one caption per moment.
 *
 * Coordinates are pixels of clean.mp4 (2940 x 1838, the recording's retina pixels minus the menu bar).
 * Times inside the recording are in seconds of the original, so they can be checked against it directly.
 */

const { fontFamily: serif } = loadSerif('normal', { weights: ['400'], subsets: ['latin'] });
loadSerif('italic', { weights: ['400'], subsets: ['latin'] });
const { fontFamily: mono } = loadMono('normal', { weights: ['400'], subsets: ['latin'] });
const { fontFamily: sans } = loadSans('normal', { weights: ['400'], subsets: ['latin'] }); // the panel's font

const FPS = 30;
export const SRC = { w: 2940, h: 1838 };
const NIGHT = '#071d1a';
const CREAM = '#efece4';
const MINT = '#9ff2d6';
type Rect = { x: number; y: number; w: number; h: number };
type Key = [t: number, rect: Rect];

// ---------- formats: the site's two cuts, and two for LinkedIn / X feeds ----------

/** One rectangle of the recording: `w` wide, centred on (cx, cy). Its height follows the picture's aspect. */
type Shot = [cx: number, cy: number, w: number];

export interface Format {
  id: 'SiftDemo' | 'SiftDemoVertical' | 'SiftSocialPortrait' | 'SiftSocialSquare' | 'SiftSocialLandscape';
  width: number;
  height: number;
  /** Captions get their own band under the picture, so they never sit on the page's own text. */
  band: number;
  /** The panel column at a given height in the recording (x of its centre and the width shown). */
  panel: [cx: number, w: number];
  /** The toolbar before Chrome goes fullscreen, the zoom on the Sift icon, and the first look at the result. */
  top: Shot;
  icon: Shot;
  start: Shot;
  caption: { size: number; label: number; side: number };
  card: { size: number; mark: number };
  intro: number;
  outro: number;
  /** Feeds autoplay muted and get scrolled past: a hook first, a longer end card, a progress line. */
  social: boolean;
}

const MID = 919; // half the recording's height

export const FORMATS: Format[] = [
  {
    id: 'SiftDemo', width: 1600, height: 1000, band: 170, panel: [2330, 1260],
    top: [1470, 0, 2940], icon: [2250, 440, 1500], start: [1470, MID, 2940],
    caption: { size: 60, label: 20, side: 64 }, card: { size: 84, mark: 64 }, intro: 36, outro: 66, social: false,
  },
  {
    id: 'SiftDemoVertical', width: 720, height: 1280, band: 250, panel: [2555, 780],
    top: [2300, 0, 1034], icon: [2384, 520, 1000], start: [2300, MID, 1034],
    caption: { size: 64, label: 22, side: 44 }, card: { size: 70, mark: 76 }, intro: 36, outro: 66, social: false,
  },
  {
    // 4:5 is the tallest shape LinkedIn's feed shows in full, and X shows it as is.
    id: 'SiftSocialPortrait', width: 1080, height: 1350, band: 300, panel: [2480, 960],
    top: [2150, 0, 1500], icon: [2300, 500, 1100], start: [2100, MID, 1680],
    caption: { size: 78, label: 27, side: 70 }, card: { size: 100, mark: 96 }, intro: 72, outro: 110, social: true,
  },
  {
    id: 'SiftSocialSquare', width: 1080, height: 1080, band: 250, panel: [2420, 1100],
    top: [2000, 0, 1880], icon: [2250, 450, 1300], start: [1950, MID, 2200],
    caption: { size: 72, label: 25, side: 64 }, card: { size: 92, mark: 88 }, intro: 72, outro: 110, social: true,
  },
  {
    // 16:9, the way most people post screen recordings; shows the page beside the panel.
    id: 'SiftSocialLandscape', width: 1920, height: 1080, band: 190, panel: [2270, 1400],
    top: [1470, 0, 2940], icon: [2250, 440, 1500], start: [1470, MID, 2940],
    caption: { size: 68, label: 23, side: 80 }, card: { size: 96, mark: 84 }, intro: 72, outro: 110, social: true,
  },
];

// ---------- a story: one recording, cut and narrated ----------

type Seconds = { from: number; to: number };

/** Text drawn over the recording, in its pixels, so it moves with the camera (made-up emails, corrected labels). */
interface Patch extends Seconds {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bg: string;
  size?: number;
  /** Left padding before the text, so it lines up with the recording's own text. */
  pad?: number;
}

export interface Story {
  src: string;
  /** Stretches of the recording, in its own seconds. */
  clips: Seconds[];
  camera: (f: Format, a: number) => Key[];
  captions: (Seconds & { label: string; text: ReactNode })[];
  patches: Patch[];
  intro: (f: Format) => ReactNode;
  introKicker?: (f: Format) => string | undefined;
  outroSub: (f: Format) => ReactNode;
  outro?: ReactNode;
}

const FADE = 10;
const len = (c: Seconds) => Math.round((c.to - c.from) * FPS);

/** Where each clip (and then the outro) starts, and the total length, for a format. */
export function timeline(f: Format, story: Story = PYLON) {
  const starts: number[] = [];
  let at = f.intro - FADE;
  for (const c of story.clips) {
    starts.push(at);
    at += len(c) - FADE;
  }
  starts.push(at); // outro
  return { starts, total: at + f.outro };
}

// ---------- the camera: rectangles of the recording to fill the frame with, over recording time ----------

/** A rectangle of the given aspect, `w` wide, centred on (cx, cy), kept inside the recording. */
export function box(cx: number, cy: number, w: number, aspect: number): Rect {
  const h = w / aspect;
  return {
    x: Math.min(Math.max(cx - w / 2, 0), SRC.w - w),
    y: Math.min(Math.max(cy - h / 2, 0), SRC.h - h),
    w,
    h,
  };
}

export function cameraAt(keys: Key[], t: number): Rect {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1]![0] <= t) i++;
  const [t0, r0] = keys[i]!;
  const [t1, r1] = keys[i + 1]!;
  const k = t1 === t0 ? 1 : interpolate(t, [t0, t1], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.45, 0, 0.2, 1),
  });
  const mix = (p: number, q: number) => p + (q - p) * k;
  return { x: mix(r0.x, r1.x), y: mix(r0.y, r1.y), w: mix(r0.w, r1.w), h: mix(r0.h, r1.h) };
}

// ---------- story 1: Sift on usepylon.com (the landing page demo) ----------

export const PYLON: Story = {
  src: 'clean.mp4',
  clips: [
    { from: 1.0, to: 3.85 }, // clicking the Sift icon, the panel loading
    { from: 4.3, to: 14.0 }, // Pylon: fit, why now, the best contact, email revealed
    { from: 22.0, to: 25.6 }, // back at the top: Save, Saved
  ],
  camera: (f, a) => {
    const shot = ([cx, cy, w]: Shot) => box(cx, cy, w, a);
    // Panel column: x 2180..2930. Where things sit in the panel changes as it scrolls (see README.md).
    const panel = (cy: number) => box(f.panel[0], cy, f.panel[1], a);
    // Before Chrome went fullscreen the toolbar (with the Sift icon) is at the top: keep it in frame.
    const top = shot(f.top);
    const start = shot(f.start);
    return [
      [1.0, top],
      [1.5, shot(f.icon)], // towards the icon
      [2.4, shot(f.icon)],
      [3.85, top],
      [4.3, start],
      [5.0, start],
      [5.9, panel(700)], // the score and the checks
      [6.6, panel(700)],
      [8.2, panel(1000)], // why now
      [9.2, panel(1000)],
      [10.2, panel(1180)], // best contact and the reveal
      [14.0, panel(1180)],
      [22.0, panel(640)],
      [25.6, panel(600)],
    ];
  },
  captions: [
    { from: 1.0, to: 3.85, label: 'usepylon.com', text: <>One click on <em>their</em> homepage.</> },
    { from: 4.6, to: 7.4, label: '82% · strong fit', text: <>Scored against <em>your</em> customer.</> },
    { from: 7.9, to: 10.2, label: 'why now · timing 75', text: <>Why they matter <em>this week.</em></> },
    { from: 10.6, to: 14.0, label: 'best contact · email verified', text: <>Who to talk to, <em>and how.</em></> },
    { from: 22.2, to: 25.6, label: 'my accounts', text: <>Save it. <em>Rank it later.</em></> },
  ],
  // The revealed email is a real person's, so it's replaced by a made-up one. `.example` is reserved (RFC 2606)
  // and can never belong to anyone. clean.mp4 also blurs the real address underneath (see README.md).
  patches: [{ text: 'dan@usepylon.example', from: 11.7, to: 14.4, x: 2226, y: 1388, w: 334, h: 64, bg: '#fcfcfc' }],
  intro: (f) => (f.social ? <>Know who to email <em style={{ color: MINT }}>before you leave their homepage.</em></> : <>Sift, on a real site.</>),
  introKicker: (f) => (f.social ? 'a free Chrome extension' : undefined),
  outroSub: (f) => (f.social ? <>Free and open source, on your own Apollo + Jev keys<br />sift-through.vercel.app</> : 'Free and open source · sift-through.vercel.app'),
};

// ---------- story 2: Sift running on treg (browserbase.com), for the co-marketing post ----------

/**
 * Recorded 2026-10-07 on v0.3.1: switching the data source to treg in Settings, then browserbase.com scored
 * against treg's own ICP, and the founder's email revealed for $0.026. treg.mp4 is the recording with Chrome's
 * account buttons covered, the revealed email blurred, and the menu bar cropped (see README.md).
 */
export const TREG: Story = {
  src: 'treg.mp4',
  clips: [
    { from: 1.2, to: 9.6 }, // Settings: the dropdown, treg, the key pasted, "Sift is using treg"
    { from: 10.0, to: 16.3 }, // browserbase.com, the icon, the panel scoring it
    { from: 20.6, to: 25.0 }, // best contacts; the founder's email revealed
    { from: 26.5, to: 30.3 }, // back at the top: the spend, Save
  ],
  camera: (f, a) => {
    const panel = (cy: number) => box(f.panel[0], cy, f.panel[1], a);
    // The Settings column is x 780..2160; keep the API keys block in frame.
    // Left edge just before the column (x 780), so its text is never cut.
    const left = (w: number) => Math.min(SRC.w, Math.max(w, 1150));
    const settings = box(740 + left(1250 * a) / 2, 640, left(1250 * a), a);
    const keys = box(740 + left(1000 * a) / 2, 560, left(1000 * a), a);
    const site = box(f.start[0], f.start[1], f.start[2], a);
    const icon = box(2250, 300, Math.min(SRC.w, 900 * a), a);
    return [
      [1.2, settings],
      [2.0, keys], // the dropdown, the key, "Sift is using treg"
      [9.6, keys],
      [10.0, site],
      [11.4, site],
      [12.2, icon], // the Sift icon
      [12.9, icon],
      [13.8, panel(620)], // the score
      [14.6, panel(860)], // and the checks it met
      [16.3, panel(880)],
      [20.6, panel(1260)], // best contacts and the reveal
      [25.0, panel(1260)],
      [26.5, panel(560)],
      [30.3, panel(560)],
    ];
  },
  captions: [
    { from: 1.2, to: 5.2, label: 'settings · data source', text: <>Pick treg. <em>No Apollo plan needed.</em></> },
    { from: 5.2, to: 9.6, label: 'treg key · connected and saved', text: <>One key. <em>That's the setup.</em></> },
    { from: 10.1, to: 13.6, label: 'browserbase.com', text: <>One click on <em>their</em> homepage.</> },
    { from: 13.7, to: 16.3, label: '81% · strong fit', text: <>The same Apollo data, <em>through treg.</em></> },
    { from: 20.6, to: 22.9, label: 'best contacts · 8 found', text: <>Who to email, <em>ranked.</em></> },
    { from: 22.9, to: 25.0, label: 'email verified · $0.026', text: <>Every click <em>priced in dollars.</em></> },
    { from: 26.5, to: 30.3, label: '$0.08 for the whole lookup', text: <>Pay per call. <em>People search is free.</em></> },
  ],
  patches: [
    // The ICP rule maker (fixed since) cut the "a" off "an engineering team": show the label as it now reads.
    { text: 'engineering team shipping AI features', from: 14.3, to: 16.4, x: 2275, y: 1199, w: 548, h: 46, bg: '#fcfcfc', pad: 10 },
    { text: 'engineering team shipping AI features', from: 26.4, to: 30.4, x: 2275, y: 1199, w: 548, h: 46, bg: '#fcfcfc', pad: 10 },
    // The founder's real address, replaced by a made-up one (blurred underneath in treg.mp4 too).
    { text: 'paul@browserbase.example', from: 22.95, to: 25.1, x: 2232, y: 1333, w: 380, h: 50, bg: '#fcfcfc' },
  ],
  intro: () => <>No Apollo plan? <em style={{ color: MINT }}>Sift runs on treg now.</em></>,
  introKicker: () => 'Sift × treg',
  outroSub: () => <>Now on treg · free and open source<br />sift-through.vercel.app</>,
};

export const STORIES = { pylon: PYLON, treg: TREG } as const;
export type StoryId = keyof typeof STORIES;

// ---------- pieces ----------

export function TextPatch({ p, t }: { p: Patch; t: number }) {
  if (t < p.from || t > p.to) return null;
  return (
    <div
      style={{
        position: 'absolute', left: p.x, top: p.y, width: p.w, height: p.h, background: p.bg, boxShadow: `0 0 6px 4px ${p.bg}`,
        display: 'flex', alignItems: 'center', paddingLeft: p.pad ?? 12, fontFamily: sans, fontSize: p.size ?? 28, color: '#26282b',
        letterSpacing: '0.005em', whiteSpace: 'nowrap',
      }}
    >
      {p.text}
    </div>
  );
}

function Clip({ clip, f, story }: { clip: Seconds; f: Format; story: Story }) {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const band = f.band;
  const t = clip.from + frame / FPS;
  const cam = cameraAt(story.camera(f, f.width / (f.height - f.band)), t);
  const scale = width / cam.w;
  const fade = Math.min(
    interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: 'clamp' }),
    interpolate(frame, [durationInFrames - FADE, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' }),
  );
  const caption = story.captions.find((c) => t >= c.from && t < c.to);
  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT, opacity: fade }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width, height: height - band, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute', left: 0, top: 0, width: SRC.w, height: SRC.h,
          transformOrigin: '0 0', transform: `scale(${scale}) translate(${-cam.x}px, ${-cam.y}px)`,
        }}
      >
        <OffthreadVideo
          src={staticFile(story.src)}
          startFrom={Math.round(clip.from * FPS)}
          muted
          style={{ position: 'absolute', left: 0, top: 0, width: SRC.w, height: SRC.h, maxWidth: 'none' }}
        />
        {story.patches.map((p, i) => <TextPatch key={i} p={p} t={t} />)}
      </div>
      </div>
      {caption && <Caption key={caption.label} {...caption} t={t} f={f} />}
    </AbsoluteFill>
  );
}

function Caption({ label, text, from, to, t, f }: { label: string; text: ReactNode; from: number; to: number; t: number; f: Format }) {
  const { size, label: labelSize, side } = f.caption;
  const inK = interpolate(t, [from, from + 0.45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const outK = interpolate(t, [to - 0.3, to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        position: 'absolute', left: side, right: side, bottom: 0, height: f.band,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        opacity: Math.min(inK, outK), transform: `translateY(${(1 - inK) * 18}px)`, color: CREAM,
      }}
    >
      <div style={{ fontFamily: mono, fontSize: labelSize, color: MINT, letterSpacing: '0.02em', marginBottom: labelSize * 0.5, display: 'flex', alignItems: 'center', gap: labelSize * 0.45 }}>
        <span style={{ width: labelSize * 0.38, height: labelSize * 0.38, borderRadius: '50%', background: MINT, boxShadow: `0 0 12px ${MINT}` }} />
        {label}
      </div>
      <div style={{ fontFamily: serif, fontSize: size, lineHeight: 1, letterSpacing: '-0.02em' }}>{text}</div>
    </div>
  );
}

function Card({ children, sub, f, kicker }: { children: ReactNode; sub?: ReactNode; f: Format; kicker?: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const k = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const out = interpolate(frame, [durationInFrames - FADE, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' });
  const { size, mark } = f.card;
  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT, alignItems: 'center', justifyContent: 'center', textAlign: 'center', opacity: out, padding: f.social ? 80 : 48 }}>
      <div style={{ opacity: k, transform: `translateY(${(1 - k) * 16}px)`, display: 'grid', justifyItems: 'center', gap: size * 0.36 }}>
        <Img src={staticFile('icon.png')} style={{ width: mark, height: mark, borderRadius: mark / 4 }} />
        {kicker && <div style={{ fontFamily: mono, color: MINT, fontSize: size * 0.27 }}>{kicker}</div>}
        <div style={{ fontFamily: serif, color: CREAM, fontSize: size, lineHeight: 1.02, letterSpacing: '-0.02em', textWrap: 'balance' }}>{children}</div>
        {sub && <div style={{ fontFamily: mono, color: '#7f9a97', fontSize: size * (f.social ? 0.27 : 0.24), lineHeight: 1.6 }}>{sub}</div>}
      </div>
    </AbsoluteFill>
  );
}

/** A thin mint line along the bottom that fills as the video plays (feeds show no scrubber). */
function Progress() {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  return <div style={{ position: 'absolute', left: 0, bottom: 0, height: 6, width: (width * frame) / (durationInFrames - 1), background: MINT, opacity: 0.85 }} />;
}

// ---------- the whole thing ----------

export function Demo({ format, story: id = 'pylon' }: { format: Format['id']; story?: StoryId }) {
  const f = FORMATS.find((x) => x.id === format)!;
  const story = STORIES[id];
  const { starts } = timeline(f, story);
  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT }}>
      <Sequence durationInFrames={f.intro}>
        <Card f={f} kicker={story.introKicker?.(f)}>{story.intro(f)}</Card>
      </Sequence>
      {story.clips.map((c, i) => (
        <Sequence key={c.from} from={starts[i]} durationInFrames={len(c)}>
          <Clip clip={c} f={f} story={story} />
        </Sequence>
      ))}
      <Sequence from={starts[story.clips.length]} durationInFrames={f.outro}>
        <Card f={f} sub={story.outroSub(f)}>
          Sift through companies.<br /><em style={{ color: MINT }}>Talk to the right ones.</em>
        </Card>
      </Sequence>
      {f.social && <Progress />}
    </AbsoluteFill>
  );
}
