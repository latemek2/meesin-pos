import type { SizeType } from './types';

export interface SizeRow {
  label: string;
  eu: string;
  us: string;
  uk: string;
  cm: string;
}

// ค่าเริ่มต้นโดยประมาณ (เทียบไซซ์ผู้ใหญ่แบบทั่วไป) แก้ได้ตามป้ายของแต่ละยี่ห้อก่อนสร้าง
const ADULT: [string, string, string, string][] = [
  ['35', '3.5', '3', '22.5'],
  ['36', '4', '3.5', '23'],
  ['37', '5', '4', '23.5'],
  ['38', '5.5', '5', '24'],
  ['39', '6.5', '6', '24.5'],
  ['40', '7', '6.5', '25'],
  ['41', '8', '7', '26'],
  ['42', '8.5', '8', '26.5'],
  ['43', '9.5', '9', '27.5'],
  ['44', '10', '9.5', '28'],
  ['45', '11', '10.5', '29'],
  ['46', '12', '11', '29.5'],
];

const KID: [string, string, string, string][] = [
  ['20', '4.5C', '4', '12.5'],
  ['21', '5C', '4.5', '13'],
  ['22', '6C', '5.5', '13.5'],
  ['23', '7C', '6', '14'],
  ['24', '7.5C', '7', '15'],
  ['25', '8.5C', '8', '15.5'],
  ['26', '9C', '8.5', '16'],
  ['27', '10C', '9', '16.5'],
  ['28', '11C', '10', '17.5'],
  ['29', '11.5C', '11', '18'],
  ['30', '12.5C', '12', '18.5'],
  ['31', '13C', '12.5', '19.5'],
  ['32', '1Y', '13', '20'],
  ['33', '2Y', '1', '20.5'],
  ['34', '3Y', '2', '21.5'],
  ['35', '3.5Y', '2.5', '22'],
];

const APPAREL = ['S', 'M', 'L', 'XL', 'XXL'];

export function sizeTemplate(type: SizeType): SizeRow[] {
  switch (type) {
    case 'shoe':
      return ADULT.map(([eu, us, uk]) => ({ label: `EU ${eu}`, eu, us, uk, cm: '' }));
    case 'kid_shoe':
      return KID.map(([eu, us, uk, cm]) => ({ label: `EU ${eu}`, eu, us, uk, cm }));
    case 'apparel':
      return APPAREL.map((s) => ({ label: s, eu: '', us: '', uk: '', cm: '' }));
    default:
      return [{ label: 'ฟรีไซซ์', eu: '', us: '', uk: '', cm: '' }];
  }
}

/** ส่วนท้ายของ SKU จากไซซ์ เช่น "EU 40" → "40", "ฟรีไซซ์" → "F" */
export function sizeCode(row: { label: string; eu?: string | null }): string {
  if (row.eu) return row.eu.replace(/\s+/g, '');
  if (row.label === 'ฟรีไซซ์') return 'F';
  return row.label.replace(/\s+/g, '').toUpperCase();
}

/** ข้อความไซซ์แบบเต็มสำหรับแสดงผล */
export function sizeDetail(v: { size_eu?: string | null; size_us?: string | null; size_uk?: string | null; size_cm?: string | null; size_label: string }) {
  const parts: string[] = [];
  if (v.size_eu) parts.push(`EU ${v.size_eu}`);
  if (v.size_us) parts.push(`US ${v.size_us}`);
  if (v.size_uk) parts.push(`UK ${v.size_uk}`);
  if (v.size_cm) parts.push(`${v.size_cm} ซม.`);
  return parts.length ? parts.join(' · ') : v.size_label;
}
