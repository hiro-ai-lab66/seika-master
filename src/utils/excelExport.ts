import ExcelJS from 'exceljs';
import type { Worksheet } from 'exceljs';
import type { InventoryDepartment, InventoryItem, InventoryType, InventoryValueType } from '../types';

type ExportOptions = {
    type: InventoryType;
    department: InventoryDepartment;
    valueType: InventoryValueType;
    storeName?: string;
    location?: string;
    executionTime?: string;
    filename?: string;
};

const TEMPLATE_PATH = `${import.meta.env.BASE_URL}templates/inventory_template.xlsx`;
const TARGET_SHEETS: Record<InventoryDepartment, string> = {
    野菜: '野菜',
    果物: '果物'
};
const EXPORT_DEPARTMENTS = Object.keys(TARGET_SHEETS) as InventoryDepartment[];
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
const DETAIL_CLEAR_COLUMNS = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'] as const;
const WRITABLE_ROWS = PAGE_BLOCKS.flatMap(({ detailStartRow, detailEndRow }) =>
    Array.from({ length: detailEndRow - detailStartRow + 1 }, (_, rowOffset) => detailStartRow + rowOffset)
);

const getFilteredItems = (
    items: InventoryItem[],
    dateStr: string,
    options: Pick<ExportOptions, 'department' | 'type'>
) => {
    return items
        .filter((item) =>
            (item.date || dateStr) === dateStr &&
            (item.inventoryType || 'monthend') === options.type &&
            (item.department || '野菜') === options.department &&
            item.name.trim() !== ''
        );
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

const writeMergedMasterValue = (sheet: Worksheet, address: string, value: string | number) => {
    const cell = sheet.getCell(address);
    const masterCell = cell.master || cell;
    masterCell.value = value;
};

const clearDetailCell = (sheet: Worksheet, address: string, clearedAddresses: Set<string>) => {
    const cell = sheet.getCell(address);
    const targetCell = cell.master || cell;
    if (clearedAddresses.has(targetCell.address)) return;
    targetCell.value = null;
    clearedAddresses.add(targetCell.address);
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
    writeMergedMasterValue(sheet, `F${block.departmentRow}`, `         ${formattedDate}`);
    sheet.getCell(`C${block.locationRow}`).value = options.location || '後方';
    sheet.getCell(`E${block.locationRow}`).value = getExecutionTimeLabel(options.executionTime);
};

const clearDetailRows = (sheet: Worksheet) => {
    const clearedAddresses = new Set<string>();
    PAGE_BLOCKS.forEach((block) => {
        for (let row = block.detailStartRow; row <= block.detailEndRow; row += 1) {
            DETAIL_CLEAR_COLUMNS.forEach((column) => {
                clearDetailCell(sheet, `${column}${row}`, clearedAddresses);
            });
        }
    });
};

const writeInventoryRows = (sheet: Worksheet, items: InventoryItem[]) => {
    items.forEach((item, index) => {
        const rowNumber = WRITABLE_ROWS[index];

        if (!rowNumber) {
            return;
        }

        sheet.getCell(`${DETAIL_COLUMNS.name}${rowNumber}`).value = item.name;
        sheet.getCell(`${DETAIL_COLUMNS.qty}${rowNumber}`).value = item.qty;
        sheet.getCell(`${DETAIL_COLUMNS.unit}${rowNumber}`).value = item.unit || '個';
        sheet.getCell(`${DETAIL_COLUMNS.cost}${rowNumber}`).value = item.cost;
        sheet.getCell(`${DETAIL_COLUMNS.price}${rowNumber}`).value = item.price;
        sheet.getCell(`${DETAIL_COLUMNS.costAmount}${rowNumber}`).value =
            item.qty !== null && item.cost !== null
                ? item.qty * item.cost
                : null;
    });
};

const findDepartmentSheet = (workbook: ExcelJS.Workbook, department: InventoryDepartment) => {
    const sheetName = TARGET_SHEETS[department];
    return workbook.getWorksheet(sheetName) ||
        workbook.worksheets.find((worksheet) => worksheet.name.trim() === sheetName);
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
        const itemsByDepartment = EXPORT_DEPARTMENTS.reduce((groups, department) => {
            const filteredItems = getFilteredItems(items, dateStr, { ...options, department });
            if (filteredItems.length > MAX_EXPORT_ROWS) {
                throw new Error(`${department}の出力件数が ${MAX_EXPORT_ROWS} 件を超えています（${filteredItems.length}件）。75件以内に絞ってください`);
            }
            groups[department] = filteredItems;
            return groups;
        }, {} as Record<InventoryDepartment, InventoryItem[]>);

        const response = await fetch(TEMPLATE_PATH);
        if (!response.ok) {
            throw new Error(`テンプレートファイルの読み込みに失敗しました: ${TEMPLATE_PATH} [${response.status}]`);
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await response.arrayBuffer());
        workbook.calcProperties.fullCalcOnLoad = true;

        const formattedDate = formatJapaneseDate(dateStr);

        EXPORT_DEPARTMENTS.forEach((department) => {
            const targetSheetName = TARGET_SHEETS[department];
            const targetSheet = findDepartmentSheet(workbook, department);
            if (!targetSheet) {
                throw new Error(`テンプレートに「${targetSheetName}」シートがありません`);
            }

            const departmentOptions = { ...options, department };
            clearDetailRows(targetSheet);
            PAGE_BLOCKS.forEach((block) => {
                updateHeaderBlock(targetSheet, block, departmentOptions, formattedDate);
            });
            writeInventoryRows(targetSheet, itemsByDepartment[department]);
        });

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
