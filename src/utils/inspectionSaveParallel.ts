export type MeasuredSaveResult = {
  status: 'fulfilled' | 'rejected';
  durationMs: number;
  error?: unknown;
};

export type ParallelInspectionSaveResult = {
  dailySales: MeasuredSaveResult;
  sharedCheck: MeasuredSaveResult;
  parallelSaveMs: number;
};

const toMeasuredResult = (
  result: PromiseSettledResult<unknown>,
  startedAt: number,
  completedAt: number
): MeasuredSaveResult => result.status === 'fulfilled'
  ? { status: 'fulfilled', durationMs: completedAt - startedAt }
  : { status: 'rejected', durationMs: completedAt - startedAt, error: result.reason };

export const runParallelInspectionSaves = async (
  saveDailySales: () => Promise<unknown>,
  saveSharedCheck: () => Promise<unknown>,
  now: () => number = () => performance.now()
): Promise<ParallelInspectionSaveResult> => {
  const parallelStartedAt = now();
  const dailySalesStartedAt = now();
  let dailySalesCompletedAt = dailySalesStartedAt;
  const dailySalesPromise = Promise.resolve()
    .then(saveDailySales)
    .finally(() => {
      dailySalesCompletedAt = now();
    });

  const sharedCheckStartedAt = now();
  let sharedCheckCompletedAt = sharedCheckStartedAt;
  const sharedCheckPromise = Promise.resolve()
    .then(saveSharedCheck)
    .finally(() => {
      sharedCheckCompletedAt = now();
    });

  const [dailySalesResult, sharedCheckResult] = await Promise.allSettled([
    dailySalesPromise,
    sharedCheckPromise
  ]);

  return {
    dailySales: toMeasuredResult(dailySalesResult, dailySalesStartedAt, dailySalesCompletedAt),
    sharedCheck: toMeasuredResult(sharedCheckResult, sharedCheckStartedAt, sharedCheckCompletedAt),
    parallelSaveMs: now() - parallelStartedAt
  };
};
