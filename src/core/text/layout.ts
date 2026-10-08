/**
 * Rich-text layout (note 03): paragraphs of runs → lines of positioned
 * segments, measured with opentype.js on the real font files. Advance
 * widths only, kerning off; greedy wrap at spaces unless `autoWidth`; CSS
 * line boxes (half-leading). Sub/sup are 65% size with an explicit
 * baseline offset, never `baseline-shift`.
 */
import type { Run, Text } from '../model/types';
import { getFont } from './fonts';

export const SCRIPT_SCALE = 0.65;
export const SUP_SHIFT = -0.35;
export const SUB_SHIFT = 0.15;
/** Size of an empty paragraph with no runs to go by. */
export const DEFAULT_SIZE = 10;

export interface Segment {
  readonly text: string;
  /** Left edge of the segment, frame-local. */
  readonly x: number;
  /** Alphabetic baseline, frame-local. */
  readonly y: number;
  readonly width: number;
  /** Drawn size (already scaled for sub/sup). */
  readonly size: number;
  readonly run: Run;
  /** Which run of which paragraph it came from. */
  readonly para: number;
  readonly index: number;
  /** Character offset of `text` within the run. */
  readonly offset: number;
}

export interface Line {
  readonly segments: readonly Segment[];
  readonly width: number;
  readonly top: number;
  readonly height: number;
  readonly baseline: number;
}

export interface TextLayout {
  readonly lines: readonly Line[];
  /** Width the text needs (longest line). */
  readonly width: number;
  readonly height: number;
}

const drawnSize = (r: Run): number => (r.script ? r.size * SCRIPT_SCALE : r.size);

const shift = (r: Run): number =>
  r.script === 'sup' ? r.size * SUP_SHIFT : r.script === 'sub' ? r.size * SUB_SHIFT : 0;

const fontOf = (r: Run) => getFont(r.font, { bold: r.bold === true, italic: r.italic === true });

export function measure(r: Run, text: string): number {
  if (text === '') return 0;
  return fontOf(r).getAdvanceWidth(text, drawnSize(r), { kerning: false, features: {} });
}

/** Ascent and descent (positive) of a run's font at its nominal size. */
function metrics(r: Run): { asc: number; desc: number } {
  const f = fontOf(r);
  const k = r.size / f.unitsPerEm;
  return { asc: f.ascender * k, desc: -f.descender * k };
}

interface Piece {
  readonly run: Run;
  readonly para: number;
  readonly index: number;
  readonly offset: number;
  readonly text: string;
  readonly width: number;
  readonly space: boolean;
}

function pieces(runs: readonly Run[], para: number): Piece[] {
  const out: Piece[] = [];
  runs.forEach((run, index) => {
    const re = /(\s+)|([^\s]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(run.text)) !== null) {
      out.push({
        run,
        para,
        index,
        offset: m.index,
        text: m[0],
        width: measure(run, m[0]),
        space: m[1] !== undefined,
      });
    }
  });
  return out;
}

function breakLines(ps: readonly Piece[], maxWidth: number | null): Piece[][] {
  if (maxWidth === null) return [ps.slice()];
  const lines: Piece[][] = [];
  let cur: Piece[] = [];
  let w = 0;
  for (const p of ps) {
    if (!p.space && cur.length > 0 && w + p.width > maxWidth + 1e-6) {
      while (cur.length > 0 && cur[cur.length - 1]?.space === true) cur.pop();
      lines.push(cur);
      cur = [];
      w = 0;
    }
    if (p.space && cur.length === 0 && lines.length > 0) continue;
    cur.push(p);
    w += p.width;
  }
  lines.push(cur);
  return lines;
}

/** Joins neighbouring pieces of the same run into segments. */
function segmentsOf(ps: readonly Piece[], x0: number, baseline: number): Segment[] {
  const out: Segment[] = [];
  let x = x0;
  for (const p of ps) {
    const last = out[out.length - 1];
    if (last?.para === p.para && last.index === p.index) {
      out[out.length - 1] = { ...last, text: last.text + p.text, width: last.width + p.width };
    } else {
      out.push({
        text: p.text,
        x,
        y: baseline + shift(p.run),
        width: p.width,
        size: drawnSize(p.run),
        run: p.run,
        para: p.para,
        index: p.index,
        offset: p.offset,
      });
    }
    x += p.width;
  }
  return out;
}

export function layoutText(
  t: Pick<Text, 'runs' | 'align' | 'lineHeight' | 'autoWidth' | 'frame'>,
): TextLayout {
  const maxWidth = t.autoWidth ? null : Math.max(t.frame.w, 1);
  const raw: { ps: Piece[]; para: readonly Run[] }[] = [];
  let lastRun: Run | undefined;
  t.runs.forEach((para, pi) => {
    const lines = breakLines(pieces(para, pi), maxWidth);
    for (const ps of lines) raw.push({ ps, para });
    lastRun = para[para.length - 1] ?? lastRun;
  });
  const width = Math.max(0, ...raw.map((l) => l.ps.reduce((s, p) => s + p.width, 0)));
  const boxWidth = maxWidth ?? width;
  const lines: Line[] = [];
  let top = 0;
  for (const { ps, para } of raw) {
    // Line metrics from the runs on the line; an empty line uses its paragraph's first run.
    const sizedBy =
      ps.length > 0
        ? ps.map((p) => p.run)
        : para.length > 0
          ? para.slice(0, 1)
          : lastRun
            ? [lastRun]
            : [];
    let asc = 0;
    let desc = 0;
    let size = 0;
    for (const r of sizedBy) {
      const m = metrics(r);
      asc = Math.max(asc, m.asc);
      desc = Math.max(desc, m.desc);
      size = Math.max(size, r.size);
    }
    if (sizedBy.length === 0) {
      size = DEFAULT_SIZE;
      asc = 0.905 * size;
      desc = 0.212 * size;
    }
    const height = t.lineHeight * size;
    const baseline = top + (height - (asc + desc)) / 2 + asc;
    const lineWidth = ps.reduce((s, p) => s + p.width, 0);
    const x0 =
      t.align === 'center'
        ? (boxWidth - lineWidth) / 2
        : t.align === 'right'
          ? boxWidth - lineWidth
          : 0;
    lines.push({ segments: segmentsOf(ps, x0, baseline), width: lineWidth, top, height, baseline });
    top += height;
  }
  return { lines, width, height: top };
}

/** The text object with its frame sized to its layout (note 02). */
export function fitText(t: Text): Text {
  const l = layoutText(t);
  const w = t.autoWidth ? l.width : t.frame.w;
  if (w === t.frame.w && l.height === t.frame.h) return t;
  return { ...t, frame: { ...t.frame, w, h: l.height } };
}

/** All the text of a text object, paragraphs joined by newlines. */
export const plainText = (t: Pick<Text, 'runs'>): string =>
  t.runs.map((p) => p.map((r) => r.text).join('')).join('\n');
