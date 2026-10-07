import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as loadSans } from '@remotion/google-fonts/SchibstedGrotesk';
import { loadFont as loadSerif } from '@remotion/google-fonts/InstrumentSerif';
import React, { type ReactNode } from 'react';
import { AbsoluteFill, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import session from '../../site/agent-session.json';
import { FORMATS, type Format } from './Demo';

/*
 * The sift-gtm launch video: a real agent session (site/agent-session.json, recorded with Claude Code and only
 * Sift's MCP server connected), replayed as a terminal. The tool calls and their results are the real ones;
 * the request and the answer are shortened for the screen, never reworded.
 */

const { fontFamily: serif } = loadSerif('normal', { weights: ['400'], subsets: ['latin'] });
loadSerif('italic', { weights: ['400'], subsets: ['latin'] });
const { fontFamily: mono } = loadMono('normal', { weights: ['400', '600'], subsets: ['latin'] });
const { fontFamily: sans } = loadSans('normal', { weights: ['400', '600'], subsets: ['latin'] });

const FPS = 30;
const NIGHT = '#071d1a';
const PANEL = '#0b2420';
const CREAM = '#efece4';
const MINT = '#9ff2d6';
const DIM = '#7f9a97';

type Step = { tool: string; input: Record<string, unknown>; summary: string } | { say: string };
const steps = (session.steps as Step[]).filter((s): s is Extract<Step, { tool: string }> => 'tool' in s);

// The request, shortened for the screen (the full one is on the website).
const REQUEST = 'Here are three accounts: gorgias.com, kustomer.com and helpscout.com. Which should I go after first, why now, and who should I email? Price it first, and don’t reveal any emails yet.';
// From the agent's real answer.
const RANKING = ['Gorgias: fit 80, timing 52', 'Help Scout: fit 78, timing 57', 'Kustomer: fit 83, timing 44'];
const WHY = '12 open roles, 8 posted in the last 30 days: its customer-facing team is growing now.';
const WHO = 'Email Aleksandra P., Director of Support (rank 69).';

const toolLine = (s: Extract<Step, { tool: string }>) => {
  if (s.tool === 'sift_company') return `sift_company("${s.input.domain as string}")`;
  if (s.tool === 'quote') return 'quote(3 domains)';
  return `${s.tool}()`;
};
const resultLine = (s: Extract<Step, { tool: string }>) => {
  if (s.tool === 'sift_company') return s.summary.replace(/ · top contact.*/, '').replace(/ · cached, free/, '');
  if (s.tool === 'get_icp') return 'Series A–C SaaS, 50–500 people, US, large support teams';
  return s.summary;
};

// ---------- timing (frames) ----------

const T = {
  intro: 66,
  request: 110, // typing the request
  toolsGap: 22, // between tool calls
  answerHold: 150,
  outro: 120,
};
const toolsStart = T.request + 14;
const toolsEnd = toolsStart + steps.length * T.toolsGap + 16;
const sceneLen = toolsEnd + T.answerHold;
export const agentTotal = T.intro - 10 + sceneLen + T.outro - 10;

// ---------- pieces ----------

const ease = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

function Card({ f, kicker, children, sub }: { f: Format; kicker?: string; children: ReactNode; sub?: ReactNode }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const k = ease(frame, 0, 14);
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' });
  const { size, mark } = f.card;
  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT, alignItems: 'center', justifyContent: 'center', textAlign: 'center', opacity: out, padding: 80 }}>
      <div style={{ opacity: k, transform: `translateY(${(1 - k) * 16}px)`, display: 'grid', justifyItems: 'center', gap: size * 0.34 }}>
        <Img src={staticFile('icon.png')} style={{ width: mark, height: mark, borderRadius: mark / 4 }} />
        {kicker && <div style={{ fontFamily: mono, color: MINT, fontSize: size * 0.27 }}>{kicker}</div>}
        <div style={{ fontFamily: serif, color: CREAM, fontSize: size, lineHeight: 1.02, letterSpacing: '-0.02em' }}>{children}</div>
        {sub && <div style={{ fontFamily: mono, color: DIM, fontSize: size * 0.27, lineHeight: 1.6 }}>{sub}</div>}
      </div>
    </AbsoluteFill>
  );
}

