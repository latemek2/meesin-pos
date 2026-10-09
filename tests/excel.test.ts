// ทดสอบอ่านและตรวจไฟล์ Excel สินค้า · วิธีรัน: npm run test:excel
import * as XLSX from 'xlsx';
import * as fs from 'node:fs'; XLSX.set_fs(fs);
import * as os from 'node:os'; process.chdir(os.tmpdir());
import { normalizeSheet, checkRows, downloadTemplate, COLUMNS } from '../src/lib/excel';
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? pass++ : fail++; console.log(c ? '  ✓' : '  ✗', m); };
const cats: any[] = [
  { id: 1, name: 'รองเท้าผ้าใบ', size_type: 'shoe', sort_order: 1 }, { id: 4, name: 'รองเท้าเด็ก', size_type: 'kid_shoe', sort_order: 4 },
  { id: 5, name: 'ถุงเท้า', size_type: 'free', sort_order: 5 }, { id: 6, name: 'เสื้อผ้า', size_type: 'apparel', sort_order: 6 } ];
const stock: any[] = [{ variant_id: 1, product_id: 9, product_name: 'ผ้าใบ Classic Low', category_name: 'รองเท้าผ้าใบ', category_id: 1, color: 'ขาว', size_label: 'EU 40', barcode: '8850000000017', price: 1290 }];

await downloadTemplate(cats);
const tpl = XLSX.readFile('แบบฟอร์มนำเข้าสินค้า-มีศิลป์.xlsx');
ok(JSON.stringify(tpl.SheetNames) === '["สินค้า","ตัวอย่าง","วิธีกรอก"]', `แบบฟอร์มมี 3 ชีต ${tpl.SheetNames}`);
const exRows = normalizeSheet(XLSX.utils.sheet_to_json(tpl.Sheets['ตัวอย่าง'], { header: 1, raw: true, defval: '' }) as any);
const exCheck = checkRows(exRows.rows, cats, stock, {}, true);
ok(exCheck.summary.skip === 1 && exCheck.summary.error === 0 && exCheck.summary.ok === 6, `ชีตตัวอย่างผ่านการตรวจ ok=${exCheck.summary.ok} skip=${exCheck.summary.skip} err=${exCheck.summary.error}`);

