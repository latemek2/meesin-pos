// ทดสอบการดึงข้อมูลทีละหน้า เลียนแบบ Supabase ที่ส่งได้ครั้งละไม่เกิน 1,000 แถว
import { fetchAll } from '../src/lib/data';

let pass = 0;
let fail = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
}
function eq(a: unknown, b: unknown, msg = '') {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} ได้ ${JSON.stringify(a)} ต้องเป็น ${JSON.stringify(b)}`);
}

/** แหล่งข้อมูลจำลอง: ตัดที่ 1,000 แถวเสมอ เหมือนค่าเริ่มต้นของ Supabase */
function fakeTable(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
  const calls: [number, number][] = [];
  const query = (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to + 1, from + 1000);
    return Promise.resolve({ data: rows.slice(from, end), error: null });
  };
  return { query, calls };
}

console.log('ดึงข้อมูลทีละหน้า');

await test('สินค้า 2,123 รายการ ได้ครบ ไม่ซ้ำ ใช้ 3 ครั้ง', async () => {
  const t = fakeTable(2123);
  const got = await fetchAll<{ id: number }>(t.query);
  eq(got.length, 2123, 'จำนวน');
  eq(new Set(got.map((r) => r.id)).size, 2123, 'ไม่ซ้ำ');
  eq(t.calls, [[0, 999], [1000, 1999], [2000, 2999]], 'ช่วงที่ขอ');
});

await test('พอดี 2,000 รายการ ขอหน้าถัดไปที่ว่างแล้วหยุด', async () => {
  const t = fakeTable(2000);
  const got = await fetchAll(t.query);
  eq(got.length, 2000);
  eq(t.calls.length, 3);
});

await test('น้อยกว่า 1,000 ใช้ครั้งเดียว', async () => {
  const t = fakeTable(300);
  eq((await fetchAll(t.query)).length, 300);
  eq(t.calls.length, 1);
});

await test('ไม่มีข้อมูล ได้รายการว่าง', async () => {
  eq(await fetchAll(fakeTable(0).query), []);
});

await test('ถ้าหน้าใดผิดพลาด แจ้ง error ไม่คืนข้อมูลครึ่ง ๆ', async () => {
  const t = fakeTable(2500);
  const q = (a: number, b: number) =>
    a >= 1000 ? Promise.resolve({ data: null, error: { message: 'network' } }) : t.query(a, b);
  let threw = false;
  try {
    await fetchAll(q);
  } catch {
    threw = true;
  }
  eq(threw, true);
});

console.log(`ผ่าน ${pass} / ${pass + fail}`);
if (fail) process.exit(1);
