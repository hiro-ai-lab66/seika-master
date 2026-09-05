import type { SellfloorRecord } from '../types';
import { fetchSharedReadResource, postSharedWriteAction } from './sharedDataApi';

const SELLFLOOR_SHEET_NAME = (import.meta as any).env?.VITE_SELLFLOOR_SHEET_TAB?.trim() || 'shared_sellfloor_records';
export const SELLFLOOR_WRITE_TIMEOUT_MS = 30_000;
let resolvedSellfloorSheetNameCache: string | null = SELLFLOOR_SHEET_NAME;

export class SellfloorSharedWriteTimeoutError extends Error {
    readonly resultUnknown = true;

    constructor() {
        super('売り場記録の保存結果を確認できませんでした');
        this.name = 'SellfloorSharedWriteTimeoutError';
    }
}

export class SellfloorSharedWriteUnknownError extends Error {
    readonly resultUnknown = true;

    constructor(message = '売り場記録の保存結果を確認できませんでした') {
        super(message);
        this.name = 'SellfloorSharedWriteUnknownError';
    }
}

const postSellfloorWriteAction = async (action: 'upsert' | 'update', record: SellfloorRecord) => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
            controller.abort();
            reject(new SellfloorSharedWriteTimeoutError());
        }, SELLFLOOR_WRITE_TIMEOUT_MS);
    });

    try {
        await Promise.race([
            postSharedWriteAction('sellfloor', action, {
                record: {
                    ...record,
                    updatedAt: new Date().toISOString()
                }
            }, { signal: controller.signal }),
            timeoutPromise
        ]);
    } catch (error) {
        if (controller.signal.aborted && !(error instanceof SellfloorSharedWriteTimeoutError)) {
            throw new SellfloorSharedWriteTimeoutError();
        }
        if (error instanceof TypeError) {
            throw new SellfloorSharedWriteUnknownError(error.message);
        }
        throw error;
    } finally {
        clearTimeout(timeout!);
    }
};

export const fetchSharedSellfloorRecords = async (): Promise<SellfloorRecord[]> => {
    return fetchSharedReadResource<SellfloorRecord>('sellfloor');
};

export const upsertSharedSellfloorRecord = async (record: SellfloorRecord) => {
    await postSellfloorWriteAction('upsert', record);
};

export const updateSharedSellfloorRecord = async (record: SellfloorRecord) => {
    await postSellfloorWriteAction('update', record);
};

export const deleteSharedSellfloorRecord = async (recordId: string) => {
    await postSharedWriteAction('sellfloor', 'delete', { recordId });
};

export const getSharedSellfloorSheetName = () => resolvedSellfloorSheetNameCache || SELLFLOOR_SHEET_NAME;
