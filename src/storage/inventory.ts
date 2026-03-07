import type { InventoryItem } from '../types';

const STORAGE_KEY = 'seika_inventory_v1';

export const loadInventory = (): InventoryItem[] => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
        console.error('Failed to save inventory to localStorage:', e);
    }
};
