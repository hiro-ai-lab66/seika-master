import type { PeriodAnalysisDailyRow, ProductRankingRow } from '../utils/periodAnalysis';
import { memo } from 'react';

const STATUS_COLORS = {
  VALID: '#0f766e',
  WARNING: '#f59e0b',
  MISSING: '#ef4444'
} as const;

const compactNumber = new Intl.NumberFormat('ja-JP', {
  notation: 'compact',
  maximumFractionDigits: 1
});

type LineSeries = {
  label: string;
  color: string;
  dashed?: boolean;
  value: (row: PeriodAnalysisDailyRow) => number;
};

const formatShortDate = (date: string) => {
  const [, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
};

export const PeriodLineChart = memo(({
  title,
  unit,
  rows,
  series
}: {
  title: string;
  unit: string;
  rows: PeriodAnalysisDailyRow[];
  series: LineSeries[];
}) => {
  if (rows.length === 0) return <div className="pa-chart-empty">表示できる日別データがありません。</div>;

  const width = 760;
  const height = 245;
  const padding = { top: 20, right: 18, bottom: 36, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maximum = Math.max(1, ...rows.flatMap((row) => series.map((item) => item.value(row))));
  const x = (index: number) => padding.left + (rows.length === 1 ? plotWidth / 2 : index / (rows.length - 1) * plotWidth);
  const y = (value: number) => padding.top + plotHeight - value / maximum * plotHeight;
  const labelStep = Math.max(1, Math.ceil(rows.length / 8));
  const grid = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="pa-chart-body">
      <div className="pa-chart-legend">
        {series.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}
        <span><i className="pa-dot-valid" />VALID</span>
        <span><i className="pa-dot-warning" />WARNING</span>
        <span><i className="pa-dot-missing" />MISSING</span>
      </div>
      <svg className="pa-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}（${unit}）`}>
        {grid.map((ratio) => {
          const gridY = padding.top + plotHeight - ratio * plotHeight;
          return (
            <g key={ratio}>
              <line x1={padding.left} y1={gridY} x2={width - padding.right} y2={gridY} stroke="#e2e8f0" />
              <text x={padding.left - 8} y={gridY + 4} textAnchor="end" className="pa-axis-label">{compactNumber.format(maximum * ratio)}</text>
            </g>
          );
        })}
        {series.map((item) => {
          const path = rows.map((row, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(item.value(row))}`).join(' ');
          return <path key={item.label} d={path} fill="none" stroke={item.color} strokeWidth="3" strokeDasharray={item.dashed ? '8 6' : undefined} strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {rows.map((row, index) => (
          <g key={row.date}>
            <circle cx={x(index)} cy={y(series[0].value(row))} r="5" fill={STATUS_COLORS[row.status]} stroke="#fff" strokeWidth="2">
              <title>{`${row.date} ${row.status} ${compactNumber.format(series[0].value(row))}${unit}${row.reasons.length ? `：${row.reasons.join('／')}` : ''}`}</title>
            </circle>
            {(index % labelStep === 0 || index === rows.length - 1) && <text x={x(index)} y={height - 12} textAnchor="middle" className="pa-axis-label">{formatShortDate(row.date)}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
});

PeriodLineChart.displayName = 'PeriodLineChart';

export const DepartmentPieChart = memo(({ vegetable, fruit }: { vegetable: number; fruit: number }) => {
  const total = vegetable + fruit;
  const vegetableRate = total > 0 ? vegetable / total * 100 : 0;
  const fruitRate = total > 0 ? fruit / total * 100 : 0;
  return (
    <div className="pa-pie-layout">
      <div
        className="pa-pie"
        role="img"
        aria-label={`野菜 ${vegetableRate.toFixed(1)}%、果物 ${fruitRate.toFixed(1)}%`}
        style={{ background: total > 0 ? `conic-gradient(#10b981 0 ${vegetableRate}%, #f59e0b ${vegetableRate}% 100%)` : '#e2e8f0' }}
      >
        <div><strong>{total > 0 ? '100%' : '-'}</strong><span>商品明細</span></div>
      </div>
      <div className="pa-pie-legend">
        <div><i className="pa-pie-veg" /><span>野菜</span><strong>{Math.round(vegetable).toLocaleString()}円</strong><small>{vegetableRate.toFixed(1)}%</small></div>
        <div><i className="pa-pie-fruit" /><span>果物</span><strong>{Math.round(fruit).toLocaleString()}円</strong><small>{fruitRate.toFixed(1)}%</small></div>
      </div>
    </div>
  );
});

DepartmentPieChart.displayName = 'DepartmentPieChart';

export const ProductBarChart = memo(({ rows, metric }: { rows: ProductRankingRow[]; metric: 'sales' | 'quantity' }) => {
  const maximum = Math.max(1, ...rows.map((row) => metric === 'sales' ? row.sales : row.quantity));
  if (rows.length === 0) return <div className="pa-chart-empty">表示できる商品データがありません。</div>;
  return (
    <div className="pa-bars">
      {rows.map((row, index) => {
        const value = metric === 'sales' ? row.sales : row.quantity;
        return (
          <div className="pa-bar-row" key={row.key}>
            <span className={`pa-bar-rank pa-bar-rank-${Math.min(index + 1, 4)}`}>{index + 1}</span>
            <div className="pa-bar-name" title={`${row.name}（${row.code}）`}><strong>{row.name}</strong><small>{row.department}</small></div>
            <div className="pa-bar-track"><i style={{ width: `${Math.max(2, value / maximum * 100)}%` }} /></div>
            <strong className="pa-bar-value">{metric === 'sales' ? `${Math.round(value).toLocaleString()}円` : `${Math.round(value).toLocaleString()}点`}</strong>
          </div>
        );
      })}
    </div>
  );
});

ProductBarChart.displayName = 'ProductBarChart';
