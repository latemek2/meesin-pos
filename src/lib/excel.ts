// อ่าน ตรวจ และเขียนไฟล์ Excel สินค้า
// ไฟล์หนึ่งแถว = สินค้าหนึ่งสีหนึ่งไซซ์ แถวที่ชื่อสินค้าเหมือนกันคือรุ่นเดียวกัน
import { sizeTemplate } from './sizes';
import type { Category, SizeType, StockRow } from './types';

export const COLUMNS = ['ชื่อสินค้า', 'หมวด', 'ยี่ห้อ', 'ราคาขาย', 'ต้นทุน', 'สี', 'ไซซ์', 'EU', 'US', 'UK', 'ซม.', 'บาร์โค้ด', 'จำนวน'] as const;
type Col = (typeof COLUMNS)[number];

const ALIASES: Record<string, Col> = {
  ชื่อสินค้า: 'ชื่อสินค้า', ชื่อ: 'ชื่อสินค้า', สินค้า: 'ชื่อสินค้า', รุ่น: 'ชื่อสินค้า', name: 'ชื่อสินค้า',
  หมวด: 'หมวด', หมวดหมู่: 'หมวด', category: 'หมวด',
  ยี่ห้อ: 'ยี่ห้อ', แบรนด์: 'ยี่ห้อ', brand: 'ยี่ห้อ',
  ราคาขาย: 'ราคาขาย', ราคา: 'ราคาขาย', price: 'ราคาขาย',
  ต้นทุน: 'ต้นทุน', ทุน: 'ต้นทุน', cost: 'ต้นทุน',
  สี: 'สี', color: 'สี',
  ไซซ์: 'ไซซ์', ไซส์: 'ไซซ์', size: 'ไซซ์',
  eu: 'EU', us: 'US', uk: 'UK', 'ซม.': 'ซม.', ซม: 'ซม.', cm: 'ซม.',
  บาร์โค้ด: 'บาร์โค้ด', barcode: 'บาร์โค้ด',
  จำนวน: 'จำนวน', สต็อก: 'จำนวน', คงเหลือ: 'จำนวน', qty: 'จำนวน',
};

export type RawRow = Partial<Record<Col, string>> & { __row: number };

/** แปลงค่าจากเซลล์ให้เป็นข้อความ ตัวเลขยาวอย่างบาร์โค้ดไม่ให้กลายเป็น 8.85E+12 */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v).trim();
}

/** แปลงแถวจาก sheet_to_json (header: 1) เป็นแถวที่มีชื่อคอลัมน์มาตรฐาน */
export function normalizeSheet(aoa: unknown[][]): { rows: RawRow[]; missing: Col[] } {
  const headerIdx = aoa.findIndex((r) => r.some((c) => ALIASES[cellText(c).toLowerCase()] === 'ชื่อสินค้า'));
  if (headerIdx < 0) return { rows: [], missing: ['ชื่อสินค้า'] };
  const header = aoa[headerIdx].map((c) => ALIASES[cellText(c).toLowerCase()] ?? null);
  const missing = (['ชื่อสินค้า', 'หมวด', 'สี'] as Col[]).filter((c) => !header.includes(c));
  const rows: RawRow[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    const row: RawRow = { __row: i + 1 };
    let any = false;
    header.forEach((col, j) => {
      if (!col) return;
      const t = cellText(r[j]);
      if (t) {
        row[col] = t;
        any = true;
      }
    });
    if (any) rows.push(row);
  }
  return { rows, missing };
}

/** เดาชนิดไซซ์จากชื่อหมวด สำหรับหมวดใหม่ที่ยังไม่มีในระบบ */
export function guessSizeType(name: string): SizeType {
  if (/เด็ก/.test(name) && /รองเท้า/.test(name)) return 'kid_shoe';
  if (/รองเท้า|แตะ|ผ้าใบ|บูท|คัชชู|ส้นสูง/.test(name)) return 'shoe';
  if (/เสื้อ|กางเกง|กระโปรง|ชุด|แจ็ค|เดรส/.test(name)) return 'apparel';
  return 'free';
}

export type LineStatus = 'ok' | 'skip' | 'error';

export interface CheckedLine {
  row: number;
  name: string;
  category: string;
  color: string;
  size: string;
  barcode: string;
  qty: number;
  status: LineStatus;
  notes: string[];
  existingProduct: boolean;
}

export interface ImportVariant {
  color: string;
  size_label: string;
  size_eu: string | null;
  size_us: string | null;
  size_uk: string | null;
  size_cm: string | null;
  barcode: string | null;
  qty: number;
  sort_order: number;
}
export interface ImportProduct {
  name: string;
  category: string;
  brand: string | null;
  price: number | null;
  cost: number | null;
  variants: ImportVariant[];
}
export interface ImportPayload {
  categories: { name: string; size_type: SizeType }[];
  products: ImportProduct[];
}

