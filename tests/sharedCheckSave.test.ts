import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSharedCheckMutationPlan, type SharedCheckInputRow } from '../api/_lib/sharedCheckMutationPlan.ts';
import { assertSharedCheckReadback, assertSharedCheckUpdatedRanges, buildExplicitSharedCheckWrites } from '../api/_lib/sharedCheckWriteVerification.ts';
import { runParallelInspectionSaves } from '../src/utils/inspectionSaveParallel.ts';
import { shouldShowInspectionSaveSuccess } from '../src/utils/inspectionSaveOutcome.ts';
import { createSerialTaskQueue } from '../src/utils/serialTaskQueue.ts';

const row = (date: string, item: string, content: string, time = '12:00'): SharedCheckInputRow => ({
  date,
  store: '古沢店',
  item,
  content,
  status: '入力済',
  owner: '',
  time
});

test('ケースA: 通常日の新規行を明示的なA:G範囲へ割り当てる', () => {
  const plan = buildSharedCheckMutationPlan('2026-08-31', ['12:00'], [row('2026-08-31', '12時実績', '100')], []);
  const writes = buildExplicitSharedCheckWrites(plan.updates, plan.appends, 1234);
  assert.equal(writes[0]?.a1Range, 'A1234:G1234');
});

test('ケースB: 月跨ぎでも明示的なA:G範囲へ割り当てる', () => {
  const plan = buildSharedCheckMutationPlan('2026-09-01', ['12:00'], [row('2026-09-01', '12時実績', '100')], []);
  const writes = buildExplicitSharedCheckWrites(plan.updates, plan.appends, 1235);
  assert.equal(writes[0]?.a1Range, 'A1235:G1235');
});

test('ケースC: 既存キーは新規追加せず同じ行を更新する', () => {
  const existing = [{ rowNumber: 20, values: ['2026-09-01', '古沢店', '12時実績', '90', '入力済', '', '12:00'] }];
  const plan = buildSharedCheckMutationPlan('2026-09-01', ['12:00'], [row('2026-09-01', '12時実績', '100')], existing);
  assert.deepEqual(plan.updates.map((entry) => entry.rowNumber), [20]);
  assert.equal(plan.appends.length, 0);
});

test('ケースD: 同一内容の再保存は書込も重複も増やさない', () => {
  const existing = [{ rowNumber: 20, values: ['2026-09-01', '古沢店', '12時実績', '100', '入力済', '', '12:00'] }];
  const plan = buildSharedCheckMutationPlan('2026-09-01', ['12:00'], [row('2026-09-01', '12時実績', '100')], existing);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.appends.length, 0);
  assert.equal(plan.unchanged.length, 1);
});

test('ケースE: 部分保存で未送信の既存項目を削除しない', () => {
  const existing = [
    { rowNumber: 20, values: ['2026-09-01', '古沢店', '12時実績', '90', '入力済', '', '12:00'] },
    { rowNumber: 21, values: ['2026-09-01', '古沢店', '12時客数', '200', '入力済', '', '12:00'] }
  ];
  const plan = buildSharedCheckMutationPlan('2026-09-01', ['12:00'], [row('2026-09-01', '12時実績', '100')], existing);
  assert.equal(plan.obsoleteRowCount, 0);
  assert.equal(plan.updates.some((entry) => entry.rowNumber === 21), false);
});

test('ケースF: Sheets APIがA:G以外を返したら失敗する', () => {
  const writes = buildExplicitSharedCheckWrites([], [['2026-09-01', '古沢店', '12時実績', '100', '入力済', '', '12:00']], 1234);
  assert.throws(
    () => assertSharedCheckUpdatedRanges('shared_check', writes, [{ updatedRange: 'shared_check!G1234:M1234' }]),
    /書込範囲が不正/
  );
});

test('保存後のキー・内容・状態を再読込結果と照合する', () => {
  const writes = buildExplicitSharedCheckWrites([], [['2026-09-01', '古沢店', '最終値確定', 'true', '入力済', '', 'final']], 1234);
  assert.doesNotThrow(() => assertSharedCheckReadback(writes, new Map([[1234, ['2026-09-01', '古沢店', '最終値確定', 'TRUE', '入力済', '', 'final']]])));
});

test('既存の同一キー重複を黙って処理しない', () => {
  const duplicate = ['2026-09-01', '古沢店', '12時実績', '100', '入力済', '', '12:00'];
  assert.throws(
    () => buildSharedCheckMutationPlan('2026-09-01', ['12:00'], [row('2026-09-01', '12時実績', '100')], [
      { rowNumber: 20, values: duplicate },
      { rowNumber: 21, values: duplicate }
    ]),
    /既存の重複キー/
  );
});

test('ケースG: API書込失敗時は保存成功表示の条件を満たさない', async () => {
  const result = await runParallelInspectionSaves(
    async () => undefined,
    async () => { throw new Error('Sheets write failed'); }
  );
  const failures = result.sharedCheck.status === 'rejected' ? ['shared_check'] : [];
  assert.equal(shouldShowInspectionSaveSuccess(failures), false);
});

test('shared_check保存キューは処理を直列化する', async () => {
  const queue = createSerialTaskQueue();
  const events: string[] = [];
  let releaseFirst: () => void = () => undefined;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const first = queue.run(async () => {
    events.push('first-start');
    await firstGate;
    events.push('first-end');
  });
  const second = queue.run(async () => {
    events.push('second-start');
    events.push('second-end');
  });
  await Promise.resolve();
  assert.deepEqual(events, ['first-start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['first-start', 'first-end', 'second-start', 'second-end']);
});
