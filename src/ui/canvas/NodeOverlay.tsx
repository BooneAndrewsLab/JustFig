/**
 * Point editing on the canvas (note 28): the object's nodes, their Bézier
 * handles and clickable segments, drawn in screen space over the page and
 * never exported; and the live line that says which point is current.
 */
import { type NodeRef, describePoint, editableNodes, isSmooth } from '@/core/edits/nodes';
import { apply, frameMatrix } from '@/core/geometry/matrix';
import type { Obj, PathNode, Vec2 } from '@/core/model/types';
import type { Unit } from '@/core/units';

import { formatBinding } from '../keyBindings';
import type { NodeEdit, View } from '../state/store';
import { OVERLAY } from './overlayPaint';

const NODE = 8;

/** Frame-local → screen pixels for this object in this view. */
function toScreen(o: Obj, v: View): (p: Vec2) => Vec2 {
  const m = frameMatrix(o.frame);
  return (p) => {
    const q = apply(m, p);
    return { x: q.x * v.zoom + v.x, y: q.y * v.zoom + v.y };
  };
}

const pt = (p: Vec2) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;

function segmentD(a: PathNode, b: PathNode, s: (p: Vec2) => Vec2): string {
  if (!a.out && !b.in) return `M${pt(s(a))}L${pt(s(b))}`;
  return `M${pt(s(a))}C${pt(s(a.out ?? a))} ${pt(s(b.in ?? b))} ${pt(s(b))}`;
}

export function NodeOverlay({ obj, view, edit }: { obj: Obj; view: View; edit: NodeEdit }) {
  const ed = editableNodes(obj);
  if (!ed) return null;
  const s = toScreen(obj, view);
  const { nodes, closed } = ed;
  const segs = closed ? nodes.length : nodes.length - 1;
  const current = (r: NodeRef) => edit.index === r.index && edit.part === r.part;
  return (
    <g data-testid="node-overlay">
      {Array.from({ length: Math.max(0, segs) }, (_, i) => {
        const a = nodes[i];
        const b = nodes[(i + 1) % nodes.length];
        if (!a || !b) return null;
        return (
          <path
            key={`s${String(i)}`}
            data-node-seg={i}
            d={segmentD(a, b, s)}
            fill="none"
            stroke="transparent"
            strokeWidth={10}
            pointerEvents="stroke"
            style={{ cursor: 'copy' }}
          >
            <title>Click to add a point</title>
          </path>
        );
      })}
      {nodes.map((n, i) =>
        (['in', 'out'] as const).map((part) => {
          const h = n[part];
          if (!h) return null;
          const a = s(n);
          const b = s(h);
          const on = current({ index: i, part });
          return (
            <g key={`${part}${String(i)}`}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                style={{ stroke: OVERLAY.select }}
                strokeOpacity={0.7}
                pointerEvents="none"
              />
              <circle
                data-node-index={i}
                data-node-part={part}
                data-current={on ? '' : undefined}
                cx={b.x}
                cy={b.y}
                r={on ? 5 : 4}
                style={{
                  fill: on ? OVERLAY.select : OVERLAY.handle,
                  stroke: OVERLAY.select,
                  cursor: 'move',
                }}
              />
            </g>
          );
        }),
      )}
      {nodes.map((n, i) => {
        const a = s(n);
        const on = current({ index: i, part: 'node' });
        const size = on ? NODE + 2 : NODE;
        return (
          <rect
            key={`n${String(i)}`}
            data-node-index={i}
            data-node-part="node"
            data-current={on ? '' : undefined}
            x={a.x - size / 2}
            y={a.y - size / 2}
            width={size}
            height={size}
            rx={isSmooth(n) ? size / 2 : 0}
            style={{
              fill: on ? OVERLAY.select : OVERLAY.handle,
              stroke: OVERLAY.select,
              cursor: 'move',
            }}
          />
        );
      })}
    </g>
  );
}

/** What the live line says about the current point. */
export function NodeStatus({
  obj,
  edit,
  units,
  bindings,
}: {
  obj: Obj;
  edit: NodeEdit;
  units: Unit;
  bindings: ReadonlyMap<string, string>;
}) {
  const key = (id: string) => {
    const b = bindings.get(id);
    return b === undefined ? '' : formatBinding(b);
  };
  return (
    <div className="node-status" data-testid="node-status">
      <p aria-live="polite">{describePoint(obj, edit, units)}</p>
      <p className="node-keys">
        Editing points. Tab: next point · arrows: move · {key('node-add')}: add ·{' '}
        {key('node-smooth')}: smooth/corner · Delete: remove · Esc: done
      </p>
    </div>
  );
}
