/**
 * A tree from a Newick string (note 04, note 47, issue 77). The decoder keeps the raw string;
 * the render parses it (`newick.ts`, never throws), lays it out as a rectangular or circular
 * tree and draws every branch as one stroked `<path>`, collapsed clades as filled triangles
 * (one path), and labels as text with explicit x/y. A bad string draws a short message in the
 * frame, and `problems` carries the full text to the Inspector. Text sizes are in points.
 */
import { type Prim, type Sub, arcNodes, pathPrim, poly } from '../prims';
import { type NewickNode, parseNewick } from '../newick';
import { defineKind } from '../types';
import { niceStep, text } from './util';

export interface TreeParams {
  readonly newick: string;
  readonly layout: 'rectangular' | 'circular';
  readonly branchLengths: boolean;
  readonly support: boolean;
  readonly labels: boolean;
  readonly collapse: readonly { readonly name: string }[];
  readonly scaleBar: boolean;
  /** Points. */
  readonly size: number;
  /** Points. */
  readonly lineWidth: number;
}

export const MAX_NEWICK = 4000;
/** A generous width of one character, as a multiple of the size (no font metrics in a pure render). */
const EST = 0.55;

/** A node of the drawn tree: collapsed clades are leaves. */
interface LNode {
  readonly n: NewickNode;
  readonly kids: readonly LNode[];
  readonly collapsed: boolean;
  /** Leaves under it. */
  readonly leaves: number;
  /** 0..1 across the tree. */
  x: number;
  /** Where a collapsed clade's triangle ends (0..1). */
  tip: number;
  /** Row (leaves) or the mean of the children's rows. */
  row: number;
  /** The text of a collapsed clade's label. */
  key: string;
}

const isNumeric = (s: string): boolean => s !== '' && Number.isFinite(Number(s));

function allLeaves(n: NewickNode, out: string[] = []): string[] {
  if (n.children.length === 0) out.push(n.name);
  else for (const c of n.children) allLeaves(c, out);
  return out;
}

/** The nodes `collapse` names, with the entries that match nothing. */
function resolveCollapse(
  root: NewickNode,
  entries: readonly string[],
): { nodes: Map<NewickNode, string>; unmatched: string[] } {
  const nodes = new Map<NewickNode, string>();
  const unmatched: string[] = [];
  const parent = new Map<NewickNode, NewickNode>();
  const walk = (n: NewickNode) => {
    for (const c of n.children) {
      parent.set(c, n);
      walk(c);
    }
  };
  walk(root);
  const all = [...parent.keys(), root];
  for (const raw of entries) {
    const entry = raw.trim();
    if (entry === '') continue;
    const names = entry
      .split(',')
      .map((s) => s.trim().replace(/_/g, ' '))
      .filter((s) => s !== '');
    let hits: NewickNode[] = [];
    if (names.length === 1) {
      const name = names[0] ?? '';
      hits = all.filter((n) => n.children.length > 0 && n.name === name);
      if (hits.length === 0) {
        const leaf = all.find((n) => n.children.length === 0 && n.name === name);
        const up = leaf ? parent.get(leaf) : undefined;
        if (up) hits = [up];
      }
    } else if (names.length > 1) {
      // The smallest clade holding all the named leaves.
      const found = names.flatMap((nm) => {
        const f = all.find((n) => n.children.length === 0 && n.name === nm);
        return f ? [f] : [];
      });
      const lead = found[0];
      if (lead && found.length === names.length) {
        const chain = (n: NewickNode): NewickNode[] => {
          const out = [n];
          for (let q = parent.get(n); q; q = parent.get(q)) out.push(q);
          return out;
        };
        const rest = found.slice(1).map((f) => new Set(chain(f)));
        const m = chain(lead).find((q) => rest.every((s) => s.has(q)));
        if (m && m.children.length > 0) hits = [m];
      }
    }
    if (hits.length === 0) unmatched.push(entry);
    for (const h of hits) nodes.set(h, entry);
  }
  return { nodes, unmatched };
}

interface Analysis {
  readonly error: string | null;
  readonly root: LNode | null;
  readonly rows: number;
  readonly hasLengths: boolean;
  /** The branch length of the whole width (length mode), else 0. */
  readonly span: number;
  readonly unmatched: readonly string[];
  readonly longest: number;
}

