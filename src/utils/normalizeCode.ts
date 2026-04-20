export function normalizeCode(code: string | null | undefined): string {
    if (!code) return '';
    return String(code).trim();
}
