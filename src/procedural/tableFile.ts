/**
 * Reading a .csv/.tsv/.txt file for the well-map editor. The file is data:
 * it is size-capped, must look like text (no NUL bytes, valid UTF-8) and is
 * only ever handed to `wellsFromTable`, the parser pasted tables use.
 */

export const MAX_TABLE_BYTES = 1_000_000;

export type TableFileResult =
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly error: string };

const TEXT_NAME = /\.(csv|tsv|txt)$/i;
const TOO_BIG = 'That file is larger than 1 MB, too big for a plate.';

/** Decode the bytes of a table file; a UTF-8 BOM is dropped, a UTF-16 BOM is honoured. */
export function decodeTableBytes(bytes: Uint8Array, name: string): TableFileResult {
  if (!TEXT_NAME.test(name)) return { ok: false, error: 'Choose a .csv, .tsv or .txt file.' };
  if (bytes.length > MAX_TABLE_BYTES) return { ok: false, error: TOO_BIG };
  const utf16 =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? 'utf-16be'
        : null;
  if (!utf16 && bytes.includes(0)) return { ok: false, error: 'That file is not plain text.' };
  try {
    const text = new TextDecoder(utf16 ?? 'utf-8', { fatal: true }).decode(bytes);
    return { ok: true, text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text };
  } catch {
    return { ok: false, error: 'That file is not valid UTF-8 text.' };
  }
}

export async function readTableFile(file: File): Promise<TableFileResult> {
  if (file.size > MAX_TABLE_BYTES) return { ok: false, error: TOO_BIG };
  return decodeTableBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}
