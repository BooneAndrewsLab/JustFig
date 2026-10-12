/**
 * A colour control: a chip and its hex (or the linked swatch's name), with no box around them, that opens
 * the picker: saturation/brightness square, hue slider, hex field, eyedropper where the browser
 * has one, the figure's swatches (choosing one links the colour to it, note 07), Okabe-Ito
 * quick colours, "none" where allowed, and recent colours. With `copy` (procedural params, whose colours carry
 * meaning) a swatch click stores its hex by value, never a link, so a later
 * palette change leaves the colour alone.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { OKABE_ITO, resolvePaint } from '@/core/color/color';
import { type Hsv, hexToHsv, hsvToHex, normalizeHex } from '@/core/color/hsv';
import type { Paint, Swatch } from '@/core/model/types';

import { rememberColor, useRecentColors } from './recentColors';

interface Props {
  readonly label: string;
  readonly value: Paint | null;
  readonly palette: readonly Swatch[];
  readonly onChange: (p: Paint | null, live?: boolean) => void;
  readonly allowNone?: boolean;
  /** Swatches copy their hex instead of linking. */
  readonly copy?: boolean;
}

export function ColorInput({
  label,
  value,
  palette,
  onChange,
  allowNone = false,
  copy = false,
}: Props) {
  const hex = value === null ? '#ffffff' : resolvePaint(value, palette);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const pick = (c: string, live = false) => {
    onChange({ hex: c }, live || undefined);
    if (!live) rememberColor(c);
  };
  const linkedTo =
    value !== null && 'swatch' in value ? palette.find((sw) => sw.id === value.swatch) : undefined;
  return (
    <div className="row">
      <label>{label}</label>
      <button
        ref={button}
        type="button"
        className="color-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={linkedTo ? `Linked to swatch ${linkedTo.name}` : undefined}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        <span
          className={`color-trigger__chip${value === null ? ' none' : ''}`}
          style={value === null ? undefined : { background: hex }}
        />
        <span className="color-trigger__text">
          {value === null ? 'None' : (linkedTo?.name ?? hex)}
        </span>
      </button>
      {open && (
        <PickerPopover
          label={label}
          hex={hex}
          hexText={value === null ? '' : hex}
          anchor={button}
          onLive={(c) => {
            pick(c, true);
          }}
          onCommit={rememberColor}
          onPick={pick}
          onClose={() => {
            setOpen(false);
          }}
        >
          {palette.length > 0 && (
            <div className="color-pop__set">
              <span
                className="note"
                title={
                  copy
                    ? 'Choosing a palette swatch copies its colour; later palette changes leave it alone.'
                    : 'Choosing a palette swatch links the colour to it.'
                }
              >
                {copy ? 'Palette (copies)' : 'Palette'}
              </span>
              {palette.map((sw) => {
                const linked = linkedTo?.id === sw.id;
                return (
                  <button
                    key={sw.id}
                    type="button"
                    className={copy ? 'swatch' : 'swatch linked'}
                    title={
                      copy
                        ? `${sw.name} ${sw.hex} (copies the colour; not linked to the palette)`
                        : `${sw.name} (linked: follows the swatch)`
                    }
                    aria-label={`${label} swatch ${sw.name}`}
                    aria-pressed={copy ? undefined : linked}
                    style={{ background: sw.hex }}
                    onClick={() => {
                      onChange(copy ? { hex: sw.hex } : { swatch: sw.id });
                    }}
                  />
                );
              })}
            </div>
          )}
          <div className="color-pop__set">
            <span className="note">Quick</span>
            {OKABE_ITO.concat(['#ffffff']).map((c) => (
              <button
                key={c}
                type="button"
                className="swatch"
                title={c}
                aria-label={`${label} ${c}`}
                style={{ background: c }}
                onClick={() => {
                  pick(c);
                }}
              />
            ))}
            {allowNone && (
              <button
                type="button"
                className="swatch none"
                title="None"
                aria-label={`${label} none`}
                onClick={() => {
                  onChange(null);
                }}
              />
            )}
          </div>
        </PickerPopover>
      )}
    </div>
  );
}

