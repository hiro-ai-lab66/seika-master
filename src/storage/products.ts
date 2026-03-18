import type { Product } from '../types';

const STORAGE_KEY = 'seika_products_v1';

export const loadProducts = (): Product[] => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            console.log('[ProductStorage] loaded products:', parsed.length);
            return parsed;
        }
    } catch (e) {
        console.error('Failed to load products from localStorage:', e);
    }
    console.log('[ProductStorage] loaded products: 0');
    return [];
};

export const saveProducts = (items: Product[]): boolean => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        console.log('[ProductStorage] saved products:', items.length);
        return true;
    } catch (e) {
        console.error('Failed to save products to localStorage:', e);
        return false;
    }
};
