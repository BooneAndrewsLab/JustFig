/**
 * Big PNGs encoded off the main thread (issue 60, note 33): a worker runs the
 * `PngWriter` (row filters and deflate) on one band while the main thread
 * draws the next, so the two overlap and the page stays responsive. Without
 * workers (unit tests, or one that cannot start) the writer runs here.
 */
import { PngWriter, type PngStreamOptions } from './png';

/** What exportPng feeds bands to: a `PngWriter` here or in a worker. */
export interface PngEncoder {
  /** The next RGBA rows. A worker takes over the buffer: do not use it after. */
  push(rgba: Uint8Array | Uint8ClampedArray): Promise<void>;
  finish(): Promise<Uint8Array>;
  /** Gives up (the drawing failed): frees the worker. */
  abort?(): void;
}

export type PngWorkerRequest =
  | { readonly type: 'start'; readonly opts: PngStreamOptions }
  | { readonly type: 'push'; readonly rgba: Uint8Array | Uint8ClampedArray }
  | { readonly type: 'finish' };

export type PngWorkerReply =
  | { readonly type: 'ok' }
  | { readonly type: 'done'; readonly png: Uint8Array }
  | { readonly type: 'error'; readonly message: string };

/** The side of a worker (or a MessagePort, in tests) the writer talks through. */
export interface PngPort {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
}

/** The worker's side: one writer per worker, requests answered in order. */
export function servePngWriter(port: PngPort): void {
  let writer: PngWriter | null = null;
  let queue = Promise.resolve();
  const reply = (r: PngWorkerReply, transfer: Transferable[] = []) => {
    port.postMessage(r, transfer);
  };
  const handle = async (req: PngWorkerRequest): Promise<void> => {
    if (req.type === 'start') {
      writer = new PngWriter(req.opts);
      reply({ type: 'ok' });
      return;
    }
    if (!writer) throw new Error('PNG writer not started');
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
    opts: PngStreamOptions,
    private readonly close?: () => void,
  ) {
    port.onmessage = (e: MessageEvent) => {
      this.waiting.shift()?.resolve(e.data as PngWorkerReply);
    };
    this.last = this.send({ type: 'start', opts });
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

/** A PNG encoder in a worker where the browser has them, else on this thread. */
export function pngEncoder(opts: PngStreamOptions): PngEncoder {
  if (typeof Worker === 'undefined') return new PngWriter(opts);
  let worker: Worker;
  try {
    worker = new Worker(new URL('./pngWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return new PngWriter(opts);
  }
  const encoder = new PortPngEncoder(worker, opts, () => {
    worker.terminate();
  });
  const died = (what: string) => () => {
    encoder.fail(new Error(`PNG encoding failed (${what}).`));
  };
  worker.onerror = died('the encoder stopped');
  worker.onmessageerror = died('a band could not be sent');
  return encoder;
}
