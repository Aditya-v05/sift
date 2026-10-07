import React from 'react';
import { Composition, Still } from 'remotion';
import { Demo, FORMATS, TREG, timeline } from './Demo';
import { Thumb } from './Thumb';
import { AgentDemo, agentTotal } from './AgentDemo';

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
    {/* The sift-gtm launch (a real agent session): the three feed formats. */}
    {FORMATS.filter((f) => f.social).map((f) => (
      <Composition key={`Agent${f.id}`} id={`Agent${f.id.replace('SiftSocial', '')}`} component={AgentDemo} durationInFrames={agentTotal} fps={30} width={f.width} height={f.height} defaultProps={{ format: f.id }} />
    ))}
    {/* The treg co-marketing post: the three feed formats. */}
    {FORMATS.filter((f) => f.social).map((f) => (
      <Composition
        key={`Treg${f.id}`}
        id={`Treg${f.id.replace('SiftSocial', '')}`}
        component={Demo}
        durationInFrames={timeline(f, TREG).total}
        fps={30}
        width={f.width}
        height={f.height}
        defaultProps={{ format: f.id, story: 'treg' as const }}
      />
    ))}
    {FORMATS.filter((f) => f.social).map((f) => (
      <React.Fragment key={`${f.id}Thumb`}>
        <Still id={`${f.id}Thumb`} component={Thumb} width={f.width} height={f.height} defaultProps={{ format: f.id }} />
        <Still id={`Treg${f.id.replace('SiftSocial', '')}Thumb`} component={Thumb} width={f.width} height={f.height} defaultProps={{ format: f.id, story: 'treg' as const }} />
      </React.Fragment>
    ))}
  </>
);
