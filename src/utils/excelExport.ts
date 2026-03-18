import * as XLSX from 'xlsx';
import type { InventoryDepartment, InventoryItem, InventoryType, InventoryValueType } from '../types';

type ExportOptions = {
    type: InventoryType;
    department: InventoryDepartment;
    valueType: InventoryValueType;
    storeName?: string;
    executionTime?: string;
};

const DETAIL_ROW_START = 12;
const DETAIL_ROW_END = 160;
const normalizeName = (value: string) => value.replace(/\s+/g, '').replace(/　/g, '').trim();

const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};

const getSummarySheetName = (department: InventoryDepartment, valueType: InventoryValueType) => {
    if (department === '野菜') {
        return valueType === 'cost' ? '野菜　原価' : '野菜　売価';
    }
    return valueType === 'cost' ? '果物　原価 ' : '果物　売価';
};

const setCellValue = (sheet: XLSX.WorkSheet, address: string, value: string | number | null, formula?: string) => {
    if (value === null || value === undefined || value === '') {
        delete sheet[address];
        return;
    }

    const cell: XLSX.CellObject = {
        t: typeof value === 'number' ? 'n' : 's',
        v: value
    };

    if (formula) {
        cell.f = formula;
    }

    sheet[address] = cell;
};

const updateHeaderValues = (
    sheet: XLSX.WorkSheet,
    department: InventoryDepartment,
    formattedDate: string,
    storeName: string,
    executionTime: string
) => {
    setCellValue(sheet, 'C5', storeName);
    setCellValue(sheet, 'C7', department);
    setCellValue(sheet, 'F7', `         ${formattedDate}`);
    setCellValue(sheet, 'C9', '後方');
    setCellValue(sheet, 'E9', `実施時間　${executionTime}`);
};

const buildDetailRowMap = (sheet: XLSX.WorkSheet) => {
    const rowMap = new Map<string, number>();
    let subtotalRow = DETAIL_ROW_END + 1;

    for (let row = DETAIL_ROW_START; row <= DETAIL_ROW_END; row += 1) {
        const nameCell = sheet[`B${row}`];
        if (!nameCell?.v) continue;

        const rawName = String(nameCell.v).trim();
        if (!rawName || rawName === '品名') continue;
        if (rawName === '小計') {
            subtotalRow = row;
            continue;
        }

        rowMap.set(normalizeName(rawName), row);
    }

    return { rowMap, subtotalRow };
};

const clearTemplateValueCells = (sheet: XLSX.WorkSheet, rowMap: Map<string, number>, subtotalRow: number) => {
    rowMap.forEach((row) => {
        ['F', 'H', 'I', 'J', 'K'].forEach((column) => {
            delete sheet[`${column}${row}`];
        });
    });

    for (let row = subtotalRow + 1; row <= subtotalRow + 20; row += 1) {
        ['B', 'F', 'G', 'H', 'I', 'J', 'K'].forEach((column) => {
            delete sheet[`${column}${row}`];
        });
    }
};

const writeMatchedRows = (sheet: XLSX.WorkSheet, items: InventoryItem[]) => {
    const { rowMap, subtotalRow } = buildDetailRowMap(sheet);
    const unmatchedItems: InventoryItem[] = [];

    clearTemplateValueCells(sheet, rowMap, subtotalRow);

    items.forEach((item) => {
        const row = rowMap.get(normalizeName(item.name));
        if (!row) {
            unmatchedItems.push(item);
            return;
        }

        const cost = item.cost || 0;
        const price = item.price || 0;
        const unit = item.unit === 'ケース' ? '箱' : (item.unit || '');

        setCellValue(sheet, `F${row}`, item.qty || 0);
        if (unit) {
            setCellValue(sheet, `G${row}`, unit);
        }
        setCellValue(sheet, `H${row}`, cost);
        setCellValue(sheet, `I${row}`, price);
        setCellValue(sheet, `J${row}`, item.qty * cost, `F${row}*H${row}`);
        setCellValue(sheet, `K${row}`, item.qty * price, `F${row}*I${row}`);
    });

    return { unmatchedItems, subtotalRow };
};

const updateSummarySheet = (
    sheet: XLSX.WorkSheet,
    department: InventoryDepartment,
    formattedDate: string,
    items: InventoryItem[],
    valueType: InventoryValueType,
    storeName: string
) => {
    const totalAmount = items.reduce((sum, item) => {
        const unitValue = valueType === 'price' ? (item.price || 0) : (item.cost || 0);
        return sum + item.qty * unitValue;
    }, 0);

    setCellValue(sheet, 'C9', `　　棚卸実施日：西暦　${formattedDate}`);
    setCellValue(sheet, 'D15', `店舗名：　${storeName}`);
    setCellValue(sheet, 'D17', `部門名：　${department}`);
    setCellValue(sheet, 'I15', 51);
    setCellValue(sheet, 'I17', department === '野菜' ? 1 : 2);
    setCellValue(sheet, 'H20', totalAmount);
};

const writeUnassignedItemsToDetailSheet = (sheet: XLSX.WorkSheet, items: InventoryItem[], startRow: number) => {
    if (items.length === 0) {
        return;
    }

    setCellValue(sheet, `B${startRow}`, '未登録商品');
    items.forEach((item, index) => {
        const row = startRow + index + 1;
        setCellValue(sheet, `B${row}`, item.name);
        setCellValue(sheet, `F${row}`, item.qty);
        if (item.unit) setCellValue(sheet, `G${row}`, item.unit);
        setCellValue(sheet, `H${row}`, item.cost || 0);
        setCellValue(sheet, `I${row}`, item.price || 0);
        setCellValue(sheet, `J${row}`, item.qty * (item.cost || 0), `F${row}*H${row}`);
        setCellValue(sheet, `K${row}`, item.qty * (item.price || 0), `F${row}*I${row}`);
    });
};

export const exportInventoryToExcel = async (
    items: InventoryItem[],
    dateStr: string,
    options: ExportOptions
) => {
    try {
        const response = await fetch('/templates/inventory_template.xlsx');
        if (!response.ok) {
            throw new Error(`テンプレートファイルの読み込みに失敗しました [${response.status}]`);
        }

        const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array', cellFormula: true });
        const detailSheet = workbook.Sheets[options.department];
        const summarySheet = workbook.Sheets[getSummarySheetName(options.department, options.valueType)];

        if (!detailSheet) {
            throw new Error(`テンプレートに「${options.department}」シートがありません`);
        }
        if (!summarySheet) {
            throw new Error('テンプレートに集計シートがありません');
        }

        const formattedDate = formatDate(dateStr);
        const storeName = options.storeName || '古沢店';
        const executionTime = options.executionTime || '16：00　　　～　18：00';
        const filteredItems = items
            .filter(item =>
                (item.inventoryType || 'monthend') === options.type &&
                (item.department || '野菜') === options.department &&
                item.qty > 0
            )
            .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

        updateHeaderValues(detailSheet, options.department, formattedDate, storeName, executionTime);
        const { unmatchedItems, subtotalRow } = writeMatchedRows(detailSheet, filteredItems);
        updateSummarySheet(summarySheet, options.department, formattedDate, filteredItems, options.valueType, storeName);
        writeUnassignedItemsToDetailSheet(detailSheet, unmatchedItems, subtotalRow + 1);

        XLSX.writeFile(
            workbook,
            `inventory_${dateStr}_${options.department}_${options.type}_${options.valueType}.xlsx`
        );
    } catch (error) {
        console.error('Excel出力エラー:', error);
        alert('Excel出力に失敗しました。\n詳細: ' + (error instanceof Error ? error.message : String(error)));
    }
};
