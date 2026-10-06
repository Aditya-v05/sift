import React from 'react';
import { Composition, Still } from 'remotion';
import { Demo, FORMATS, timeline } from './Demo';
import { Thumb } from './Thumb';

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
    {FORMATS.filter((f) => f.social).map((f) => (
      <Still key={`${f.id}Thumb`} id={`${f.id}Thumb`} component={Thumb} width={f.width} height={f.height} defaultProps={{ format: f.id }} />
    ))}
  </>
);
