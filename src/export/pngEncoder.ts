/**
 * Big PNGs encoded off the main thread (issue 60, note 33): a worker runs the
 * `PngWriter` (row filters and deflate) on one band while the main thread
 * draws the next, so the two overlap and the page stays responsive. Without
 * workers (unit tests, or one that cannot start) the writer runs here.
 * The same worker also runs a `TiffWriter` (issue 63): the protocol only
 * names the format in its `start` request.
 */
import { type DecodedTiff, readTiffForImport } from '@/io/tiffStack';

import { PngWriter, type PngStreamOptions } from './png';
import { TiffWriter, type TiffOptions } from './tiff';

export type RasterFormat = 'png' | 'tiff';

/** Either writer's options (they are the same fields). */
export type RasterStreamOptions = PngStreamOptions & TiffOptions;

/** The writers a worker can run: bands in, a finished file out. */
interface RasterWriter {
  push(rgba: Uint8Array | Uint8ClampedArray): void | Promise<void>;
  finish(): Uint8Array | Promise<Uint8Array>;
}

/** What exportPng feeds bands to: a `PngWriter` here or in a worker. */
export interface PngEncoder {
  /** The next RGBA rows. A worker takes over the buffer: do not use it after. */
  push(rgba: Uint8Array | Uint8ClampedArray): Promise<void>;
  finish(): Promise<Uint8Array>;
  /** Gives up (the drawing failed): frees the worker. */
  abort?(): void;
}

export type PngWorkerRequest =
  | {
      readonly type: 'start';
      readonly opts: RasterStreamOptions;
      /** Absent means a PNG (the first protocol). */
      readonly format?: RasterFormat;
    }
  | { readonly type: 'push'; readonly rgba: Uint8Array | Uint8ClampedArray }
  | { readonly type: 'finish' }
  /** A TIFF to read for import (issue 65, note 43); needs no `start`. */
  | { readonly type: 'decodeTiff'; readonly bytes: Uint8Array };

export type PngWorkerReply =
  | { readonly type: 'ok' }
  | { readonly type: 'done'; readonly png: Uint8Array } // the finished file, whichever format
  | { readonly type: 'tiff'; readonly result: DecodedTiff }
  | { readonly type: 'error'; readonly message: string };

/** The side of a worker (or a MessagePort, in tests) the writer talks through. */
export interface PngPort {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
}

