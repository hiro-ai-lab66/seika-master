import * as XLSX from 'xlsx';
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
    name: 'A',
    qty: 'B',
    unit: 'C',
    cost: 'D',
    price: 'E',
    costAmount: 'F',
    salesAmount: 'G'
} as const;
const THIN_BORDER_STYLE = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' }
} as const;

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

        const workbook = XLSX.read(await response.arrayBuffer(), {
            type: 'array',
            cellFormula: true,
            cellStyles: true,
            cellNF: true
        });

        if (!templatePath) {
            throw new Error('templatePath が未設定です');
        }

        console.log('[Inventory] using template path', templatePath);
        console.log('[excelExport] loaded template workbook', {
            templatePath,
            sheetNames: workbook.SheetNames
        });

        return { workbook, templatePath };
    }

    throw new Error(`テンプレートファイルの読み込みに失敗しました: ${lastStatus}`);
};

const cloneCellWithoutValue = (cell?: XLSX.CellObject): XLSX.CellObject => {
    if (!cell) {
        return { t: 'z' };
    }

    const nextCell = { ...cell };
    delete nextCell.v;
    delete nextCell.w;
    delete nextCell.r;
    delete nextCell.h;
    return nextCell;
};

const setCellValuePreservingTemplate = (
    sheet: XLSX.WorkSheet,
    address: string,
    value: string | number | null | undefined
) => {
    const baseCell = cloneCellWithoutValue(sheet[address]);

    if (value === null || value === undefined || value === '') {
        delete baseCell.f;
        baseCell.t = 'z';
        sheet[address] = baseCell;
        return;
    }

    delete baseCell.f;
    baseCell.t = typeof value === 'number' ? 'n' : 's';
    baseCell.v = value;
    sheet[address] = baseCell;
};

const clearWritableCells = (sheet: XLSX.WorkSheet) => {
    WRITABLE_ROWS.forEach((row) => {
        setCellValuePreservingTemplate(sheet, `${COLUMN_MAP.name}${row}`, null);
        setCellValuePreservingTemplate(sheet, `${COLUMN_MAP.qty}${row}`, null);
        setCellValuePreservingTemplate(sheet, `${COLUMN_MAP.cost}${row}`, null);
        setCellValuePreservingTemplate(sheet, `${COLUMN_MAP.price}${row}`, null);
    });
};

const applyBorder = (sheet: XLSX.WorkSheet, range: XLSX.Range) => {
    for (let row = range.s.r; row <= range.e.r; row += 1) {
        for (let col = range.s.c; col <= range.e.c; col += 1) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
            if (!sheet[cellAddress]) continue;

            const currentStyle = (sheet[cellAddress].s || {}) as Record<string, unknown>;
            sheet[cellAddress].s = {
                ...currentStyle,
                border: THIN_BORDER_STYLE
            } as any;
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

const writeInventoryRows = (sheet: XLSX.WorkSheet, items: InventoryItem[]) => {
    clearWritableCells(sheet);

    items.forEach((item, index) => {
        const row = WRITABLE_ROWS[index];
        console.log('[Inventory] write start', {
            row,
            col: 'A,B,D,E',
            name: item.name,
            qty: item.qty || 0,
            cost: item.cost || 0,
            price: item.price || 0
        });
        setCellValuePreservingTemplate(sheet, `${COLUMN_MAP.name}${row}`, item.name);
        setCellValuePreservingTemplate(sheet, `${COLUMN_MAP.qty}${row}`, item.qty || 0);
        setCellValuePreservingTemplate(sheet, `${COLUMN_MAP.cost}${row}`, item.cost || 0);
        setCellValuePreservingTemplate(sheet, `${COLUMN_MAP.price}${row}`, item.price || 0);
    });
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
        const targetSheet = workbook.Sheets[targetSheetName];

        if (!targetSheet) {
            throw new Error(`テンプレートに「${targetSheetName}」シートがありません`);
        }

        console.log('[Inventory] target sheet', targetSheetName);
        console.log('[Inventory] resolved inventory column map', {
            sheetName: targetSheetName,
            inputStartRow: WRITE_BLOCKS[0].start,
            itemNameCol: COLUMN_MAP.name,
            quantityCol: COLUMN_MAP.qty,
            unitCol: COLUMN_MAP.unit,
            costCol: COLUMN_MAP.cost,
            priceCol: COLUMN_MAP.price,
            costAmountCol: COLUMN_MAP.costAmount,
            salesAmountCol: COLUMN_MAP.salesAmount,
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
        if (targetSheet['!ref']) {
            applyBorder(targetSheet, XLSX.utils.decode_range(targetSheet['!ref']));
        }

        console.log('[Inventory] workbook verification', {
            templatePath,
            targetSheetName,
            firstWrittenCell: {
                A12: targetSheet['A12']?.v,
                B12: targetSheet['B12']?.v,
                C12: targetSheet['C12']?.v,
                D12: targetSheet['D12']?.v,
                E12: targetSheet['E12']?.v,
            },
            preservedCells: {
                G12: targetSheet['G12']?.v,
                C12: targetSheet['C12']?.v,
            },
            formulas: {
                F12: targetSheet['F12']?.f || null,
                G12: targetSheet['G12']?.f || null,
                F37: targetSheet['F37']?.f || null,
                G37: targetSheet['G37']?.f || null,
                F74: targetSheet['F74']?.f || null,
                G74: targetSheet['G74']?.f || null,
                F111: targetSheet['F111']?.f || null,
                G111: targetSheet['G111']?.f || null
            }
        });

        XLSX.writeFile(
            workbook,
            `inventory_${dateStr}_${options.department}_${options.type}_${options.valueType}.xlsx`,
            { cellStyles: true }
        );
    } catch (error) {
        console.error('Excel出力エラー:', error);
        alert('Excel出力に失敗しました。\n詳細: ' + (error instanceof Error ? error.message : String(error)));
    }
};
