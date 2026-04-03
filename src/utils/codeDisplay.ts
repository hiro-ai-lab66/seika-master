const calcJan13 = (rawCode: string): string => {
    const digits = rawCode.replace(/[^0-9]/g, '');
    if (digits.length === 0) return rawCode;
    if (digits.length >= 13) return digits;
    const padded = digits.padStart(12, '0');
    let sum = 0;
    for (let i = 0; i < 12; i += 1) {
        const weight = i % 2 === 0 ? 1 : 3;
        sum += Number.parseInt(padded[i], 10) * weight;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return `${padded}${checkDigit.toString()}`;
};

export const formatDisplayCodeWithCheckDigit = (rawCode?: string) => {
    if (!rawCode) return '-';

    const trimmed = rawCode.trim();
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) {
        return trimmed || '-';
    }

    if (digits.length === 13) {
        return digits;
    }

    if (digits.length === 12) {
        return calcJan13(digits);
    }

    const stripped = digits.replace(/^0+/, '') || '0';
    return calcJan13(stripped).replace(/^0+/, '') || stripped;
};
