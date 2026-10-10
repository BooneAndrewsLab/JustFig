/**
 * JSON Schema (draft 2020-12) for a procedural kind's `params`, generated from
 * its `fields` so the published fragment schema cannot drift from the kinds
 * (note 05, issue 79). The decoder is lenient (note 04): a value outside this
 * schema is replaced or clamped, never refused, so the schema is the contract a
 * generator should meet rather than a validity test the app applies.
 */
import type { Field, ProceduralKind, ScalarField } from './types';

type Schema = Record<string, unknown>;

const HEX = '^#[0-9a-fA-F]{6}$';

function describe(f: Field): Schema {
  const text = [f.label, f.help].filter((x): x is string => x !== undefined && x !== '');
  return { description: text.join('. ') };
}

function scalar(f: ScalarField): Schema {
  switch (f.type) {
    case 'number':
    case 'int':
      return {
        type: f.type === 'int' ? 'integer' : 'number',
        minimum: f.min,
        maximum: f.max,
        default: f.default,
        ...describe(f),
        ...(f.unit !== undefined ? { 'x-unit': f.unit } : {}),
      };
    case 'enum':
      return { enum: f.options.map((o) => o.value), default: f.default, ...describe(f) };
    case 'bool':
      return { type: 'boolean', default: f.default, ...describe(f) };
    case 'text':
      return { type: 'string', maxLength: f.maxLength, default: f.default, ...describe(f) };
    case 'color':
      return {
        type: 'string',
        pattern: f.auto === true ? `^(${HEX.slice(1, -1)})?$` : HEX,
        default: f.default,
        ...describe(f),
      };
  }
}

function field(f: Field): Schema {
  if (f.type === 'list') {
    return {
      type: 'array',
      minItems: f.min,
      maxItems: f.max,
      items: {
        type: 'object',
        properties: Object.fromEntries(f.item.map((i) => [i.key, scalar(i)])),
      },
      ...describe(f),
    };
  }
  if (f.type === 'wellMap') {
    return {
      type: 'object',
      propertyNames: { pattern: '^[A-Z]{1,2}[1-9][0-9]?$' },
      additionalProperties: { type: 'string', pattern: HEX },
      ...describe(f),
    };
  }
  return scalar(f);
}

/** The schema of one kind's `params` object. Unknown keys are ignored by the app, so they are allowed. */
export function paramsSchema(kind: ProceduralKind): Schema {
  return {
    type: 'object',
    title: `${kind.kind} params`,
    description: kind.description,
    properties: Object.fromEntries(kind.fields.map((f) => [f.key, field(f)])),
  };
}

/**
 * `$defs` entries and the `allOf` branches that attach each kind's params
 * schema to a procedural object of that kind and current `kindVersion`.
 */
export function proceduralSchemas(kinds: readonly ProceduralKind[]): {
  defs: Record<string, Schema>;
  allOf: Schema[];
} {
  const defs: Record<string, Schema> = {};
  const allOf: Schema[] = [];
  for (const k of kinds) {
    const name = `Params_${k.kind}`;
    defs[name] = paramsSchema(k);
    allOf.push({
      if: {
        properties: { kind: { const: k.kind }, kindVersion: { const: k.version } },
        required: ['kind', 'kindVersion'],
      },
      then: { properties: { params: { $ref: `#/$defs/${name}` } } },
    });
  }
  return { defs, allOf };
}
