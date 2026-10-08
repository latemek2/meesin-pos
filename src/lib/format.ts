const money0 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const money2 = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1290 → "1,290" */
export const baht = (n: number | string | null | undefined) => money0.format(Number(n ?? 0));
/** 1290 → "1,290.00" */
export const baht2 = (n: number | string | null | undefined) => money2.format(Number(n ?? 0));

export const dateTH = (d: string | Date) =>
  new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
export const dateTimeTH = (d: string | Date) =>
  new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** วันนี้ตามเวลาไทย รูปแบบ YYYY-MM-DD */
export const todayISO = () =>
  new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });

export const num = (v: string) => {
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
