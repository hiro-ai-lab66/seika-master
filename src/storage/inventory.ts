import type { InventoryItem } from '../types';

export const INVENTORY_STORAGE_KEY = 'seika_inventory_phase1_draft_v1';

export const loadInventory = (): InventoryItem[] => {
    try {
        const saved = localStorage.getItem(INVENTORY_STORAGE_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.error('Failed to load inventory from localStorage:', e);
    }
    return [];
};

export const saveInventory = (items: InventoryItem[]): void => {
    try {
        localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
        console.error('Failed to save inventory to localStorage:', e);
    }
};

export const clearInventoryDraft = (): void => {
    try {
        localStorage.removeItem(INVENTORY_STORAGE_KEY);
    } catch (e) {
        console.error('Failed to clear inventory draft from localStorage:', e);
    }
};
