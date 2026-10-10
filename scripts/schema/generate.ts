import { mkdirSync, writeFileSync } from 'node:fs';

import { createGenerator } from 'ts-json-schema-generator';
import { createServer } from 'vite';

// The fragment JSON Schema (draft 2020-12), served with the app at /schema/fragment.schema.json
// (note 05, issue 79). Two sources, so it cannot drift:
//  - the shape of every object, from `FragmentFile` in src/io/jfig.ts (ts-json-schema-generator,
//    which writes draft-07; the two dialects differ here only in `definitions` → `$defs`);
//  - each procedural kind's `params`, from the kind's `fields` (src/procedural/paramsSchema.ts).
// `--stdout` prints it instead of writing public/schema/fragment.schema.json (the staleness test).
const OUT_DIR = 'public/schema';
const OUT = `${OUT_DIR}/fragment.schema.json`;

type Schema = Record<string, unknown>;

const base = createGenerator({
  path: 'src/io/jfig.ts',
  tsconfig: 'tsconfig.app.json',
  type: 'FragmentFile',
  expose: 'export',
  topRef: false,
  skipTypeCheck: true,
}).createSchema('FragmentFile') as Schema;

// The kinds import through the app's `@/` alias, so load them the way the app does.
const vite = await createServer({
  configFile: 'vite.config.ts',
  appType: 'custom',
  server: { middlewareMode: true, watch: null },
  logLevel: 'silent',
  optimizeDeps: { noDiscovery: true },
  ssr: { noExternal: ['opentype.js'] },
});
let extra: { defs: Record<string, Schema>; allOf: Schema[] };
try {
  const kinds = (await vite.ssrLoadModule('/src/procedural/registry.ts')) as {
    allKinds: () => readonly unknown[];
  };
  const schemas = (await vite.ssrLoadModule('/src/procedural/paramsSchema.ts')) as {
    proceduralSchemas: (k: readonly unknown[]) => typeof extra;
  };
  extra = schemas.proceduralSchemas(kinds.allKinds());
} finally {
  await vite.close();
}

const { definitions, $schema: _draft, ...rest } = base;
const defs = { ...(definitions as Record<string, Schema>), ...extra.defs };
const procedural = defs['Procedural'];
if (procedural === undefined) throw new Error('schema: no Procedural definition');
defs['Procedural'] = { ...procedural, allOf: extra.allOf };

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  ...rest,
  title: 'Figure fragment',
  description:
    'Objects and the assets they use, pasted or opened into a figure. Units are points (1/72 in).',
  $defs: defs,
};
const text = `${JSON.stringify(schema, null, 2).replaceAll('#/definitions/', '#/$defs/')}\n`;

if (process.argv.includes('--stdout')) {
  process.stdout.write(text);
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, text);
  process.stdout.write(`schema: wrote ${OUT}\n`);
}
