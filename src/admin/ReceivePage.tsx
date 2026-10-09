import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { getCosts, getStock, getSuppliers, must, useLoad } from '../lib/data';
import { baht, dateTH, num, todayISO } from '../lib/format';
import { sizeDetail } from '../lib/sizes';
import { ErrorBox, Loading, useToast } from '../components/ui';
import ProductPicker from '../components/ProductPicker';
import type { StockRow } from '../lib/types';

interface Line {
  row: StockRow;
  qty: string;
  cost: string;
}

interface ReceiptRow {
  id: number;
  invoice_no: string | null;
  received_on: string;
  total_cost: number;
  supplier: { name: string } | null;
  goods_receipt_items: { qty: number }[];
}

export default function ReceivePage() {
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(async () => {
    const [stock, suppliers, costs, history] = await Promise.all([
      getStock(),
      getSuppliers(),
      getCosts(),
      must<ReceiptRow[]>(
        supabase
          .from('goods_receipts')
          .select('id, invoice_no, received_on, total_cost, supplier:suppliers(name), goods_receipt_items(qty)')
          .order('id', { ascending: false })
          .limit(20),
      ),
    ]);
    return { stock, suppliers: suppliers.filter((s) => s.active), costs: new Map(costs.map((c) => [c.product_id, Number(c.cost)])), history };
  });

  const [supplierId, setSupplierId] = useState('');
  const [invoice, setInvoice] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [updateCost, setUpdateCost] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;

  function add(row: StockRow) {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.row.variant_id === row.variant_id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: String(num(l.qty) + 1) } : l));
      return [...ls, { row, qty: '1', cost: String(data!.costs.get(row.product_id) ?? '') }];
    });
  }
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((a, l) => a + num(l.qty) * num(l.cost), 0);
  const pcs = lines.reduce((a, l) => a + num(l.qty), 0);

  async function submit() {
    setErr(null);
    if (!lines.length) return setErr('ยังไม่มีรายการรับของ');
    if (lines.some((l) => num(l.qty) <= 0)) return setErr('จำนวนต้องมากกว่า 0 ทุกรายการ');
    setBusy(true);
    const { error } = await supabase.rpc('receive_goods', {
      p: {
        supplier_id: supplierId || null,
        invoice_no: invoice.trim() || null,
        received_on: date,
        note: note.trim() || null,
        update_cost: updateCost,
        items: lines.map((l) => ({
          variant_id: l.row.variant_id,
          qty: Math.round(num(l.qty)),
          unit_cost: l.cost === '' ? null : num(l.cost),
        })),
      },
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    toast(`รับของเข้า ${pcs} ชิ้นแล้ว`);
    const printItems = lines.map((l) => ({ variant_id: l.row.variant_id, qty: Math.round(num(l.qty)) }));
    setLines([]);
    setInvoice('');
    setNote('');
    await reload();
    if (lines.some((l) => !l.row.barcode)) {
      nav('/admin/labels', { state: { items: printItems.filter((p) => !lines.find((l) => l.row.variant_id === p.variant_id)?.row.barcode) } });
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>รับของเข้า</h1>
          <p>ยิงบาร์โค้ดหรือค้นชื่อสินค้า ใส่จำนวนและต้นทุน แล้วกดบันทึก สต็อกจะเพิ่มทันที</p>
        </div>
      </div>

      {data.stock.length === 0 && (
        <div className="notice">
          ยังไม่มีสินค้าในระบบ <Link to="/admin/products/new">เพิ่มสินค้า</Link> ก่อน แล้วค่อยกลับมารับของเข้า
        </div>
      )}

      <div className="card stack">
        <div className="form-grid">
          <label className="field">
            <span>ซัพพลายเออร์</span>
            <select id="r-supplier" className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— ไม่ระบุ —</option>
              {data.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>เลขที่บิลของซัพพลายเออร์</span>
            <input id="r-invoice" className="input" value={invoice} onChange={(e) => setInvoice(e.target.value)} />
          </label>
          <label className="field">
            <span>วันที่รับของ</span>
            <input id="r-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>หมายเหตุ</span>
            <input id="r-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        {data.suppliers.length === 0 && (
          <p className="muted small" style={{ margin: 0 }}>
            ยังไม่มีซัพพลายเออร์ <Link to="/admin/suppliers">เพิ่มได้ที่นี่</Link>
          </p>
        )}

        <ProductPicker stock={data.stock} onPick={add} />

        {lines.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th>สี / ไซซ์</th>
                  <th className="c">จำนวน</th>
                  <th className="r">ต้นทุน/ชิ้น</th>
                  <th className="r">รวม</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.row.variant_id}>
                    <td>
                      <strong>{l.row.product_name}</strong>
                      {!l.row.barcode && <span className="badge warn" style={{ marginLeft: 6 }}>ไม่มีบาร์โค้ด</span>}
                    </td>
                    <td>
                      {l.row.color} · {sizeDetail(l.row)}
                    </td>
                    <td className="c">
                      <input
                        className="input cell num"
                        style={{ width: 70, textAlign: 'center' }}
                        inputMode="numeric"
                        value={l.qty}
                        aria-label="จำนวน"
                        onChange={(e) => setLine(i, { qty: e.target.value.replace(/[^0-9]/g, '') })}
                      />
                    </td>
                    <td className="r">
                      <input
                        className="input cell num"
                        style={{ width: 90, textAlign: 'right' }}
                        inputMode="decimal"
                        value={l.cost}
                        aria-label="ต้นทุนต่อชิ้น"
                        onChange={(e) => setLine(i, { cost: e.target.value.replace(/[^0-9.]/g, '') })}
                      />
                    </td>
                    <td className="r num">{baht(num(l.qty) * num(l.cost))}</td>
                    <td className="r">
                      <button className="btn sm ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="ลบรายการ">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="row between">
          <label className="check small">
            <input type="checkbox" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} />
            อัปเดตต้นทุนสินค้าเป็นราคาในใบนี้
          </label>
          <div className="row">
            <span className="num">
              {pcs} ชิ้น · ต้นทุนรวม <strong>฿{baht(total)}</strong>
            </span>
            <button className="btn primary lg" disabled={busy || !lines.length} onClick={submit}>
              {busy ? 'กำลังบันทึก…' : 'บันทึกรับของเข้า'}
            </button>
          </div>
        </div>
        {lines.some((l) => !l.row.barcode) && (
          <p className="muted small" style={{ margin: 0 }}>
            หลังบันทึก ระบบจะพาไปหน้าพิมพ์สติกเกอร์ให้สินค้าที่ยังไม่มีบาร์โค้ดโรงงาน
          </p>
        )}
        <ErrorBox error={err} />
      </div>

      <div className="card">
        <h2>ประวัติรับของล่าสุด</h2>
        {data.history.length === 0 ? (
          <div className="empty">ยังไม่มีประวัติ</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>ซัพพลายเออร์</th>
                  <th>เลขที่บิล</th>
                  <th className="r">จำนวน</th>
                  <th className="r">ต้นทุนรวม</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id}>
                    <td>{dateTH(h.received_on)}</td>
                    <td>{h.supplier?.name ?? '—'}</td>
                    <td>{h.invoice_no ?? '—'}</td>
                    <td className="r num">{h.goods_receipt_items.reduce((a, x) => a + x.qty, 0)} ชิ้น</td>
                    <td className="r num">฿{baht(h.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
