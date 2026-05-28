import React from 'react';
import { G, Circle, Text as SvgText } from 'react-native-svg';
import { color } from '../theme/tokens';
import type { Peer } from '../mesh/types';

interface Props {
  peer: Peer;
  cx: number;
  cy: number;
}

export function MapMarker({ peer, cx, cy }: Props): React.JSX.Element {
  if (peer.sos) {
    return (
      <G>
        <Circle cx={cx} cy={cy} r={18} fill="rgba(255,68,56,0.18)" />
        <Circle cx={cx} cy={cy} r={10} fill={color.sos} stroke="#1A0807" strokeWidth={1.5} />
        <SvgText
          x={cx}
          y={cy + 4}
          fill="#1A0807"
          fontSize={12}
          fontWeight="900"
          textAnchor="middle"
        >
          !
        </SvgText>
      </G>
    );
  }

  const tint = peer.platform === 'android' ? color.android : color.ios;
  return (
    <G>
      <Circle cx={cx} cy={cy} r={14} fill="rgba(0,0,0,0.45)" />
      <Circle cx={cx} cy={cy} r={8} fill={tint} stroke={color.bg} strokeWidth={1.5} />
      <SvgText
        x={cx}
        y={cy + 22}
        fill={color.tx2}
        fontSize={9}
        textAnchor="middle"
        fontFamily="monospace"
      >
        {`#${peer.senderId}`}
      </SvgText>
    </G>
  );
}
