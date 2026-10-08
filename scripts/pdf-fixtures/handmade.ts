/**
 * Writes src/io/pdf/fixtures/handmade.pdf (note 13): the PDF features plots
 * rarely use but PDF import must still handle, written as raw content so
 * each is exact. `node scripts/pdf-fixtures/handmade.ts`.
 *
 * - A Type 3 font whose glyphs have no Unicode meaning (codes 1 and 2, names
 *   pdf.js cannot map): drawn as shapes.
 * - Helvetica text, rotated by 30°, and invisible text (render mode 3).
 * - A circular clip (cut exactly, issue 25), an even-odd fill, a dashed
 *   CMYK stroke and a half-transparent fill (ExtGState /ca).
 * - A 3 × 2 RGB image (becomes six rectangles).
 */
import { writeFileSync } from 'node:fs';

import { PDFDocument, PDFName, PDFNumber, StandardFonts } from 'pdf-lib';

const doc = await PDFDocument.create();
doc.setProducer('handmade');
doc.setCreator('handmade');
doc.setCreationDate(new Date(0));
doc.setModificationDate(new Date(0));
const page = doc.addPage([200, 150]);
const ctx = doc.context;
const helv = await doc.embedFont(StandardFonts.Helvetica);

const glyph = (body: string) => ctx.stream(`1000 0 0 0 800 800 d1\n${body}`);
const t3 = ctx.obj({
  Type: 'Font',
  Subtype: 'Type3',
  FontBBox: [0, 0, 1000, 1000],
  FontMatrix: [0.001, 0, 0, 0.001, 0, 0],
  CharProcs: {
    sq: ctx.register(glyph('0 0 m 800 0 l 800 800 l 0 800 l h f')),
    tri: ctx.register(glyph('0 0 m 800 0 l 400 800 l h f')),
  },
  Encoding: { Type: 'Encoding', Differences: [1, PDFName.of('sq'), PDFName.of('tri')] },
  FirstChar: 1,
  LastChar: 2,
  Widths: [1000, 1000],
  Resources: {},
});
const img = ctx.stream(
  new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255]),
  {
    Type: 'XObject',
    Subtype: 'Image',
    Width: 3,
    Height: 2,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 8,
  },
);
const resources = ctx.obj({
  Font: { F1: helv.ref, T3: ctx.register(t3) },
  ExtGState: { Half: { Type: 'ExtGState', ca: PDFNumber.of(0.5) } },
  XObject: { Im1: ctx.register(img) },
});
const content = `
q 1 0 0 RG 2 w 10 10 180 130 re S Q
q 0 0 0 1 k 0 0 0 1 K [4 2] 0 d 1 w 20 120 m 180 120 l S Q
q /Half gs 0 0 1 rg 20 20 60 40 re f Q
q 0 0.5 0 rg 100 20 m 160 20 l 160 80 l 100 80 l h 115 35 m 145 35 l 145 65 l 115 65 l h f* Q
q 100 100 m 100 111 109 120 120 120 c 131 120 140 111 140 100 c 140 89 131 80 120 80 c 109 80 100 89 100 100 c h W n
  0 0 0 rg 90 70 60 60 re f Q
BT /F1 10 Tf 0.866 0.5 -0.5 0.866 30 80 Tm (Rotated) Tj ET
q BT 3 Tr /F1 10 Tf 20 100 Td (hidden) Tj ET Q
BT /T3 12 Tf 150 40 Td <0102> Tj ET
q 30 0 0 20 150 100 cm /Im1 Do Q
`;
page.node.set(PDFName.of('Resources'), resources);
page.node.set(PDFName.of('Contents'), ctx.register(ctx.stream(content)));
writeFileSync('src/io/pdf/fixtures/handmade.pdf', await doc.save({ useObjectStreams: false }));
