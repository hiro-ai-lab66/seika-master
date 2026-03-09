const fs = require('fs');
let code = fs.readFileSync('src/components/InspectionForm.tsx', 'utf-8');
const startMatch = `    const parseCSVLine = (line: string): string[] => {`;
const endMatch = `    const handleSubmit = (e: React.FormEvent) => {`;
const startIdx = code.indexOf(startMatch);
const endIdx = code.indexOf(endMatch);
if (startIdx === -1 || endIdx === -1) {
    console.error("Match " + startIdx + " " + endIdx);
    process.exit(1);
}
const repl = `    const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'veggie' | 'fruit') => {
        const file = e.target.files?.[0];
        if (!file) return;

        const typeName = type === 'veggie' ? '野菜' : '果物';
        console.log(\`\${type} csv selected\`);
        alert(\`\${typeName}CSVを読み込みました\`);

        const reader = new FileReader();
        reader.onload = (event) => {
            const arrayBuffer = event.target?.result as ArrayBuffer;
            if (!arrayBuffer) return;

            let text = '';
            try {
                const decoder = new TextDecoder('utf-8', { fatal: true });
                text = decoder.decode(arrayBuffer);
            } catch (e) {
                const decoder = new TextDecoder('shift-jis');
                text = decoder.decode(arrayBuffer);
            }

            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    if (results.data.length === 0) {
                        alert("解析に失敗しました。データが空です。");
                        return;
                    }

                    const headers = results.meta.fields || [];
                    const cleanHeaders = headers.map(h => h.replace(/^[\\uFEFF\\u200B"'\\s　]+|["'\\s　]+$/g, '').normalize('NFKC'));

                    const findKey = (keywords: string[]) => cleanHeaders.find(header =>
                        keywords.some(keyword => header.includes(keyword))
                    );

                    const codeKey = findKey(['コード', '商品コード', 'JAN']);
                    const nameKey = findKey(['名称', '商品名', '品名']);
                    const yoyKey = findKey(['売上数昨比', '売上数作比', '数量前年比', '昨年比', '数量昨比', '前比']);
                    const qtyKey = cleanHeaders.find(h => 
                        (h.includes('売上数') || h.includes('数量') || h.includes('販売数') || h.includes('販売数量')) && h !== yoyKey
                    );
                    const amtKey = findKey(['売上高', '金額', '販売金額']);

                    if (!nameKey) {
                        alert("解析に失敗しました。必須列（名称など）が見つかりません。\\n検出されたヘッダー: " + cleanHeaders.join(', '));
                        return;
                    }

                    const items: BestItem[] = [];

                    results.data.forEach((row: any) => {
                        const cleanRow: Record<string, string> = {};
                        Object.keys(row).forEach((k, i) => {
                            if (!cleanHeaders[i]) return;
                            cleanRow[cleanHeaders[i]] = String(row[k] || '').trim();
                        });

                        const itemName = nameKey ? cleanRow[nameKey] : '';
                        const code = codeKey ? cleanRow[codeKey] : undefined;
                        
                        if (!itemName || itemName === '合計' || !code) return;

                        const parseNumeric = (val: string | undefined) => {
                            if (!val) return undefined;
                            const num = parseFloat(val.replace(/[^0-9.-]/g, ''));
                            return isNaN(num) ? undefined : num;
                        };

                        const qty = qtyKey ? parseNumeric(cleanRow[qtyKey]) : undefined;
                        const yoy = yoyKey ? parseNumeric(cleanRow[yoyKey]) : undefined;
                        const amt = amtKey ? parseNumeric(cleanRow[amtKey]) : undefined;

                        items.push({
                            name: itemName,
                            code: code,
                            salesQty: qty,
                            salesYoY: yoy,
                            salesAmt: amt,
                            sales: amt || 0
                        });
                    });

                    if (items.length > 0) {
                        items.sort((a, b) => (b.salesAmt || 0) - (a.salesAmt || 0));
                        setForm(prev => ({
                            ...prev,
                            [type === 'veggie' ? 'bestVegetables' : 'bestFruits']: items
                        }));
                        alert(\`\${typeName}CSV \${items.length}件を抽出しました\`);
                    } else {
                        alert("データの抽出に失敗しました（有効なデータが0件です）。\\n検出されたヘッダー: " + cleanHeaders.join(', '));
                    }
                },
                error: (error: any) => {
                    console.error("CSV Parse Error:", error);
                    alert("CSVファイルの読み込み中にエラーが発生しました。");
                }
            });
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    };

`;
const updated = code.substring(0, startIdx) + repl + code.substring(endIdx);
fs.writeFileSync('src/components/InspectionForm.tsx', updated);
console.log("Success");
