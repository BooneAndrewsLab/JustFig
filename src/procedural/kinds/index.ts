/** Every procedural kind this version knows (note 04), in Objects-panel order. */
import type { ProceduralKind } from '../types';
import { cell } from './cell';
import { proteinDomains } from './domains';
import { gel } from './gel';
import { gelLabels } from './gelLabels';
import { bilayer, helix, receptors } from './pathKinds';
import { petriDish } from './petri';
import { plasmidMap } from './plasmid';
import { placeholderPlot } from './plot';
import { scaleBar } from './scaleBar';
import { sequenceSnippet } from './sequence';
import { studyDesign } from './studyDesign';
import { timeline } from './timeline';
import { tree } from './tree';
import { wellPlate } from './wellPlate';

export const KINDS: readonly ProceduralKind[] = [
  cell,
  bilayer,
  receptors,
  helix,
  plasmidMap,
  proteinDomains,
  wellPlate,
  petriDish,
  gel,
  gelLabels,
  scaleBar,
  timeline,
  sequenceSnippet,
  studyDesign,
  tree,
  placeholderPlot,
];
