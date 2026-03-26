import type { SellfloorRecord } from '../types';
import { fetchSharedReadResource, postSharedWriteAction } from './sharedDataApi';

const SELLFLOOR_SHEET_NAME = (import.meta as any).env?.VITE_SELLFLOOR_SHEET_TAB?.trim() || 'shared_sellfloor_records';
let resolvedSellfloorSheetNameCache: string | null = SELLFLOOR_SHEET_NAME;

export const fetchSharedSellfloorRecords = async (): Promise<SellfloorRecord[]> => {
    return fetchSharedReadResource<SellfloorRecord>('sellfloor');
};

export const upsertSharedSellfloorRecord = async (record: SellfloorRecord) => {
    await postSharedWriteAction('sellfloor', 'upsert', {
        record: {
            ...record,
            updatedAt: new Date().toISOString()
        }
    });
};

export const updateSharedSellfloorRecord = async (record: SellfloorRecord) => {
    await postSharedWriteAction('sellfloor', 'update', {
        record: {
            ...record,
            updatedAt: new Date().toISOString()
        }
    });
};

export const deleteSharedSellfloorRecord = async (recordId: string) => {
    await postSharedWriteAction('sellfloor', 'delete', { recordId });
};

export const getSharedSellfloorSheetName = () => resolvedSellfloorSheetNameCache || SELLFLOOR_SHEET_NAME;
