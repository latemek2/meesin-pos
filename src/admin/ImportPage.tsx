import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { getCategories, getStock, must, useLoad } from '../lib/data';
import { ErrorBox, Loading, useToast } from '../components/ui';
import { baht } from '../lib/format';
import { SIZE_TYPE_LABEL, type SizeType } from '../lib/types';
import {
  checkRows,
  downloadTemplate,
  exportProducts,
  guessSizeType,
  normalizeSheet,
  readWorkbook,
  type RawRow,
} from '../lib/excel';

interface ImportResult {
  categories_created: number;
  products_created: number;
  products_existing: number;
  variants_created: number;
  variants_skipped: number;
  pieces: number;
}

const MAX_ROWS = 3000;

export default function ImportPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(async () => {
    const [categories, stock] = await Promise.all([getCategories(), getStock()]);
    return { categories, stock };
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<RawRow[] | null>(null);
  const [readErr, setReadErr] = useState<string | null>(null);
  const [createCats, setCreateCats] = useState(true);
  const [catTypes, setCatTypes] = useState<Record<string, SizeType>>({});
  const [filter, setFilter] = useState<'all' | 'problem'>('all');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);

  const checked = useMemo(
    () => (rows && data ? checkRows(rows, data.categories, data.stock, catTypes, createCats) : null),
    [rows, data, catTypes, createCats],
  );

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReadErr(null);
    setResult(null);
    setRows(null);
    setFileName(file.name);
    try {
      const aoa = await readWorkbook(file);
      const { rows, missing } = normalizeSheet(aoa);
      if (missing.length) return setReadErr(`ไม่พบคอลัมน์ ${missing.join(', ')} ในไฟล์ ใช้แบบฟอร์มของระบบ หรือแก้หัวคอลัมน์ให้ตรง`);
      if (!rows.length) return setReadErr('ไฟล์ไม่มีข้อมูลสินค้า');
      if (rows.length > MAX_ROWS) return setReadErr(`ไฟล์มี ${rows.length} แถว นำเข้าได้ครั้งละไม่เกิน ${MAX_ROWS} แถว แบ่งเป็นหลายไฟล์`);
      setRows(rows);
      setFilter(rows.length > 50 ? 'problem' : 'all');
    } catch (e) {
      setReadErr(`เปิดไฟล์ไม่ได้: ${errorText(e)} ใช้ไฟล์ .xlsx .xls หรือ .csv`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function runImport() {
    if (!checked) return;
    setBusy(true);
    const { data: res, error } = await supabase.rpc('import_products', { p: checked.payload });
    setBusy(false);
    if (error) {
      toast(errorText(error), 'danger');
      return;
    }
    setResult(res as ImportResult);
    setRows(null);
    setFileName(null);
    await reload();
  }

  async function onExport() {
    try {
      const costs = await must<{ product_id: number; cost: number }[]>(supabase.from('product_costs').select('product_id, cost'));
      await exportProducts(await getStock(), new Map(costs.map((c) => [c.product_id, Number(c.cost)])));
    } catch (e) {
      toast(errorText(e), 'danger');
    }
  }

  const shown = checked ? checked.lines.filter((l) => filter === 'all' || l.status !== 'ok' || l.notes.length) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>นำเข้า / ส่งออก Excel</h1>
          <p>ใส่สินค้าทีละหลายรุ่นจากไฟล์ Excel พร้อมจำนวนที่นับได้เป็นสต็อกตั้งต้น</p>
        </div>
      </div>

      <div className="card stack">
        <h2>1. ดาวน์โหลดแบบฟอร์ม แล้วกรอกใน Excel</h2>
        <p className="muted" style={{ margin: 0 }}>
          1 แถวคือสินค้า 1 สี 1 ไซซ์ ในไฟล์มีชีตตัวอย่างและวิธีกรอก
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => downloadTemplate(data.categories).catch((e) => toast(errorText(e), 'danger'))}>
            ดาวน์โหลดแบบฟอร์ม (.xlsx)
          </button>
          <button className="btn" onClick={onExport} disabled={!data.stock.length}>
            ส่งออกสินค้าทั้งหมดเป็น Excel
          </button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          ไฟล์ส่งออกใช้ดูสต็อก สำรองข้อมูล หรือเป็นใบนับสต็อกได้ ({data.stock.length} รายการ)
        </p>
      </div>

      <div className="card stack">
        <h2>2. อัปโหลดไฟล์ที่กรอกแล้ว</h2>
        <label
          className={`drop ${dragging ? 'on' : ''}`}
          onDragOver={(e) => (e.preventDefault(), setDragging(true))}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFile(e.dataTransfer.files[0]);
          }}
        >
          <input
            ref={fileRef}
            id="import-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <strong>{fileName ?? 'คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่'}</strong>
          <span className="muted small">.xlsx .xls หรือ .csv · ระบบจะตรวจทุกแถวก่อน ยังไม่บันทึกจนกว่าจะกดนำเข้า</span>
        </label>
        <ErrorBox error={readErr} />
      </div>

      {result && (
        <div className="notice ok stack" style={{ gap: 6 }}>
          <strong>นำเข้าเรียบร้อย</strong>
          <span>
            สินค้าใหม่ {result.products_created} รุ่น · เพิ่มสีไซซ์ให้รุ่นเดิม {result.products_existing} รุ่น · สร้าง{' '}
            {result.variants_created} รายการ · สต็อกตั้งต้น {baht(result.pieces)} ชิ้น
            {result.categories_created > 0 && ` · หมวดใหม่ ${result.categories_created} หมวด`}
            {result.variants_skipped > 0 && ` · ข้าม ${result.variants_skipped} รายการที่มีอยู่แล้ว`}
          </span>
          <div className="row">
            <Link className="btn sm" to="/admin/products">
              ดูสินค้า
            </Link>
            <Link className="btn sm" to="/admin/labels">
              พิมพ์สติกเกอร์บาร์โค้ด
            </Link>
          </div>
        </div>
      )}

      {checked && (
        <div className="card stack">
          <h2>3. ตรวจข้อมูลก่อนนำเข้า</h2>
          <div className="stats">
            <div className="stat">
              <div className="k">พร้อมนำเข้า</div>
              <div className="v">{checked.summary.ok} รายการ</div>
              <div className="muted small">
                สินค้าใหม่ {checked.summary.newProducts} รุ่น · {baht(checked.summary.pieces)} ชิ้น
              </div>
            </div>
            <div className="stat">
              <div className="k">มีอยู่แล้ว ข้าม</div>
              <div className="v">{checked.summary.skip} รายการ</div>
            </div>
            <div className={`stat ${checked.summary.error ? 'alert' : ''}`}>
              <div className="k">ต้องแก้ในไฟล์</div>
              <div className="v">{checked.summary.error} แถว</div>
            </div>
          </div>

          {checked.unknownCategories.length > 0 && (
            <div className="card stack" style={{ background: 'var(--bg)' }}>
              <label className="check">
                <input type="checkbox" checked={createCats} onChange={(e) => setCreateCats(e.target.checked)} />
                <span>
                  สร้างหมวดที่ยังไม่มีให้อัตโนมัติ: <strong>{checked.unknownCategories.join(', ')}</strong>
                </span>
              </label>
              {createCats && (
                <div className="form-grid">
                  {checked.unknownCategories.map((c) => (
                    <label key={c} className="field">
                      <span>ชนิดไซซ์ของหมวด {c}</span>
                      <select
                        className="input"
                        value={catTypes[c] ?? guessSizeType(c)}
                        onChange={(e) => setCatTypes((t) => ({ ...t, [c]: e.target.value as SizeType }))}
                      >
                        {(Object.keys(SIZE_TYPE_LABEL) as SizeType[]).map((t) => (
                          <option key={t} value={t}>
                            {SIZE_TYPE_LABEL[t]}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="row between">
            <div className="seg-admin">
              <button className={`btn sm ${filter === 'all' ? 'primary' : ''}`} onClick={() => setFilter('all')}>
                ทุกแถว ({checked.lines.length})
              </button>
              <button className={`btn sm ${filter === 'problem' ? 'primary' : ''}`} onClick={() => setFilter('problem')}>
                เฉพาะแถวที่มีหมายเหตุ ({checked.lines.filter((l) => l.status !== 'ok' || l.notes.length).length})
              </button>
            </div>
          </div>

          <div className="table-wrap" style={{ maxHeight: 480, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th className="r">แถว</th>
                  <th>สถานะ</th>
                  <th>สินค้า</th>
                  <th>หมวด</th>
                  <th>สี</th>
                  <th>ไซซ์</th>
                  <th>บาร์โค้ด</th>
                  <th className="r">จำนวน</th>
                  <th>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.row}>
                    <td className="r num muted">{l.row}</td>
                    <td>
                      {l.status === 'ok' ? (
                        <span className="badge ok">{l.existingProduct ? 'เพิ่มรุ่นเดิม' : 'ใหม่'}</span>
                      ) : l.status === 'skip' ? (
                        <span className="badge">ข้าม</span>
                      ) : (
                        <span className="badge danger">ต้องแก้</span>
                      )}
                    </td>
                    <td>{l.name || '—'}</td>
                    <td>{l.category || '—'}</td>
                    <td>{l.color}</td>
                    <td>{l.size || '—'}</td>
                    <td className="num small">{l.barcode || <span className="muted">สร้างให้</span>}</td>
                    <td className="r num">{l.qty}</td>
                    <td className={`small ${l.status === 'error' ? 'danger-text' : 'muted'}`} style={{ whiteSpace: 'normal', minWidth: 220 }}>
                      {l.notes.join(' · ')}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={9} className="empty">
                      ทุกแถวถูกต้อง
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {checked.summary.error > 0 && (
            <div className="notice">
              แก้แถวที่ขึ้นว่า "ต้องแก้" ในไฟล์ แล้วอัปโหลดใหม่ หรือกดนำเข้าเฉพาะแถวที่ถูกต้องก่อนก็ได้ (แถวที่ผิดจะไม่ถูกบันทึก)
            </div>
          )}
          <div className="row">
            <button className="btn primary lg" disabled={busy || checked.summary.ok === 0} onClick={runImport}>
              {busy ? 'กำลังนำเข้า…' : `นำเข้า ${checked.summary.ok} รายการ`}
            </button>
            <button className="btn lg" disabled={busy} onClick={() => (setRows(null), setFileName(null))}>
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </>
  );
}
