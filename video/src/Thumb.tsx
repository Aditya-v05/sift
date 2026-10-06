import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { FORMATS, SRC, STORIES, TextPatch, box, type Format, type StoryId } from './Demo';

/*
 * Cover image for the social posts: no text, just the product. One still of the recording at 6.6 s
 * (public/thumb-frame.png, extracted with ffmpeg; see README.md): Pylon at 82% strong fit with why now,
 * before any contact or email is on screen. A still image rather than a video seek, so the frame is exact.
 * The treg story's cover is treg-thumb-frame.png (treg.mp4 at 15.5 s: Browserbase at 81% with its checks), with
 * that story's text patches applied at the same moment, so its corrected label shows too.
 */

const FRAMES: Record<StoryId, { src: string; t: number; cy: number }> = {
  pylon: { src: 'thumb-frame.png', t: 6.6, cy: 760 },
  treg: { src: 'treg-thumb-frame.png', t: 15.5, cy: 820 },
};

export function Thumb({ format, story = 'pylon' }: { format: Format['id']; story?: StoryId }) {
  const f = FORMATS.find((x) => x.id === format)!;
  const fr = FRAMES[story];
  const cam = box(f.panel[0], fr.cy, f.panel[1], f.width / f.height);
  const scale = f.width / cam.w;
  return (
    <AbsoluteFill style={{ backgroundColor: '#071d1a', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute', left: 0, top: 0, width: SRC.w, height: SRC.h,
          transformOrigin: '0 0', transform: `scale(${scale}) translate(${-cam.x}px, ${-cam.y}px)`,
        }}
      >
        <Img src={staticFile(fr.src)} style={{ width: SRC.w, height: SRC.h, maxWidth: 'none' }} />
        {STORIES[story].patches.map((p, i) => <TextPatch key={i} p={p} t={fr.t} />)}
      </div>
    </AbsoluteFill>
  );
}