function HexField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (hex: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const h = draft === null ? null : normalizeHex(draft);
    if (h !== null && h !== value) onCommit(h);
    setDraft(null);
  };
  return (
    <input
      type="text"
      className="hexfield"
      aria-label={`${label} hex`}
      placeholder="none"
      spellCheck={false}
      maxLength={7}
      value={draft ?? value}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') setDraft(null);
      }}
    />
  );
}

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };
const eyeDropper = (): EyeDropperCtor | undefined =>
  (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;

const pct = (v: number): number => Math.round(v * 100);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function PickerPopover({
  label,
  hex,
  hexText,
  children,
  anchor,
  onLive,
  onCommit,
  onPick,
  onClose,
}: {
  label: string;
  hex: string;
  /** What the hex field shows: '' for "none". */
  hexText: string;
  /** The palette and quick colour rows. */
  children: React.ReactNode;
  anchor: React.RefObject<HTMLButtonElement | null>;
  /** Called on every step of a drag or key press. */
  onLive: (hex: string) => void;
  /** The gesture ended: remember the colour. */
  onCommit: (hex: string) => void;
  onPick: (hex: string) => void;
  onClose: () => void;
}) {
  const pop = useRef<HTMLDivElement>(null);
  const square = useRef<HTMLDivElement>(null);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(hex) ?? { h: 0, s: 0, v: 1 });
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const recent = useRecentColors();

  // An outside change (a swatch, the hex field) moves the handles; our own edits keep the hue
  // even where the colour is grey.
  if (hex !== hsvToHex(hsv)) {
    const next = hexToHsv(hex);
    if (next) setHsv(next);
  }

  const set = (next: Hsv) => {
    setHsv(next);
    onLive(hsvToHex(next));
  };

  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    const p = pop.current;
    if (!a || !p) return;
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    const below = a.bottom + 6;
    setPos({
      left: clamp(a.left, 4, window.innerWidth - w - 4),
      top: below + h > window.innerHeight - 4 ? Math.max(4, a.top - h - 6) : below,
    });
  }, [anchor]);

  useEffect(() => {
    square.current?.focus();
    const close = () => {
      onClose();
    };
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !anchor.current?.contains(t)) close();
    };
    const scrolled = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('scroll', scrolled, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('scroll', scrolled, true);
      window.removeEventListener('resize', close);
    };
  }, [anchor, onClose]);

  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    set({
      h: hsv.h,
      s: clamp((e.clientX - r.left) / r.width, 0, 1),
      v: 1 - clamp((e.clientY - r.top) / r.height, 0, 1),
    });
  };

  const dropper = eyeDropper();
  return (
    <div
      ref={pop}
      className="color-pop"
      role="dialog"
      aria-label={`${label} picker`}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
          anchor.current?.focus();
        }
      }}
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null;
        if (to && !pop.current?.contains(to) && !anchor.current?.contains(to)) onClose();
      }}
    >
      <div
        ref={square}
        className="color-pop__square"
        role="slider"
        tabIndex={0}
        aria-label={`${label} saturation and brightness`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct(hsv.v)}
        aria-valuetext={`Saturation ${pct(hsv.s)}%, brightness ${pct(hsv.v)}%`}
        style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons) drag(e);
        }}
        onPointerUp={() => {
          onCommit(hsvToHex(hsv));
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.01;
          const ds = { ArrowLeft: -step, ArrowRight: step };
          const dv = { ArrowDown: -step, ArrowUp: step };
          const dS: number = (ds as Record<string, number | undefined>)[e.key] ?? 0;
          const dV: number = (dv as Record<string, number | undefined>)[e.key] ?? 0;
          if (dS === 0 && dV === 0) return;
          e.preventDefault();
          set({ h: hsv.h, s: clamp(hsv.s + dS, 0, 1), v: clamp(hsv.v + dV, 0, 1) });
        }}
        onKeyUp={(e) => {
          if (e.key.startsWith('Arrow')) onCommit(hsvToHex(hsv));
        }}
      >
        <span
          className="color-pop__handle"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      <input
        type="range"
        className="color-pop__hue"
        aria-label={`${label} hue`}
        min={0}
        max={359}
        value={Math.round(hsv.h)}
        onChange={(e) => {
          set({ ...hsv, h: Number(e.target.value) });
        }}
        onPointerUp={() => {
          onCommit(hsvToHex(hsv));
        }}
        onKeyUp={() => {
          onCommit(hsvToHex(hsv));
        }}
      />
      <div className="color-pop__row">
        <HexField label={label} value={hexText} onCommit={onPick} />
        {dropper && (
          <button
            type="button"
            className="color-pop__eye"
            title="Pick a colour from anywhere on the screen"
            aria-label={`${label} eyedropper`}
            onClick={() => {
              new dropper()
                .open()
                .then((r) => {
                  const c = normalizeHex(r.sRGBHex);
                  if (c) onPick(c);
                })
                .catch(() => {
                  // Cancelled with Escape.
                });
            }}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="m9.5 4.5 2 2M11 2.5l2.5 2.5-1.5 1.5-2.5-2.5zM10 5.5 4 11.5 3 13.5l2-1 6-6" />
            </svg>
          </button>
        )}
      </div>
      {children}
      {recent.length > 0 && (
        <div className="color-pop__set">
          <span className="note">Recent</span>
          {recent.map((c) => (
            <button
              key={c}
              type="button"
              className="swatch"
              title={c}
              aria-label={`${label} recent ${c}`}
              style={{ background: c }}
              onClick={() => {
                onPick(c);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
