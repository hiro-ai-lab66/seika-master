import type { SharedAdvertisementEntry } from '../types';
import { fetchSharedReadResource } from './sharedDataApi';

export const fetchSharedAdvertisements = async (): Promise<SharedAdvertisementEntry[]> => {
    try {
        console.log('advertisement service called');
        console.log('before sheets fetch');
        const records = await fetchSharedReadResource<SharedAdvertisementEntry>('advertisement');
        console.log('advertisement raw records:', records);
        return records;
    } catch (e) {
        console.error('advertisement fetch error:', e);
        throw e;
    }
};
