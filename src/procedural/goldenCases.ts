/** Variants each kind's golden SVGs cover, besides its defaults (kinds.test.ts). */
import type { Params } from './types';

export const GOLDEN_CASES: Readonly<Record<string, Readonly<Record<string, Partial<Params>>>>> = {
  wellPlate: {
    '24-square': { format: '24', shape: 'square', wells: { A1: '#e69f00', D6: '#0072b2' } },
    '48-plain': { format: '48', showLabels: false, outline: false, wells: { F8: '#0072b2' } },
    '6-painted': { format: '6', wells: { A1: '#d55e00', B3: '#009e73' } },
  },
  bilayer: {
    vesicle: { closed: true, tails: 'wavy' },
  },
  helix: {
    rna: { molecule: 'rna', perTurn: 8 },
  },
  receptors: {
    gpcr: { protein: 'gpcr', side: 'in' },
    channel: { protein: 'channel', membrane: false },
    antibody: { protein: 'antibody' },
  },
  plasmidMap: {
    linear: { topology: 'linear', name: 'pLinear', length: 6000 },
    origin: {
      length: 4000,
      features: [
        { name: 'across ori', start: 3800, end: 200, strand: 1, type: 'CDS', color: '' },
        { name: 'rev', start: 1000, end: 1600, strand: -1, type: 'promoter', color: '#cc79a7' },
      ],
    },
  },
  proteinDomains: {
    shapes: {
      length: 300,
      domains: [
        { name: 'A', start: 10, end: 80, color: '#56b4e9', shape: 'ellipse' },
        { name: 'B', start: 100, end: 200, color: '#d55e00', shape: 'hexagon' },
      ],
      showScale: false,
    },
  },
  petriDish: {
    streak: { pattern: 'streak' },
    spots: { pattern: 'spots', count: 40 },
    grid: { pattern: 'grid', count: 96, variation: 0 },
    lawn: { pattern: 'lawn', lid: false },
  },
  gel: {
    inverted: { look: 'inverted', ladder: '100bp' },
  },
  gelLabels: {
    slanted: { angle: 45, side: 'right', ticks: false, first: 20, last: 80 },
    upright: { angle: 90, size: 6, lanes: [{ label: 'Ladder' }, { label: '' }, { label: 'WT' }] },
    'comb-gap': {
      lanes: [
        { label: 'L', shift: 0 },
        { label: '1', shift: 0 },
        { label: '2', shift: 6 },
        { label: '3', shift: 6 },
      ],
    },
  },
  scaleBar: {
    'top-left': { corner: 'tl', pixelSize: 0.065, imageWidth: 2048, length: 0.5, thickness: 2 },
    custom: { corner: 'bl', label: 'Scale', length: 25, size: 10, margin: 0 },
    unlabelled: { showLabel: false, length: 50 },
  },
  placeholderPlot: {
    umap: { plot: 'umap', points: 120, seed: 12 },
    scatter: { plot: 'scatter', legend: false, xLabel: 'Dose (µM)', yLabel: 'Response' },
    'flow-quadrant': { plot: 'flow', gate: 'quadrant', events: 1200, pointSize: 2, seed: 7 },
    'flow-polygon': { plot: 'flow', gate: 'polygon', events: 1200, pointSize: 2, seed: 7 },
    bar: { plot: 'bar' },
    bare: { plot: 'bar', axes: false, axisLabels: false, errorBars: false, dots: false },
  },
  sequence: {
    protein: {
      sequence: 'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP',
      first: 1,
      interval: 10,
      highlights: [{ start: 12, end: 20, color: '#a9d6f5' }],
      annotations: [],
      size: 10,
    },
    'highlighted-annotated': {
      sequence: 'ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAGAGCTTCA',
      first: 100,
      highlights: [
        { start: 103, end: 108, color: '#ffe08a' },
        { start: 120, end: 124, color: '#a6e3a1' },
      ],
      annotations: [
        { label: 'p.R175H', start: 113, end: 115, color: '' },
        { label: 'fwd primer', start: 105, end: 125, color: '#0072b2' },
        { label: 'stop', start: 142, end: 142, color: '#cc79a7' },
      ],
    },
    wrapped: {
      sequence:
        'ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAGAGCTTCAGGATCCAAGCTTGGCGCGCCTAGGTTAATTAAACGTACGGATATCCCGGGAATTCGTCGAC',
      first: 1,
      interval: 20,
      highlights: [{ start: 40, end: 70, color: '#f4b6c2' }],
      annotations: [{ label: 'MCS', start: 40, end: 70, color: '' }],
    },
  },
  timeline: {
    below: {
      side: 'below',
      tickLabels: 'unit',
      events: [
        { label: 'Seed', time: 0, marker: 'tick', end: 0, color: '' },
        { label: 'Imaging', time: 4, marker: 'bracket', end: 6, color: '#0072b2' },
        { label: 'Fix', time: 7, marker: 'tick', end: 7, color: '' },
      ],
      ranges: [],
      end: 7,
    },
    hours: {
      unit: 'hours',
      start: 0,
      end: 48,
      arrow: false,
      events: [
        { label: 'Transfect', time: 0, marker: 'triangle', end: 0, color: '' },
        { label: 'Media change', time: 6, marker: 'triangle', end: 6, color: '' },
        { label: 'Drug', time: 8, marker: 'triangle', end: 8, color: '#0072b2' },
        { label: 'Lyse', time: 48, marker: 'triangle', end: 48, color: '' },
      ],
      ranges: [
        { label: 'Serum-free', start: 6, end: 24, color: '#e69f00' },
        { label: 'Drug', start: 8, end: 48, color: '#0072b2' },
        { label: 'BrdU', start: 44, end: 48, color: '#009e73' },
      ],
    },
    weeks: {
      unit: 'weeks',
      end: 12,
      step: 4,
      events: [
        { label: 'Graft', time: 0, marker: 'tick', end: 0, color: '' },
        { label: 'Tumour monitoring', time: 2, marker: 'bracket', end: 10, color: '' },
        { label: 'Endpoint', time: 12, marker: 'triangle', end: 12, color: '' },
      ],
      ranges: [
        { label: 'High-fat diet', start: 0, end: 12, color: '#f0e442' },
        { label: 'Antibody', start: 4, end: 5, color: '#cc79a7' },
        { label: 'Washout', start: 11, end: 12, color: '#009e73' },
      ],
    },
    bare: { tickLabels: 'none', arrow: false, ranges: [], events: [] },
  },
  studyDesign: {
    three: {
      end: 28,
      arms: [
        { name: 'Vehicle', n: 8, color: '#9aa5b1' },
        { name: 'Drug A', n: 10, color: '#9aa5b1' },
        { name: 'Drug A + anti-PD-1', n: 10, color: '#9aa5b1' },
      ],
      marks: [
        { arm: 1, time: 0, kind: 'inject' },
        { arm: 1, time: 14, kind: 'sample' },
        { arm: 1, time: 28, kind: 'endpoint' },
        { arm: 2, time: 0, kind: 'inject' },
        { arm: 2, time: 7, kind: 'dose' },
        { arm: 2, time: 14, kind: 'sample' },
        { arm: 2, time: 28, kind: 'endpoint' },
        { arm: 3, time: 0, kind: 'inject' },
        { arm: 3, time: 7, kind: 'dose' },
        { arm: 3, time: 10, kind: 'dose' },
        { arm: 3, time: 14, kind: 'sample' },
        { arm: 3, time: 28, kind: 'endpoint' },
      ],
      bars: [
        { label: 'Drug A, daily', arm: 0, start: 7, end: 21, color: '#56b4e9' },
        { label: 'Anti-PD-1', arm: 3, start: 10, end: 14, color: '#e69f00' },
      ],
    },
    weeks: {
      unit: 'weeks',
      end: 12,
      tickLabels: 'unit',
      legend: false,
      arrow: false,
      arms: [{ name: 'Placebo', n: 0, color: '#9aa5b1' }],
      marks: [
        { arm: 1, time: 0, kind: 'dose' },
        { arm: 1, time: 4, kind: 'sample' },
        { arm: 1, time: 12, kind: 'endpoint' },
      ],
      bars: [],
    },
  },
  cell: {
    irregular: { shape: 'irregular', er: false, mitochondria: 10, seed: 11 },
    'irregular-wall-microvilli': { shape: 'irregular', wall: 3, microvilli: 10, vacuole: 0.3 },
    'apoptotic-bud': { apoptotic: true, bud: 0.4, chloroplasts: 4 },
  },
  bacterium: {
    'coccus-tuft-pili': { shape: 'coccus', flagella: 'tuft', pili: 12, capsule: true },
    'vibrio-positive': {
      shape: 'vibrio',
      envelope: 'positive',
      flagella: 'peritrichous',
      nucleoid: false,
    },
  },
  tree: {
    support: {
      newick:
        "((('Homo sapiens':0.10,Pan_troglodytes:0.12)99:0.06,Gorilla_gorilla:0.2)87:0.05,((Mus_musculus:0.20,Rattus_norvegicus:0.18)100:0.07,Cavia_porcellus:0.3)92:0.1,Gallus_gallus:0.6);",
    },
    cladogram: { branchLengths: false, scaleBar: false },
    circular: {
      layout: 'circular',
      newick:
        '(((Human:0.1,Chimp:0.12)99:0.06,Gorilla:0.2)87:0.05,((Mouse:0.2,Rat:0.18)100:0.07,Guinea_pig:0.3)92:0.1,(Chicken:0.5,Duck:0.45)100:0.1,Frog:0.7);',
    },
    collapsed: {
      newick: '((((A1,A2,A3,A4)Alpha,(B1,B2)Beta)95,(C1,C2,C3)Gamma)100,(D1,D2,D3)88,E);',
      collapse: [{ name: 'Alpha' }, { name: 'C1,C3' }],
    },
    'circular-collapsed': {
      layout: 'circular',
      newick:
        '((((A1:1,A2:1,A3:1,A4:1)Alpha:1,(B1:1,B2:1)Beta:1)95:1,(C1:2,C2:2,C3:2)Gamma:1)100:1,(D1:3,D2:3,D3:3)88:1,E:4);',
      collapse: [{ name: 'Alpha' }, { name: 'Gamma' }],
    },
    malformed: { newick: '((A:1,B:x),C' },
  },
};
