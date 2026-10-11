/** The agar plate's tetrad wizard (note 58): how many tetrads, how they segregate, what fails. */
import type { KindWizard } from '../types';
import type { PetriParams } from './petri';

/** Share of spores (percent) beyond which the plate is mostly empty or dead. */
const MOSTLY = 50;

export const tetradWizard: KindWizard<PetriParams> = {
  title: 'Tetrad plate wizard',
  steps: [
    {
      question: 'How many tetrads?',
      fields: [
        {
          key: 'tetrads',
          label: 'Tetrads',
          type: 'int',
          min: 1,
          max: 24,
          default: 8,
          help: 'One column of four spores (a to d) per tetrad.',
        },
        { key: 'tetradLabels', label: 'Number the tetrads', type: 'bool', default: true },
      ],
    },
    {
      question: 'How do the spores segregate?',
      fields: [
        {
          key: 'segregation',
          label: 'Segregation',
          type: 'enum',
          options: [
            { value: 'mixed', label: 'Mostly 2:2, some others' },
            { value: '2:2', label: '2:2' },
            { value: '4:0', label: '4:0' },
            { value: '3:1', label: '3:1' },
            { value: '1:3', label: '1:3' },
            { value: '0:4', label: '0:4' },
          ],
          default: '2:2',
          help: 'Spores of the usual colour : spores of the marker colour in each tetrad.',
        },
      ],
    },
    {
      question: 'Which spores fail?',
      fields: [
        {
          key: 'dead',
          label: 'Dead spores',
          type: 'number',
          min: 0,
          max: 100,
          step: 5,
          unit: '%',
          default: 0,
          help: 'Spores that germinated but stopped as a tiny microcolony.',
        },
        {
          key: 'missing',
          label: 'Missing spores',
          type: 'number',
          min: 0,
          max: 100,
          step: 5,
          unit: '%',
          default: 0,
          help: 'Spores that did not grow at all: an empty spot.',
        },
      ],
    },
  ],
  build(a) {
    const n = (k: string, lo: number, hi: number, d: number) => {
      const v = a[k];
      return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
    };
    const seg = a['segregation'];
    return {
      pattern: 'tetrads',
      tetrads: Math.round(n('tetrads', 1, 24, 8)),
      tetradLabels: a['tetradLabels'] !== false,
      segregation:
        seg === 'mixed' || seg === '4:0' || seg === '3:1' || seg === '1:3' || seg === '0:4'
          ? seg
          : '2:2',
      dead: n('dead', 0, 100, 0),
      missing: n('missing', 0, 100, 0),
    };
  },
  problems(a) {
    const dead = typeof a['dead'] === 'number' ? a['dead'] : 0;
    const missing = typeof a['missing'] === 'number' ? a['missing'] : 0;
    const out: string[] = [];
    if (dead + missing >= 100) out.push('No spore will grow into a colony.');
    else if (dead + missing > MOSTLY)
      out.push('More than half of the spores will be dead or missing.');
    return out;
  },
};
