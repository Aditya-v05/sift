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

/** A block that rises out of a mask on a spring. */
function Lift({ children, at = 0, style }: { children: ReactNode; at?: number; style?: React.CSSProperties }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = sp(frame, fps, at);
  return (
    <div style={{ overflow: 'hidden', paddingBottom: '0.06em', ...style }}>
      <div style={{ transform: `translateY(${(1 - s) * 110}%)` }}>{children}</div>
    </div>
  );
}

const heavy = (wght = 860): React.CSSProperties => ({ fontFamily: archivo, fontVariationSettings: `'wght' ${wght}, 'wdth' 100`, letterSpacing: '-0.03em', lineHeight: 0.95, whiteSpace: 'nowrap' });
const BEAT_120 = 30; // one beat at 120 BPM, in frames at 60 fps

/** Three accounts Sift really scored: Pylon (the recording) and two from the agent session. */
const SURVIVORS = [
  { domain: 'usepylon.com', name: 'Pylon', fit: 82, timing: 75, at: [0.22, 0.42] },
  { domain: 'gorgias.com', name: 'Gorgias', fit: 80, timing: 52, at: [0.55, 0.68] },
  { domain: 'helpscout.com', name: 'Help Scout', fit: 78, timing: 57, at: [0.8, 0.3] },
] as const;

/**
 * The home hook. Beat 1-2: a full-bleed wall of about 200 accounts rushes in under "200 accounts.". Beat 2: the wall
 * sifts (almost every tile falls away) while three stay lit and fly forward as cards with their real scores, under
 * "3 worth an email.".
 */
