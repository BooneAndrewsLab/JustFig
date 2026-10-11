/**
 * Plasmid backbone presets (note 58): published cloning vectors as named features. Built here
 * from the public GenBank records, never from PlasmidPop. Positions are 1-based and inclusive
 * on the record's own numbering; strand -1 is the complement strand.
 *
 * How each was checked (NCBI efetch, 2026-10-11):
 *
 * pUC19, GenBank L09137.2 (SYNPUC19CV, 2686 bp). The record carries no feature table, so
 * every coordinate was found by searching the record's own sequence for the feature's
 * sequence and confirming it, not copied from a drawing:
 *  - AmpR (bla), complement 1626..2486: the 861 bp ORF translates to the 286-residue TEM-1
 *    beta-lactamase (MSIQHFRVALIPFFAAFCLPVFA... ...EIGASLIKHW), start ATG at 2486, stop at 1626.
 *  - ori (pMB1/pUC), complement 867..1455: the 589 bp origin sequence matches exactly.
 *  - AmpR promoter, complement 2487..2591: the 105 bp sequence matches exactly.
 *  - lacZα, complement 146..469: ORF from ATGACCATGATTACGCCAAGC at 469 to the stop at 146,
 *    MTMITPSLHACRSTLEDPRVPSSNSLAVVLQRRDWENPGVTQLNRLAAHPPFASWRNSEEARTDRPSQQLRSLNGEWR...
 *  - lac promoter, complement 513..543: tttacactttatgcttccggctcgtatgttg matches exactly.
 *  - MCS 396..452: from the EcoRI site GAATTC (396..401) to the HindIII site AAGCTT
 *    (447..452), the only sites of those enzymes in the record.
 *
 * pBR322, GenBank J01749.1 (SYNPBR322, 4361 bp). Taken from the record's own feature table:
 *  - tet CDS 86..1276 (tetracycline resistance protein),
 *  - rop CDS 1915..2106 (ROP protein),
 *  - bla CDS complement(3293..4153) (beta-lactamase, 286 residues, same protein as above).
 *  The record marks the origin only as a point (rep_origin 2535), so its span was found by
 *  aligning pUC19's 589 bp ori to the record: complement 2534..3122, one substitution (the
 *  known pUC copy-number point mutation), which brackets that point.
 *
 * pET-28a(+) and pLKO.1 are left out on purpose: NCBI holds no record of the vector itself
 * (only derivatives carrying inserts, with other lengths and numbering), so their coordinates
 * could not be checked. A wrong map is worse than none.
 */
import type { Feature } from './plasmid';

const f = (
  name: string,
  start: number,
  end: number,
  strand: Feature['strand'],
  type: string,
  color = '',
): Feature => ({ name, start, end, strand, type, color });

export const PUC19_LENGTH = 2686;

/** pUC19, L09137.2; see the file header for how each position was verified. */
export const PUC19_FEATURES: readonly Feature[] = [
  f('AmpR', 1626, 2486, -1, 'CDS'),
  f('ori', 867, 1455, -1, 'rep_origin'),
  f('lacZα', 146, 469, -1, 'CDS', '#56b4e9'),
  f('lac promoter', 513, 543, -1, 'promoter'),
  f('MCS', 396, 452, 0, 'misc_feature'),
  f('AmpR promoter', 2487, 2591, -1, 'promoter'),
];

export const PBR322_LENGTH = 4361;

/** pBR322, J01749.1; see the file header. */
export const PBR322_FEATURES: readonly Feature[] = [
  f('TetR', 86, 1276, 1, 'CDS'),
  f('rop', 1915, 2106, 1, 'CDS'),
  f('ori', 2534, 3122, -1, 'rep_origin'),
  f('AmpR', 3293, 4153, -1, 'CDS'),
];
