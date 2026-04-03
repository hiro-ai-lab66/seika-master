import ExcelJS from 'exceljs';
import type { Borders, Worksheet } from 'exceljs';
import type { InventoryDepartment, InventoryItem, InventoryType, InventoryValueType } from '../types';

type ExportOptions = {
    type: InventoryType;
    department: InventoryDepartment;
    valueType: InventoryValueType;
    storeName?: string;
    executionTime?: string;
};

const TEMPLATE_CANDIDATES = [
    '/templates/棚卸帳票類_原本.xlsx',
    '/templates/inventory_template.xlsx'
];
const TARGET_SHEETS: Record<InventoryDepartment, string> = {
    野菜: '野菜',
    果物: '果物'
};
const WRITE_BLOCKS = [
    { start: 12, end: 36 },
    { start: 49, end: 73 },
    { start: 86, end: 110 }
] as const;
const MAX_EXPORT_ROWS = WRITE_BLOCKS.reduce((sum, block) => sum + (block.end - block.start + 1), 0);
const COLUMN_MAP = {
    name: 1,
    qty: 2,
    unit: 3,
    cost: 4,
    price: 5,
    costAmount: 6,
    salesAmount: 7
} as const;
const THIN_BORDER_STYLE: Partial<Borders> = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' }
};

const buildWritableRows = () => {
    const rows: number[] = [];
    WRITE_BLOCKS.forEach((block) => {
        for (let row = block.start; row <= block.end; row += 1) {
            rows.push(row);
        }
    });
    return rows;
};

const WRITABLE_ROWS = buildWritableRows();

const loadTemplateWorkbook = async () => {
    let lastStatus = '';

    for (const templatePath of TEMPLATE_CANDIDATES) {
        console.log('[Inventory] try template path', templatePath);
        const response = await fetch(templatePath);
        if (!response.ok) {
            lastStatus = `${templatePath} [${response.status}]`;
            console.log('[Inventory] template fetch failed', templatePath, response.status);
            continue;
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await response.arrayBuffer());

        console.log('[Inventory] using template path', templatePath);
        console.log('[excelExport] loaded template workbook', {
            templatePath,
            sheetNames: workbook.worksheets.map((sheet) => sheet.name)
        });

        return { workbook, templatePath };
    }

    throw new Error(`テンプレートファイルの読み込みに失敗しました: ${lastStatus}`);
};

const clearWritableCells = (sheet: Worksheet) => {
    WRITABLE_ROWS.forEach((rowNumber) => {
        sheet.getCell(rowNumber, COLUMN_MAP.name).value = null;
        sheet.getCell(rowNumber, COLUMN_MAP.qty).value = null;
        sheet.getCell(rowNumber, COLUMN_MAP.cost).value = null;
        sheet.getCell(rowNumber, COLUMN_MAP.price).value = null;
    });
};

const applyBorder = (sheet: Worksheet) => {
    const rowCount = sheet.rowCount;
    const columnCount = Math.max(sheet.columnCount, COLUMN_MAP.salesAmount);

    for (let row = 1; row <= rowCount; row += 1) {
        for (let col = 1; col <= columnCount; col += 1) {
            const cell = sheet.getCell(row, col);
            cell.border = THIN_BORDER_STYLE;
        }
    }
};

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

const writeInventoryRows = (sheet: Worksheet, items: InventoryItem[]) => {
    clearWritableCells(sheet);

    items.forEach((item, index) => {
        const rowNumber = WRITABLE_ROWS[index];
        console.log('[Inventory] write start', {
            row: rowNumber,
            col: 'A,B,D,E',
            name: item.name,
            qty: item.qty || 0,
            cost: item.cost || 0,
            price: item.price || 0
        });

        sheet.getCell(rowNumber, COLUMN_MAP.name).value = item.name;
        sheet.getCell(rowNumber, COLUMN_MAP.qty).value = item.qty || 0;
        sheet.getCell(rowNumber, COLUMN_MAP.cost).value = item.cost || 0;
        sheet.getCell(rowNumber, COLUMN_MAP.price).value = item.price || 0;
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
) => {
    try {
        const filteredItems = getFilteredItems(items, options);
        if (filteredItems.length > MAX_EXPORT_ROWS) {
            throw new Error(`出力件数が ${MAX_EXPORT_ROWS} 件を超えています（${filteredItems.length}件）。75件以内に絞ってください`);
        }

        const { workbook, templatePath } = await loadTemplateWorkbook();
        console.log('[Inventory] resolved template path on export', templatePath);
        const targetSheetName = TARGET_SHEETS[options.department];
        const targetSheet = workbook.getWorksheet(targetSheetName);

        if (!targetSheet) {
            throw new Error(`テンプレートに「${targetSheetName}」シートがありません`);
        }

        console.log('[Inventory] target sheet', targetSheetName);
        console.log('[Inventory] resolved inventory column map', {
            sheetName: targetSheetName,
            inputStartRow: WRITE_BLOCKS[0].start,
            itemNameCol: 'A',
            quantityCol: 'B',
            unitCol: 'C',
            costCol: 'D',
            priceCol: 'E',
            costAmountCol: 'F',
            salesAmountCol: 'G'
        });
        console.log('[excelExport] writing inventory rows', {
            templatePath,
            targetSheetName,
            dateStr,
            blocks: WRITE_BLOCKS,
            rowCount: filteredItems.length,
            sampleRows: filteredItems.slice(0, 10).map((item, index) => ({
                index,
                targetRow: WRITABLE_ROWS[index],
                name: item.name,
                qty: item.qty,
                cost: item.cost || 0,
                price: item.price || 0
            }))
        });

        writeInventoryRows(targetSheet, filteredItems);
        applyBorder(targetSheet);

        console.log('[Inventory] workbook verification', {
            templatePath,
            targetSheetName,
            firstWrittenCell: {
                A12: targetSheet.getCell('A12').value,
                B12: targetSheet.getCell('B12').value,
                C12: targetSheet.getCell('C12').value,
                D12: targetSheet.getCell('D12').value,
                E12: targetSheet.getCell('E12').value
            },
            preservedCells: {
                G12: targetSheet.getCell('G12').value,
                C12: targetSheet.getCell('C12').value
            },
            formulas: {
                F12: targetSheet.getCell('F12').formula || null,
                G12: targetSheet.getCell('G12').formula || null,
                F37: targetSheet.getCell('F37').formula || null,
                G37: targetSheet.getCell('G37').formula || null,
                F74: targetSheet.getCell('F74').formula || null,
                G74: targetSheet.getCell('G74').formula || null,
                F111: targetSheet.getCell('F111').formula || null,
                G111: targetSheet.getCell('G111').formula || null
            }
        });

        await downloadWorkbook(
            workbook,
            `inventory_${dateStr}_${options.department}_${options.type}_${options.valueType}.xlsx`
        );
    } catch (error) {
        console.error('Excel出力エラー:', error);
        alert('Excel出力に失敗しました。\n詳細: ' + (error instanceof Error ? error.message : String(error)));
    }
};