function analyse(p: TreeParams): Analysis {
  const empty = { root: null, rows: 0, hasLengths: false, span: 0, unmatched: [], longest: 0 };
  const parsed = parseNewick(p.newick);
  if (!parsed.ok) return { ...empty, error: parsed.error };
  const tree = parsed.root;
  const { nodes: collapseAt, unmatched } = resolveCollapse(
    tree,
    p.collapse.map((c) => c.name),
  );

  const hasLengths = (function any(n: NewickNode): boolean {
    return n.length !== null || n.children.some(any);
  })(tree);
  const useLen = p.branchLengths && hasLengths;

  const heightOf = (n: NewickNode): number =>
    n.children.length === 0 ? 0 : 1 + Math.max(...n.children.map(heightOf));
  const H = heightOf(tree);

  // Raw depth of every node, and the largest at a leaf.
  let maxDepth = 0;
  const lenOf = (n: NewickNode) => Math.max(0, n.length ?? 0);
  const rawDepth = new Map<NewickNode, number>();
  const measure = (n: NewickNode, d: number) => {
    rawDepth.set(n, d);
    if (n.children.length === 0) maxDepth = Math.max(maxDepth, d);
    for (const c of n.children) measure(c, d + lenOf(c));
  };
  measure(tree, 0);
  const lengthMode = useLen && maxDepth > 0;
  const subtreeTip = (n: NewickNode): number =>
    n.children.length === 0
      ? (rawDepth.get(n) ?? 0)
      : Math.max(...n.children.map((c) => subtreeTip(c)));

  let row = 0;
  let longest = 0;
  const build = (n: NewickNode): LNode => {
    const collapsed = n.children.length > 0 && collapseAt.has(n);
    const x = lengthMode ? (rawDepth.get(n) ?? 0) / maxDepth : H === 0 ? 0 : (H - heightOf(n)) / H;
    const tip = lengthMode ? subtreeTip(n) / maxDepth : 1;
    const leaves = n.children.length === 0 ? 1 : allLeaves(n).length;
    const key = collapsed
      ? n.name !== '' && !isNumeric(n.name)
        ? n.name
        : (collapseAt.get(n) ?? '')
      : n.name;
    if (collapsed || n.children.length === 0) {
      const shown = collapsed ? `${key} (${String(leaves)})` : n.name;
      longest = Math.max(longest, shown.length);
      return { n, kids: [], collapsed, leaves, x, tip, row: row++, key };
    }
    const kids = n.children.map(build);
    const first = kids[0];
    const last = kids[kids.length - 1];
    return {
      n,
      kids,
      collapsed: false,
      leaves,
      x,
      tip,
      row: first && last ? (first.row + last.row) / 2 : 0,
      key,
    };
  };
  const root = build(tree);
  return {
    error: null,
    root,
    rows: row,
    hasLengths: lengthMode,
    span: lengthMode ? maxDepth : 0,
    unmatched,
    longest,
  };
}

const shownLabel = (l: LNode): string =>
  l.collapsed ? `${l.key} (${String(l.leaves)})` : l.n.name;

