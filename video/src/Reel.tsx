import { loadVariableFont as loadArchivo } from '@remotion/google-fonts/Archivo';
import { loadFont as loadSerif } from '@remotion/google-fonts/InstrumentSerif';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import React, { type ReactNode } from 'react';
import {
  AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import { REQUEST, WHO, WHY, resultLine, steps, toolLine } from './AgentDemo';
import { FORMATS, PYLON, SRC, TextPatch, cameraAt, type Format } from './Demo';

/*
 * The showreel cut: Sift in the style of a motion-design reel. A HUD frame on every shot (corner labels, a
 * timecode, a progress hairline, a spec line with Sift's real numbers), springs instead of fades, hard-cut word
 * beats, layered wipes, a 3D tile grid, and beats of real product footage in between: the usepylon.com
 * recording (through the same camera and text patches as Demo.tsx, so the email is the made-up
 * dan@usepylon.example) and the real agent session (site/agent-session.json). 60 fps.
 *
 * Two reels share the pieces: `home` (the extension, for the landing page) and `agents` (sift-gtm, for /agents).
 */

const { fontFamily: archivo } = loadArchivo('normal', { subsets: ['latin'] });
const { fontFamily: serif } = loadSerif('normal', { weights: ['400'], subsets: ['latin'] });
loadSerif('italic', { weights: ['400'], subsets: ['latin'] });
const { fontFamily: mono } = loadMono('normal', { weights: ['400', '600'], subsets: ['latin'] });

export const REEL_FPS = 60;
const NIGHT = '#071d1a';
const PANEL = '#0b2420';
const CREAM = '#efece4';
const MINT = '#9ff2d6';
const DIM = '#7f9a97';
const DEEP = '#2c6b5f';
const SPRING = { stiffness: 190, damping: 18 };

export interface ReelFormat {
  id: 'Landscape' | 'Portrait' | 'Square';
  width: number;
  height: number;
  /** Which Demo.tsx format's camera shots to use for the recording. */
  demo: Format['id'];
}

export const REEL_FORMATS: ReelFormat[] = [
  { id: 'Landscape', width: 1920, height: 1080, demo: 'SiftSocialLandscape' },
  { id: 'Portrait', width: 1080, height: 1350, demo: 'SiftSocialPortrait' },
  { id: 'Square', width: 1080, height: 1080, demo: 'SiftSocialSquare' },
];

// ---------- layout ----------

function useLayout() {
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const pad = 46 * u;
  const side = 52 * u;
  // The content area: between the top labels and the caption / spec lines.
  const area = { left: side, top: pad + 52 * u, width: width - 2 * side, height: height - (pad + 52 * u) - (pad + 156 * u) };
  return { width, height, u, pad, side, area };
}

const sp = (frame: number, fps: number, at = 0, config = SPRING) => spring({ frame: frame - at, fps, config });
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** The largest size, up to `max`, at which `text` in heavy Archivo fits in `w`. */
const fit = (text: string, w: number, max: number, em = 0.7) => Math.min(max, w / (text.length * em));

// ---------- the HUD ----------

interface Hud {
  chapter: string;
  specL?: string;
  specR?: string;
  caption?: ReactNode;
  /** Dark labels on a light ground (word beats on mint or cream). */
  dark?: boolean;
  /** Identifies the caption; defaults to the chapter. A new cue makes the caption rise in again. */
  cue?: string;
}
const cueOf = (h: Hud) => h.cue ?? h.chapter;

function HudLayer({ hud, top, meta, captionKey, since }: { hud: Hud; top: string; meta: string; captionKey: string; since: number }) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const { width, u, pad, side } = useLayout();
  const ink = hud.dark ? 'rgba(7,29,26,0.72)' : DIM;
  const label: React.CSSProperties = { fontFamily: mono, fontSize: 18 * u, letterSpacing: '0.16em', textTransform: 'uppercase', color: ink, whiteSpace: 'nowrap' };
  const secs = frame / fps;
  const tc = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(Math.floor(secs % 60)).padStart(2, '0')}:${String(frame % fps).padStart(2, '0')}`;
  const p = frame / (durationInFrames - 1);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ ...label, position: 'absolute', left: side, top: pad }}>{top}</div>
      <div style={{ ...label, position: 'absolute', right: side, top: pad }}>{hud.chapter}</div>
      {hud.caption && <Caption key={captionKey} since={since} dark={hud.dark}>{hud.caption}</Caption>}
      <div style={{ ...label, position: 'absolute', left: side, right: side, bottom: pad + 50 * u, display: 'flex', justifyContent: 'space-between', gap: 24 * u, fontSize: 17 * u, color: hud.dark ? 'rgba(7,29,26,0.85)' : CREAM, opacity: 0.85 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{hud.specL}</span>
        {width > 1200 && <span>{hud.specR}</span>}
      </div>
      <div style={{ ...label, position: 'absolute', left: side, right: side, bottom: pad + 16 * u, display: 'flex', justifyContent: 'space-between' }}>
        <span>{meta}</span>
        <span>{tc}</span>
      </div>
      <div style={{ position: 'absolute', left: side, right: side, bottom: pad, height: Math.max(1, 1.5 * u), background: hud.dark ? 'rgba(7,29,26,0.18)' : 'rgba(159,242,214,0.14)' }}>
        <div style={{ width: `${p * 100}%`, height: '100%', background: hud.dark ? NIGHT : MINT }} />
      </div>
    </AbsoluteFill>
  );
}

function Caption({ children, dark, since }: { children: ReactNode; dark?: boolean; since: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, pad, side, width } = useLayout();
  // Rises in from the frame its cue began.
  const k = sp(frame, fps, since);
  return (
    <div style={{ position: 'absolute', left: side, right: side, bottom: pad + 84 * u, overflow: 'hidden', height: 66 * u }}>
      <div style={{ fontFamily: serif, fontSize: (width > 1200 ? 52 : 46) * u, lineHeight: `${66 * u}px`, letterSpacing: '-0.02em', color: dark ? NIGHT : CREAM, transform: `translateY(${(1 - k) * 100}%)`, whiteSpace: 'nowrap' }}>
        {children}
      </div>
    </div>
  );
}

// ---------- pieces ----------

/** A word that rises out of a mask letter by letter on a spring, its width settling as it lands. */
function Rise({ text, size, at = 0, color = CREAM, gap = 4 }: { text: string; size: number; at?: number; color?: string; gap?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: 'flex', fontFamily: archivo, fontSize: size, lineHeight: 0.92, color, letterSpacing: '-0.02em' }}>
      {[...text].map((ch, i) => {
        const s = sp(frame, fps, at + i * gap);
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: size * 0.04 }}>
            <span style={{ display: 'inline-block', transform: `translateY(${(1 - s) * 110}%)`, fontVariationSettings: `'wght' 860, 'wdth' ${interpolate(s, [0, 1], [125, 100])}` }}>
              {ch === ' ' ? ' ' : ch}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function Hairline({ at, w, u }: { at: number; w: number; u: number }) {
  const frame = useCurrentFrame();
  const k = interpolate(frame, [at, at + 22], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return <div style={{ width: w * k, height: Math.max(1, 1.5 * u), background: 'rgba(239,236,228,0.5)' }} />;
}

/** The hook: a word between two hairlines, and a tracked subline. */
function Hook({ word, sub }: { word: string; sub: string }) {
  const frame = useCurrentFrame();
  const { u, area } = useLayout();
  const size = fit(word, area.width * 0.8, 300 * u);
  const lineW = Math.min(area.width * 0.8, word.length * size * 0.72);
  const subK = interpolate(frame, [44, 64], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 22 * u, flexDirection: 'column' }}>
      <Hairline at={0} w={lineW} u={u} />
      <Rise text={word} size={size} at={10} />
      <Hairline at={4} w={lineW} u={u} />
      <div style={{ fontFamily: mono, fontSize: 19 * u, letterSpacing: `${interpolate(subK, [0, 1], [0.5, 0.3])}em`, color: MINT, opacity: subK, textTransform: 'uppercase', textAlign: 'center', marginTop: 8 * u }}>
        {sub}
      </div>
    </AbsoluteFill>
  );
}

/** A grid of accounts on a perspective plane; a radial wave flips each one to show how it fits the ICP. */
function Tiles() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { u, area } = useLayout();
  const wide = area.width / area.height > 1.4;
  const cols = wide ? 13 : 8;
  const rows = wide ? 6 : 9;
  const planeW = area.width * (wide ? 0.78 : 0.92);
  const cell = Math.min(planeW / cols, (area.height * 1.05) / rows);
  const tile = cell * 0.84;
  const orbit = interpolate(frame, [0, durationInFrames], [-16, 14]);
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  return (
    <div style={{ position: 'absolute', ...areaStyle(area), perspective: 1450 * u, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: cols * cell, height: rows * cell, transformStyle: 'preserve-3d', transform: `rotateX(26deg) rotateZ(-3deg) rotateY(${orbit}deg)` }}>
        {Array.from({ length: cols * rows }, (_, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          const dist = Math.hypot(c - cx, (r - cy) * 1.2);
          const s = sp(frame, fps, dist * 2.2);
          const flipAt = 64 + dist * 3.2;
          const deg = interpolate(frame, [flipAt, flipAt + 26], [0, 180], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
          const roll = random(`tile-${i}`);
          const back = roll < 0.18 ? { background: MINT } : roll < 0.4 ? { background: DEEP } : { background: '#0c2622', border: `${Math.max(1, 1.5 * u)}px solid rgba(159,242,214,0.2)` };
          const face: React.CSSProperties = { position: 'absolute', inset: 0, borderRadius: 4 * u, backfaceVisibility: 'hidden', boxSizing: 'border-box' };
          return (
            <div key={i} style={{ position: 'absolute', left: c * cell, top: r * cell, width: tile, height: tile, transformStyle: 'preserve-3d', transform: `scale(${s}) rotateY(${deg}deg)`, opacity: Math.min(1, s * 1.4) }}>
              <div style={{ ...face, background: '#183b35', border: `${Math.max(1, u)}px solid rgba(239,236,228,0.12)` }} />
              <div style={{ ...face, ...back, transform: 'rotateY(180deg)' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const areaStyle = (a: { left: number; top: number; width: number; height: number }): React.CSSProperties => ({ left: a.left, top: a.top, width: a.width, height: a.height });

/** Stretches of the real recording, hard-cut together, through Demo.tsx's camera and text patches. */
type Clip = { from: number; to: number };
const clipLen = (c: Clip) => Math.round((c.to - c.from) * REEL_FPS);

/** Recording time (seconds) at a frame of a footage scene. */
function recordingTime(clips: Clip[], local: number) {
  let at = 0;
  for (const c of clips) {
    if (local < at + clipLen(c)) return c.from + (local - at) / REEL_FPS;
    at += clipLen(c);
  }
  const last = clips[clips.length - 1]!;
  return last.to;
}

function Footage({ clips, demo }: { clips: Clip[]; demo: Format['id'] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, area } = useLayout();
  const f = FORMATS.find((x) => x.id === demo)!;
  const keys = PYLON.camera(f, area.width / area.height);
  const k = sp(frame, fps, 0, { stiffness: 140, damping: 20 });
  let at = 0;
  return (
    <div style={{ position: 'absolute', ...areaStyle(area), borderRadius: 14 * u, overflow: 'hidden', background: '#fcfcfc', border: `1px solid rgba(159,242,214,0.2)`, transform: `scale(${0.965 + 0.035 * k})`, opacity: Math.min(1, k * 1.6) }}>
      {clips.map((c) => {
        const from = at;
        at += clipLen(c);
        return (
          <Sequence key={c.from} from={from} durationInFrames={clipLen(c)} layout="none">
            <ClipView clip={c} keys={keys} scale={area.width} />
          </Sequence>
        );
      })}
    </div>
  );
}

function ClipView({ clip, keys, scale: w }: { clip: Clip; keys: Parameters<typeof cameraAt>[0]; scale: number }) {
  const frame = useCurrentFrame();
  const t = clip.from + frame / REEL_FPS;
  const cam = cameraAt(keys, t);
  const scale = w / cam.w;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: SRC.w, height: SRC.h, transformOrigin: '0 0', transform: `scale(${scale}) translate(${-cam.x}px, ${-cam.y}px)` }}>
      <OffthreadVideo src={staticFile(PYLON.src)} startFrom={Math.round(clip.from * REEL_FPS)} muted style={{ position: 'absolute', left: 0, top: 0, width: SRC.w, height: SRC.h, maxWidth: 'none' }} />
      {PYLON.patches.map((p, i) => <TextPatch key={i} p={p} t={t} />)}
    </div>
  );
}

/** Hard-cut words on solid grounds, one every `each` frames. */
type Beat = { word: string; bg: string; ink: string };
const BEAT = 28;
function Words({ beats }: { beats: Beat[] }) {
  const frame = useCurrentFrame();
  const { width } = useLayout();
  const i = Math.min(beats.length - 1, Math.floor(frame / BEAT));
  const b = beats[i]!;
  const local = frame - i * BEAT;
  const longest = Math.max(...beats.map((x) => x.word.length));
  const size = fit('W'.repeat(longest), width * 0.8, 280 * (width / 1920 > 0.9 ? 1 : 1.4), 0.66);
  const settle = interpolate(local, [0, 12], [1.06, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: b.bg, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: archivo, fontSize: size, color: b.ink, letterSpacing: '-0.025em', fontVariationSettings: `'wght' 880, 'wdth' ${interpolate(local, [0, 14], [112, 100], clamp)}`, transform: `scale(${settle})`, whiteSpace: 'nowrap' }}>
        {b.word}
      </div>
    </AbsoluteFill>
  );
}

/** A numbered list that staggers in, values in a mono column on the right. */
function List({ title, rows, after }: { title: string; rows: [string, string][]; after?: ReactNode }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, area, width } = useLayout();
  const wide = width > 1200;
  const size = (wide ? 58 : 46) * u;
  return (
    <div style={{ position: 'absolute', ...areaStyle(area), display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0 }}>
      <div style={{ fontFamily: mono, fontSize: 16 * u, letterSpacing: '0.18em', color: MINT, textTransform: 'uppercase', marginBottom: 22 * u, opacity: interpolate(frame, [0, 12], [0, 1], clamp) }}>{title}</div>
      {rows.map(([label, value], i) => {
        const s = sp(frame, fps, 8 + i * 9);
        const line = interpolate(frame, [8 + i * 9, 30 + i * 9], [0, 100], { ...clamp, easing: Easing.out(Easing.cubic) });
        return (
          <div key={label} style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 22 * u, padding: `${(wide ? 18 : 16) * u}px 0`, opacity: Math.min(1, s * 1.3), transform: `translateY(${(1 - s) * 30}px)` }}>
            <span style={{ fontFamily: mono, fontSize: 16 * u, color: DIM, width: 34 * u }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{ flex: 1, fontFamily: archivo, fontSize: size, color: CREAM, fontVariationSettings: `'wght' 460, 'wdth' 100`, letterSpacing: '-0.015em', whiteSpace: 'nowrap' }}>{label}</span>
            <span style={{ fontFamily: mono, fontSize: (wide ? 28 : 22) * u, color: MINT, whiteSpace: 'nowrap' }}>{value}</span>
            <span style={{ position: 'absolute', left: 0, bottom: 0, height: 1, width: `${line}%`, background: 'rgba(239,236,228,0.16)' }} />
          </div>
        );
      })}
      {after && <div style={{ marginTop: 26 * u, opacity: interpolate(frame, [70, 90], [0, 1], clamp), transform: `translateY(${interpolate(frame, [70, 90], [16, 0], clamp)}px)` }}>{after}</div>}
    </div>
  );
}

/** Three accounts as cards; each flips to its fit and timing. */
const ACCOUNTS = [
  { domain: 'gorgias.com', name: 'Gorgias', fit: 80, timing: 52 },
  { domain: 'helpscout.com', name: 'Help Scout', fit: 78, timing: 57 },
  { domain: 'kustomer.com', name: 'Kustomer', fit: 83, timing: 44 },
];
function Accounts() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, area } = useLayout();
  const gap = 24 * u;
  const w = (area.width - 2 * gap) / 3;
  const h = Math.min(area.height * 0.82, w * 1.3);
  const small = w < 400 * u;
  return (
    <div style={{ position: 'absolute', ...areaStyle(area), perspective: 1450 * u, display: 'flex', alignItems: 'center', justifyContent: 'center', gap }}>
      {ACCOUNTS.map((a, i) => {
        const s = sp(frame, fps, i * 6);
        const flipAt = 40 + i * 14;
        const deg = interpolate(frame, [flipAt, flipAt + 30], [0, 180], { ...clamp, easing: Easing.out(Easing.back(1.5)) });
        const face: React.CSSProperties = { position: 'absolute', inset: 0, borderRadius: 14 * u, backfaceVisibility: 'hidden', padding: (small ? 22 : 34) * u, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' };
        const label: React.CSSProperties = { fontFamily: mono, fontSize: (small ? 14 : 17) * u, letterSpacing: '0.16em', textTransform: 'uppercase' };
        return (
          <div key={a.domain} style={{ position: 'relative', width: w, height: h, transformStyle: 'preserve-3d', transform: `translateY(${(1 - s) * 60}px) rotateY(${deg}deg)`, opacity: Math.min(1, s * 1.4) }}>
            <div style={{ ...face, background: PANEL, border: '1px solid rgba(159,242,214,0.16)' }}>
              <span style={{ ...label, color: DIM }}>{String(i + 1).padStart(2, '0')} / account</span>
              <span style={{ fontFamily: mono, fontSize: (small ? 22 : 30) * u, color: CREAM }}>{a.domain}</span>
              <span style={{ ...label, color: DIM }}>sift_company()</span>
            </div>
            <div style={{ ...face, background: i === 0 ? MINT : CREAM, transform: 'rotateY(180deg)', color: NIGHT }}>
              <span style={{ ...label, color: 'rgba(7,29,26,0.7)' }}>{String(i + 1).padStart(2, '0')} / {i === 0 ? 'go first' : 'ranked'}</span>
              <div>
                <div style={{ fontFamily: archivo, fontSize: (small ? 34 : 50) * u, fontVariationSettings: `'wght' 760, 'wdth' 100`, letterSpacing: '-0.02em', marginBottom: 14 * u }}>{a.name}</div>
                <div style={{ display: 'flex', gap: (small ? 16 : 30) * u }}>
                  {([['fit', a.fit], ['timing', a.timing]] as const).map(([k, v]) => (
                    <div key={k}>
                      <div style={{ ...label, color: 'rgba(7,29,26,0.7)' }}>{k}</div>
                      <div style={{ fontFamily: archivo, fontSize: (small ? 64 : 104) * u, lineHeight: 1, fontVariationSettings: `'wght' 860, 'wdth' 100`, letterSpacing: '-0.03em' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <span style={{ ...label, color: 'rgba(7,29,26,0.7)' }}>cached · 0 credits</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The real agent session, replayed in a terminal panel. */
const TYPE_END = 140;
const TOOLS_AT = 152;
const TOOL_GAP = 34;
function Terminal() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, area, width } = useLayout();
  const wide = width > 1200;
  const typed = REQUEST.slice(0, Math.floor(interpolate(frame, [6, TYPE_END], [0, REQUEST.length], clamp)));
  const k = sp(frame, fps, 0, { stiffness: 140, damping: 20 });
  return (
    <div style={{ position: 'absolute', ...areaStyle(area), background: PANEL, borderRadius: 14 * u, border: '1px solid rgba(159,242,214,0.16)', padding: `${26 * u}px ${32 * u}px`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 18 * u, overflow: 'hidden', transform: `scale(${0.965 + 0.035 * k})`, opacity: Math.min(1, k * 1.6) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 18 * u, color: DIM }}>
        <span>claude code · mcp: sift</span>
        <span style={{ color: MINT }}>● connected</span>
      </div>
      <div style={{ fontFamily: archivo, fontVariationSettings: `'wght' 400, 'wdth' 100`, fontSize: (wide ? 40 : area.height > area.width ? 40 : 34) * u, color: CREAM, lineHeight: 1.4 }}>
        <span style={{ fontFamily: mono, color: MINT }}>&gt; </span>
        {typed}
        {frame < TYPE_END + 8 && <span style={{ opacity: Math.floor(frame / 16) % 2 ? 0 : 1 }}>▍</span>}
      </div>
      <div style={{ display: 'grid', gap: 12 * u }}>
        {steps.map((s, i) => {
          const at = TOOLS_AT + i * TOOL_GAP;
          if (frame < at) return null;
          const t = sp(frame, fps, at);
          return (
            <div key={i} style={{ opacity: Math.min(1, t * 1.4), transform: `translateX(${(1 - t) * 24}px)`, fontFamily: mono, fontSize: (wide ? 28 : area.height > area.width ? 24 : 23) * u, lineHeight: 1.38 }}>
              <span style={{ color: MINT }}>⏺ {toolLine(s)}</span>
              <div style={{ color: DIM, paddingLeft: 24 * u }}>⎿ {resultLine(s)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The end card: the icon, the line, and where to get it. */
function Outro({ kicker, children, sub }: { kicker?: string; children: ReactNode; sub: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, width } = useLayout();
  const wide = width > 1200;
  const a = sp(frame, fps, 4);
  const b = sp(frame, fps, 12);
  const c = interpolate(frame, [30, 48], [0, 1], clamp);
  const ring = interpolate(frame, [0, 30], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 26 * u, textAlign: 'center', padding: 80 * u }}>
      <div style={{ position: 'relative', width: 96 * u, height: 96 * u, transform: `scale(${0.7 + 0.3 * a})`, opacity: a }}>
        <svg width={96 * u} height={96 * u} viewBox="0 0 96 96" style={{ position: 'absolute', inset: 0 }}>
          <circle cx="48" cy="48" r="46" fill="none" stroke={MINT} strokeWidth="1.5" strokeDasharray={289} strokeDashoffset={289 * (1 - ring)} transform="rotate(-90 48 48)" />
        </svg>
        <Img src={staticFile('icon.png')} style={{ position: 'absolute', inset: 14 * u, width: 68 * u, height: 68 * u, borderRadius: 17 * u }} />
      </div>
      {kicker && <div style={{ fontFamily: mono, fontSize: (wide ? 30 : 26) * u, color: MINT, opacity: a }}>{kicker}</div>}
      <div style={{ overflow: 'hidden', paddingBottom: 8 * u }}>
        <div style={{ fontFamily: serif, fontSize: (wide ? 96 : 86) * u, lineHeight: 1.02, letterSpacing: '-0.02em', color: CREAM, transform: `translateY(${(1 - b) * 105}%)`, textWrap: 'balance' }}>{children}</div>
      </div>
      <div style={{ fontFamily: mono, fontSize: 17 * u, letterSpacing: '0.2em', textTransform: 'uppercase', color: DIM, opacity: c }}>{sub}</div>
    </AbsoluteFill>
  );
}

/** Layered bands that sweep across the cut. The last (darkest) covers the whole frame at frame WIPE_CUT. */
const WIPE_LEN = 28;
const WIPE_CUT = 17;
function Wipe() {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const bw = width * 1.5;
  const travel = width + bw + width * 0.6;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', pointerEvents: 'none' }}>
      {[MINT, DEEP, '#0c2924'].map((bg, i) => {
        const p = interpolate(frame, [i * 3, i * 3 + 22], [0, 1], clamp);
        const x = -bw - width * 0.3 + p * travel;
        return <div key={bg} style={{ position: 'absolute', top: '-10%', height: '120%', left: x, width: bw, background: bg, transform: 'skewX(-14deg)' }} />;
      })}
    </AbsoluteFill>
  );
}

// ---------- the two reels ----------

interface Scene {
  len: number;
  wipe?: boolean;
  bg?: string;
  render: (f: ReelFormat) => ReactNode;
  hud: (local: number) => Hud;
}

const footage = (clips: Clip[], cues: (Clip & Hud)[]): Pick<Scene, 'len' | 'render' | 'hud'> => ({
  len: clips.reduce((n, c) => n + clipLen(c), 0),
  render: (f) => <Footage clips={clips} demo={f.demo} />,
  hud: (local) => {
    const t = recordingTime(clips, local);
    return cues.find((c) => t >= c.from && t < c.to) ?? cues[cues.length - 1]!;
  },
});

const words = (beats: Beat[], chapter: string): Scene => ({
  len: beats.length * BEAT,
  render: () => <Words beats={beats} />,
  hud: (local) => {
    const b = beats[Math.min(beats.length - 1, Math.floor(local / BEAT))]!;
    return { chapter, dark: b.bg !== NIGHT };
  },
});

const em = (s: string) => <em style={{ color: MINT }}>{s}</em>;

const HOME: Scene[] = [
  {
    len: 150,
    render: () => <Hook word="SIFT" sub="Fit · why now · who to email" />,
    hud: () => ({ chapter: '01 / Sift', specL: 'Chrome side panel · your own keys', specR: 'Apollo or treg + Jev' }),
  },
  {
    len: 200,
    render: () => <Tiles />,
    hud: (l) => ({ chapter: '02 / Your ICP', cue: l < 70 ? 'icp-a' : 'icp-b', caption: l < 70 ? <>A list of {em('accounts.')}</> : <>Which ones {em('actually fit?')}</>, specL: 'Every account · one ICP', specR: 'Fit · near · not yet' }),
  },
  {
    wipe: true,
    ...footage([{ from: 1.0, to: 3.85 }, { from: 4.3, to: 7.4 }], [
      { from: 0, to: 4.3, chapter: '03 / One click', caption: <>One click on {em('their')} homepage.</>, specL: 'usepylon.com · real recording', specR: 'Sift side panel' },
      { from: 4.3, to: 99, chapter: '04 / Fit', caption: <>Scored against {em('your')} customer.</>, specL: 'Fit 82% · strong', specR: 'Every check shown' },
    ]),
  },
  words([{ word: 'FIT.', bg: NIGHT, ink: CREAM }, { word: 'WHY NOW.', bg: MINT, ink: NIGHT }, { word: 'WHO.', bg: CREAM, ink: NIGHT }], 'Fit · why now · who'),
  footage([{ from: 7.9, to: 14.0 }], [
    { from: 0, to: 10.2, chapter: '05 / Why now', caption: <>Why they matter {em('this week.')}</>, specL: 'Timing 75', specR: 'From their site and hiring' },
    { from: 10.2, to: 99, chapter: '06 / Who', caption: <>Who to talk to, {em('and how.')}</>, specL: 'Best contact · email verified', specR: '1 credit, only when found' },
  ]),
  {
    len: 230,
    wipe: true,
    render: () => (
      <List title="What Sift tells you · usepylon.com" rows={[['Fit against your ICP', '82%'], ['Why now, with evidence', 'timing 75'], ['Who to email', 'dan@usepylon.example'], ['What it costs', 'priced before you spend']]} />
    ),
    hud: () => ({ chapter: '07 / The answer', specL: 'One lookup · one page', specR: '2 credits + 1 per email' }),
  },
  {
    len: 200,
    wipe: true,
    render: () => <Outro sub="Free · open source · sift-through.vercel.app">Sift through companies.<br />{em('Talk to the right ones.')}</Outro>,
    hud: () => ({ chapter: '08 / Install', specL: 'Chrome extension', specR: 'Bring your own keys' }),
  },
];

const AGENTS: Scene[] = [
  {
    len: 150,
    render: () => <Hook word="MCP" sub="Give your agent Sift" />,
    hud: () => ({ chapter: '01 / sift-gtm', specL: 'MCP server · CLI · skill', specR: '7 tools' }),
  },
  {
    len: TOOLS_AT + steps.length * TOOL_GAP + 70,
    render: () => <Terminal />,
    hud: (l) =>
      l < TOOLS_AT
        ? { chapter: '02 / The ask', caption: <>You ask in {em('plain words.')}</>, specL: 'Claude Code · real session', specR: '3 accounts' }
        : { chapter: '03 / Price first', caption: <>It prices first. {em('Cached, so $0.')}</>, specL: 'quote · 3 companies · 0 credits', specR: `${steps.length} tool calls` },
  },
  words([{ word: 'QUOTE.', bg: NIGHT, ink: CREAM }, { word: 'SIFT.', bg: MINT, ink: NIGHT }, { word: 'RANK.', bg: CREAM, ink: NIGHT }], 'Quote · sift · rank'),
  {
    len: 230,
    wipe: true,
    render: () => <Accounts />,
    hud: () => ({ chapter: '04 / Fit + timing', caption: <>Every account, {em('scored.')}</>, specL: 'Gorgias · Help Scout · Kustomer', specR: 'Fit 80 / 78 / 83' }),
  },
  {
    len: 270,
    render: (f) => (
      <List
        title="The agent's answer"
        rows={[['Gorgias', 'fit 80 · timing 52'], ['Help Scout', 'fit 78 · timing 57'], ['Kustomer', 'fit 83 · timing 44']]}
        after={<AnswerNote wide={f.width > 1200} />}
      />
    ),
    hud: () => ({ chapter: '05 / The answer', specL: '0 credits spent · no emails revealed', specR: 'Real tool calls' }),
  },
  {
    len: 200,
    wipe: true,
    render: () => <Outro kicker="npx sift-gtm mcp" sub="sift-through.vercel.app/agents">Your agent, {em('qualifying accounts.')}</Outro>,
    hud: () => ({ chapter: '06 / Install', specL: 'Claude · Codex · Gemini · Cursor', specR: 'Free · open source' }),
  },
];

function AnswerNote({ wide }: { wide: boolean }) {
  const { u } = useLayout();
  return (
    <div style={{ fontFamily: archivo, fontVariationSettings: `'wght' 400, 'wdth' 100`, fontSize: (wide ? 34 : 30) * u, lineHeight: 1.45, color: '#dcebe7', maxWidth: 1300 * u }}>
      <b style={{ color: MINT, fontWeight: 600 }}>Gorgias first:</b> {WHY} {WHO}
    </div>
  );
}

export const REELS = { home: HOME, agents: AGENTS } as const;
export type ReelId = keyof typeof REELS;
const META: Record<ReelId, { top: string; meta: string }> = {
  home: { top: 'Sift / outbound research', meta: 'Sift · free + open source' },
  agents: { top: 'Sift / for AI agents', meta: 'sift-gtm · MCP + CLI' },
};

function starts(scenes: Scene[]) {
  const s: number[] = [];
  let at = 0;
  for (const sc of scenes) {
    s.push(at);
    at += sc.len;
  }
  return { s, total: at };
}
export const reelTotal = (id: ReelId) => starts(REELS[id]).total;

export function Reel({ reel, format }: { reel: ReelId; format: ReelFormat['id'] }) {
  const frame = useCurrentFrame();
  const f = REEL_FORMATS.find((x) => x.id === format)!;
  const scenes = REELS[reel];
  const { s } = starts(scenes);
  let i = 0;
  while (i < scenes.length - 1 && frame >= s[i + 1]!) i++;
  const local = frame - s[i]!;
  const hud = scenes[i]!.hud(local);
  // Where this cue began, so its caption rises in from there.
  let back = local;
  while (back > 0 && cueOf(scenes[i]!.hud(back - 1)) === cueOf(hud)) back--;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, #0d2a25 0%, ${NIGHT} 62%, #04130f 100%)` }}>
      {scenes.map((sc, j) => (
        <Sequence key={j} from={s[j]} durationInFrames={sc.len}>
          {sc.render(f)}
        </Sequence>
      ))}
      <HudLayer hud={hud} top={META[reel].top} meta={META[reel].meta} captionKey={`${i}-${cueOf(hud)}`} since={s[i]! + back} />
      {scenes.map((sc, j) => sc.wipe && (
        <Sequence key={`w${j}`} from={s[j]! - WIPE_CUT} durationInFrames={WIPE_LEN}>
          <Wipe />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