const SIFT_AT = 2 * BEAT_120;
const FLY_AT = SIFT_AT + 26;
export const HOME_HOOK = 210;
function HomeHook() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width, height, u, area } = useLayout();
  const wide = area.width / area.height > 1.3;
  const cell = Math.sqrt((width * height) / 200);
  const cols = Math.round(width / cell);
  const rows = Math.round(height / cell);
  const cw = width / cols;
  const ch = height / rows;
  const survivorIdx = SURVIVORS.map((sv) => Math.round(sv.at[1] * (rows - 1)) * cols + Math.round(sv.at[0] * (cols - 1)));
  // The wall rushes in from the viewer.
  const rush = sp(frame, fps, 0, { stiffness: 120, damping: 18 });
  const wallScale = 1.5 - 0.5 * rush;
  // Card targets.
  const gap = 22 * u;
  const cardW = wide ? Math.min(area.width * 0.28, 470 * u) : (area.width - 2 * gap) / 3;
  const cardH = wide ? cardW * 0.74 : cardW * 1.18;
  const rowW = 3 * cardW + 2 * gap;
  const cardTop = wide ? area.top + area.height * 0.42 : area.top + area.height * 0.46;
  const textA = wide ? ['200 accounts.'] : ['200', 'accounts.'];
  const textB = wide ? ['3 worth an email.'] : ['3 worth', 'an email.'];
  const sizeA = Math.min(230 * u, area.width / (Math.max(...textA.map((t) => t.length)) * 0.64));
  const sizeB = Math.min(wide ? 150 * u : 170 * u, area.width / (Math.max(...textB.map((t) => t.length)) * 0.64));
  const phaseB = frame >= SIFT_AT;
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${wallScale})`, transformOrigin: '50% 50%' }}>
        {Array.from({ length: cols * rows }, (_, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          const keep = survivorIdx.indexOf(i);
          const roll = random(`wall-${i}`);
          const inK = sp(frame, fps, roll * 10);
          // Sifting: each tile falls with gravity from a slightly random start.
          const t0 = SIFT_AT + roll * 18;
          const t = Math.max(0, frame - t0);
          const fall = keep >= 0 ? 0 : 0.09 * t * t * u;
          const spin = keep >= 0 ? 0 : (random(`spin-${i}`) - 0.5) * t * 2.2;
          const fade = keep >= 0 ? 1 : interpolate(t, [10, 34], [1, 0], clamp);
          if (keep >= 0 && frame >= FLY_AT) return null; // drawn as a card below
          const lit = keep >= 0 ? interpolate(frame, [SIFT_AT, SIFT_AT + 10], [0, 1], clamp) : 0;
          const tone = roll < 0.12 ? '#1d4a42' : '#0f2c27';
          return (
            <div key={i} style={{
              position: 'absolute', left: c * cw + cw * 0.07, top: r * ch + ch * 0.07, width: cw * 0.86, height: ch * 0.86, borderRadius: 6 * u,
              background: lit ? MINT : tone, border: `${Math.max(1, u)}px solid rgba(159,242,214,${0.12 + 0.3 * lit})`, boxSizing: 'border-box',
              opacity: Math.min(1, inK * 1.4) * fade, transform: `translateY(${fall}px) rotate(${spin}deg) scale(${0.6 + 0.4 * inK})`,
            }} />
          );
        })}
      </div>
      {/* The survivors fly forward and become cards. */}
      {SURVIVORS.map((sv, k) => {
        if (frame < FLY_AT) return null;
        const idx = survivorIdx[k]!;
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        // Grid position on screen (the wall is scaled about the centre).
        const from = { x: width / 2 + (c * cw + cw * 0.07 - width / 2) * wallScale, y: height / 2 + (r * ch + ch * 0.07 - height / 2) * wallScale, w: cw * 0.86 * wallScale, h: ch * 0.86 * wallScale };
        const to = { x: (width - rowW) / 2 + k * (cardW + gap), y: cardTop, w: cardW, h: cardH };
        const f = sp(frame, fps, FLY_AT + k * 4, { stiffness: 130, damping: 17 });
        const m = (a: number, b: number) => a + (b - a) * f;
        const show = interpolate(f, [0.55, 0.95], [0, 1], clamp);
        const label: React.CSSProperties = { fontFamily: mono, fontSize: (wide ? 18 : 15) * u, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(7,29,26,0.7)', whiteSpace: 'nowrap' };
        const num = (wide ? 92 : 62) * u;
        return (
          <div key={sv.domain} style={{
            position: 'absolute', left: m(from.x, to.x), top: m(from.y, to.y), width: m(from.w, to.w), height: m(from.h, to.h),
            borderRadius: m(6, 16) * u, background: k === 0 ? MINT : CREAM, color: NIGHT, overflow: 'hidden', boxSizing: 'border-box',
            padding: (wide ? 28 : 18) * u, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div style={{ opacity: show }}>
              <div style={label}>{sv.domain}</div>
              <div style={{ ...heavy(720), fontSize: (wide ? 44 : 32) * u, marginTop: 8 * u }}>{sv.name}</div>
            </div>
            <div style={{ display: 'flex', gap: (wide ? 30 : 12) * u, opacity: show, flexDirection: wide ? 'row' : 'column' }}>
              {([['fit', sv.fit], ['timing', sv.timing]] as const).map(([kk, v]) => (
                <div key={kk}>
                  <div style={label}>{kk}</div>
                  <div style={{ ...heavy(), fontSize: num, lineHeight: 1 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {/* Type. A sits low over a scrim; B sits at the top once the wall has gone. */}
      {!phaseB && (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%', background: 'linear-gradient(0deg, rgba(4,19,15,0.96) 30%, rgba(4,19,15,0))' }} />
          <div style={{ position: 'absolute', left: area.left, bottom: height - (area.top + area.height) + 10 * u }}>
            {textA.map((t, i) => <Lift key={t} at={2 + i * 4}><div style={{ ...heavy(), fontSize: sizeA, color: CREAM }}>{t}</div></Lift>)}
          </div>
        </>
      )}
      {phaseB && (
        <div style={{ position: 'absolute', left: area.left, top: area.top + (wide ? 10 : 20) * u }}>
          {textB.map((t, i) => (
            <Lift key={t} at={SIFT_AT + i * 4}>
              <div style={{ ...heavy(), fontSize: sizeB, color: CREAM }}>{i === textB.length - 1 ? <>{t.replace('email.', '')}<span style={{ color: MINT }}>{t.includes('email.') ? 'email.' : ''}</span></> : t}</div>
            </Lift>
          ))}
        </div>
      )}
    </AbsoluteFill>
  );
}

/**
 * The agents hook. Beat 1-3: "Which account first?" typed huge. Then the tool calls slam in as big mono lines.
 * Then the answer on mint: "Gorgias." / "Hiring now."
 */
const CALLS_AT = 84;
const ANSWER_AT = 150;
export const AGENT_HOOK = 210;
function AgentHook() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, area } = useLayout();
  const wide = area.width / area.height > 1.3;
  if (frame < CALLS_AT) {
    const lines = wide ? ['Which account', 'first?'] : ['Which', 'account', 'first?'];
    const size = Math.min(230 * u, area.width / (Math.max(...lines.map((l) => l.length)) * 0.62 + 0.8));
    let left = Math.floor(interpolate(frame, [2, 50], [0, lines.join('').length], clamp));
    const caret = Math.floor(frame / 16) % 2 === 0;
    return (
      <AbsoluteFill style={{ justifyContent: 'center', paddingLeft: area.left, paddingRight: area.left }}>
        <div style={{ fontFamily: mono, fontSize: 26 * u, color: MINT, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 18 * u }}>&gt; you ask your agent</div>
        {lines.map((l, i) => {
          const shown = l.slice(0, Math.max(0, left));
          const last = left > 0 && left <= l.length;
          left -= l.length;
          return (
            <div key={i} style={{ ...heavy(820), fontSize: size, color: CREAM, height: size * 1.0 }}>
              {shown}
              {(last || (i === lines.length - 1 && left >= 0)) && <span style={{ display: 'inline-block', width: size * 0.07, height: size * 0.78, marginLeft: size * 0.04, background: MINT, opacity: caret ? 1 : 0, verticalAlign: '-0.06em' }} />}
            </div>
          );
        })}
      </AbsoluteFill>
    );
  }
  if (frame < ANSWER_AT) {
    const calls: [string, string][] = [['quote(3 companies)', '0 credits'], ['get_icp()', 'your ICP'], ['sift_company ×3', 'cached, free']];
    const size = Math.min(wide ? 92 * u : 64 * u, area.width / (19 * 0.6 + (wide ? 10 * 0.6 : 0)));
    return (
      <AbsoluteFill style={{ justifyContent: 'center', paddingLeft: area.left, paddingRight: area.left, gap: 30 * u }}>
        {calls.map(([c, r], i) => {
          const s = sp(frame, fps, CALLS_AT + i * 8, { stiffness: 260, damping: 20 });
          return (
            <div key={c} style={{ display: 'flex', flexDirection: wide ? 'row' : 'column', justifyContent: 'space-between', alignItems: wide ? 'baseline' : 'flex-start', gap: 8 * u, transform: `translateX(${(1 - s) * -80 * u}px)`, opacity: Math.min(1, s * 1.6) }}>
              <span style={{ fontFamily: mono, fontWeight: 600, fontSize: size, color: MINT, whiteSpace: 'nowrap' }}>● {c}</span>
              <span style={{ fontFamily: mono, fontSize: size * 0.62, color: CREAM, whiteSpace: 'nowrap', paddingLeft: wide ? 0 : size * 0.9 }}>→ {r}</span>
            </div>
          );
        })}
      </AbsoluteFill>
    );
  }
  const big = Math.min(wide ? 300 * u : 250 * u, area.width / (8 * 0.64));
  const small = Math.min(wide ? 170 * u : 150 * u, area.width / (11 * 0.64));
  return (
    <AbsoluteFill style={{ background: MINT, justifyContent: 'center', paddingLeft: area.left, paddingRight: area.left }}>
      <Rise text="Gorgias." size={big} at={ANSWER_AT + 2} color={NIGHT} gap={2} />
      <Lift at={ANSWER_AT + 14}><div style={{ ...heavy(), fontSize: small, color: NIGHT, opacity: 0.78 }}>Hiring now.</div></Lift>
    </AbsoluteFill>
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
      <NameFix t={t} />
    </div>
  );
}

/**
 * After the reveal (11.8 s) the panel shows the contact's full surname. Paint the end of it over with the panel's
 * white and draw the period back, so it reads "Dan G." as before the reveal. Pixels measured on clean.mp4.
 */
function NameFix({ t }: { t: number }) {
  if (t < 11.6 || t > 14.4) return null;
  return (
    <>
      <div style={{ position: 'absolute', left: 2319, top: 1306, width: 40, height: 36, background: '#fcfcfc' }} />
      <div style={{ position: 'absolute', left: 2320, top: 1328, width: 6, height: 5, borderRadius: 2, background: '#1f2322' }} />
    </>
  );
}

/** A tight crop of the real panel only (no page beside it), so its text reads at phone size. */
type PanelKey = [t: number, cy: number];
const PANEL_X = 2204;
const PANEL_W = 712;
function panelY(keys: PanelKey[], t: number) {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1]![0] <= t) i++;
  const [t0, y0] = keys[i]!;
  const [t1, y1] = keys[i + 1] ?? keys[i]!;
  const k = t1 === t0 ? 1 : interpolate(t, [t0, t1], [0, 1], { ...clamp, easing: Easing.bezier(0.45, 0, 0.2, 1) });
  return y0 + (y1 - y0) * k;
}

function PanelCam({ clip, keys, box }: { clip: Clip; keys: PanelKey[]; box: { left: number; top: number; width: number; height: number } }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useLayout();
  const k = sp(frame, fps, 0, { stiffness: 150, damping: 19 });
  const scale = box.width / PANEL_W;
  const h = Math.min(SRC.h, box.height / scale);
  return (
    <div style={{ position: 'absolute', ...areaStyle(box), borderRadius: 16 * u, overflow: 'hidden', background: '#fcfcfc', transform: `translateY(${(1 - k) * 40 * u}px)`, opacity: Math.min(1, k * 1.6) }}>
      <Sequence durationInFrames={clipLen(clip)} layout="none">
        <PanelView clip={clip} keys={keys} scale={scale} h={h} />
      </Sequence>
    </div>
  );
}

function PanelView({ clip, keys, scale, h }: { clip: Clip; keys: PanelKey[]; scale: number; h: number }) {
  const frame = useCurrentFrame();
  const t = clip.from + frame / REEL_FPS;
  const y = Math.min(Math.max(panelY(keys, t) - h / 2, 0), SRC.h - h);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: SRC.w, height: SRC.h, transformOrigin: '0 0', transform: `scale(${scale}) translate(${-PANEL_X}px, ${-y}px)` }}>
      <OffthreadVideo src={staticFile(PYLON.src)} startFrom={Math.round(clip.from * REEL_FPS)} muted style={{ position: 'absolute', left: 0, top: 0, width: SRC.w, height: SRC.h, maxWidth: 'none' }} />
      {PYLON.patches.map((p, i) => <TextPatch key={i} p={p} t={t} />)}
      <NameFix t={t} />
    </div>
  );
}

/** The key fact in big type beside (or above) the real panel. */
function Split({ clip, keys, text }: { clip: Clip; keys: PanelKey[]; text: (box: { w: number; h: number }) => ReactNode }) {
  const { area, u } = useLayout();
  const wide = area.width / area.height > 1.3;
  const textBox = wide ? { left: area.left, top: area.top, width: area.width * 0.53, height: area.height } : { left: area.left, top: area.top, width: area.width, height: area.height * 0.45 };
  const panel = wide
    ? { left: area.left + area.width * 0.57, top: area.top, width: area.width * 0.43, height: area.height }
    : { left: area.left, top: area.top + area.height * 0.48, width: area.width, height: area.height * 0.52 };
  return (
    <>
      <div style={{ position: 'absolute', ...areaStyle(textBox), display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 * u }}>
        {text({ w: textBox.width, h: textBox.height })}
      </div>
      <PanelCam clip={clip} keys={keys} box={panel} />
    </>
  );
}

/** Sizes for a Split's type, from the box it has. */
function useSplitType(box: { w: number; h: number }, bigChars: number) {
  const { u } = useLayout();
  return {
    kicker: Math.min(22 * u, box.h * 0.05),
    big: Math.min(250 * u, box.h * 0.36, box.w / (bigChars * 0.62)),
    row: Math.min(40 * u, box.h * 0.072),
  };
}

function Kicker({ children, size, at = 0 }: { children: ReactNode; size: number; at?: number }) {
  const frame = useCurrentFrame();
  return <div style={{ fontFamily: mono, fontSize: size, letterSpacing: '0.16em', textTransform: 'uppercase', color: MINT, opacity: interpolate(frame, [at, at + 10], [0, 1], clamp), whiteSpace: 'nowrap' }}>{children}</div>;
}

/** Rows that tick in: a mark, a label, and a value on the right. */
function Rows({ rows, size, at }: { rows: [mark: string, label: string, value: string][]; size: number; at: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useLayout();
  return (
    <div style={{ display: 'grid', gap: size * 0.32, marginTop: size * 0.5 }}>
      {rows.map(([mark, label, value], i) => {
        const s = sp(frame, fps, at + i * 7);
        const tick = sp(frame, fps, at + i * 7 + 6, { stiffness: 320, damping: 14 });
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: size * 0.5, opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * 24 * u}px)` }}>
            <span style={{ width: size * 0.8, color: mark === '✓' ? MINT : '#e8b25c', fontFamily: mono, fontSize: size * 0.9, display: 'inline-block', transform: `scale(${tick})` }}>{mark}</span>
            <span style={{ flex: 1, fontFamily: archivo, fontVariationSettings: `'wght' 500, 'wdth' 100`, fontSize: size, color: CREAM, whiteSpace: 'nowrap' }}>{label}</span>
            <span style={{ fontFamily: mono, fontSize: size * 0.8, color: DIM, whiteSpace: 'nowrap' }}>{value}</span>
          </div>
        );
      })}
    </div>
  );
}

