import React from 'react';

const STACK_COLORS: Record<string, string> = {
  node:   '#4A90B8',
  python: '#F5C800',
  golang: '#1eaedb',
  rust:   '#C4A000',
  static: '#9aa7b5',
  skill:  '#2E6A8E',
  dotnet: '#7B4FD8',
  java:   '#E05A2B',
  mixed:  '#6b6b6b',
  other:  '#6b6b6b',
};

const BUILDING_DEFS: Record<string, {
  h: number;
  awning: boolean;
  door: 'narrow' | 'wide' | 'none';
  winRows: number[][];
  winY: number[];
  counter?: boolean;
  star?: boolean;
}> = {
  node:   { h: 46, awning: true,  door: 'narrow', winRows: [[10, 30], [10, 30]],            winY: [22, 36] },
  python: { h: 38, awning: false, door: 'narrow', winRows: [[10, 30]],                       winY: [22] },
  golang: { h: 62, awning: false, door: 'narrow', winRows: [[10, 30], [10, 30], [10, 30]],  winY: [22, 36, 50] },
  rust:   { h: 34, awning: false, door: 'wide',   winRows: [[34]],                           winY: [20] },
  static: { h: 28, awning: true,  door: 'none',   winRows: [[8]],                            winY: [4],  counter: true },
  skill:  { h: 34, awning: false, door: 'narrow', winRows: [[30]],                           winY: [20], star: true },
  dotnet: { h: 40, awning: false, door: 'narrow', winRows: [[10, 30]],                       winY: [22] },
  java:   { h: 42, awning: false, door: 'narrow', winRows: [[10, 30], [10, 30]],             winY: [20, 34] },
  other:  { h: 36, awning: false, door: 'narrow', winRows: [[10, 30]],                       winY: [22] },
};

interface Props {
  stack: string;
  status: string;
}

export function IsometricBuilding({ stack, status }: Props) {
  const def = BUILDING_DEFS[stack] || BUILDING_DEFS.other;
  const sc  = STACK_COLORS[stack]  || STACK_COLORS.other;
  const h   = def.h;
  const lit = status !== 'idle';

  const winColor = status === 'unhealthy' ? '#c81b3a' : '#F5C800';
  const winGlow  = status === 'unhealthy' ? 'rgba(200,27,58,0.9)' : 'rgba(245,200,0,0.95)';

  let winAnim = '';
  if (lit) {
    if      (status === 'running')   winAnim = 'st-window-glow 3s ease infinite';
    else if (status === 'slow')      winAnim = 'st-window-flicker 2.2s linear infinite';
    else if (status === 'unhealthy') winAnim = 'st-window-alarm 0.8s ease infinite';
  }

  const winLit: React.CSSProperties = {
    background: winColor,
    boxShadow: `0 0 8px ${winGlow}, 0 0 3px ${winGlow}`,
    ...(winAnim ? { animation: winAnim } : {}),
  };
  const winOff: React.CSSProperties = {
    background: '#ccd3dc',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
  };

  const deco: React.ReactNode[] = [];

  if (def.door === 'narrow') {
    deco.push(<div key="door" style={{ position:'absolute', left:19, top:0, width:14, height:15, background:'#3a4149', borderRadius:2 }} />);
  } else if (def.door === 'wide') {
    deco.push(<div key="door" style={{ position:'absolute', left:8,  top:0, width:24, height:14, background:'#3a4149', borderRadius:2, borderTop:'2px solid rgba(255,255,255,0.4)' }} />);
  }

  def.winRows.forEach((row, r) => {
    row.forEach((x, wi) => {
      deco.push(
        <div key={`w-${r}-${wi}`} style={{
          position: 'absolute', left: x, top: def.winY[r],
          width: def.counter ? 36 : 12, height: 9, borderRadius: 1.5,
          ...(lit ? winLit : winOff),
        }} />
      );
    });
  });

  if (def.awning) {
    deco.push(
      <div key="awning" style={{
        position:'absolute', left:-2, top: h - 8, width:56, height:8,
        background: `repeating-linear-gradient(90deg, #ffffff 0 6px, ${sc} 6px 12px)`,
        borderRadius:2, boxShadow:'0 1px 2px rgba(0,0,0,0.15)',
      }} />
    );
  }

  if (def.star) {
    deco.push(
      <div key="star" style={{
        position:'absolute', left:0, top: h - 22, width:52,
        textAlign:'center', color:'#F5C800', fontSize:13, lineHeight:'1',
        textShadow:'0 0 6px rgba(245,200,0,0.8)',
      }}>◆</div>
    );
  }

  return (
    <div style={{ width:132, height:138, flexShrink:0, position:'relative' }}>
      <div style={{
        position:'absolute', left:24, top:42, width:84, height:84,
        transformStyle:'preserve-3d', transform:'rotateX(55deg) rotateZ(-45deg)',
      }}>
        {/* Base plinth */}
        <div style={{ position:'absolute', left:-4, top:-4, width:92, height:92, transform:'translateZ(10px)', background:'#eef1f6', borderRadius:8 }} />
        <div style={{ position:'absolute', left:-4, top:88,  width:92, height:10, transformOrigin:'top',  transform:'rotateX(90deg)',  background:'#d5dbe3' }} />
        <div style={{ position:'absolute', left:-4, top:-4,  width:10, height:92, transformOrigin:'left', transform:'rotateY(-90deg)', background:'#c3cad4' }} />

        {/* Roof */}
        <div style={{
          position:'absolute', left:16, top:16, width:52, height:52,
          transform:`translateZ(${10 + h}px)`,
          background:`linear-gradient(rgba(255,255,255,0.5),rgba(255,255,255,0.38)),linear-gradient(${sc},${sc})`,
          borderRadius:3,
        }} />

        {/* Front face */}
        <div style={{
          position:'absolute', left:16, top:68, width:52, height:h,
          transformOrigin:'top', transform:'translateZ(10px) rotateX(90deg)',
          background:`linear-gradient(rgba(255,255,255,0.22),rgba(255,255,255,0.22)),linear-gradient(${sc},${sc})`,
        }}>
          {deco}
        </div>

        {/* Right face */}
        <div style={{
          position:'absolute', left:16, top:16, width:h, height:52,
          transformOrigin:'left', transform:'translateZ(10px) rotateY(-90deg)',
          background:`linear-gradient(rgba(0,0,0,0.22),rgba(0,0,0,0.22)),linear-gradient(${sc},${sc})`,
        }} />
      </div>
    </div>
  );
}
