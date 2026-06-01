// Thai locale formatters for currency and numbers.

export const fmtTHB = (n: number, opts: Intl.NumberFormatOptions = {}): string =>
  '฿' + Number(n).toLocaleString('th-TH', { maximumFractionDigits: 0, ...opts });

export const fmtN = (n: number): string => Number(n).toLocaleString('th-TH');
