import type { SharedNoticeEntry } from '../types';
import { fetchSharedReadResource, postSharedWriteAction } from './sharedDataApi';

const NOTICE_SHEET_NAME = 'shared_notice';
let resolvedNoticeSheetNameCache: string | null = NOTICE_SHEET_NAME;

export const fetchSharedNotices = async (): Promise<SharedNoticeEntry[]> => {
    return fetchSharedReadResource<SharedNoticeEntry>('notice');
};

export const appendSharedNotice = async (notice: Omit<SharedNoticeEntry, 'id' | 'rowNumber' | 'updatedAt' | 'createdAt' | 'readUsers'>) => {
    await postSharedWriteAction('notice', 'append', notice);
};

export const updateSharedNoticeReadUsers = async (notice: SharedNoticeEntry, userName: string) => {
    if (!notice.rowNumber) throw new Error('既読更新対象の行番号がありません');
    await postSharedWriteAction('notice', 'markRead', { notice, userName });
};

export const restoreSharedNoticeForUser = async (notice: SharedNoticeEntry, userName: string) => {
    if (!notice.rowNumber) throw new Error('既読解除対象の行番号がありません');
    await postSharedWriteAction('notice', 'restoreRead', { notice, userName });
};

export const deleteSharedNotice = async (noticeId: number) => {
    await postSharedWriteAction('notice', 'delete', { noticeId });
};

export const getSharedNoticeSheetName = () => resolvedNoticeSheetNameCache || NOTICE_SHEET_NAME;
