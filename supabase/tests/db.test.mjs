// ทดสอบฐานข้อมูลบน Postgres จำลอง (ไม่แตะฐานข้อมูลจริง)
// วิธีรัน: npm i -D @electric-sql/pglite@0.4.6 แล้ว node supabase/tests/db.test.mjs supabase/001_setup.sql

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';

const sqlPath = process.argv[2];
const db = new PGlite({ extensions: { pgcrypto } });

const OWNER = '11111111-1111-1111-1111-111111111111';
const POS = '22222222-2222-2222-2222-222222222222';
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };
const as = async (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid ?? ''}',false); ${uid ? 'set role authenticated;' : ''}`);
const q = async (sql, params) => (await db.query(sql, params ?? [])).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const expectErr = async (sql, params, needle, msg) => {
  try { await db.query(sql, params ?? []); ok(false, msg + ' (ไม่มี error)'); }
  catch (e) { ok(!needle || e.message.includes(needle), `${msg} → "${e.message}"`); }
};
const sale = async (p) => (await one('select public.create_sale($1::jsonb) r', [JSON.stringify(p)])).r;
const stock = async (id) => (await one('select stock_qty from public.variants where id=$1', [id])).stock_qty;

// ---- Supabase stubs ----
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create table auth.users(id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
  create schema extensions; grant usage on schema extensions to authenticated, anon;
  grant usage on schema public to authenticated, anon;
`);
await db.exec(fs.readFileSync(sqlPath, 'utf8'));
console.log('SQL ติดตั้งสำเร็จ');
await db.exec(`
  insert into auth.users values ('${OWNER}','owner@x'),('${POS}','pos@x');
  insert into public.profiles(user_id, role) values ('${OWNER}','owner'),('${POS}','pos');
`);

console.log('\n[1] เจ้าของร้านเพิ่มสินค้าและสต็อก');
await as(OWNER);
const prod = await one(`insert into public.products(name, category_id, price) values ('ผ้าใบ Classic', 1, 1290) returning id`);
await q(`insert into public.product_costs(product_id, cost) values ($1, 700)`, [prod.id]);
const v40 = await one(`insert into public.variants(product_id,color,size_label,size_eu,size_us,size_uk,sku,barcode) values ($1,'ขาว','EU 40','40','7','6.5','SN-WH-40','8850000000017') returning id`, [prod.id]);
const v41 = await one(`insert into public.variants(product_id,color,size_label,size_eu,sku) values ($1,'ขาว','EU 41','41','SN-WH-41') returning id`, [prod.id]);
const cheap = await one(`insert into public.products(name, category_id, price) values ('ถุงเท้า', 5, 190) returning id`);
const vSock = await one(`insert into public.variants(product_id,color,size_label,sku) values ($1,'ดำ','ฟรีไซซ์','SK-BK-F') returning id`, [cheap.id]);
await q(`select public.adjust_stock($1, 2, 'สต็อกตั้งต้น', 'opening')`, [v40.id]);
const sup = await one(`insert into public.suppliers(name) values ('ร้านส่งรองเท้า A') returning id`);
await q(`select public.receive_goods($1::jsonb)`, [JSON.stringify({ supplier_id: sup.id, invoice_no: 'INV-1', items: [{ variant_id: vSock.id, qty: 10, unit_cost: 80 }] })]);
ok(await stock(v40.id) === 2, 'EU40 มีสต็อก 2');
ok(await stock(v41.id) === 0, 'EU41 สต็อก 0');
ok(await stock(vSock.id) === 10, 'รับถุงเท้าเข้า 10 คู่');
ok(Number((await one(`select cost from public.product_costs where product_id=$1`, [cheap.id])).cost) === 80, 'ต้นทุนถุงเท้าอัปเดตเป็น 80 จากใบรับของ');

console.log('\n[2] เครื่อง POS: สิทธิ์และการมองเห็น');
await as(POS);
ok((await one(`select public.verify_pos_pin('1234') r`)).r === true, 'PIN เข้า POS 1234 ถูก');
ok((await one(`select public.verify_pos_pin('9999') r`)).r === false, 'PIN ผิดถูกปฏิเสธ');
ok((await q(`select * from public.product_costs`)).length === 0, 'POS มองไม่เห็นต้นทุนสินค้า');
ok((await q(`select * from public.v_stock`)).length === 3, 'POS เห็นหน้าเช็กสต็อก 3 รายการ');
await expectErr(`select * from public.secrets`, null, '', 'POS อ่านตาราง PIN ไม่ได้');
await q(`update public.products set price = 1 where id=$1`, [prod.id]);
ok(Number((await one(`select price from public.products where id=$1`, [prod.id])).price) === 1290, 'POS แก้ราคาสินค้าไม่ได้');
await expectErr(`select public.receive_goods('{"items":[{"variant_id":1,"qty":1}]}'::jsonb)`, null, 'เฉพาะเจ้าของร้าน', 'POS รับของเข้าไม่ได้');
await expectErr(`insert into public.sales(bill_no) values ('x')`, null, '', 'POS เขียนบิลตรง ๆ ไม่ได้');
await expectErr(`select public.create_sale('{"items":[]}'::jsonb)`, null, 'ยังไม่ได้เปิดรอบขาย', 'ขายก่อนเปิดร้านไม่ได้');

console.log('\n[3] เปิดร้าน และขาย (รวมขายสต็อกติดลบ)');
await q(`select public.open_shift(1000)`);
const s1 = await sale({ items: [{ variant_id: v40.id, qty: 1 }, { variant_id: v41.id, qty: 1 }], pay_method: 'cash', cash_received: 3000 });
ok(Number(s1.total) === 2580 && Number(s1.change) === 420, `บิล ${s1.bill_no} ยอด 2,580 ทอน 420`);
ok(/^\d{4}-0001$/.test(s1.bill_no), 'เลขบิลรูปแบบ ปีเดือน-0001');
ok(await stock(v41.id) === -1, 'EU41 ขายได้แม้สต็อก 0 → ติดลบ -1');
await expectErr(`select public.create_sale($1::jsonb)`, [JSON.stringify({ items: [{ variant_id: vSock.id, qty: 1 }], pay_method: 'cash', cash_received: 100 })], 'รับเงินมาไม่พอ', 'รับเงินไม่พอถูกปฏิเสธ');

console.log('\n[4] ส่วนลดต้องใช้ PIN เจ้าของร้าน');
await expectErr(`select public.create_sale($1::jsonb)`, [JSON.stringify({ items: [{ variant_id: vSock.id, qty: 1, discount: 20 }], pay_method: 'promptpay' })], 'PIN อนุมัติไม่ถูกต้อง', 'ส่วนลดไม่มี PIN ถูกปฏิเสธ');
ok(await stock(vSock.id) === 10, 'บิลที่ล้มเหลวไม่ตัดสต็อก');
const s2 = await sale({ items: [{ variant_id: vSock.id, qty: 2, discount: 20 }], bill_discount: 10, owner_pin: '0000', pay_method: 'promptpay' });
ok(Number(s2.total) === 350, 'ถุงเท้า 2 คู่ 380 ลด 20 + 10 = 350');
ok(s2.bill_no.endsWith('-0002'), 'เลขบิลไม่กระโดดหลังบิลที่ล้มเหลว');

console.log('\n[5] สมาชิกสะสมและใช้แต้ม');
const m = await one(`select * from public.create_member('081-234-5678','น้องเอ')`);
await expectErr(`select public.create_member('0812345678','ซ้ำ')`, null, 'เป็นสมาชิกอยู่แล้ว', 'สมัครเบอร์ซ้ำไม่ได้');
const s3 = await sale({ member_id: m.id, items: [{ variant_id: v40.id, qty: 1 }], pay_method: 'card', pay_ref: 'APP123' });
ok(s3.points_earned === 12, 'ซื้อ 1,290 ได้ 12 แต้ม');
await as(OWNER); await q(`select public.adjust_points($1, 100, 'ทดสอบ')`, [m.id]); await as(POS);
const s4 = await sale({ member_id: m.id, points_used: 100, items: [{ variant_id: vSock.id, qty: 1 }], pay_method: 'cash', cash_received: 140 });
ok(Number(s4.total) === 140, 'ใช้ 100 แต้มลด 50 บาท ถุงเท้า 190 → 140');
ok((await one(`select points from public.members where id=$1`, [m.id])).points === 13, 'แต้มคงเหลือ 12 + 100 − 100 + 1 = 13');

console.log('\n[6] เปลี่ยนสินค้า และคืนเงิน');
const s1row = await one(`select id from public.sales where bill_no=$1`, [s1.bill_no]);
const item40 = await one(`select id from public.sale_items where sale_id=$1 and variant_id=$2`, [s1row.id, v40.id]);
const ex1 = await sale({ kind: 'exchange', ref_sale_id: s1row.id, items: [{ sale_item_id: item40.id, qty: -1 }, { variant_id: v41.id, qty: 1 }] });
ok(Number(ex1.total) === 0, 'เปลี่ยน EU40 เป็น EU41 ราคาเท่ากัน ไม่ต้องจ่ายเพิ่ม');
ok(await stock(v41.id) === -2 && await stock(v40.id) === 1, 'สต็อก EU40 กลับมา +1, EU41 ลดอีก 1');
await expectErr(`select public.create_sale($1::jsonb)`, [JSON.stringify({ kind: 'refund', ref_sale_id: s1row.id, items: [{ sale_item_id: item40.id, qty: -1 }], pay_method: 'cash', owner_pin: '0000' })], 'คืนเกินจำนวน', 'คืนชิ้นเดิมซ้ำไม่ได้');
const item41 = await one(`select id from public.sale_items where sale_id=$1 and variant_id=$2`, [s1row.id, v41.id]);
await expectErr(`select public.create_sale($1::jsonb)`, [JSON.stringify({ kind: 'exchange', ref_sale_id: s1row.id, items: [{ sale_item_id: item41.id, qty: -1 }, { variant_id: vSock.id, qty: 1 }], pay_method: 'cash' })], 'PIN อนุมัติไม่ถูกต้อง', 'เปลี่ยนเป็นของถูกกว่า ต้องคืนเงิน ต้องใช้ PIN');
const ex2 = await sale({ kind: 'exchange', ref_sale_id: s1row.id, owner_pin: '0000', items: [{ sale_item_id: item41.id, qty: -1, return_to_stock: false }, { variant_id: vSock.id, qty: 1 }], pay_method: 'cash' });
ok(Number(ex2.total) === -1100 && Number(ex2.change) === 1100, 'เปลี่ยน 1,290 เป็นถุงเท้า 190 ร้านคืนเงินสด 1,100');
ok(await stock(v41.id) === -2, 'ของชำรุดไม่กลับเข้าสต็อก');
const s3row = await one(`select id from public.sales where bill_no=$1`, [s3.bill_no]);
const item3 = await one(`select id from public.sale_items where sale_id=$1`, [s3row.id]);
const ex3 = await sale({ kind: 'exchange', ref_sale_id: s3row.id, items: [{ sale_item_id: item3.id, qty: -1 }, { variant_id: v41.id, qty: 1 }, { variant_id: vSock.id, qty: 1 }], pay_method: 'transfer' });
ok(Number(ex3.total) === 190, 'เปลี่ยนแล้วซื้อเพิ่ม ลูกค้าจ่ายส่วนต่าง 190');

console.log('\n[7] ยกเลิกบิล');
await expectErr(`select public.void_sale($1,'ทดสอบ','0000')`, [s1.bill_no], 'มีการเปลี่ยนหรือคืนสินค้าแล้ว', 'ยกเลิกบิลที่มีการเปลี่ยนสินค้าแล้วไม่ได้');
await expectErr(`select public.void_sale($1,'ทดสอบ','1234')`, [s2.bill_no], 'PIN อนุมัติไม่ถูกต้อง', 'ยกเลิกบิลด้วย PIN พนักงานไม่ได้');
const sockBefore = await stock(vSock.id);
await q(`select public.void_sale($1,'ลูกค้าเปลี่ยนใจ','0000')`, [s2.bill_no]);
ok(await stock(vSock.id) === sockBefore + 2, 'ยกเลิกบิลแล้วถุงเท้า 2 คู่กลับเข้าสต็อก');
ok((await one(`select status from public.sales where bill_no=$1`, [s2.bill_no])).status === 'void', 'บิลยังอยู่ สถานะยกเลิก');
const ptsBefore = (await one(`select points from public.members where id=$1`, [m.id])).points;
const s4row = await one(`select id from public.sales where bill_no=$1`, [s4.bill_no]);
await q(`select public.void_sale($1,'ทดสอบคืนแต้ม','0000')`, [s4.bill_no]);
ok((await one(`select points from public.members where id=$1`, [m.id])).points === ptsBefore + 100 - 1, 'ยกเลิกบิลที่ใช้แต้ม คืนแต้มที่ใช้ และหักแต้มที่ได้');

console.log('\n[8] ปิดยอด');
const sum = (await one(`select public.shift_summary() r`)).r;
// เงินสด: 1000 + 2580 (s1) + 0 (ex1 none) - 1100 (ex2) ; s4 cash 140 ถูกยกเลิกในรอบเดียวกัน
ok(Number(sum.expected_cash) === 2480, `เงินที่ควรมีในลิ้นชัก 2,480 (ได้ ${sum.expected_cash})`);
const closed = (await one(`select public.close_shift(2470, '{"1000":2,"100":4,"50":1,"20":1}'::jsonb, 'ขาด 10 บาท') r`)).r;
ok(Number(closed.difference) === -10, 'นับได้ 2,470 ขาด 10 บาท');
await expectErr(`select public.create_sale($1::jsonb)`, [JSON.stringify({ items: [{ variant_id: vSock.id, qty: 1 }], pay_method: 'cash', cash_received: 200 })], 'ยังไม่ได้เปิดรอบขาย', 'ปิดยอดแล้วขายต่อไม่ได้');

console.log('\n[9] เจ้าของร้านนับสต็อก');
await as(OWNER);
const cnt = (await one(`select public.start_stock_count('นับต้นเดือน') id`)).id;
await q(`update public.stock_count_items set counted_qty = 0 where count_id=$1 and variant_id=$2`, [cnt, v41.id]);
const n = (await one(`select public.confirm_stock_count($1) n`, [cnt])).n;
ok(n === 1 && await stock(v41.id) === 0, 'นับ EU41 ได้ 0 ระบบปรับจาก -3 เป็น 0');
const movements = (await one(`select count(*)::int c from public.stock_movements`)).c;
const check = await one(`select bool_and(v.stock_qty = coalesce(m.s,0)) ok from public.variants v left join (select variant_id, sum(qty_change) s from public.stock_movements group by variant_id) m on m.variant_id = v.id`);
ok(check.ok, `ยอดคงเหลือตรงกับประวัติการเคลื่อนไหวทั้ง ${movements} รายการ`);
await as(POS);
ok((await q(`select * from public.sale_item_costs`)).length === 0, 'POS มองไม่เห็นต้นทุนในบิล');
await as(OWNER);
ok((await q(`select * from public.sale_item_costs`)).length > 0, 'เจ้าของร้านเห็นต้นทุนในบิล');

console.log(`\nผ่าน ${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);
