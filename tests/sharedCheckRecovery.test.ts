import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSharedCheckRecovery, buildRecoveryWritePlan } from '../scripts/shared-check-recovery-lib.mjs';

test('横ずれ重複をまとめ、正常A:Gを上書き候補から除外する', () => {
  const normal = ['2026-09-01', '古沢店', '12時実績', '100', '入力済', '', '12:00'];
  const shifted = ['2026-09-01', '古沢店', '最終実績', '925', '入力済', '', 'final'];
  const rows = [
    ['日付', '店舗', '項目', '内容', '状態', '担当', '時間'],
    normal,
    ['', '', '', '', '', '', ...shifted],
    ['', '', '', '', '', '', ...shifted]
  ];
  const result = analyzeSharedCheckRecovery(rows, '2026-09-01', '2026-09-03');
  assert.equal(result.summary.normalRowCount, 1);
  assert.equal(result.summary.shiftedRowCount, 2);
  assert.equal(result.summary.duplicateExtraRowCount, 1);
  assert.equal(result.summary.restoreCandidateCount, 1);
  assert.equal(result.summary.humanReviewCount, 0);
});

test('同一キーで内容が異なる横ずれ行は自動復旧候補にしない', () => {
  const rows = [
    ['日付', '店舗', '項目', '内容', '状態', '担当', '時間'],
    ['', '', '', '', '', '', '2026-09-02', '古沢店', '最終実績', '399', '入力済', '', 'final'],
    ['', '', '', '', '', '', '2026-09-02', '古沢店', '最終実績', '400', '入力済', '', 'final']
  ];
  const result = analyzeSharedCheckRecovery(rows, '2026-09-01', '2026-09-03');
  assert.equal(result.summary.restoreCandidateCount, 0);
  assert.equal(result.summary.humanReviewCount, 1);
});

test('復旧予定行は既存最終行より後ろのA:Gに割り当てる', () => {
  const plan = buildRecoveryWritePlan([
    { key: 'first', values: ['2026-09-01'], sourceRows: [100] },
    { key: 'second', values: ['2026-09-02'], sourceRows: [101] }
  ], 200);
  assert.deepEqual(plan.map((entry) => entry.targetRange), [
    'shared_check!A200:G200',
    'shared_check!A201:G201'
  ]);
});

test('A:G復旧後はG:M原本を残しても追加の復旧候補を作らない', () => {
  const recovered = ['2026-09-01', '古沢店', '最終実績', '925', '入力済', '', 'final'];
  const rows = [
    ['日付', '店舗', '項目', '内容', '状態', '担当', '時間'],
    recovered,
    ['', '', '', '', '', '', ...recovered]
  ];
  const result = analyzeSharedCheckRecovery(rows, '2026-09-01', '2026-09-03');
  assert.equal(result.summary.restoreCandidateCount, 0);
  assert.equal(result.summary.alreadyPresentCount, 1);
  assert.equal(result.summary.humanReviewCount, 0);
});
