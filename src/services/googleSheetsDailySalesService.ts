import type { DailySalesRecord } from '../types';
import { fetchSharedReadResource, postSharedWriteAction } from './sharedDataApi';

export type SharedDailySalesUpsertPayload = {
    date: string;
    department: '野菜' | '果物';
    records: DailySalesRecord[];
};

export type SharedDailySalesEnrichPayload = {
    date: string;
    weather?: string;
    temp_band?: string;
    customer_count?: number | null;
    avg_price?: number | null;
};

const normalizeDailySalesDate = (value: string) => {
    const trimmed = (value || '').trim().replace(/\//g, '-');
    const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
        return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }
    return trimmed;
};

export const fetchSharedDailySales = async (): Promise<DailySalesRecord[]> => {
    const records = await fetchSharedReadResource<DailySalesRecord>('dailySales');
    console.log('[DailySalesSheets] fetched records', {
        rowCount: records.length,
        sampleRows: records.slice(0, 10)
    });
    return records.map((record) => ({
        ...record,
        date: normalizeDailySalesDate(record.date)
    }));
};

export const fetchSharedDailySalesByDate = async (date: string): Promise<DailySalesRecord[]> => {
    const normalizedDate = normalizeDailySalesDate(date);
    const records = await fetchSharedDailySales();
    const filtered = records.filter((record) => normalizeDailySalesDate(record.date) === normalizedDate);
    console.log('[DailySalesSheets] records for date', {
        date,
        normalizedDate,
        rowCount: filtered.length,
        sampleRows: filtered.slice(0, 10)
    });
    return filtered;
};

export const upsertSharedDailySalesForDateDepartment = async (payload: SharedDailySalesUpsertPayload) => {
    console.log('[DailySalesSheets] upsert payload', {
        date: payload.date,
        department: payload.department,
        recordCount: payload.records.length,
        sampleRows: payload.records.slice(0, 10)
    });
    return postSharedWriteAction<{ ok: boolean; rowCount: number }>(
        'dailySales',
        'upsertForDateDepartment',
        {
            ...payload,
            date: normalizeDailySalesDate(payload.date),
            records: payload.records.map((record) => ({
                ...record,
                date: normalizeDailySalesDate(record.date)
            }))
        }
    );
};

export const enrichSharedDailySalesByDate = async (payload: SharedDailySalesEnrichPayload) => {
    console.log('[DailySalesSheets] enrich payload', payload);
    return postSharedWriteAction<{ ok: boolean }>('dailySales', 'enrichByDate', {
        ...payload,
        date: normalizeDailySalesDate(payload.date)
    });
};
