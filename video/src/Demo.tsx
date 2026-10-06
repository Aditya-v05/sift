import { loadFont as loadSerif } from '@remotion/google-fonts/InstrumentSerif';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as loadSans } from '@remotion/google-fonts/SchibstedGrotesk';
import React, { type ReactNode } from 'react';
import {
  AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';

/*
 * The landing page demo: a real screen recording of Sift on usepylon.com (public/clean.mp4, made from the raw
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

// ---------- the cut: [start, end] in seconds of the recording ----------

const CLIPS = [
  { from: 1.0, to: 3.85 },   // clicking the Sift icon, the panel loading
  { from: 4.3, to: 14.0 },   // Pylon: fit, why now, the best contact, email revealed
  { from: 22.0, to: 25.6 },  // back at the top: Save, Saved
] as const;

const FADE = 10;
const len = (c: { from: number; to: number }) => Math.round((c.to - c.from) * FPS);

/** Where each clip (and then the outro) starts, and the total length, for a format. */
export function timeline(f: Format) {
  const starts: number[] = [];
  let at = f.intro - FADE;
  for (const c of CLIPS) {
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

function cameraKeys(f: Format): Key[] {
  const a = f.width / (f.height - f.band);
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
}

function cameraAt(keys: Key[], t: number): Rect {
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

// ---------- the revealed email: a real person's, so it's replaced by a made-up one ----------

/**
 * Drawn over the panel in recording pixels, so it moves with the camera. `.example` is reserved (RFC 2606) and
 * can never belong to anyone. clean.mp4 also blurs the real address underneath from the same moment, as a
 * safety net (see README.md).
 */
const FAKE_EMAIL = { text: 'dan@usepylon.example', from: 11.7, to: 14.4, x: 2226, y: 1388, w: 334, h: 64 };

function FakeEmail({ t }: { t: number }) {
  if (t < FAKE_EMAIL.from || t > FAKE_EMAIL.to) return null;
  const { x, y, w, h, text } = FAKE_EMAIL;
  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, width: w, height: h, background: '#fcfcfc', boxShadow: '0 0 6px 4px #fcfcfc',
        display: 'flex', alignItems: 'center', paddingLeft: 12, fontFamily: sans, fontSize: 28, color: '#26282b',
        letterSpacing: '0.005em', whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
}

// ---------- captions: one per moment, in recording time ----------

const CAPTIONS: { from: number; to: number; label: string; text: ReactNode }[] = [
  { from: 1.0, to: 3.85, label: 'usepylon.com', text: <>One click on <em>their</em> homepage.</> },
  { from: 4.6, to: 7.4, label: '82% · strong fit', text: <>Scored against <em>your</em> customer.</> },
  { from: 7.9, to: 10.2, label: 'why now · timing 75', text: <>Why they matter <em>this week.</em></> },
  { from: 10.6, to: 14.0, label: 'best contact · email verified', text: <>Who to talk to, <em>and how.</em></> },
  { from: 22.2, to: 25.6, label: 'my accounts', text: <>Save it. <em>Rank it later.</em></> },
];

// ---------- pieces ----------

function Clip({ clip, f }: { clip: (typeof CLIPS)[number]; f: Format }) {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const band = f.band;
  const t = clip.from + frame / FPS;
  const cam = cameraAt(cameraKeys(f), t);
  const scale = width / cam.w;
  const fade = Math.min(
    interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: 'clamp' }),
    interpolate(frame, [durationInFrames - FADE, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' }),
  );
  const caption = CAPTIONS.find((c) => t >= c.from && t < c.to);
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
          src={staticFile('clean.mp4')}
          startFrom={Math.round(clip.from * FPS)}
          muted
          style={{ position: 'absolute', left: 0, top: 0, width: SRC.w, height: SRC.h, maxWidth: 'none' }}
        />
        <FakeEmail t={t} />
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

export function Demo({ format }: { format: Format['id'] }) {
  const f = FORMATS.find((x) => x.id === format)!;
  const { starts } = timeline(f);
  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT }}>
      <Sequence durationInFrames={f.intro}>
        {f.social ? (
          <Card f={f} kicker="a free Chrome extension">
            Know who to email <em style={{ color: MINT }}>before you leave their homepage.</em>
          </Card>
        ) : (
          <Card f={f}>Sift, on a real site.</Card>
        )}
      </Sequence>
      {CLIPS.map((c, i) => (
        <Sequence key={c.from} from={starts[i]} durationInFrames={len(c)}>
          <Clip clip={c} f={f} />
        </Sequence>
      ))}
      <Sequence from={starts[3]} durationInFrames={f.outro}>
        <Card
          f={f}
          sub={f.social ? <>Free and open source, on your own Apollo + Jev keys<br />sift-through.vercel.app</> : 'Free and open source · sift-through.vercel.app'}
        >
          Sift through companies.<br /><em style={{ color: MINT }}>Talk to the right ones.</em>
        </Card>
      </Sequence>
      {f.social && <Progress />}
    </AbsoluteFill>
  );
}
