import test from 'node:test';
import assert from 'node:assert/strict';
import type { DailySalesRecord } from '../src/types.ts';
import { selectDailySalesTop5 } from '../src/utils/dailySalesRanking.ts';

const record = (
  date: string,
  department: DailySalesRecord['department'],
  name: string,
  salesAmt: number,
  index: number
): DailySalesRecord => ({
  date,
  department,
  name,
  salesAmt,
  salesQty: Math.max(1, 500 - index),
  code: String(index).padStart(13, '0')
});

test('9/8は野菜178件だけから売上金額TOP5を選び、果物54件を除外する', () => {
  const vegetableTop = [
    ['玉ねぎ バラ', 25_285],
    ['トマト バラ', 20_790],
    ['小松菜', 19_794],
    ['ＰＢ国産生姜', 18_018],
    ['トマト ３コパック', 17_641]
  ] as const;
  const vegetables = [
    ...vegetableTop.map(([name, salesAmt], index) => record('2026-09-08', '野菜', name, salesAmt, index)),
    ...Array.from({ length: 173 }, (_, index) => record('2026/9/8', '野菜', `野菜${index}`, 10_000 - index, index + 5))
  ];
  const fruits = [
    record('2026-09-08', '果物', 'カンボジア産 バナナ', 49_945, 500),
    record('2026-09-08', '果物', 'サンゴールドキウイバラ', 30_789, 501),
    record('2026-09-08', '果物', 'シャインマスカット', 26_830, 502),
    record('2026-09-08', '果物', 'シャインマスカット宅配ギフト1kg', 25_000, 503),
    ...Array.from({ length: 50 }, (_, index) => record('2026-09-08', '果物', `果物${index}`, 15_000 - index, index + 504))
  ];
  const rows = [...vegetables, ...fruits];

  assert.equal(rows.filter((row) => row.department === '野菜').length, 178);
  assert.equal(rows.filter((row) => row.department === '果物').length, 54);
  assert.deepEqual(
    selectDailySalesTop5(rows, '2026-09-08', '野菜').map((row) => [row.name, row.salesAmt]),
    vegetableTop
  );
});

test('日付を切り替えても対象日だけを集計する', () => {
  const rows = [
    record('2026-09-07', '野菜', 'ブロッコリー', 20_099, 1),
    record('2026-09-07', '野菜', 'トマト ３コパック', 8_616, 2),
    record('2026-09-08', '野菜', '玉ねぎ バラ', 25_285, 3),
    record('2026-09-09', '野菜', 'きゅうり', 9_847, 4),
    record('2026-09-09', '果物', 'バナナ', 99_999, 5)
  ];

  assert.deepEqual(selectDailySalesTop5(rows, '2026-09-07', '野菜').map((row) => row.name), [
    'ブロッコリー',
    'トマト ３コパック'
  ]);
  assert.deepEqual(selectDailySalesTop5(rows, '2026-09-09', '野菜').map((row) => row.name), ['きゅうり']);
});
