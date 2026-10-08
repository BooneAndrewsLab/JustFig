/**
 * Assets (note 02): content-addressed by a hash of their canonical JSON,
 * so placing the same icon twice stores it once.
 */
import { contentHash } from '@/core/model/hash';
import type { Asset } from '@/core/model/types';

import { canonical } from './jfig';

export const hashAsset = (a: Asset): string => contentHash(JSON.stringify(canonical(a)));