function FitText({ box }: { box: { w: number; h: number } }) {
  const z = useSplitType(box, 4);
  return (
    <>
      <Kicker size={z.kicker}>Fit against your ICP</Kicker>
      <Lift at={4}><div style={{ ...heavy(), fontSize: z.big, color: CREAM }}>82%</div></Lift>
      <Lift at={10}><div style={{ ...heavy(760), fontSize: z.row * 1.5, color: MINT }}>Strong fit.</div></Lift>
      <Rows at={22} size={z.row} rows={[['✓', '50–500 employees', '120'], ['✓', 'Based in the US', 'US'], ['✓', 'Series A–C SaaS', '88%'], ['○', 'Large support team', '47%']]} />
    </>
  );
}

function WhyText({ box }: { box: { w: number; h: number } }) {
  const z = useSplitType(box, 11);
  return (
    <>
      <Kicker size={z.kicker}>Why now · timing 75 · hot</Kicker>
      <Lift at={4}><div style={{ ...heavy(), fontSize: z.big, color: CREAM }}>Hiring <span style={{ color: MINT }}>now.</span></div></Lift>
      <Rows at={20} size={z.row} rows={[['✓', '4 relevant roles open', '84%'], ['✓', '19 open roles, 4 this month', '62%'], ['✓', 'Headcount +49% in 6 months', '57%']]} />
    </>
  );
}

