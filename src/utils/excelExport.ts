import ExcelJS from 'exceljs';
import type { Worksheet } from 'exceljs';
import type { InventoryDepartment, InventoryItem, InventoryType, InventoryValueType } from '../types';

type ExportOptions = {
    type: InventoryType;
    department: InventoryDepartment;
    valueType: InventoryValueType;
    storeName?: string;
    executionTime?: string;
    filename?: string;
};

const TEMPLATE_PATH = '/templates/inventory_template.xlsx';
const TARGET_SHEETS: Record<InventoryDepartment, string> = {
    野菜: '野菜テンプレ',
    果物: '果物'
};
const PAGE_BLOCKS = [
    {
        number: 1,
        titleRow: 1,
        storeRow: 5,
        departmentRow: 7,
        locationRow: 9,
        checkHeaderRow: 4,
        checkInputRow: 5,
        detailStartRow: 12,
        detailEndRow: 36,
        subtotalRow: 37
    },
    {
        number: 2,
        titleRow: 38,
        storeRow: 42,
        departmentRow: 44,
        locationRow: 46,
        checkHeaderRow: 41,
        checkInputRow: 42,
        detailStartRow: 49,
        detailEndRow: 73,
        subtotalRow: 74
    },
    {
        number: 3,
        titleRow: 75,
        storeRow: 79,
        departmentRow: 81,
        locationRow: 83,
        checkHeaderRow: 78,
        checkInputRow: 79,
        detailStartRow: 86,
        detailEndRow: 110,
        subtotalRow: 111
    }
] as const;
const MAX_EXPORT_ROWS = PAGE_BLOCKS.reduce((sum, block) => sum + (block.detailEndRow - block.detailStartRow + 1), 0);
const DETAIL_COLUMNS = {
    name: 'B',
    qty: 'F',
    unit: 'G',
    cost: 'I',
    price: 'J',
    costAmount: 'K',
    salesAmount: 'N'
} as const;
const CHECK_AREA_LAYOUT = [
    { headerRange: 'K:K', inputRange: 'K:K', label: '担当者（記入係）' },
    { headerRange: 'L:M', inputRange: 'L:M', label: '担当者（読上係）' },
    { headerRange: 'N:N', inputRange: 'N:N', label: '検査員' }
] as const;
const WRITABLE_ROWS = PAGE_BLOCKS.flatMap(({ detailStartRow, detailEndRow }) =>
    Array.from({ length: detailEndRow - detailStartRow + 1 }, (_, rowOffset) => detailStartRow + rowOffset)
);

const getFilteredItems = (
    items: InventoryItem[],
    options: Pick<ExportOptions, 'department' | 'type'>
) => {
    return items
        .filter((item) =>
            (item.inventoryType || 'monthend') === options.type &&
            (item.department || '野菜') === options.department &&
            item.qty > 0
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
};

const formatJapaneseDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) {
        return dateStr;
    }
    return `${year}年 ${month}月 ${day}日`;
};

const getExecutionTimeLabel = (executionTime?: string) => {
    return `実施時間　${executionTime || '16：00　　　～　18：00'}`;
};

const clearMergedMasterValue = (sheet: Worksheet, address: string) => {
    sheet.getCell(address).value = null;
};

const updateHeaderBlock = (
    sheet: Worksheet,
    block: (typeof PAGE_BLOCKS)[number],
    options: ExportOptions,
    formattedDate: string
) => {
    sheet.getCell(`L${block.titleRow}`).value = block.number;

    sheet.getCell(`C${block.storeRow}`).value = options.storeName || '古沢店';
    sheet.getCell(`C${block.departmentRow}`).value = options.department;
    sheet.getCell(`F${block.departmentRow}`).value = `         ${formattedDate}`;
    sheet.getCell(`C${block.locationRow}`).value = '後方';
    sheet.getCell(`E${block.locationRow}`).value = getExecutionTimeLabel(options.executionTime);
};

const rebuildCheckArea = (sheet: Worksheet, block: (typeof PAGE_BLOCKS)[number]) => {
    CHECK_AREA_LAYOUT.forEach(({ headerRange, inputRange, label }) => {
        const [headerStartCol] = headerRange.split(':');
        const [inputStartCol] = inputRange.split(':');
        const headerCell = sheet.getCell(`${headerStartCol}${block.checkHeaderRow}`);
        const inputCell = sheet.getCell(`${inputStartCol}${block.checkInputRow}`);

        headerCell.value = label;
        inputCell.value = null;
    });
};

const clearDetailRows = (sheet: Worksheet) => {
    PAGE_BLOCKS.forEach((block) => {
        for (let row = block.detailStartRow; row <= block.detailEndRow; row += 1) {
            clearMergedMasterValue(sheet, `${DETAIL_COLUMNS.name}${row}`);
            clearMergedMasterValue(sheet, `${DETAIL_COLUMNS.qty}${row}`);
            clearMergedMasterValue(sheet, `${DETAIL_COLUMNS.cost}${row}`);
            clearMergedMasterValue(sheet, `${DETAIL_COLUMNS.price}${row}`);
        }
    });
};

const writeInventoryRows = (sheet: Worksheet, items: InventoryItem[]) => {
    clearDetailRows(sheet);

    items.forEach((item, index) => {
        const rowNumber = WRITABLE_ROWS[index];

        if (!rowNumber) {
            return;
        }

        sheet.getCell(`${DETAIL_COLUMNS.name}${rowNumber}`).value = item.name;
        sheet.getCell(`${DETAIL_COLUMNS.qty}${rowNumber}`).value = item.qty || 0;
        sheet.getCell(`${DETAIL_COLUMNS.cost}${rowNumber}`).value = item.cost || 0;
        sheet.getCell(`${DETAIL_COLUMNS.price}${rowNumber}`).value = item.price || 0;
    });
};

const downloadWorkbook = async (workbook: ExcelJS.Workbook, filename: string) => {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const exportInventoryToExcel = async (
    items: InventoryItem[],
    dateStr: string,
    options: ExportOptions
): Promise<boolean> => {
    try {
        const filteredItems = getFilteredItems(items, options);
        if (filteredItems.length > MAX_EXPORT_ROWS) {
            throw new Error(`出力件数が ${MAX_EXPORT_ROWS} 件を超えています（${filteredItems.length}件）。75件以内に絞ってください`);
        }

        const response = await fetch(TEMPLATE_PATH);
        if (!response.ok) {
            throw new Error(`テンプレートファイルの読み込みに失敗しました: ${TEMPLATE_PATH} [${response.status}]`);
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await response.arrayBuffer());
        workbook.calcProperties.fullCalcOnLoad = true;

        const targetSheetName = TARGET_SHEETS[options.department];
        const targetSheet = workbook.getWorksheet(targetSheetName);

        if (!targetSheet) {
            throw new Error(`テンプレートに「${targetSheetName}」シートがありません`);
        }

        const formattedDate = formatJapaneseDate(dateStr);

        PAGE_BLOCKS.forEach((block) => {
            updateHeaderBlock(targetSheet, block, options, formattedDate);
            rebuildCheckArea(targetSheet, block);
        });
        writeInventoryRows(targetSheet, filteredItems);

        await downloadWorkbook(
            workbook,
            options.filename || `inventory_${dateStr}_${options.department}_${options.type}_${options.valueType}.xlsx`
        );
        return true;
    } catch (error) {
        console.error('Excel出力エラー:', error);
        alert('Excel出力に失敗しました。\n詳細: ' + (error instanceof Error ? error.message : String(error)));
        return false;
    }
};
