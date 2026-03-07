import * as XLSX from 'xlsx';
import type { InventoryItem, InventoryType } from '../types';

/**
 * テンプレートExcelを読み込み、棚卸しデータを書き込んでダウンロードする
 * @param items 出力対象の棚卸しデータ
 * @param dateStr 実行日表示文字列 (例: "2026-02-28" → "2026年2月28日")
 * @param type 棚卸種別 ('mid' または 'monthend')
 */
export const exportInventoryToExcel = async (items: InventoryItem[], dateStr: string, type: InventoryType = 'monthend') => {
    try {
        // 1. /public/templates/inventory_template.xlsx をフェッチ
        const response = await fetch('/templates/inventory_template.xlsx');
        if (!response.ok) {
            throw new Error(`テンプレートファイルの読み込みに失敗しました。 (/public/templates/inventory_template.xlsx にファイルが存在するか確認してください) [${response.status}]`);
        }

        const arrayBuffer = await response.arrayBuffer();

        // 2. xlsx ワークブックとしてパース
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        // 日付のフォーマット (YYYY-MM-DD -> YYYY年M月D日)
        const d = new Date(dateStr);
        const formattedDate = Number.isNaN(d.getTime())
            ? dateStr
            : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;

        // 書き込み処理用の共通関数
        const processSheet = (sheetName: '野菜' | '果物', departmentItems: InventoryItem[], deptName: string) => {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) {
                console.warn(`テンプレートに「${sheetName}」シートがありません。`);
                return;
            }

            // ヘッダー情報の書き換え
            // テンプレの構造を推測し、指定されたキーワードの右のセル（同じ行の次のセル）に値を書き込むロジック
            const setHeaderValue = (keyword: string, value: string) => {
                const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z20');
                for (let R = range.s.r; R <= Math.min(10, range.e.r); ++R) {
                    for (let C = range.s.c; C <= range.e.c; ++C) {
                        const cellAddress = XLSX.utils.encode_cell({ c: C, r: R });
                        const cell = sheet[cellAddress];
                        if (cell && cell.v && String(cell.v).includes(keyword)) {
                            // キーワードが見つかったら、一つ右のセルに書き込む
                            const targetAddress = XLSX.utils.encode_cell({ c: C + 1, r: R });
                            sheet[targetAddress] = { t: 's', v: value };
                            return; // 最初の1つだけ書き換え
                        }
                    }
                }

                // もしキーワードが見つからなかった場合のフォールバック（固定位置）
                let fallbackCell = '';
                if (keyword.includes('店舗')) fallbackCell = 'C2';
                else if (keyword.includes('部門')) fallbackCell = 'C3';
                else if (keyword.includes('日')) fallbackCell = 'C4';
                else if (keyword.includes('場所')) fallbackCell = 'C5';
                else if (keyword.includes('時間')) fallbackCell = 'C6';

                if (fallbackCell) {
                    sheet[fallbackCell] = { t: 's', v: value };
                }
            };

            setHeaderValue('店舗', '古沢店');
            setHeaderValue('部門', deptName);
            setHeaderValue('実施日', formattedDate);
            setHeaderValue('場所', '後方');
            setHeaderValue('実施時間', '16:00～18:00');
            setHeaderValue('担当者', '');

            // 明細行の書き込み (12行目から開始 -> row index 11)
            const START_ROW = 11;

            departmentItems.forEach((item, index) => {
                const row = START_ROW + index;

                // 単位の変換処理 (ケース -> 箱)
                const unit = item.unit === 'ケース' ? '箱' : (item.unit || '');

                // B列(1): 品名, F列(5): 数量, G列(6): 単位, I列(8): 原価
                // K列(10): 原価金額の数式は触らない => undefinedを渡してスキップ（上書きしない）

                // AOAで1行分作成して指定行に注入 (C,D,Eなどはスキップするため null を挟む)
                // [A, B, C, D, E, F, G, H, I]
                const rowData = [
                    null,              // A
                    item.name,         // B 品名
                    null,              // C
                    null,              // D
                    null,              // E
                    item.qty,          // F 数量
                    unit,              // G 単位
                    null,              // H
                    item.cost || 0,    // I 原価
                ];

                XLSX.utils.sheet_add_aoa(sheet, [rowData], { origin: XLSX.utils.encode_cell({ c: 0, r: row }) });
            });
        };

        // 3. データを部門ごとに振り分け
        const vegItems = items.filter(item => item.department === '野菜' || !item.department); // 未設定は野菜フォールバック
        const fruitItems = items.filter(item => item.department === '果物');

        processSheet('野菜', vegItems, '野菜');
        processSheet('果物', fruitItems, '果物');

        // 4. ダウンロードの実行
        const fileName = `seika_inventory_${dateStr}_${type}.xlsx`;
        XLSX.writeFile(workbook, fileName);

    } catch (error) {
        console.error('Excel出力エラー:', error);
        alert('Excel出力に失敗しました。\\n詳細: ' + (error instanceof Error ? error.message : String(error)));
    }
};
