import type { SharedShiftMasterRow } from '../types';
import { fetchSharedReadResource } from './sharedDataApi';

export const fetchSharedShiftRows = async () =>
  fetchSharedReadResource<SharedShiftMasterRow>('shift', { ttlMs: 60_000 });
