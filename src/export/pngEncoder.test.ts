/** The worker PNG encoder (issue 60, note 33), its two sides joined by a MessageChannel. */
import { describe, expect, it } from 'vitest';

import { decodePng } from '@/io/png';
import { type TiffPageSpec, writeTiff } from '@/test/tiffWriter';

import { PngWriter } from './png';
import {
  type PngPort,
  PortPngEncoder,
  pngEncoder,
  servePngWriter,
  tiffEncoder,
} from './pngEncoder';
import { encodeTiff } from './tiff';

const opts = { width: 7, height: 10, dpi: 300, alpha: true, software: 'T 1' };

const pixels = () =>
  Uint8Array.from({ length: 7 * 10 * 4 }, (_, i) => (i % 4 === 3 ? 255 - i : (i * 37) & 0xff));

function channel() {
  const { port1, port2 } = new MessageChannel();
  servePngWriter(port2);
  let closed = false;
  const close = () => {
    closed = true;
    port1.close();
    port2.close();
  };
  return { main: port1 as unknown as PngPort, close, isClosed: () => closed };
}

describe('the worker PNG encoder', () => {
  it('writes the same bytes as the writer on this thread, and takes over each band', async () => {
    const px = pixels();
    const here = new PngWriter(opts);
    await here.push(px.subarray(0, 7 * 4 * 3));
    await here.push(px.subarray(7 * 4 * 3));
    const expected = await here.finish();

    const ch = channel();
    const enc = new PortPngEncoder(ch.main, opts, ch.close);
    const first = px.slice(0, 7 * 4 * 3); // its own buffer: moved, not copied
    await enc.push(first);
    await enc.push(px.subarray(7 * 4 * 3)); // part of a bigger buffer: copied
    const png = await enc.finish();
    expect(first.byteLength).toBe(0);
    expect(png).toEqual(expected);
    expect(decodePng(png)?.data).toEqual(px);
    expect(ch.isClosed()).toBe(true);
  });

  it('reports a writer error from the worker', async () => {
    const ch = channel();
    const enc = new PortPngEncoder(ch.main, opts, ch.close);
    await enc.push(new Uint8Array(5)); // not whole rows: the worker throws
    await expect(enc.push(new Uint8Array(7 * 4))).rejects.toThrow('does not match');
    await expect(enc.finish()).rejects.toThrow('does not match');
    expect(ch.isClosed()).toBe(true);
  });

  it('fails waiting requests when the worker dies, and frees it on abort', async () => {
    const ch = channel();
    const enc = new PortPngEncoder(ch.main, opts, ch.close);
    enc.fail(new Error('gone'));
    await expect(enc.push(pixels())).rejects.toThrow('gone');
    const other = channel();
    new PortPngEncoder(other.main, opts, other.close).abort();
    expect(other.isClosed()).toBe(true);
  });

  it('runs on this thread where there are no workers', () => {
    expect(pngEncoder(opts)).toBeInstanceOf(PngWriter);
  });

  it('writes a TIFF byte for byte as encodeTiff does (issue 63)', async () => {
    const px = pixels();
    const ch = channel();
    const enc = new PortPngEncoder(ch.main, opts, ch.close, 'tiff');
    await enc.push(px.slice(0, 7 * 4 * 4));
    await enc.push(px.slice(7 * 4 * 4));
    expect(await enc.finish()).toEqual(encodeTiff(px, opts));
    expect(ch.isClosed()).toBe(true);
  });

  it('runs the TIFF writer on this thread where there are no workers', async () => {
    const px = pixels();
    const enc = tiffEncoder(opts);
    await enc.push(px);
    expect(await enc.finish()).toEqual(encodeTiff(px, opts));
  });
});

describe('reading a TIFF in the worker (issue 65, note 43)', () => {
  const spec: TiffPageSpec = {
    width: 5,
    height: 4,
    bits: 16,
    samples: 1,
    compression: 5,
    values: Array.from({ length: 20 }, (_, i) => i * 3000),
    description: 'ImageJ=1\nunit=micron\n',
    xResolution: 10,
  };

  it('answers a decode request with the pixels moved back, and a plain error for a bad file', async () => {
    const { port1, port2 } = new MessageChannel();
    servePngWriter(port2);
    const ask = (bytes: Uint8Array) =>
      new Promise<{
        type: string;
        result?: { images: { data: Uint16Array }[]; pixelSize?: number };
        message?: string;
      }>((resolve) => {
        port1.onmessage = (e: MessageEvent) => {
          resolve(e.data as never);
        };
        port1.postMessage({ type: 'decodeTiff', bytes });
      });
    const ok = await ask(writeTiff({ pages: [spec] }));
    expect(ok.type).toBe('tiff');
    expect(Array.from(ok.result?.images[0]?.data ?? [])).toEqual(Array.from(spec.values));
    expect(ok.result?.pixelSize).toBeCloseTo(0.1, 3);
    const bad = await ask(writeTiff({ pages: [{ ...spec, compression: 7 }] }));
    expect(bad).toMatchObject({ type: 'error' });
    expect(bad.message).toMatch(/JPEG/);
    port1.close();
    port2.close();
  });

  it('decodeTiffInWorker reads on this thread where there are no workers', async () => {
    const { decodeTiffInWorker } = await import('./pngEncoder');
    const r = await decodeTiffInWorker(writeTiff({ pages: [spec] }));
    expect(r.images).toHaveLength(1);
    await expect(decodeTiffInWorker(new Uint8Array(16))).rejects.toThrow(/not a TIFF/);
  });
});
