import React from 'react';
import { Composition } from 'remotion';
import { Demo, FORMATS, timeline } from './Demo';

export const Root = () => (
  <>
    {FORMATS.map((f) => (
      <Composition
        key={f.id}
        id={f.id}
        component={Demo}
        durationInFrames={timeline(f).total}
        fps={30}
        width={f.width}
        height={f.height}
        defaultProps={{ format: f.id }}
      />
    ))}
  </>
);
