import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  batchUpdateGoogleSheetValues,
  ensureGoogleSheetRowCapacity,
  readGoogleSheetValueRanges,
  readGoogleSheetValues
} from '../api/_lib/googleServiceAccount.ts';
import {
  assertSharedCheckReadback,
  assertSharedCheckUpdatedRanges
} from '../api/_lib/sharedCheckWriteVerification.ts';
import { analyzeSharedCheckRecovery, buildRecoveryWritePlan } from './shared-check-recovery-lib.mjs';

const getArg = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const reportPath = getArg('--report');
const execute = process.argv.includes('--execute');
if (!reportPath) throw new Error('--report に復旧直前dry-runのrecovery-dry-run.jsonを指定してください');
if (!execute) throw new Error('実行には --execute が必要です');

const sheetName = 'shared_check';
const chunkSize = 50;
const resolvedReportPath = path.resolve(reportPath);
const outputPath = path.join(path.dirname(resolvedReportPath), 'recovery-execution.json');
const report = JSON.parse(await readFile(resolvedReportPath, 'utf8'));

if (report.mode !== 'dry-run' || report.sheetName !== sheetName || report.sourceRange !== 'A1:M') {
  throw new Error('復旧レポートの対象またはモードが不正です');
}
if (report.summary?.humanReviewCount !== 0) {
  throw new Error(`人手確認対象が残っているため復旧を停止します: ${report.summary?.humanReviewCount}`);
}

const liveRows = await readGoogleSheetValues(sheetName, 'A1:M');
const liveAnalysis = analyzeSharedCheckRecovery(liveRows, report.summary.fromDate, report.summary.toDate);
const livePlan = buildRecoveryWritePlan(liveAnalysis.restoreCandidates, liveRows.length + 1);
const reportPlan = report.plannedRestoreCandidates || [];

const comparablePlan = (plan) => plan.map(({ key, values, sourceRows, targetRow, targetRange }) => ({
  key,
  values,
  sourceRows,
  targetRow,
  targetRange
}));
if (JSON.stringify(liveAnalysis.summary) !== JSON.stringify(report.summary)) {
  throw new Error('復旧直前dry-run後に集計値が変化したため復旧を停止します');
}
if (JSON.stringify(comparablePlan(livePlan)) !== JSON.stringify(comparablePlan(reportPlan))) {
  throw new Error('復旧直前dry-run後に候補・内容・書込予定行が変化したため復旧を停止します');
}

const firstTargetRow = livePlan[0]?.targetRow;
const lastTargetRow = livePlan.at(-1)?.targetRow;
if (!firstTargetRow || !lastTargetRow) throw new Error('復旧対象がありません');
const existingTargetValues = await readGoogleSheetValues(sheetName, `A${firstTargetRow}:G${lastTargetRow}`);
if (existingTargetValues.some((row) => row.some((cell) => String(cell ?? '').trim()))) {
  throw new Error(`復旧予定範囲が空ではありません: A${firstTargetRow}:G${lastTargetRow}`);
}

await ensureGoogleSheetRowCapacity(sheetName, lastTargetRow);

const execution = {
  mode: 'execute',
  startedAt: new Date().toISOString(),
  completedAt: null,
  reportPath: resolvedReportPath,
  sheetName,
  sourceRange: 'G:M',
  targetRange: `A${firstTargetRow}:G${lastTargetRow}`,
  plannedCount: livePlan.length,
  successfulCount: 0,
  failedCount: 0,
  updatedRanges: [],
  failedKeys: [],
  sourceRowsPreserved: true
};
await writeFile(outputPath, `${JSON.stringify(execution, null, 2)}\n`, 'utf8');

try {
  for (let index = 0; index < livePlan.length; index += chunkSize) {
    const chunk = livePlan.slice(index, index + chunkSize).map((candidate) => ({
      rowNumber: candidate.targetRow,
      a1Range: `A${candidate.targetRow}:G${candidate.targetRow}`,
      values: candidate.values,
      key: candidate.key
    }));
    const writeResult = await batchUpdateGoogleSheetValues(
      sheetName,
      chunk.map((entry) => ({ a1Range: entry.a1Range, values: [entry.values] }))
    );
    assertSharedCheckUpdatedRanges(sheetName, chunk, writeResult.responses || []);

    const readback = await readGoogleSheetValueRanges(sheetName, chunk.map((entry) => entry.a1Range));
    const readbackByRow = new Map();
    chunk.forEach((entry, readIndex) => {
      readbackByRow.set(entry.rowNumber, readback[readIndex]?.values?.[0] || []);
    });
    assertSharedCheckReadback(chunk, readbackByRow);

    execution.successfulCount += chunk.length;
    execution.updatedRanges.push(...(writeResult.responses || []).map((response) => response.updatedRange || ''));
    await writeFile(outputPath, `${JSON.stringify(execution, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      verifiedThrough: execution.successfulCount,
      plannedCount: execution.plannedCount,
      firstRange: chunk[0].a1Range,
      lastRange: chunk.at(-1).a1Range
    }));
  }
  execution.completedAt = new Date().toISOString();
  await writeFile(outputPath, `${JSON.stringify(execution, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(execution, null, 2));
} catch (error) {
  const failedIndex = execution.successfulCount;
  execution.failedCount = Math.min(chunkSize, execution.plannedCount - failedIndex);
  execution.failedKeys = livePlan.slice(failedIndex, failedIndex + execution.failedCount).map((entry) => entry.key);
  execution.completedAt = new Date().toISOString();
  execution.error = error instanceof Error ? error.message : String(error);
  await writeFile(outputPath, `${JSON.stringify(execution, null, 2)}\n`, 'utf8');
  throw error;
}
