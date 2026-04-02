import type { SharedAdvertisementEntry } from '../types';
import { fetchSharedReadResource } from './sharedDataApi';

export const fetchSharedAdvertisements = async (): Promise<SharedAdvertisementEntry[]> => {
    try {
        return await fetchSharedReadResource<SharedAdvertisementEntry>('advertisement');
    } catch (e) {
        console.error('advertisement fetch error:', e);
        throw e;
    }
};
