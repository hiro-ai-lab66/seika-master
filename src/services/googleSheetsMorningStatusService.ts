import type { SharedMorningStatusEntry } from '../types';
import { fetchSharedReadResource, postSharedWriteAction } from './sharedDataApi';

export const fetchSharedMorningStatuses = async (
    options?: { force?: boolean; ttlMs?: number }
): Promise<SharedMorningStatusEntry[]> => {
    return fetchSharedReadResource<SharedMorningStatusEntry>('morningStatus', options);
};

export const upsertSharedMorningStatus = async (
    entry: Omit<SharedMorningStatusEntry, 'id' | 'rowNumber' | 'updatedAt'>
): Promise<SharedMorningStatusEntry> => {
    return postSharedWriteAction<SharedMorningStatusEntry>('morningStatus', 'upsert', { entry });
};
