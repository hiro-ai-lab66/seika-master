import * as XLSX from 'xlsx';
import type { InventoryDepartment, InventoryItem, InventoryType, InventoryValueType } from '../types';

type ExportOptions = {
    type: InventoryType;
    department: InventoryDepartment;
    valueType: InventoryValueType;
};

const DETAIL_ROW_START = 11;
const DETAIL_ROW_END = 160;

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

const setCellValue = (sheet: XLSX.WorkSheet, address: string, value: string | number | null) => {
    if (value === null || value === undefined || value === '') {
        delete sheet[address];
        return;
    }

    sheet[address] = {
        t: typeof value === 'number' ? 'n' : 's',
        v: value
    };
};

const updateHeaderValues = (sheet: XLSX.WorkSheet, department: InventoryDepartment, formattedDate: string) => {
    setCellValue(sheet, 'C5', '古沢店');
    setCellValue(sheet, 'C7', department);
    setCellValue(sheet, 'F7', `         ${formattedDate}`);
    setCellValue(sheet, 'C9', '後方');
    setCellValue(sheet, 'E9', '実施時間　16：00　　　～　18：00');
};

const clearDetailRows = (sheet: XLSX.WorkSheet) => {
    for (let row = DETAIL_ROW_START; row <= DETAIL_ROW_END; row += 1) {
        ['B', 'F', 'G', 'I', 'J', 'K'].forEach(column => {
            delete sheet[`${column}${row + 1}`];
        });
    }
};

const writeDetailRows = (sheet: XLSX.WorkSheet, items: InventoryItem[]) => {
    clearDetailRows(sheet);

    items.forEach((item, index) => {
        const row = DETAIL_ROW_START + index + 1;
        const unit = item.unit === 'ケース' ? '箱' : (item.unit || '');
        const cost = item.cost || 0;
        const price = item.price || 0;

        setCellValue(sheet, `B${row}`, item.name);
        setCellValue(sheet, `F${row}`, item.qty || 0);
        setCellValue(sheet, `G${row}`, unit);
        setCellValue(sheet, `I${row}`, cost);
        setCellValue(sheet, `J${row}`, price);
        setCellValue(sheet, `K${row}`, item.qty * cost);
    });
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
    setCellValue(sheet, 'D15', `店舗名：　古沢店`);
    setCellValue(sheet, 'D17', `部門名：　${department}`);
    setCellValue(sheet, 'I17', department === '野菜' ? 1 : 2);
    setCellValue(sheet, 'I15', 51);
    setCellValue(sheet, 'I11', 16 / 24);
    setCellValue(sheet, 'I12', 18 / 24);
    setCellValue(sheet, 'H20', totalAmount);
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

        const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
        const detailSheet = workbook.Sheets[options.department];
        const summarySheet = workbook.Sheets[getSummarySheetName(options.department, options.valueType)];

        if (!detailSheet) {
            throw new Error(`テンプレートに「${options.department}」シートがありません`);
        }

        if (!summarySheet) {
            throw new Error(`テンプレートに集計シートがありません`);
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
        writeDetailRows(detailSheet, filteredItems);
        updateSummarySheet(summarySheet, options.department, formattedDate, filteredItems, options.valueType);

        XLSX.writeFile(
            workbook,
            `inventory_${dateStr}_${options.department}_${options.type}_${options.valueType}.xlsx`
        );
    } catch (error) {
        console.error('Excel出力エラー:', error);
        alert('Excel出力に失敗しました。\n詳細: ' + (error instanceof Error ? error.message : String(error)));
    }
};
