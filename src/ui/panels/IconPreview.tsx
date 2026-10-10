/**
 * The icon browser's large preview (note 01): a tooltip beside a tile with
 * the icon drawn from its own SVG (crisp at any size, fetched only when the
 * preview opens) and its name and licence. It opens after a short hover, at
 * once on keyboard focus or when moving from tile to tile, and closes on
 * leave, blur, Escape, click or drag, or when its tile scrolls out of sight.
 */
import { useLayoutEffect, useRef, useState } from 'react';

import type { IconEntry } from '@/icons/manifest';

import { type Box, PREVIEW_ID, previewCredit, previewPosition } from './previewTimer';

export function IconPreview({
  entry,
  anchor,
  svgUrl,
  onPointerEnter,
  onPointerLeave,
}: {
  entry: IconEntry;
  anchor: Box;
  svgUrl: string;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos(
      previewPosition(
        anchor,
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [anchor]);
  return (
    <div
      ref={ref}
      id={PREVIEW_ID}
      role="tooltip"
      className="icon-preview"
      data-icon={entry.id}
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
    >
      {/* An <img>, not inline SVG: the library is data, and an image runs no script. */}
      <img key={entry.id} src={svgUrl} alt="" />
      <strong className="icon-preview-title">{entry.title}</strong>
      <span className="icon-preview-credit">{previewCredit(entry)}</span>
      {entry.meta.shareAlike && <span className="icon-preview-sa">Share-alike (CC BY-SA)</span>}
    </div>
  );
}
