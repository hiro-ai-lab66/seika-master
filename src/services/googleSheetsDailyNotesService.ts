import type { SharedDailyNotesEntry } from '../types';
import { fetchSharedReadResource, postSharedWriteAction } from './sharedDataApi';

const DAILY_NOTES_SHEET_NAME = 'shared_daily_notes';
let resolvedDailyNotesSheetNameCache: string | null = DAILY_NOTES_SHEET_NAME;

export const fetchSharedDailyNotes = async (): Promise<SharedDailyNotesEntry[]> => {
    return fetchSharedReadResource<SharedDailyNotesEntry>('dailyNotes');
};

export const upsertSharedDailyNotes = async (
    entry: Omit<SharedDailyNotesEntry, 'id' | 'updatedAt'>
): Promise<SharedDailyNotesEntry> => {
    return postSharedWriteAction<SharedDailyNotesEntry>('dailyNotes', 'upsert', { entry });
};

export const getSharedDailyNotesSheetName = () => resolvedDailyNotesSheetNameCache || DAILY_NOTES_SHEET_NAME;
