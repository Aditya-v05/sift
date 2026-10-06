import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { FORMATS, SRC, box, type Format } from './Demo';

/*
 * Cover image for the social posts: no text, just the product. One still of the recording at 6.6 s
 * (public/thumb-frame.png, extracted with ffmpeg; see README.md): Pylon at 82% strong fit with why now,
 * before any contact or email is on screen. A still image rather than a video seek, so the frame is exact.
 */

export function Thumb({ format }: { format: Format['id'] }) {
  const f = FORMATS.find((x) => x.id === format)!;
  const cam = box(f.panel[0], 760, f.panel[1], f.width / f.height);
  const scale = f.width / cam.w;
  return (
    <AbsoluteFill style={{ backgroundColor: '#071d1a', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute', left: 0, top: 0, width: SRC.w, height: SRC.h,
          transformOrigin: '0 0', transform: `scale(${scale}) translate(${-cam.x}px, ${-cam.y}px)`,
        }}
      >
        <Img src={staticFile('thumb-frame.png')} style={{ width: SRC.w, height: SRC.h, maxWidth: 'none' }} />
      </div>
    </AbsoluteFill>
  );
}