export const tree = defineKind<TreeParams>({
  kind: 'tree',
  version: 1,
  title: 'Tree from Newick',
  category: 'Lab',
  description:
    'A phylogenetic or clustering tree drawn from a pasted Newick string, rectangular or circular, with optional collapsed clades.',
  keywords: [
    'tree',
    'newick',
    'phylogeny',
    'phylogenetic',
    'dendrogram',
    'cladogram',
    'clade',
    'bootstrap',
    'taxa',
    'evolution',
    'cluster',
    'hierarchical',
  ],
  defaultSize: { w: 260, h: 230 },
  fields: [
    {
      key: 'newick',
      label: 'Newick',
      help: `A tree such as ((A:1,B:1)90:1,C:2); up to ${String(MAX_NEWICK)} characters. Quoted labels, :lengths and [comments] work.`,
      type: 'text',
      maxLength: MAX_NEWICK,
      default:
        '((Homo_sapiens:0.10,Pan_troglodytes:0.12)99:0.06,(Mus_musculus:0.20,Rattus_norvegicus:0.18)100:0.07,Gallus_gallus:0.35);',
      placeholder: '((A:1,B:1)90:1,C:2);',
    },
    {
      key: 'layout',
      label: 'Layout',
      type: 'enum',
      options: [
        { value: 'rectangular', label: 'Rectangular' },
        { value: 'circular', label: 'Circular' },
      ],
      default: 'rectangular',
    },
    {
      key: 'branchLengths',
      label: 'Use branch lengths',
      help: 'Off (or no lengths in the string): a cladogram, tips aligned.',
      type: 'bool',
      default: true,
    },
    {
      key: 'support',
      label: 'Show node labels',
      help: 'Support values or clade names on the internal nodes.',
      type: 'bool',
      default: true,
    },
    { key: 'labels', label: 'Show leaf labels', type: 'bool', default: true },
    {
      key: 'collapse',
      label: 'Collapsed clades',
      help: 'A clade’s label, or a leaf in it (its parent clade), or two leaves a,b (the smallest clade holding both). Drawn as a triangle.',
      type: 'list',
      min: 0,
      max: 20,
      item: [{ key: 'name', label: 'Clade or leaves', type: 'text', maxLength: 80, default: '' }],
      default: [],
      itemTitle: (it, i) =>
        typeof it['name'] === 'string' && it['name'] !== ''
          ? `Collapse ${it['name']}`
          : `Clade ${String(i + 1)}`,
      newItem: () => ({ name: '' }),
    },
    {
      key: 'scaleBar',
      label: 'Scale bar',
      help: 'A branch-length bar under a rectangular tree drawn with lengths.',
      type: 'bool',
      default: true,
      showIf: (p) => p['layout'] === 'rectangular' && p['branchLengths'] === true,
    },
    {
      key: 'size',
      label: 'Text size',
      type: 'number',
      min: 4,
      max: 24,
      step: 0.5,
      unit: 'pt',
      default: 9,
    },
    {
      key: 'lineWidth',
      label: 'Line width',
      type: 'number',
      min: 0.25,
      max: 6,
      step: 0.25,
      unit: 'pt',
      default: 1,
    },
  ],
  slots: [
    { id: 'branch', label: 'Branches', default: '#1f2933' },
    { id: 'text', label: 'Labels', default: '#1f2933' },
    { id: 'support', label: 'Node labels', default: '#7b8794' },
    { id: 'clade', label: 'Collapsed clades', default: '#b8c4d0' },
  ],
  problems: (p) => {
    const a = analyse(p);
    return [
      ...(a.error ? [a.error] : []),
      ...a.unmatched.map((u) => `Collapsed clade "${u}" matches no clade or leaf.`),
    ];
  },
  // Labels run out past the tips (or the circle), and the message and scale-bar text hang
  // below; a frame smaller than its text lets all of it spill.
  overhang: (p) => {
    const a = analyse(p);
    const longest = Math.max(a.longest, a.error ? 24 : 0, 8);
    return EST * p.size * longest + 4 * p.size + p.lineWidth;
  },
  render(p, { w, h, slots }) {
    const s = p.size;
    const ink = slots['branch'] ?? '#1f2933';
    const textInk = slots['text'] ?? '#1f2933';
    const supInk = slots['support'] ?? '#7b8794';
    const cladeInk = slots['clade'] ?? '#b8c4d0';
    const a = analyse(p);
    if (a.root === null) {
      return [
        text(a.error === null ? '' : 'Newick: cannot read the tree', w / 2, h / 2, s, '#c0392b', {
          anchor: 'middle',
        }),
      ].filter((t) => t.text !== '');
    }
    const root = a.root;
    const n = Math.max(1, a.rows);
    const pad = Math.min(s * 0.4, Math.min(w, h) * 0.1);
    const labelW = (EST * s * a.longest + s * 0.5) * (p.labels ? 1 : 0);
    const gap = s * 0.35;
    const lines: Sub[] = [];
    const tris: Sub[] = [];
    const labels: Prim[] = [];
    const sup: Prim[] = [];
    const supSize = s * 0.75;
    const showSup = (l: LNode) => p.support && l.n.name !== '' && l.kids.length > 0;

    const rect = p.layout === 'rectangular';
    if (rect) {
      const scale = p.scaleBar && a.hasLengths;
      const scaleH = scale ? s * 1.9 : 0;
      const x0 = pad;
      const plotW = Math.max(0, w - 2 * pad - Math.min(labelW + gap, w * 0.45));
      const top = pad;
      const rowH = Math.max(0, h - 2 * pad - scaleH) / n;
      const X = (v: number) => x0 + v * plotW;
      const Y = (r: number) => top + (r + 0.5) * rowH;
      const walk = (l: LNode, parentX: number | null) => {
        const nx = X(l.x);
        const ny = Y(l.row);
        if (parentX !== null)
          lines.push(
            poly([
              { x: parentX, y: ny },
              { x: nx, y: ny },
            ]),
          );
        if (showSup(l))
          sup.push(
            text(l.n.name, nx - gap * 0.4, ny - s * 0.15, supSize, supInk, {
              anchor: 'end',
              baseline: 'alphabetic',
            }),
          );
        if (l.collapsed) {
          const hh = rowH * 0.4;
          const tx = Math.max(nx, X(l.tip));
          tris.push(
            poly(
              [
                { x: nx, y: ny },
                { x: tx, y: ny - hh },
                { x: tx, y: ny + hh },
              ],
              true,
            ),
          );
          if (p.labels)
            labels.push(text(shownLabel(l), tx + gap, ny, s, textInk, { anchor: 'start' }));
        } else if (l.kids.length === 0) {
          if (p.labels && l.n.name !== '')
            labels.push(text(l.n.name, nx + gap, ny, s, textInk, { anchor: 'start' }));
        } else {
          const ys = l.kids.map((k) => Y(k.row));
          lines.push(
            poly([
              { x: nx, y: Math.min(...ys) },
              { x: nx, y: Math.max(...ys) },
            ]),
          );
          for (const k of l.kids) walk(k, nx);
        }
      };
      walk(root, null);
      if (scale && a.span > 0) {
        const len = Math.min(niceStep(a.span, 5), a.span);
        const bw = (len / a.span) * plotW;
        const y = h - pad - s * 1.2;
        const t = s * 0.25;
        lines.push(
          poly([
            { x: x0, y },
            { x: x0 + bw, y },
          ]),
        );
        lines.push(
          poly([
            { x: x0, y: y - t },
            { x: x0, y: y + t },
          ]),
        );
        lines.push(
          poly([
            { x: x0 + bw, y: y - t },
            { x: x0 + bw, y: y + t },
          ]),
        );
        labels.push(
          text(
            String(Number(len.toPrecision(3))),
            x0 + bw / 2,
            y + t + s * 0.15,
            s * 0.85,
            textInk,
            {
              anchor: 'middle',
              baseline: 'top',
            },
          ),
        );
      }
    } else {
      const cx = w / 2;
      const cy = h / 2;
      const half = Math.min(w, h) / 2;
      const R = Math.max(0, half - pad - Math.min(labelW + gap, half * 0.5));
      const step = (2 * Math.PI) / n;
      const ang = (r: number) => (r + 0.5) * step;
      const at = (r: number, t: number) => ({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
      const walk = (l: LNode, parentR: number | null) => {
        const t = ang(l.row);
        const r = l.x * R;
        if (parentR !== null) lines.push(poly([at(parentR, t), at(r, t)]));
        // Near the centre the values would sit on top of each other.
        if (showSup(l) && r >= s * 2.5) {
          const q = at(r, t);
          sup.push(
            text(l.n.name, q.x - gap * 0.4, q.y - s * 0.15, supSize, supInk, {
              anchor: 'end',
              baseline: 'alphabetic',
            }),
          );
        }
        const labelAt = (rad: number, str: string) => {
          const q = at(rad, t);
          const deg = (t * 180) / Math.PI;
          const left = Math.cos(t) < 0;
          labels.push(
            text(str, q.x, q.y, s, textInk, {
              anchor: left ? 'end' : 'start',
              rotation: left ? deg - 180 : deg,
            }),
          );
        };
        if (l.collapsed) {
          const tipR = Math.max(r, l.tip * R);
          const d = step * 0.4;
          const arc = arcNodes(cx, cy, tipR, t - d, t + d);
          tris.push({
            t: 'poly',
            nodes: [{ ...at(r, t) }, ...arc],
            closed: true,
          });
          if (p.labels) labelAt(tipR + gap, shownLabel(l));
        } else if (l.kids.length === 0) {
          if (p.labels && l.n.name !== '') labelAt(r + gap, l.n.name);
        } else {
          const ts = l.kids.map((k) => ang(k.row));
          const t0 = Math.min(...ts);
          const t1 = Math.max(...ts);
          if (r > 0 && t1 - t0 > 1e-9) lines.push(poly(arcNodes(cx, cy, r, t0, t1)));
          for (const k of l.kids) walk(k, r);
        }
      };
      walk(root, null);
    }

    return [
      ...pathPrim(tris, { fill: cladeInk }),
      ...pathPrim(lines, { stroke: ink, sw: p.lineWidth, cap: 'round', join: 'round' }),
      ...sup,
      ...labels,
    ];
  },
});
