import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readGoogleSheetValues } from '../api/_lib/googleServiceAccount.ts';
import { analyzeSharedCheckRecovery, buildRecoveryWritePlan } from './shared-check-recovery-lib.mjs';

const getArg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const fromDate = getArg('--from', '2026-09-01');
const toDate = getArg('--to', '2026-09-03');
const outputDir = path.resolve(getArg('--output-dir', `artifacts/shared-check-recovery-${fromDate}-${toDate}`));
const sheetName = 'shared_check';

await mkdir(outputDir, { recursive: true });
const rows = await readGoogleSheetValues(sheetName, 'A1:M');
const generatedAt = new Date().toISOString();

const backupLines = rows.map((values, index) => JSON.stringify({ rowNumber: index + 1, values }));
await writeFile(path.join(outputDir, 'shared_check-full-backup.jsonl'), `${backupLines.join('\n')}\n`, 'utf8');

const analysis = analyzeSharedCheckRecovery(rows, fromDate, toDate);
const plannedRestoreCandidates = buildRecoveryWritePlan(analysis.restoreCandidates, rows.length + 1);
const report = {
  generatedAt,
  sheetName,
  sourceRange: 'A1:M',
  mode: 'dry-run',
  ...analysis,
  plannedRestoreCandidates
};
await writeFile(path.join(outputDir, 'recovery-dry-run.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const csvEscape = (value) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const candidateHeader = ['targetRange', 'sourceRows', 'date', 'store', 'item', 'content', 'status', 'owner', 'time'];
const candidateRows = plannedRestoreCandidates.map((entry) => [entry.targetRange, entry.sourceRows.join('|'), ...entry.values]);
await writeFile(
  path.join(outputDir, 'restore-candidates.csv'),
  `${[candidateHeader, ...candidateRows].map((row) => row.map(csvEscape).join(',')).join('\n')}\n`,
  'utf8'
);

const reviewHeader = ['key', 'reason', 'normalRows', 'shiftedRows', 'variants'];
const reviewRows = analysis.humanReview.map((entry) => [
  entry.key,
  entry.reason,
  entry.normalRows.map((row) => row.rowNumber).join('|'),
  entry.shiftedRows.map((row) => row.rowNumber).join('|'),
  JSON.stringify(entry.variants)
]);
await writeFile(
  path.join(outputDir, 'human-review.csv'),
  `${[reviewHeader, ...reviewRows].map((row) => row.map(csvEscape).join(',')).join('\n')}\n`,
  'utf8'
);

const summary = analysis.summary;
const dateRows = Object.entries(summary.byDate).map(([date, value]) =>
  `| ${date} | ${value.shiftedRows} | ${value.uniqueKeys} | ${value.duplicateExtraRows} | ${value.restoreCandidates} | ${value.humanReview} |`
);
const markdown = `# shared_check 復旧dry-run\n\n` +
  `- 生成日時: ${generatedAt}\n- 対象: ${fromDate}〜${toDate}\n- モード: dry-run（Google Sheetsへの書き込みなし）\n` +
  `- A:G正常行: ${summary.normalRowCount}\n- G:M横ずれ行: ${summary.shiftedRowCount}\n` +
  `- 横ずれ一意キー: ${summary.shiftedUniqueKeyCount}\n- 重複グループ: ${summary.duplicateGroupCount}\n` +
  `- 重複余剰行: ${summary.duplicateExtraRowCount}\n- 復旧候補: ${summary.restoreCandidateCount}\n` +
  `- A:Gに同一内容あり: ${summary.alreadyPresentCount}\n- 人手確認: ${summary.humanReviewCount}\n\n` +
  `- 復旧予定範囲: ${plannedRestoreCandidates[0]?.targetRange || 'なし'} 〜 ${plannedRestoreCandidates.at(-1)?.targetRange || 'なし'}\n` +
  `- 復旧予定範囲は既存A:M最終使用行より後ろに割り当て（既存正常行・横ずれ原本を上書きしない）\n\n` +
  `| 日付 | 横ずれ行 | 一意キー | 重複余剰行 | 復旧候補 | 人手確認 |\n|---|---:|---:|---:|---:|---:|\n${dateRows.join('\n')}\n`;
await writeFile(path.join(outputDir, 'summary.md'), markdown, 'utf8');

console.log(JSON.stringify({ outputDir, ...summary }, null, 2));
