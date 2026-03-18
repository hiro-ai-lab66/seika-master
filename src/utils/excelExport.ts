import * as XLSX from 'xlsx';
import type { InventoryDepartment, InventoryItem, InventoryType, InventoryValueType } from '../types';

type ExportOptions = {
    type: InventoryType;
    department: InventoryDepartment;
    valueType: InventoryValueType;
};

const DETAIL_ROW_START = 12;
const DETAIL_ROW_END = 160;
const UNASSIGNED_SHEET_NAME = '未割当商品';

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

const updateHeaderValues = (sheet: XLSX.WorkSheet, department: InventoryDepartment, formattedDate: string) => {
    setCellValue(sheet, 'C5', '古沢店');
    setCellValue(sheet, 'C7', department);
    setCellValue(sheet, 'F7', `         ${formattedDate}`);
    setCellValue(sheet, 'C9', '後方');
    setCellValue(sheet, 'E9', '実施時間　16：00　　　～　18：00');
};

const buildDetailRowMap = (sheet: XLSX.WorkSheet) => {
    const rowMap = new Map<string, number>();

    for (let row = DETAIL_ROW_START; row <= DETAIL_ROW_END; row += 1) {
        const nameCell = sheet[`B${row}`];
        if (!nameCell?.v) continue;

        const rawName = String(nameCell.v).trim();
        if (!rawName || rawName === '品名' || rawName === '小計') continue;

        rowMap.set(normalizeName(rawName), row);
    }

    return rowMap;
};

const clearTemplateValueCells = (sheet: XLSX.WorkSheet, rowMap: Map<string, number>) => {
    rowMap.forEach((row) => {
        ['F', 'H', 'I', 'J', 'K'].forEach((column) => {
            delete sheet[`${column}${row}`];
        });
    });
};

const writeMatchedRows = (sheet: XLSX.WorkSheet, items: InventoryItem[]) => {
    const rowMap = buildDetailRowMap(sheet);
    const unmatchedItems: InventoryItem[] = [];

    clearTemplateValueCells(sheet, rowMap);

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

    return unmatchedItems;
};

const updateSummarySheet = (
    sheet: XLSX.WorkSheet,
    department: InventoryDepartment,
    formattedDate: string,
    items: InventoryItem[],
    valueType: InventoryValueType
) => {
    const totalAmount = items.reduce((sum, item) => {
        const unitValue = valueType === 'price' ? (item.price || 0) : (item.cost || 0);
        return sum + item.qty * unitValue;
    }, 0);

    setCellValue(sheet, 'C9', `　　棚卸実施日：西暦　${formattedDate}`);
    setCellValue(sheet, 'D15', '店舗名：　古沢店');
    setCellValue(sheet, 'D17', `部門名：　${department}`);
    setCellValue(sheet, 'I15', 51);
    setCellValue(sheet, 'I17', department === '野菜' ? 1 : 2);
    setCellValue(sheet, 'H20', totalAmount);
};

const writeUnassignedSheet = (workbook: XLSX.WorkBook, items: InventoryItem[], options: ExportOptions) => {
    if (items.length === 0) {
        if (workbook.Sheets[UNASSIGNED_SHEET_NAME]) {
            workbook.Sheets[UNASSIGNED_SHEET_NAME] = XLSX.utils.aoa_to_sheet([
                ['商品名', '部門', '数量', '原価', '売価', '棚卸区分'],
                ['未割当なし', options.department, '', '', '', options.type === 'mid' ? '15日' : '月末']
            ]);
        }
        return;
    }

    const rows = [
        ['商品名', '部門', '数量', '原価', '売価', '棚卸区分'],
        ...items.map(item => [
            item.name,
            item.department || '野菜',
            item.qty,
            item.cost || 0,
            item.price || 0,
            item.inventoryType === 'mid' ? '15日' : '月末'
        ])
    ];

    workbook.Sheets[UNASSIGNED_SHEET_NAME] = XLSX.utils.aoa_to_sheet(rows);
    if (!workbook.SheetNames.includes(UNASSIGNED_SHEET_NAME)) {
        workbook.SheetNames.push(UNASSIGNED_SHEET_NAME);
    }
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
        const filteredItems = items
            .filter(item =>
                (item.inventoryType || 'monthend') === options.type &&
                (item.department || '野菜') === options.department &&
                item.qty > 0
            )
            .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

        updateHeaderValues(detailSheet, options.department, formattedDate);
        const unmatchedItems = writeMatchedRows(detailSheet, filteredItems);
        updateSummarySheet(summarySheet, options.department, formattedDate, filteredItems, options.valueType);
        writeUnassignedSheet(workbook, unmatchedItems, options);

        XLSX.writeFile(
            workbook,
            `inventory_${dateStr}_${options.department}_${options.type}_${options.valueType}.xlsx`
        );
    } catch (error) {
        console.error('Excel出力エラー:', error);
        alert('Excel出力に失敗しました。\n詳細: ' + (error instanceof Error ? error.message : String(error)));
    }
};
