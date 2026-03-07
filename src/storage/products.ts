import type { Product } from '../types';

const STORAGE_KEY = 'seika_products_v1';

export const loadProducts = (): Product[] => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.error('Failed to load products from localStorage:', e);
    }
    return [];
};

export const saveProducts = (items: Product[]): void => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
        console.error('Failed to save products to localStorage:', e);
    }
};