// ไฟล์แบบที่คนกรอกจริง: หัวตารางอยู่แถว 2, บาร์โค้ดเป็นตัวเลข, มีปัญหาหลายแบบ
const aoa = [
  ['สินค้าร้านมีศิลป์ ตุลาคม'],
  ['ชื่อ', 'หมวดหมู่', 'ยี่ห้อ', 'ราคา', 'ทุน', 'สี', 'ไซส์', 'EU', 'US', 'UK', 'ซม.', 'บาร์โค้ด', 'จำนวน'],
  ['รองเท้าวิ่ง Swift', 'รองเท้าผ้าใบ', '', 1890, 1100, 'เทา', '', 41, '', '', '', 8851234567890, 2],
  ['รองเท้าวิ่ง Swift', 'รองเท้าผ้าใบ', '', 1890, 1100, 'เทา', 'EU 42', '', '', '', '', '', 1],
  ['รองเท้าวิ่ง Swift', 'รองเท้าผ้าใบ', '', 1890, 1100, 'เทา', '', 41, '', '', '', '', 1],
  ['ผ้าใบเด็ก', 'รองเท้าเด็ก', '', 590, 300, 'ชมพู', '', 28, '', '', '', '8.85123E+12', 1],
  ['เสื้อยืด', 'เสื้อผ้า', '', 290, 120, 'ขาว', '', '', '', '', '', '', 3],
  ['เสื้อยืด', 'เสื้อผ้า', '', 290, 120, 'ขาว', 'm', '', '', '', '', '', 2.5],
  ['กระเป๋าผ้า', 'กระเป๋า', '', 250, 90, '', '', '', '', '', '', 8850000000017, 4],
  ['ถุงเท้า', 'ถุงเท้า', '', '', 80, 'ดำ', '', '', '', '', '', '', 5],
  ['', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['ผ้าใบ Classic Low', 'รองเท้าผ้าใบ', '', 1390, 700, 'ขาว', '', 40, '', '', '', '', 9],
  ['ผ้าใบ Classic Low', 'รองเท้าผ้าใบ', '', 1390, 700, 'ดำ', '', 40, '', '', '', '', 9],
];
const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
XLSX.writeFile(wb, 'meesin-sample-import.xlsx');
const read = XLSX.read(buf, { type: 'array' });
const norm = normalizeSheet(XLSX.utils.sheet_to_json(read.Sheets[read.SheetNames[0]], { header: 1, raw: true, defval: '' }) as any);
ok(norm.missing.length === 0 && norm.rows.length === 10, `หาหัวตารางเจอแม้อยู่แถว 2 และชื่อหัวต่างกันเล็กน้อย (${norm.rows.length} แถว ข้ามแถวว่าง)`);
const r = checkRows(norm.rows, cats, stock, {}, false);
const by = (row: number) => r.lines.find((l) => l.row === row)!;
ok(by(3).status === 'ok' && by(3).barcode === '8851234567890' && by(3).size === 'EU 41', 'บาร์โค้ดตัวเลข 13 หลักอ่านถูก ไซซ์ EU 41');
ok(by(4).status === 'ok' && by(4).size === 'EU 42', 'ไซซ์เขียนว่า "EU 42" ในช่องไซซ์ก็อ่านได้');
ok(by(5).status === 'error' && by(5).notes[0].includes('ซ้ำกับแถวก่อนหน้า'), 'สีไซซ์ซ้ำในไฟล์ถูกจับ');
ok(by(6).status === 'error' && by(6).notes.join().includes('เลขยกกำลัง'), 'บาร์โค้ดแบบ 8.85E+12 ถูกจับ');
ok(by(7).status === 'error' && by(7).notes.join().includes('ต้องใส่ไซซ์'), 'เสื้อผ้าไม่ใส่ไซซ์ถูกจับ');
ok(by(8).status === 'error' && by(8).notes.join().includes('จำนวนเต็ม'), 'จำนวน 2.5 ถูกจับ');
ok(by(9).status === 'error' && by(9).notes.join().includes('ยังไม่มีหมวด'), 'หมวดที่ไม่มีถูกจับเมื่อไม่ให้สร้างอัตโนมัติ');
ok(by(10).status === 'error' && by(10).notes.join().includes('ราคาขาย'), 'สินค้าใหม่ไม่ใส่ราคาถูกจับ');
ok(by(12).status === 'skip', 'สีไซซ์ที่มีในระบบแล้วถูกข้าม');
ok(by(13).status === 'ok' && by(13).notes.join().includes('ใช้ราคาเดิม'), 'เพิ่มสีใหม่ให้รุ่นเดิม และเตือนราคาไม่ตรง');
const kid = checkRows([{ __row: 2, 'ชื่อสินค้า': 'ผ้าใบเด็ก', 'หมวด': 'รองเท้าเด็ก', 'ราคาขาย': '590', 'สี': 'ฟ้า', 'EU': '28' }], cats, stock, {}, false);
const kv = kid.payload.products[0].variants[0];
ok(kv.size_us === '11C' && kv.size_uk === '10' && kv.size_cm === '17.5', `รองเท้าเด็กเติม US/UK/ซม. ให้อัตโนมัติ (${kv.size_us}/${kv.size_uk}/${kv.size_cm})`);
const r2 = checkRows(norm.rows, cats, stock, {}, true);
ok(r2.lines.find((l) => l.row === 9)!.status === 'error' && r2.lines.find((l) => l.row === 9)!.notes.join().includes('บาร์โค้ดซ้ำ'),
   'สร้างหมวดอัตโนมัติแล้ว แถวกระเป๋ายังติดเพราะบาร์โค้ดซ้ำกับของเดิม');
ok(r2.lines.find((l) => l.row === 9)!.color === 'สีเดียว', 'ไม่ใส่สี = สีเดียว');
ok(r.payload.products.length === 2 && r.summary.ok === 3, `ส่งเข้าระบบเฉพาะแถวที่ถูก ${r.summary.ok} รายการ ${r.payload.products.length} รุ่น`);
console.log(`ผ่าน ${pass} / ${pass + fail}`); process.exit(fail ? 1 : 0);
