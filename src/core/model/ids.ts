/**
 * Stable ids for everything a project holds (note 02). An id never changes
 * once made, so renaming or reordering never breaks a reference.
 *
 * The prefix says what the id names, which keeps saved files and bug
 * reports readable: `d_` document, `pg_` page, `ly_` layer, `o_` object,
 * `ts_` text style, `sw_` swatch.
 */

export type Id = string & { readonly __brand: 'Id' };

/** `n_`: a review note or reply (note 24). `k_` is not in documents: it keys rows the user keeps on purpose (saved presets, note 22). */
export type IdPrefix = 'd' | 'pg' | 'ly' | 'o' | 'ts' | 'sw' | 'n' | 'k';

/** Takes a string that is already an id, e.g. read from a file. */
export const asId = (s: string): Id => s as Id;

/**
 * A fresh id: the prefix and 64 random bits in hex.
 *
 * `crypto.getRandomValues` is used rather than `randomUUID` because it also
 * exists outside a secure context (a dev server reached by IP), as in
 * PlasmidPop's `newId`.
 */
export function newId(prefix: IdPrefix): Id {
  const bytes = new Uint8Array(8);
  const webCrypto = (globalThis as { crypto?: Partial<Crypto> }).crypto;
  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let hex = '';
  bytes.forEach((b) => {
    hex += b.toString(16).padStart(2, '0');
  });
  return asId(`${prefix}_${hex}`);
}
