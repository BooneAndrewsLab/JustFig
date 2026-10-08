import { writeFileSync } from 'node:fs';

import { createGenerator } from 'ts-json-schema-generator';

// The fragment JSON Schema, generated from `FragmentFile` in src/io/jfig.ts (note 05).
// `--stdout` prints it instead of writing schemas/fragment.schema.json (the staleness test uses it).
const schema = createGenerator({
  path: 'src/io/jfig.ts',
  tsconfig: 'tsconfig.app.json',
  type: 'FragmentFile',
  expose: 'export',
  topRef: false,
  skipTypeCheck: true,
}).createSchema('FragmentFile');
const text = `${JSON.stringify(schema, null, 2)}\n`;

if (process.argv.includes('--stdout')) {
  process.stdout.write(text);
} else {
  writeFileSync('schemas/fragment.schema.json', text);
  process.stdout.write('schema: wrote schemas/fragment.schema.json\n');
}