function Session({ f }: { f: Format }) {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const u = Math.min(width, height * 1.25) / 1080; // scale unit
  const fade = Math.min(ease(frame, 0, 10), interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' }));
  const typed = REQUEST.slice(0, Math.floor(interpolate(frame, [6, T.request], [0, REQUEST.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })));
  const caption =
    frame < toolsStart ? 'You ask, in plain words.'
      : frame < toolsEnd ? 'It prices first. Cached, so $0.'
        : 'It answers with evidence, not vibes.';
  const capKey = frame < toolsStart ? 0 : frame < toolsEnd ? 1 : 2;
  const capIn = ease(frame, [0, toolsStart, toolsEnd][capKey]!, [0, toolsStart, toolsEnd][capKey]! + 12);
  const pad = 54 * u;
  const fs = 34 * u;

  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT, opacity: fade, padding: pad, display: 'flex', flexDirection: 'column', gap: 26 * u }}>
      <div style={{ flex: 1, background: PANEL, borderRadius: 22 * u, border: '1px solid rgba(159,242,214,0.14)', padding: `${30 * u}px ${36 * u}px`, display: 'flex', flexDirection: 'column', gap: 22 * u, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 22 * u, color: DIM }}>
          <span>claude code · mcp: sift</span>
          <span style={{ color: MINT }}>● connected</span>
        </div>
        {/* the request and the tool calls, folded away when the answer arrives */}
        {frame < toolsEnd + 8 && <div style={{ display: 'flex', flexDirection: 'column', gap: 22 * u, opacity: 1 - ease(frame, toolsEnd, toolsEnd + 8) }}>
        <div style={{ fontFamily: sans, fontSize: fs * 1.08, color: CREAM, lineHeight: 1.45 }}>
          <span style={{ fontFamily: mono, color: MINT }}>&gt; </span>
          {typed}
          {frame < T.request + 6 && <span style={{ opacity: Math.floor(frame / 8) % 2 ? 0 : 1 }}>▍</span>}
        </div>
        {/* the tool calls */}
        <div style={{ display: 'grid', gap: 16 * u }}>
          {steps.map((s, i) => {
            const at = toolsStart + i * T.toolsGap;
            const k = ease(frame, at, at + 10);
            if (frame < at) return null;
            return (
              <div key={i} style={{ opacity: k, transform: `translateX(${(1 - k) * 12}px)`, fontFamily: mono, fontSize: fs * 0.82, lineHeight: 1.4 }}>
                <span style={{ color: MINT }}>⏺ {toolLine(s)}</span>
                <div style={{ color: DIM, paddingLeft: 26 * u }}>⎿ {resultLine(s)}</div>
              </div>
            );
          })}
        </div>
        </div>}
        {/* the answer */}
        {frame >= toolsEnd + 8 && (
          <div style={{ opacity: ease(frame, toolsEnd + 8, toolsEnd + 20), fontFamily: sans, fontSize: fs * 1.12, color: CREAM, lineHeight: 1.45 }}>
            <div style={{ fontFamily: mono, fontSize: fs * 0.78, color: DIM, marginBottom: 18 * u }}>
              <span style={{ color: MINT }}>⏺</span> {steps.length} Sift calls · quote first · <span style={{ color: MINT }}>0 credits spent</span>
            </div>
            {RANKING.map((r, i) => (
              <div key={r} style={{ opacity: ease(frame, toolsEnd + 6 + i * 8, toolsEnd + 16 + i * 8) }}>
                <span style={{ fontFamily: mono, color: i === 0 ? MINT : DIM }}>{i + 1}. </span>
                <span style={{ fontWeight: i === 0 ? 600 : 400 }}>{r}</span>
              </div>
            ))}
            <div style={{ marginTop: 12 * u, opacity: ease(frame, toolsEnd + 40, toolsEnd + 56), color: '#dcebe7' }}>
              <b style={{ color: MINT, fontWeight: 600 }}>Gorgias first:</b> {WHY} {WHO}
            </div>
          </div>
        )}
      </div>
      {/* caption band */}
      <div style={{ height: f.band * 0.62, display: 'flex', alignItems: 'center', fontFamily: serif, color: CREAM, fontSize: f.caption.size * 0.92, letterSpacing: '-0.02em', opacity: capIn, transform: `translateY(${(1 - capIn) * 12}px)` }}>
        {caption}
      </div>
    </AbsoluteFill>
  );
}

function Progress() {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  return <div style={{ position: 'absolute', left: 0, bottom: 0, height: 6, width: (width * frame) / (durationInFrames - 1), background: MINT, opacity: 0.85 }} />;
}

export function AgentDemo({ format }: { format: Format['id'] }) {
  const f = FORMATS.find((x) => x.id === format)!;
  const s1 = T.intro - 10;
  const s2 = s1 + sceneLen - 10;
  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT }}>
      <Sequence durationInFrames={T.intro}>
        <Card f={f} kicker="sift-gtm · MCP server">Give your agent <em style={{ color: MINT }}>Sift.</em></Card>
      </Sequence>
      <Sequence from={s1} durationInFrames={sceneLen}>
        <Session f={f} />
      </Sequence>
      <Sequence from={s2} durationInFrames={T.outro}>
        <Card f={f} kicker="npx sift-gtm mcp" sub={<>Fit · why now · who to email, as tools<br />sift-through.vercel.app/agents</>}>
          Your agent, <em style={{ color: MINT }}>qualifying accounts.</em>
        </Card>
      </Sequence>
      <Progress />
    </AbsoluteFill>
  );
}

export const AGENT_FPS = FPS;