/** The reveal lands at 11.8 s in the recording; the Who clip starts at 10.2 s. */
const REVEAL_AT = Math.round((11.8 - 10.2) * REEL_FPS);
function WhoText({ box }: { box: { w: number; h: number } }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const z = useSplitType(box, 6);
  const r = sp(frame, fps, REVEAL_AT);
  return (
    <>
      <Kicker size={z.kicker}>Who to email · best of 12</Kicker>
      <Lift at={4}><div style={{ ...heavy(), fontSize: z.big, color: CREAM }}>Dan G.</div></Lift>
      <Lift at={12}><div style={{ fontFamily: archivo, fontVariationSettings: `'wght' 500, 'wdth' 100`, fontSize: z.row * 1.15, color: '#dcebe7' }}>Head of Customer Success</div></Lift>
      <div style={{ marginTop: z.row * 0.6, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: `${z.row * 0.3}px ${z.row * 0.7}px`, opacity: Math.min(1, r * 1.4), transform: `translateY(${(1 - r) * 24}px)` }}>
        <span style={{ fontFamily: mono, fontSize: z.row * 0.95, color: MINT, whiteSpace: 'nowrap' }}>dan@usepylon.example</span>
        <span style={{ fontFamily: mono, fontSize: z.row * 0.7, color: DIM, whiteSpace: 'nowrap', letterSpacing: '0.1em', textTransform: 'uppercase' }}>verified · 1 credit</span>
      </div>
    </>
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

/** A numbered list that fills the frame and staggers in, values in mint on the right. */
function List({ title, rows, after }: { title: string; rows: [string, string][]; after?: ReactNode }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, area } = useLayout();
  const wide = area.width / area.height > 1.3;
  const share = after ? (wide ? 0.6 : 0.62) : 0.84;
  const perRow = (area.height * share) / rows.length;
  const longest = Math.max(...rows.map(([l, v]) => l.length + v.length * (wide ? 0.9 : 0)));
  const longestV = Math.max(...rows.map(([, v]) => v.length));
  const size = Math.min(perRow * 0.46, wide ? area.width / (longest * 0.6 + 3) : area.width / (Math.max(...rows.map(([l]) => l.length)) * 0.6 + 2), 120 * u);
  const vSize = wide ? size * 0.82 : Math.min(size * 0.7, area.width / (longestV * 0.62 + 2));
  return (
    <div style={{ position: 'absolute', ...areaStyle(area), display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ fontFamily: mono, fontSize: 20 * u, letterSpacing: '0.18em', color: MINT, textTransform: 'uppercase', marginBottom: 14 * u, opacity: interpolate(frame, [0, 12], [0, 1], clamp) }}>{title}</div>
      {rows.map(([label, value], i) => {
        const s = sp(frame, fps, 6 + i * 8);
        const line = interpolate(frame, [6 + i * 8, 30 + i * 8], [0, 100], { ...clamp, easing: Easing.out(Easing.cubic) });
        return (
          <div key={label} style={{ position: 'relative', display: 'flex', flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'baseline' : 'flex-start', justifyContent: 'space-between', gap: wide ? 24 * u : 2 * u, padding: `${perRow * (wide ? 0.16 : 0.1)}px 0`, opacity: Math.min(1, s * 1.3), transform: `translateY(${(1 - s) * 40 * u}px)` }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 22 * u }}>
              <span style={{ fontFamily: mono, fontSize: 18 * u, color: DIM }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ ...heavy(780), fontSize: size, color: CREAM }}>{label}</span>
            </span>
            <span style={{ ...heavy(620), fontSize: vSize, color: MINT, paddingLeft: wide ? 0 : 40 * u }}>{value}</span>
            <span style={{ position: 'absolute', left: 0, bottom: 0, height: Math.max(1, 1.5 * u), width: `${line}%`, background: 'rgba(239,236,228,0.16)' }} />
          </div>
        );
      })}
      {after && <div style={{ marginTop: 26 * u, opacity: interpolate(frame, [50, 70], [0, 1], clamp), transform: `translateY(${interpolate(frame, [50, 70], [16, 0], clamp)}px)` }}>{after}</div>}
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
/** Shorter result lines for the reel (same facts as the session's summaries), so the calls can be set large. */
const reelResult = (s: (typeof steps)[number]) =>
  s.tool === 'get_icp' ? 'Series A–C SaaS · US · 50–500 people' : resultLine(s).replace(/ strong| partial| weak/g, '');

function Terminal() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, area, width, height } = useLayout();
  const wide = width > 1200;
  const tall = height > width;
  const typed = REQUEST.slice(0, Math.floor(interpolate(frame, [6, TYPE_END], [0, REQUEST.length], clamp)));
  const k = sp(frame, fps, 0, { stiffness: 140, damping: 20 });
  // The camera: the request fills the panel while it is typed, then folds to one dim line and the calls take the room.
  const fold = sp(frame, fps, TOOLS_AT - 14, { stiffness: 120, damping: 22 });
  const askSize = (wide ? 74 : tall ? 64 : 56) * u;
  const callSize = (wide ? 45 : tall ? 42 : 36) * u;
  const inner = area.width - 64 * u;
  return (
    <div style={{ position: 'absolute', ...areaStyle(area), background: PANEL, borderRadius: 14 * u, border: '1px solid rgba(159,242,214,0.16)', padding: `${26 * u}px ${32 * u}px`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 18 * u, overflow: 'hidden', transform: `scale(${0.965 + 0.035 * k})`, opacity: Math.min(1, k * 1.6) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 20 * u, color: DIM }}>
        <span>claude code · mcp: sift</span>
        <span style={{ color: MINT }}>● connected</span>
      </div>
      <div style={{ position: 'relative', flex: 1 }}>
        {/* the ask, large */}
        {fold < 0.99 && (
          <div style={{ position: 'absolute', inset: 0, fontFamily: archivo, fontVariationSettings: `'wght' 450, 'wdth' 100`, fontSize: askSize, color: CREAM, lineHeight: 1.3, letterSpacing: '-0.01em', opacity: 1 - fold, transform: `translateY(${-fold * 40 * u}px) scale(${1 - fold * 0.06})`, transformOrigin: 'top left' }}>
            <span style={{ fontFamily: mono, color: MINT }}>&gt; </span>
            {typed}
            {frame < TYPE_END + 8 && <span style={{ opacity: Math.floor(frame / 16) % 2 ? 0 : 1 }}>▍</span>}
          </div>
        )}
        {/* the ask, folded, and the calls, large */}
        {fold > 0.01 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 22 * u, opacity: fold }}>
            <div style={{ flexShrink: 0, fontFamily: mono, fontSize: 22 * u, color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: inner }}>
              <span style={{ color: MINT }}>&gt; </span>{REQUEST}
            </div>
            <div style={{ display: 'grid', gap: (tall ? 30 : wide ? 12 : 16) * u, alignContent: 'start', paddingTop: tall ? 110 * u : 0 }}>
              {steps.map((s, i) => {
                const at = TOOLS_AT + i * TOOL_GAP;
                if (frame < at) return null;
                const t = sp(frame, fps, at);
                return (
                  <div key={i} style={{ opacity: Math.min(1, t * 1.4), transform: `translateX(${(1 - t) * 30 * u}px)`, fontFamily: mono, fontSize: callSize, lineHeight: 1.28, whiteSpace: 'nowrap' }}>
                    <span style={{ color: MINT }}>⏺ {toolLine(s)}</span>
                    <div style={{ color: '#a9c2bd', paddingLeft: callSize * 0.9, fontSize: callSize * (tall ? 0.82 : 0.86) }}>⎿ {reelResult(s)}</div>
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

const split = (clip: Clip, keys: PanelKey[], text: (box: { w: number; h: number }) => ReactNode, hud: Hud): Scene => ({
  len: clipLen(clip),
  render: () => <Split clip={clip} keys={keys} text={text} />,
  hud: () => hud,
});

const HOME: Scene[] = [
  {
    len: HOME_HOOK,
    render: () => <HomeHook />,
    hud: (l) => (l < SIFT_AT
      ? { chapter: '01 / Your list', specL: '200 accounts · one ICP', specR: 'Fit · timing · who' }
      : { chapter: '01 / Sifted', cue: 'sifted', specL: 'Pylon 82/75 · Gorgias 80/52 · Help Scout 78/57', specR: 'fit / timing' }),
  },
  footage([{ from: 1.0, to: 3.85 }], [
    { from: 0, to: 99, chapter: '02 / One click', caption: <>One click on {em('their')} homepage.</>, specL: 'usepylon.com · real recording', specR: 'Sift side panel' },
  ]),
  split({ from: 4.75, to: 7.4 }, [[4.75, 700], [5.4, 700], [6.4, 860], [7.4, 860]], (box) => <FitText box={box} />,
    { chapter: '03 / Fit', specL: 'usepylon.com · real recording', specR: '3 of 4 met · 1 unsure' }),
  split({ from: 7.9, to: 10.2 }, [[7.9, 900], [8.9, 650], [9.5, 650], [10.2, 780]], (box) => <WhyText box={box} />,
    { chapter: '04 / Why now', specL: 'Timing 75 · hot', specR: 'From their site and hiring' }),
  split({ from: 10.2, to: 14.0 }, [[10.2, 1300], [14.0, 1370]], (box) => <WhoText box={box} />,
    { chapter: '05 / Who', specL: 'Best contact · email verified', specR: '1 credit, only when found' }),
  {
    len: 220,
    wipe: true,
    render: () => <List title="What Sift tells you · usepylon.com" rows={[['Fit', '82%'], ['Why now', 'timing 75'], ['Who', 'Dan G., verified'], ['Cost', '3 credits']]} />,
    hud: () => ({ chapter: '06 / The answer', specL: 'One lookup · one page', specR: '2 credits + 1 per email' }),
  },
  {
    len: 200,
    wipe: true,
    render: () => <Outro sub="Free · open source · sift-through.vercel.app">Sift through companies.<br />{em('Talk to the right ones.')}</Outro>,
    hud: () => ({ chapter: '07 / Install', specL: 'Chrome extension', specR: 'Bring your own keys' }),
  },
];

const AGENTS: Scene[] = [
  {
    len: AGENT_HOOK,
    render: () => <AgentHook />,
    hud: (l) => (l < CALLS_AT
      ? { chapter: '01 / The ask', specL: 'sift-gtm · MCP server', specR: '7 tools' }
      : l < ANSWER_AT
        ? { chapter: '01 / Tool calls', cue: 'calls', specL: 'quote · 3 companies · 0 credits', specR: 'Real session' }
        : { chapter: '01 / The answer', cue: 'answer', dark: true, specL: 'Gorgias first · 8 roles posted in 30 days', specR: 'fit 80 · timing 52' }),
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
