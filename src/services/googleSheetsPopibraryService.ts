import type { PopItem } from '../types';
import { fetchSharedReadResource, postSharedWriteAction } from './sharedDataApi';

const POPIBRARY_SHEET_NAME = (import.meta as any).env?.VITE_POPIBRARY_SHEET_TAB?.trim() || 'shared_popibrary';
let resolvedPopibrarySheetNameCache: string | null = POPIBRARY_SHEET_NAME;

export const fetchSharedPopibraryItems = async (): Promise<PopItem[]> => {
    return fetchSharedReadResource<PopItem>('popibrary');
};

export const appendSharedPopibraryItem = async (pop: PopItem) => {
    return postSharedWriteAction<PopItem>('popibrary', 'append', { pop });
};

export const updateSharedPopibraryItem = async (pop: PopItem) => {
    return postSharedWriteAction<PopItem>('popibrary', 'update', { pop });
};

export const deleteSharedPopibraryItem = async (popId: string) => {
    await postSharedWriteAction('popibrary', 'delete', { popId });
};

export const getSharedPopibrarySheetName = () => resolvedPopibrarySheetNameCache || POPIBRARY_SHEET_NAME;
