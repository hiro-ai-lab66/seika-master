import React, { useState } from 'react';
import { Search, Tag, MessageCircle, Plus } from 'lucide-react';
import type { PopItem } from '../types';

// Dummy POP data for initial display and testing
const DUMMY_POPS: PopItem[] = [
  {
    id: "pop-001",
    title: "春キャベツ特売",
    categoryLarge: "野菜",
    categorySmall: "葉物",
    season: "春",
    usage: "定番平台",
    size: "A4",
    thumbUrl: "https://placehold.co/400x300/e2e8f0/475569?text=Cabbage+POP",
    pdfUrl: "https://example.com/dummy.pdf",
    improvementComment: "価格を大きくし、鮮度感を出すキャッチコピーに変更。前年比120%達成。",
    createdAt: new Date().toISOString()
  },
  {
    id: "pop-002",
    title: "新玉ねぎ レシピ付き",
    categoryLarge: "野菜",
    categorySmall: "土物",
    season: "春",
    usage: "エンド",
    size: "B5",
    thumbUrl: "https://placehold.co/400x300/e2e8f0/475569?text=Onion+Recipe+POP",
    pdfUrl: "https://example.com/dummy.pdf",
    improvementComment: "食べ方提案を入れることで、まとめ買いが増加。",
    createdAt: new Date().toISOString()
  },
  {
    id: "pop-003",
    title: "厳選いちご ギフト用",
    categoryLarge: "果物",
    categorySmall: "いちご",
    season: "冬",
    usage: "平台一番地",
    size: "A4",
    thumbUrl: "https://placehold.co/400x300/e2e8f0/475569?text=Strawberry+Gift+POP",
    pdfUrl: "https://example.com/dummy.pdf",
    improvementComment: "ギフト用途を強調し、高単価商品の売行きが改善。",
    createdAt: new Date().toISOString()
  }
];

interface PopibraryListProps {
  onSelectPop: (pop: PopItem) => void;
  onAddPop: () => void;
  savedPops?: PopItem[];
}

export const PopibraryList: React.FC<PopibraryListProps> = ({ onSelectPop, onAddPop, savedPops = [] }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'すべて' | '野菜' | '果物'>('すべて');

  // For testing, merge dummy pops with any saved pops, ensuring unique IDs
  const allPops = [...DUMMY_POPS, ...savedPops].filter((pop, index, self) =>
    index === self.findIndex((t) => (
      t.id === pop.id
    ))
  );

  const filteredPops = allPops.filter(pop => {
    const matchesSearch = pop.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          pop.improvementComment.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'すべて' || pop.categoryLarge === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="page-container" style={{ paddingBottom: '90px', maxWidth: '800px', margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ margin: 0 }}>POPibrary</h2>
          <span className="date-badge-outline">{filteredPops.length}件</span>
        </div>
        <button 
          onClick={onAddPop}
          style={{ 
            display: 'flex', alignItems: 'center', gap: '6px', 
            backgroundColor: 'var(--primary)', color: 'white', border: 'none', 
            padding: '8px 16px', borderRadius: '8px', fontSize: '0.9rem', 
            fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' 
          }}
        >
          <Plus size={18} /> 追加
        </button>
      </div>
      
      {/* Search and Filter */}
      <div style={{ background: 'white', padding: '16px', borderRadius: '12px', boxShadow: 'var(--shadow-sm)', marginBottom: '24px' }}>
         <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                    type="text" 
                    placeholder="POP名・コメントで検索" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                />
            </div>
         </div>
         <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            {['すべて', '野菜', '果物'].map(cat => (
                <button 
                    key={cat}
                    onClick={() => setCategoryFilter(cat as any)}
                    style={{
                        padding: '6px 16px',
                        borderRadius: '20px',
                        border: 'none',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        backgroundColor: categoryFilter === cat ? 'var(--primary)' : '#f1f5f9',
                        color: categoryFilter === cat ? 'white' : 'var(--text-main)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    {cat}
                </button>
            ))}
         </div>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {filteredPops.map(pop => (
            <div 
                key={pop.id} 
                className="pop-card"
                onClick={() => onSelectPop(pop)}
                style={{
                    background: 'white',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-md)',
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                <div style={{ position: 'relative', height: '160px', backgroundColor: '#f8fafc' }}>
                    <img 
                        src={pop.thumbUrl} 
                        alt={pop.title} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        loading="lazy"
                    />
                    <div style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'var(--accent)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                        {pop.size}
                    </div>
                </div>
                <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.3 }}>{pop.title}</h3>
                    </div>
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', color: 'var(--text-muted)' }}>
                            <Tag size={12} /> {pop.categoryLarge}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', color: 'var(--text-muted)' }}>
                            <Tag size={12} /> {pop.categorySmall}
                        </span>
                    </div>

                    <div style={{ backgroundColor: '#fff7ed', padding: '10px', borderRadius: '8px', fontSize: '0.8rem', color: '#c2410c', marginTop: 'auto', display: 'flex', gap: '6px' }}>
                        <MessageCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span style={{ lineHeight: 1.4 }}>{pop.improvementComment}</span>
                    </div>
                </div>
            </div>
        ))}
        {filteredPops.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                条件に一致するPOPが見つかりません。
            </div>
        )}
      </div>

    </div>
  );
};
