import { buildGoogleDriveImageCandidates } from '../services/storageService';
import type { SellfloorRecord } from '../types';

export const PERIOD_PDF_SELLFLOOR_LIMIT = 12;
export const PERIOD_PDF_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PERIOD_PDF_IMAGE_TIMEOUT_MS = 7_000;
export const PERIOD_PDF_IMAGE_CONCURRENCY = 4;

export interface PeriodPdfSellfloorRecord {
  record: SellfloorRecord;
  imageDataUrl: string | null;
  imageError?: string;
}

export interface PeriodPdfSellfloorPreparation {
  records: PeriodPdfSellfloorRecord[];
  totalRecordCount: number;
  selectedRecordCount: number;
  successfulImageCount: number;
  failedImageCount: number;
}

interface PrepareOptions {
  limit?: number;
  width?: number;
  timeoutMs?: number;
  maxBytes?: number;
  concurrency?: number;
  fetchImpl?: typeof fetch;
}

const compareRecordsNewestFirst = (a: SellfloorRecord, b: SellfloorRecord) => {
  const dateCompare = String(b.date || '').localeCompare(String(a.date || ''));
  if (dateCompare !== 0) return dateCompare;
  return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
};

export const selectPeriodPdfSellfloorRecords = (
  records: SellfloorRecord[],
  limit = PERIOD_PDF_SELLFLOOR_LIMIT
) => {
  const sorted = records.filter((record) => record.photoUrl.trim()).sort(compareRecordsNewestFirst);
  const selected: SellfloorRecord[] = [];
  const selectedIds = new Set<string>();
  const selectedDates = new Set<string>();

  for (const record of sorted) {
    if (selected.length >= limit) break;
    if (selectedDates.has(record.date)) continue;
    selected.push(record);
    selectedIds.add(record.id);
    selectedDates.add(record.date);
  }

  for (const record of sorted) {
    if (selected.length >= limit) break;
    if (selectedIds.has(record.id)) continue;
    selected.push(record);
    selectedIds.add(record.id);
  }

  return { selected, totalRecordCount: sorted.length };
};

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('画像をData URLへ変換できませんでした'));
  reader.readAsDataURL(blob);
});

const fetchImageCandidate = async (
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  maxBytes: number
) => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('未対応の画像URLです');
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`画像取得HTTP ${response.status}`);

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > maxBytes) throw new Error('画像サイズが上限を超えています');

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) throw new Error('画像以外の応答です');

    const blob = await response.blob();
    if (blob.size > maxBytes) throw new Error('画像サイズが上限を超えています');
    if (!(blob.type || contentType).toLowerCase().startsWith('image/')) throw new Error('画像以外の応答です');
    return blobToDataUrl(blob);
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const fetchRecordImage = async (
  record: SellfloorRecord,
  options: Required<Pick<PrepareOptions, 'width' | 'timeoutMs' | 'maxBytes' | 'fetchImpl'>>
) => {
  const candidates = buildGoogleDriveImageCandidates(record.photoUrl, options.width);
  let lastError: unknown = new Error('画像URL候補がありません');

  for (const candidate of candidates) {
    try {
      return await fetchImageCandidate(candidate, options.fetchImpl, options.timeoutMs, options.maxBytes);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

export const preparePeriodPdfSellfloorRecords = async (
  records: SellfloorRecord[],
  options: PrepareOptions = {}
): Promise<PeriodPdfSellfloorPreparation> => {
  const limit = options.limit ?? PERIOD_PDF_SELLFLOOR_LIMIT;
  const width = options.width ?? 800;
  const timeoutMs = options.timeoutMs ?? PERIOD_PDF_IMAGE_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? PERIOD_PDF_IMAGE_MAX_BYTES;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? PERIOD_PDF_IMAGE_CONCURRENCY, 4));
  const fetchImpl = options.fetchImpl ?? window.fetch.bind(window);
  const { selected, totalRecordCount } = selectPeriodPdfSellfloorRecords(records, limit);
  const prepared: PeriodPdfSellfloorRecord[] = [];

  for (let offset = 0; offset < selected.length; offset += concurrency) {
    const batch = selected.slice(offset, offset + concurrency);
    const settled = await Promise.allSettled(batch.map((record) => fetchRecordImage(record, {
      width,
      timeoutMs,
      maxBytes,
      fetchImpl
    })));
    settled.forEach((result, index) => {
      const record = batch[index];
      if (result.status === 'fulfilled') {
        prepared.push({ record, imageDataUrl: result.value });
      } else {
        prepared.push({
          record,
          imageDataUrl: null,
          imageError: result.reason instanceof Error ? result.reason.message : '画像を取得できませんでした'
        });
      }
    });
  }

  const successfulImageCount = prepared.filter((item) => item.imageDataUrl).length;
  const failedImageCount = prepared.length - successfulImageCount;
  return {
    records: successfulImageCount > 0 ? prepared : [],
    totalRecordCount,
    selectedRecordCount: selected.length,
    successfulImageCount,
    failedImageCount
  };
};

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number) => new Promise<T>((resolve, reject) => {
  const timeoutId = window.setTimeout(() => reject(new Error('画像描画待ちがタイムアウトしました')), timeoutMs);
  promise.then(
    (value) => {
      window.clearTimeout(timeoutId);
      resolve(value);
    },
    (error) => {
      window.clearTimeout(timeoutId);
      reject(error);
    }
  );
});

export const waitForPeriodPdfImages = async (root: HTMLElement, timeoutMs = 5_000) => {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img[data-pdf-sellfloor-image]'));
  await Promise.allSettled(images.map((image) => {
    if (image.complete) {
      return image.naturalWidth > 0 ? Promise.resolve() : Promise.reject(new Error('画像を描画できませんでした'));
    }
    const ready = typeof image.decode === 'function'
      ? image.decode()
      : new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => reject(new Error('画像を描画できませんでした')), { once: true });
      });
    return withTimeout(ready, timeoutMs);
  }));
};