/** The worker's side: one writer per worker, requests answered in order. */
export function servePngWriter(port: PngPort): void {
  let writer: RasterWriter | null = null;
  let queue = Promise.resolve();
  const reply = (r: PngWorkerReply, transfer: Transferable[] = []) => {
    port.postMessage(r, transfer);
  };
  const handle = async (req: PngWorkerRequest): Promise<void> => {
    if (req.type === 'decodeTiff') {
      const result = readTiffForImport(req.bytes);
      reply(
        { type: 'tiff', result },
        result.images.map((i) => i.data.buffer as ArrayBuffer),
      );
      return;
    }
    if (req.type === 'start') {
      writer = req.format === 'tiff' ? new TiffWriter(req.opts) : new PngWriter(req.opts);
      reply({ type: 'ok' });
      return;
    }
    if (!writer) throw new Error('Image writer not started');
    if (req.type === 'push') {
      await writer.push(req.rgba);
      reply({ type: 'ok' });
      return;
    }
    const png = await writer.finish();
    writer = null;
    reply({ type: 'done', png }, [png.buffer]);
  };
  port.onmessage = (e: MessageEvent) => {
    const req = e.data as PngWorkerRequest;
    queue = queue
      .then(() => handle(req))
      .catch((err: unknown) => {
        writer = null;
        reply({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      });
  };
}

const ignore = (): void => undefined;

/** The buffer to hand over, so a band is moved to the worker rather than copied. */
function transferable(rgba: Uint8Array | Uint8ClampedArray): Transferable[] {
  const { buffer } = rgba;
  return buffer instanceof ArrayBuffer &&
    rgba.byteOffset === 0 &&
    rgba.byteLength === buffer.byteLength
    ? [buffer]
    : [];
}

/**
 * The main thread's side. `push` waits for the band before it (not this one),
 * so one band is encoded while the next is drawn and at most two are alive.
 */
export class PortPngEncoder implements PngEncoder {
  private readonly waiting: { resolve: (r: PngWorkerReply) => void; reject: (e: Error) => void }[] =
    [];
  private last: Promise<PngWorkerReply>;
  private failure: Error | null = null;

  constructor(
    private readonly port: PngPort,
    opts: RasterStreamOptions,
    private readonly close?: () => void,
    format: RasterFormat = 'png',
  ) {
    port.onmessage = (e: MessageEvent) => {
      this.waiting.shift()?.resolve(e.data as PngWorkerReply);
    };
    this.last = this.send({ type: 'start', opts, format });
    this.last.catch(ignore); // awaited by the next push or finish, or dropped by abort
  }

  abort(): void {
    this.fail(new Error('PNG encoding was stopped.'));
  }

  /** The worker died (failed to load, or crashed): every request still waiting fails. */
  fail(error: Error): void {
    this.failure = error;
    for (const w of this.waiting.splice(0)) w.reject(error);
    this.close?.();
  }

  private send(req: PngWorkerRequest, transfer: Transferable[] = []): Promise<PngWorkerReply> {
    if (this.failure) return Promise.reject(this.failure);
    const reply = new Promise<PngWorkerReply>((resolve, reject) => {
      this.waiting.push({ resolve, reject });
    });
    this.port.postMessage(req, transfer);
    return reply;
  }

  private async settled(): Promise<void> {
    const r = await this.last;
    if (r.type === 'error') {
      const error = new Error(r.message);
      this.fail(error);
      throw error;
    }
  }

  async push(rgba: Uint8Array | Uint8ClampedArray): Promise<void> {
    await this.settled();
    this.last = this.send({ type: 'push', rgba }, transferable(rgba));
    this.last.catch(ignore);
  }

  async finish(): Promise<Uint8Array> {
    await this.settled();
    const r = await this.send({ type: 'finish' });
    this.close?.();
    if (r.type === 'error') throw new Error(r.message);
    if (r.type !== 'done') throw new Error('PNG encoding failed.');
    return r.png;
  }
}

/** A TiffWriter behind the encoder interface, for use on this thread. */
class LocalTiffEncoder implements PngEncoder {
  private readonly writer: TiffWriter;
  constructor(opts: TiffOptions) {
    this.writer = new TiffWriter(opts);
  }
  push(rgba: Uint8Array | Uint8ClampedArray): Promise<void> {
    try {
      this.writer.push(rgba);
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }
  finish(): Promise<Uint8Array> {
    try {
      return Promise.resolve(this.writer.finish());
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }
}

function workerEncoder(
  format: RasterFormat,
  opts: RasterStreamOptions,
  local: () => PngEncoder,
): PngEncoder {
  if (typeof Worker === 'undefined') return local();
  let worker: Worker;
  try {
    worker = new Worker(new URL('./pngWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return local();
  }
  const encoder = new PortPngEncoder(
    worker,
    opts,
    () => {
      worker.terminate();
    },
    format,
  );
  const died = (what: string) => () => {
    encoder.fail(new Error(`Image encoding failed (${what}).`));
  };
  worker.onerror = died('the encoder stopped');
  worker.onmessageerror = died('a band could not be sent');
  return encoder;
}

/** A PNG encoder in a worker where the browser has them, else on this thread. */
export function pngEncoder(opts: PngStreamOptions): PngEncoder {
  return workerEncoder('png', opts, () => new PngWriter(opts));
}

/** A TIFF encoder in a worker where the browser has them, else on this thread. */
export function tiffEncoder(opts: TiffOptions): PngEncoder {
  return workerEncoder('tiff', opts, () => new LocalTiffEncoder(opts));
}

/**
 * A TIFF read for import in a worker where the browser has them, else on this
 * thread (issue 65, note 43). The bytes are handed over: do not use them after.
 */
export function decodeTiffInWorker(bytes: Uint8Array): Promise<DecodedTiff> {
  const local = (): Promise<DecodedTiff> => {
    try {
      return Promise.resolve(readTiffForImport(bytes));
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  };
  if (typeof Worker === 'undefined') return local();
  let worker: Worker;
  try {
    worker = new Worker(new URL('./pngWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return local();
  }
  return new Promise<DecodedTiff>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      const r = e.data as PngWorkerReply;
      worker.terminate();
      if (r.type === 'tiff') resolve(r.result);
      else reject(new Error(r.type === 'error' ? r.message : 'The TIFF could not be read.'));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error('The TIFF could not be read (the decoder stopped).'));
    };
    const { buffer } = bytes;
    const owns =
      buffer instanceof ArrayBuffer &&
      bytes.byteOffset === 0 &&
      bytes.byteLength === buffer.byteLength;
    worker.postMessage(
      { type: 'decodeTiff', bytes } satisfies PngWorkerRequest,
      owns ? [buffer] : [],
    );
  });
}
