import type { PopItem } from '../types';
import { fetchSharedReadResource, postSharedWriteAction } from './sharedDataApi';

const POPIBRARY_SHEET_NAME = (import.meta as any).env?.VITE_POPIBRARY_SHEET_TAB?.trim() || 'shared_popibrary';
let resolvedPopLibrarySheetNameCache: string | null = POPIBRARY_SHEET_NAME;

export const fetchSharedPopLibraryItems = async (): Promise<PopItem[]> => {
    const items = await fetchSharedReadResource<PopItem>('popibrary');
    console.log('[PopLibraryService] fetched pop items', {
        rowCount: items.length,
        sampleItems: items.slice(0, 10).map((item) => ({
            id: item.id,
            title: item.title,
            thumbUrl: item.thumbUrl,
            author: item.author,
            updatedAt: item.updatedAt
        }))
    });
    return items;
};

export const appendSharedPopLibraryItem = async (pop: PopItem) => {
    return postSharedWriteAction<PopItem>('popibrary', 'append', { pop });
};

export const updateSharedPopLibraryItem = async (pop: PopItem) => {
    return postSharedWriteAction<PopItem>('popibrary', 'update', { pop });
};

export const deleteSharedPopLibraryItem = async (popId: string) => {
    await postSharedWriteAction('popibrary', 'delete', { popId });
};

export const getSharedPopLibrarySheetName = () => resolvedPopLibrarySheetNameCache || POPIBRARY_SHEET_NAME;