export interface CheckResult {
  lines: CheckedLine[];
  payload: ImportPayload;
  unknownCategories: string[];
  summary: { ok: number; skip: number; error: number; newProducts: number; pieces: number };
}

const parseNum = (s: string | undefined) => {
  if (s === undefined || s === '') return null;
  const n = Number(s.replace(/[,฿\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

const key = (...parts: string[]) => parts.map((p) => p.trim().toLowerCase()).join('|');

export function checkRows(
  rows: RawRow[],
  categories: Category[],
  stock: StockRow[],
  newCategoryTypes: Record<string, SizeType>,
  createCategories: boolean,
): CheckResult {
  const catByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]));
  const existingProducts = new Map(stock.map((s) => [key(s.product_name, s.category_name), s.product_id]));
  const existingVariants = new Set(stock.map((s) => key(s.product_name, s.category_name, s.color, s.size_label)));
  const existingPrice = new Map(stock.map((s) => [key(s.product_name, s.category_name), Number(s.price)]));
  const barcodeOwner = new Map(stock.filter((s) => s.barcode).map((s) => [s.barcode!, key(s.product_name, s.category_name, s.color, s.size_label)]));

  const unknownCategories: string[] = [];
  const lines: CheckedLine[] = [];
  const products = new Map<string, ImportProduct>();
  const seenVariant = new Set<string>();
  const seenBarcode = new Map<string, number>();

  for (const r of rows) {
    const notes: string[] = [];
    let status = 'ok' as LineStatus;
    const err = (m: string) => {
      notes.push(m);
      status = 'error';
    };
    const name = (r['ชื่อสินค้า'] ?? '').trim();
    const catName = (r['หมวด'] ?? '').trim();
    const color = (r['สี'] ?? '').trim() || 'สีเดียว';
    const barcode = (r['บาร์โค้ด'] ?? '').replace(/\s/g, '');
    let qty = 0;

    if (!name) err('ไม่มีชื่อสินค้า');
    let sizeType: SizeType | null = null;
    if (!catName) err('ไม่มีหมวด');
    else {
      const c = catByName.get(catName.toLowerCase());
      if (c) sizeType = c.size_type;
      else {
        if (!unknownCategories.includes(catName)) unknownCategories.push(catName);
        if (createCategories) sizeType = newCategoryTypes[catName] ?? guessSizeType(catName);
        else err(`ยังไม่มีหมวด "${catName}" ในระบบ`);
      }
    }

    // ไซซ์
    let size: ImportVariant = { color, size_label: '', size_eu: null, size_us: null, size_uk: null, size_cm: null, barcode: barcode || null, qty: 0, sort_order: 0 };
    const sizeRaw = (r['ไซซ์'] ?? '').trim();
    if (sizeType === 'shoe' || sizeType === 'kid_shoe') {
      const eu = (r['EU'] ?? sizeRaw.replace(/^eu\s*/i, '')).trim();
      if (!eu) err('รองเท้าต้องใส่ไซซ์ EU');
      else {
        const tpl = sizeTemplate(sizeType);
        const idx = tpl.findIndex((t) => t.eu === eu);
        const t = idx >= 0 ? tpl[idx] : null;
        size = {
          ...size,
          size_label: `EU ${eu}`,
          size_eu: eu,
          size_us: r['US'] || t?.us || null,
          size_uk: r['UK'] || t?.uk || null,
          size_cm: r['ซม.'] || (sizeType === 'kid_shoe' ? t?.cm || null : null),
          sort_order: Math.round(Number(eu) * 10) || (idx >= 0 ? idx : 0),
        };
      }
    } else if (sizeType === 'apparel') {
      const s = sizeRaw.toUpperCase();
      if (!s) err('เสื้อผ้าต้องใส่ไซซ์ เช่น S M L');
      else {
        const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL'];
        size = { ...size, size_label: s, sort_order: order.indexOf(s) >= 0 ? order.indexOf(s) : 20 };
      }
    } else if (sizeType === 'free') {
      size = { ...size, size_label: sizeRaw || 'ฟรีไซซ์' };
    }

    // ราคา ต้นทุน จำนวน
    const price = parseNum(r['ราคาขาย']);
    const cost = parseNum(r['ต้นทุน']);
    const q = parseNum(r['จำนวน']);
    if (Number.isNaN(price) || (price !== null && price < 0)) err('ราคาขายต้องเป็นตัวเลข');
    if (Number.isNaN(cost) || (cost !== null && cost < 0)) err('ต้นทุนต้องเป็นตัวเลข');
    if (q !== null && (Number.isNaN(q) || q < 0 || !Number.isInteger(q))) err('จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 0');
    else qty = q ?? 0;
    if (/e\+/i.test(barcode)) err('บาร์โค้ดถูก Excel แปลงเป็นเลขยกกำลัง ตั้งคอลัมน์บาร์โค้ดเป็น "ข้อความ" แล้วพิมพ์ใหม่');

    const pKey = key(name, catName);
    const vKey = key(name, catName, color, size.size_label);
    const existingProduct = existingProducts.has(pKey);

    if (status !== 'error') {
      if (existingVariants.has(vKey)) {
        status = 'skip';
        notes.push('มีสีไซซ์นี้ในระบบแล้ว ข้าม (เพิ่มสต็อกที่หน้ารับของเข้า)');
      } else if (seenVariant.has(vKey)) {
        err('สีและไซซ์นี้ซ้ำกับแถวก่อนหน้าในไฟล์');
      } else if (barcode && barcodeOwner.has(barcode) && barcodeOwner.get(barcode) !== vKey) {
        err(`บาร์โค้ดซ้ำกับสินค้าที่มีอยู่แล้ว`);
      } else if (barcode && seenBarcode.has(barcode)) {
        err(`บาร์โค้ดซ้ำกับแถว ${seenBarcode.get(barcode)}`);
      } else if (!existingProduct && !products.has(pKey) && price === null) {
        err('สินค้าใหม่ต้องใส่ราคาขาย');
      }
    }

    if (status === 'ok') {
      seenVariant.add(vKey);
      if (barcode) seenBarcode.set(barcode, r.__row);
      let p = products.get(pKey);
      if (!p) {
        p = { name, category: catName, brand: r['ยี่ห้อ'] || null, price, cost, variants: [] };
        products.set(pKey, p);
        if (existingProduct) {
          notes.push('เพิ่มให้รุ่นเดิมที่มีอยู่');
          if (price !== null && existingPrice.get(pKey) !== price) notes.push('ราคาในไฟล์ไม่ตรงกับในระบบ ใช้ราคาเดิม');
        }
      } else if (price !== null && p.price !== null && price !== p.price) {
        notes.push(`ราคาไม่ตรงกับแถวแรกของรุ่นนี้ ใช้ ${p.price}`);
      }
      p.variants.push({ ...size, qty });
    }

    lines.push({ row: r.__row, name, category: catName, color, size: size.size_label, barcode, qty, status, notes, existingProduct });
  }

  const usedNewCats = createCategories
    ? unknownCategories.filter((c) => [...products.values()].some((p) => p.category === c))
    : [];
  const ok = lines.filter((l) => l.status === 'ok');
  return {
    lines,
    unknownCategories,
    payload: {
      categories: usedNewCats.map((name) => ({ name, size_type: newCategoryTypes[name] ?? guessSizeType(name) })),
      products: [...products.values()],
    },
    summary: {
      ok: ok.length,
      skip: lines.filter((l) => l.status === 'skip').length,
      error: lines.filter((l) => l.status === 'error').length,
      newProducts: [...products.keys()].filter((k) => !existingProducts.has(k)).length,
      pieces: ok.reduce((a, l) => a + l.qty, 0),
    },
  };
}

/* ---------- เขียนไฟล์ ---------- */
type XLSXModule = typeof import('xlsx');

const COL_WIDTHS = [28, 16, 12, 10, 10, 12, 8, 6, 6, 6, 6, 16, 8].map((wch) => ({ wch }));

export async function downloadTemplate(categories: Category[]) {
  const XLSX: XLSXModule = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const main = XLSX.utils.aoa_to_sheet([[...COLUMNS]]);
  main['!cols'] = COL_WIDTHS;
  XLSX.utils.book_append_sheet(wb, main, 'สินค้า');

  const example = XLSX.utils.aoa_to_sheet([
    [...COLUMNS],
    ['ผ้าใบ Classic Low', 'รองเท้าผ้าใบ', 'Breeze', 1290, 700, 'ขาว', '', 40, '', '', '', '8850000000017', 3],
    ['ผ้าใบ Classic Low', 'รองเท้าผ้าใบ', 'Breeze', 1290, 700, 'ขาว', '', 41, '', '', '', '', 2],
    ['ผ้าใบ Classic Low', 'รองเท้าผ้าใบ', 'Breeze', 1290, 700, 'ดำ', '', 41, '', '', '', '', 4],
    ['ผ้าใบเด็ก Little Step', 'รองเท้าเด็ก', '', 590, 300, 'ชมพู', '', 28, '11C', '10', '17.5', '', 2],
    ['เสื้อยืดคอกลม', 'เสื้อผ้า', '', 290, 120, 'กรม', 'M', '', '', '', '', '', 5],
    ['เสื้อยืดคอกลม', 'เสื้อผ้า', '', 290, 120, 'กรม', 'L', '', '', '', '', '', 5],
    ['ถุงเท้าข้อสั้น แพ็ก 3', 'ถุงเท้า', '', 190, 80, 'ดำ', '', '', '', '', '', '', 12],
  ]);
  example['!cols'] = COL_WIDTHS;
  XLSX.utils.book_append_sheet(wb, example, 'ตัวอย่าง');

  const help = XLSX.utils.aoa_to_sheet([
    ['วิธีกรอกแบบฟอร์มนำเข้าสินค้า ร้านมีศิลป์'],
    [],
    ['1 แถว = สินค้า 1 สี 1 ไซซ์ แถวที่ชื่อสินค้าและหมวดเหมือนกันคือรุ่นเดียวกัน'],
    ['กรอกในชีต "สินค้า" ดูตัวอย่างในชีต "ตัวอย่าง"'],
    [],
    ['คอลัมน์', 'ต้องกรอก', 'คำอธิบาย'],
    ['ชื่อสินค้า', 'ต้อง', 'ชื่อรุ่น พิมพ์ให้เหมือนกันทุกแถวของรุ่นเดียวกัน'],
    ['หมวด', 'ต้อง', 'ชื่อหมวดตามรายการด้านล่าง ถ้าไม่มี ระบบสร้างให้ได้ตอนนำเข้า'],
    ['ยี่ห้อ', '', ''],
    ['ราคาขาย', 'ต้อง (สินค้าใหม่)', 'ราคารวม VAT ใส่แค่ตัวเลข'],
    ['ต้นทุน', '', 'ต้นทุนต่อชิ้น ใช้คำนวณกำไร'],
    ['สี', '', 'ถ้าว่าง ระบบใส่ว่า "สีเดียว"'],
    ['ไซซ์', 'เสื้อผ้า', 'เช่น S M L XL XXL รองเท้าเว้นว่างได้ ถ้ากรอกช่อง EU แล้ว'],
    ['EU', 'รองเท้า', 'เช่น 40 ช่อง US UK ซม. เว้นว่างได้ ระบบเติมค่าประมาณให้ ตรวจแก้ภายหลังได้'],
    ['US / UK / ซม.', '', 'ใส่เมื่อต้องการค่าตามป้ายยี่ห้อ'],
    ['บาร์โค้ด', '', 'บาร์โค้ดโรงงาน ถ้าไม่มีเว้นว่าง ระบบสร้างรหัสให้และพิมพ์สติกเกอร์ได้'],
    ['จำนวน', '', 'จำนวนที่นับได้ตอนนี้ เป็นสต็อกตั้งต้น ว่าง = 0'],
    [],
    ['ข้อควรระวัง'],
    ['บาร์โค้ดที่ขึ้นต้นด้วย 0 หรือ Excel แสดงเป็น 8.85E+12 ให้คลิกขวาที่คอลัมน์บาร์โค้ด > Format Cells > Text แล้วพิมพ์ใหม่'],
    ['สีและไซซ์ที่มีในระบบแล้วจะถูกข้าม ไม่แก้สต็อก ให้ใช้หน้ารับของเข้าหรือปรับสต็อกแทน'],
    [],
    ['หมวดที่มีในระบบตอนนี้'],
    ...categories.map((c) => [c.name]),
  ]);
  help['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, help, 'วิธีกรอก');

  XLSX.writeFile(wb, 'แบบฟอร์มนำเข้าสินค้า-มีศิลป์.xlsx');
}

export async function exportProducts(stock: StockRow[], costs: Map<number, number>) {
  const XLSX: XLSXModule = await import('xlsx');
  const rows = [...stock].sort(
    (a, b) =>
      a.category_name.localeCompare(b.category_name, 'th') ||
      a.product_name.localeCompare(b.product_name, 'th') ||
      a.color.localeCompare(b.color, 'th') ||
      a.sort_order - b.sort_order,
  );
  const aoa = [
    [...COLUMNS, 'SKU'],
    ...rows.map((s) => [
      s.product_name,
      s.category_name,
      s.brand ?? '',
      Number(s.price),
      costs.get(s.product_id) ?? '',
      s.color,
      s.size_eu ? '' : s.size_label,
      s.size_eu ?? '',
      s.size_us ?? '',
      s.size_uk ?? '',
      s.size_cm ?? '',
      s.barcode ?? '',
      s.stock_qty,
      s.sku,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [...COL_WIDTHS, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'สินค้า');
  const d = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
  XLSX.writeFile(wb, `สินค้าทั้งหมด-มีศิลป์-${d}.xlsx`);
}

export async function readWorkbook(file: File): Promise<unknown[][]> {
  const XLSX: XLSXModule = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const name = wb.SheetNames.find((n) => n.trim() === 'สินค้า') ?? wb.SheetNames[0];
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
}
