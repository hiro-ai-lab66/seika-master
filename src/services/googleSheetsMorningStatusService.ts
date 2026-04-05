import type { SharedMorningStatusEntry } from '../types';
import { fetchSharedReadResource, postSharedWriteAction } from './sharedDataApi';

export const fetchSharedMorningStatuses = async (): Promise<SharedMorningStatusEntry[]> => {
    return fetchSharedReadResource<SharedMorningStatusEntry>('morningStatus');
};

export const upsertSharedMorningStatus = async (
    entry: Omit<SharedMorningStatusEntry, 'id' | 'rowNumber' | 'updatedAt'>
): Promise<SharedMorningStatusEntry> => {
    return postSharedWriteAction<SharedMorningStatusEntry>('morningStatus', 'upsert', { entry });
};
