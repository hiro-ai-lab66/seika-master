import React, { useEffect, useMemo, useState } from 'react';
import type { DailyNotesEntry } from '../types';
import { NoticeForm } from '../components/NoticeForm';

type Props = {
  currentDate: string;
  onChangeDate: (date: string) => void;
  entries: DailyNotesEntry[];
  onSave: (entry: DailyNotesEntry) => void;
};

type FormState = {
  schedule: string;
  inspectionNotes: string;
  announcements: string;
};

const emptyForm: FormState = {
  schedule: '',
  inspectionNotes: '',
  announcements: '',
};

const blockStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  padding: '16px',
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
};

export const DailyNotesPage: React.FC<Props> = ({ currentDate, onChangeDate, entries, onSave }) => {
  const currentEntry = useMemo(
    () => entries.find((entry) => entry.date === currentDate),
    [entries, currentDate]
  );

  const [form, setForm] = useState<FormState>(emptyForm);
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    setForm({
      schedule: currentEntry?.schedule || '',
      inspectionNotes: currentEntry?.inspectionNotes || '',
      announcements: currentEntry?.announcements || '',
    });
  }, [currentEntry, currentDate]);

  const recentEntries = useMemo(
    () =>
      [...entries]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 7),
    [entries]
  );

  const updateField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave({
      date: currentDate,
      schedule: form.schedule.trim(),
      inspectionNotes: form.inspectionNotes.trim(),
      announcements: form.announcements.trim(),
      updatedAt: new Date().toISOString(),
    });
    setSavedMessage('保存しました');
    window.setTimeout(() => setSavedMessage(''), 1500);
  };

  return (
    <div className="page-container">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)',
          border: '1px solid #dbeafe',
          borderRadius: '18px',
          padding: '18px',
        }}
      >
        <div>
          <h2 style={{ marginBottom: '4px' }}>連絡事項と予定表</h2>
          <p className="description" style={{ margin: 0 }}>
            本日の予定、定時点検で気づいたこと、その他の連絡事項を1ページで確認できます。
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="date"
            value={currentDate}
            onChange={(e) => onChangeDate(e.target.value)}
            style={{ maxWidth: '220px' }}
          />
          <button className="button-primary" style={{ width: 'auto', padding: '12px 18px', fontSize: '1rem' }} onClick={handleSave}>
            保存する
          </button>
          {savedMessage && <span style={{ color: '#15803d', fontWeight: 700, fontSize: '0.9rem' }}>{savedMessage}</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '16px' }}>
        <section style={blockStyle}>
          <h3 style={{ marginTop: 0, marginBottom: '10px', color: '#0f172a' }}>本日の予定</h3>
          <textarea
            value={form.schedule}
            onChange={(e) => updateField('schedule', e.target.value)}
            placeholder="例: 朝礼、特売準備、入荷確認、売場変更"
            style={{ width: '100%', minHeight: '120px', resize: 'vertical' }}
          />
        </section>

        <section style={blockStyle}>
          <h3 style={{ marginTop: 0, marginBottom: '10px', color: '#0f172a' }}>定時点検で気づいたこと</h3>
          <textarea
            value={form.inspectionNotes}
            onChange={(e) => updateField('inspectionNotes', e.target.value)}
            placeholder="例: 白菜のフェイス不足、バナナ熟度注意、値引きタイミング"
            style={{ width: '100%', minHeight: '140px', resize: 'vertical' }}
          />
        </section>

        <section style={blockStyle}>
          <h3 style={{ marginTop: 0, marginBottom: '10px', color: '#0f172a' }}>その他の連絡事項</h3>
          <textarea
            value={form.announcements}
            onChange={(e) => updateField('announcements', e.target.value)}
            placeholder="例: 明日の応援、発注締切、共有事項"
            style={{ width: '100%', minHeight: '120px', resize: 'vertical' }}
          />
        </section>
      </div>

      <section style={blockStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a' }}>最近の記録</h3>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>日付ごとに見返せます。</p>
          </div>
        </div>

        {recentEntries.length === 0 ? (
          <p style={{ margin: 0, color: '#64748b' }}>まだ記録がありません。</p>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {recentEntries.map((entry) => (
              <button
                key={entry.date}
                onClick={() => onChangeDate(entry.date)}
                style={{
                  textAlign: 'left',
                  border: entry.date === currentDate ? '2px solid #2563eb' : '1px solid #dbeafe',
                  background: entry.date === currentDate ? '#eff6ff' : '#f8fafc',
                  borderRadius: '12px',
                  padding: '12px 14px',
                }}
              >
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>{entry.date}</div>
                <div style={{ fontSize: '0.9rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  予定: {entry.schedule || '未入力'}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <NoticeForm />
    </div>
  );
};
