/** Rulers in mm or inches along the canvas edges, zero at the page's top-left (note 01). */
import type { Unit } from '@/core/units';
import { MM_PER_IN, PT_PER_IN } from '@/core/units';

import type { View } from '../state/store';
import { OVERLAY } from './overlayPaint';

interface Props {
  readonly axis: 'x' | 'y';
  readonly view: View;
  readonly length: number;
  readonly units: Unit;
}

/** Minor tick spacing in the unit, and how many minors per labelled major. */
function steps(units: Unit, pxPerUnit: number): { minor: number; per: number } {
  const candidates =
    units === 'in'
      ? [
          { minor: 1 / 16, per: 16 },
          { minor: 1 / 8, per: 8 },
          { minor: 1 / 4, per: 4 },
          { minor: 1 / 2, per: 2 },
          { minor: 1, per: 1 },
          { minor: 2, per: 5 },
        ]
      : [
          { minor: 1, per: 10 },
          { minor: 2, per: 5 },
          { minor: 5, per: 2 },
          { minor: 10, per: 5 },
          { minor: 20, per: 5 },
          { minor: 50, per: 2 },
        ];
  return (
    candidates.find((c) => c.minor * pxPerUnit >= 5) ??
    candidates[candidates.length - 1] ?? { minor: 10, per: 5 }
  );
}

export function Ruler({ axis, view, length, units }: Props) {
  const ptPerUnit = units === 'in' ? PT_PER_IN : units === 'mm' ? PT_PER_IN / MM_PER_IN : 1;
  const pxPerUnit = ptPerUnit * view.zoom;
  const origin = axis === 'x' ? view.x : view.y;
  const { minor, per } = steps(units, pxPerUnit);
  const first = Math.floor(-origin / pxPerUnit / minor);
  const last = Math.ceil((length - origin) / pxPerUnit / minor);
  const ticks: React.ReactNode[] = [];
  for (let i = first; i <= last && ticks.length < 2000; i += 1) {
    const pos = origin + i * minor * pxPerUnit;
    const major = i % per === 0;
    const size = major ? 10 : 4;
    ticks.push(
      axis === 'x' ? (
        <line
          key={i}
          x1={pos}
          x2={pos}
          y1={20 - size}
          y2={20}
          style={{ stroke: OVERLAY.rulerTick }}
        />
      ) : (
        <line
          key={i}
          y1={pos}
          y2={pos}
          x1={20 - size}
          x2={20}
          style={{ stroke: OVERLAY.rulerTick }}
        />
      ),
    );
    if (major) {
      const label = String(Math.round(i * minor * 100) / 100);
      ticks.push(
        axis === 'x' ? (
          <text
            key={`t${String(i)}`}
            x={pos + 2}
            y={9}
            fontSize={9}
            style={{ fill: OVERLAY.rulerText }}
          >
            {label}
          </text>
        ) : (
          <text
            key={`t${String(i)}`}
            x={9}
            y={pos + 2}
            fontSize={9}
            style={{ fill: OVERLAY.rulerText }}
            transform={`rotate(-90 9 ${String(pos + 2)})`}
          >
            {label}
          </text>
        ),
      );
    }
  }
  return (
    <div className="ruler" aria-hidden="true">
      <svg width={axis === 'x' ? length : 20} height={axis === 'x' ? 20 : length}>
        {ticks}
      </svg>
    </div>
  );
}
