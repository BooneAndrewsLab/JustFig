/**
 * Stubs for running svg2pdf under jsdom.
 *
 * jsdom never loads images (no canvas package), so `img.onload` never
 * fires and svg2pdf waits for ever. This stub reads a PNG data URI's size
 * from its IHDR and fires onload, which is all svg2pdf asks of it.
 */
class StubImage {
  width = 0;
  height = 0;
  onload: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  set src(url: string) {
    const m = /^data:image\/png;base64,(.*)$/.exec(url);
    const bytes = m?.[1] ? Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)) : null;
    setTimeout(() => {
      if (bytes && bytes.length > 24) {
        const v = new DataView(bytes.buffer);
        this.width = v.getUint32(16);
        this.height = v.getUint32(20);
        this.onload?.();
      } else this.onerror?.(new Error('stub image: not a PNG data URI'));
    }, 0);
  }
}

/**
 * svg2pdf measures text with the browser (canvas or getBBox), only to
 * advance to the next chunk; every tspan we write has an explicit x, so
 * the width it gets here does not matter.
 */
export function stubDom(): void {
  (globalThis as { Image?: unknown }).Image = StubImage;
  const proto = (globalThis as { SVGElement?: { prototype: object } }).SVGElement?.prototype;
  if (proto && !('getBBox' in proto))
    Object.assign(proto, { getBBox: () => ({ x: 0, y: 0, width: 0, height: 0 }) });
  const canvas = (globalThis as { HTMLCanvasElement?: { prototype: object } }).HTMLCanvasElement
    ?.prototype;
  if (canvas) Object.assign(canvas, { getContext: () => null });
}
