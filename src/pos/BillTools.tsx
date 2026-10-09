import { useEffect, useState, type FormEvent } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { ErrorBox, Loading, Modal, useToast } from '../components/ui';
import { baht2, dateTimeTH } from '../lib/format';
import type { Settings, StockRow } from '../lib/types';
import type { BillDiscount, CartLine, Member } from './cart';
import type { Cart } from './useCart';
import { fetchBill, KIND_LABEL, PAY_LABEL, type BillData } from './bill';
import { usePrint } from './print';
import { Receipt } from './Receipt';
import type { AskOwner } from './SellView';

/* ---------- ช่องค้นบิล (พิมพ์เลขบิล หรือยิงบาร์โค้ดท้ายใบเสร็จ) ---------- */
export function BillLookup({ onFound, autoFocus = true }: { onFound: (b: BillData) => void; autoFocus?: boolean }) {
  const [no, setNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!no.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const b = await fetchBill(no);
      if (!b) setErr(`ไม่พบบิลเลขที่ ${no.trim()}`);
      else onFound(b);
    } catch (ex) {
      setErr(errorText(ex));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="stack" style={{ gap: 8 }} onSubmit={submit}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input
          id="bill-no"
          className="input num grow"
          style={{ fontSize: '1.2rem', minHeight: 48 }}
          placeholder="เลขบิล เช่น 2610-0001 หรือยิงบาร์โค้ดท้ายใบเสร็จ"
          autoFocus={autoFocus}
          value={no}
          onChange={(e) => setNo(e.target.value)}
        />
        <button className="btn primary lg" disabled={busy}>
          {busy ? 'กำลังค้น…' : 'ค้นบิล'}
        </button>
      </div>
      <ErrorBox error={err} />
    </form>
  );
}

export function BillSummary({ bill }: { bill: BillData }) {
  const s = bill.sale;
  return (
    <div className="card stack" style={{ gap: 6, background: 'var(--bg)' }}>
      <div className="row between">
        <strong>
          บิล {s.bill_no} · {KIND_LABEL[s.kind]}
        </strong>
        {s.status === 'void' ? <span className="badge danger">ยกเลิกแล้ว</span> : <span className="badge ok">ชำระแล้ว</span>}
      </div>
      <div className="muted small">
        {dateTimeTH(s.created_at)} · {s.pay_method ? PAY_LABEL[s.pay_method] : '—'}
        {bill.member && ` · สมาชิก ${bill.member.nickname}`}
        {bill.ref_bill_no && ` · อ้างอิงบิล ${bill.ref_bill_no}`}
      </div>
      <div className="stack" style={{ gap: 2 }}>
        {bill.items.map((i) => (
          <div key={i.id} className="row between small">
            <span>
              {i.qty < 0 && <span className="badge warn">คืน</span>} {i.product_name} · {i.color} · {i.size_label} × {Math.abs(i.qty)}
            </span>
            <span className="num">{baht2(i.line_total)}</span>
          </div>
        ))}
      </div>
      <div className="row between">
        <span>{s.total < 0 ? 'คืนเงินลูกค้า' : 'ยอดสุทธิ'}</span>
        <strong className="num">฿{baht2(Math.abs(s.total))}</strong>
      </div>
      {s.status === 'void' && s.void_reason && <div className="small muted">เหตุผลที่ยกเลิก: {s.void_reason}</div>}
    </div>
  );
}

/* ---------- พิมพ์ใบเสร็จซ้ำ ---------- */
export function ReprintModal({ settings, onClose }: { settings: Settings; onClose: () => void }) {
  const print = usePrint();
  const [bill, setBill] = useState<BillData | null>(null);
  return (
    <Modal title="พิมพ์ใบเสร็จซ้ำ" onClose={onClose}>
      <BillLookup onFound={setBill} />
      {bill && (
        <>
          <BillSummary bill={bill} />
          <div className="actions">
            <button type="button" className="btn primary lg" onClick={() => print(<Receipt bill={bill} settings={settings} copy />)}>
              พิมพ์สำเนา
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ---------- ยกเลิกบิล ---------- */
const VOID_REASONS = ['ลูกค้าเปลี่ยนใจ', 'คีย์ผิด', 'รับเงินผิดวิธี', 'ทดสอบระบบ'];

export function VoidModal({ askOwner, onDone, onClose }: { askOwner: AskOwner; onDone: () => void; onClose: () => void }) {
  const toast = useToast();
  const [bill, setBill] = useState<BillData | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!bill) return;
    if (!reason.trim()) return setErr('กรุณาเลือกหรือพิมพ์เหตุผล');
    const pin = await askOwner('อนุมัติยกเลิกบิล', `ยกเลิกบิล ${bill.sale.bill_no} ยอด ฿${baht2(bill.sale.total)}`);
    if (!pin) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc('void_sale', { p_bill_no: bill.sale.bill_no, p_reason: reason.trim(), p_owner_pin: pin });
    setBusy(false);
    if (error) return setErr(errorText(error));
    const s = bill.sale;
    toast(
      s.pay_method === 'cash' && s.total > 0
        ? `ยกเลิกบิล ${s.bill_no} แล้ว คืนเงินสด ฿${baht2(s.total)} จากลิ้นชัก`
        : `ยกเลิกบิล ${s.bill_no} แล้ว สต็อกกลับเข้าระบบ`,
    );
    onDone();
  }

  const s = bill?.sale;
  return (
    <Modal title="ยกเลิกบิล" onClose={onClose}>
      <BillLookup onFound={(b) => (setBill(b), setErr(null))} />
      {bill && s && (
        <>
          <BillSummary bill={bill} />
          {s.status === 'paid' ? (
            <>
              <div className="stack" style={{ gap: 8 }}>
                <strong>เหตุผล</strong>
                <div className="row">
                  {VOID_REASONS.map((r) => (
                    <button key={r} type="button" className={`btn ${reason === r ? 'primary' : ''}`} onClick={() => setReason(r)}>
                      {r}
                    </button>
                  ))}
                </div>
                <input
                  id="void-reason"
                  className="input"
                  placeholder="หรือพิมพ์เหตุผลอื่น"
                  value={VOID_REASONS.includes(reason) ? '' : reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              {s.pay_method && s.pay_method !== 'cash' && s.total > 0 && (
                <div className="notice">บิลนี้ชำระด้วย{PAY_LABEL[s.pay_method]} ต้องคืนเงินให้ลูกค้าด้วยวิธีเดียวกันเอง</div>
              )}
              <ErrorBox error={err} />
              <div className="actions">
                <button type="button" className="btn lg" onClick={onClose}>
                  ปิด
                </button>
                <button type="button" className="btn danger lg" disabled={busy} onClick={submit}>
                  {busy ? 'กำลังยกเลิก…' : 'ยกเลิกบิลนี้'}
                </button>
              </div>
            </>
          ) : (
            <div className="notice">บิลนี้ถูกยกเลิกไปแล้ว</div>
          )}
        </>
      )}
    </Modal>
  );
}

/* ---------- บิลที่พักไว้ ---------- */
interface HeldRow {
  id: number;
  name: string;
  created_at: string;
  cart: {
    lines: { variant_id: number; qty: number; discount: number }[];
    member: Member | null;
    billDiscount: BillDiscount | null;
    pointsUsed: number;
  };
}

export function HeldBillsModal({
  stock,
  cart,
  onChanged,
  onClose,
}: {
  stock: StockRow[];
  cart: Cart;
  onChanged: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<HeldRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.from('held_bills').select('*').order('created_at');
    if (error) setErr(errorText(error));
    else setRows(data as HeldRow[]);
  }
  useEffect(() => {
    load();
  }, []);

  async function remove(id: number) {
    const { error } = await supabase.from('held_bills').delete().eq('id', id);
    if (error) return setErr(errorText(error));
    onChanged();
    await load();
  }

  async function recall(h: HeldRow) {
    const map = new Map(stock.map((s) => [s.variant_id, s]));
    const lines: CartLine[] = [];
    let missing = 0;
    for (const l of h.cart.lines) {
      const row = map.get(l.variant_id);
      if (row) lines.push({ row, qty: l.qty, discount: l.discount });
      else missing++;
    }
    cart.clear();
    cart.setLines(lines);
    cart.setMember(h.cart.member);
    cart.setBillDiscount(h.cart.billDiscount);
    cart.setPointsUsed(h.cart.pointsUsed ?? 0);
    await remove(h.id);
    toast(missing ? `เรียกบิล "${h.name}" แล้ว มี ${missing} รายการที่ปิดขายไปแล้ว` : `เรียกบิล "${h.name}" กลับมาแล้ว`);
    onClose();
  }

  const busyCart = cart.lines.length > 0;
  return (
    <Modal title="บิลที่พักไว้" onClose={onClose}>
      {busyCart && <div className="notice">บิลปัจจุบันยังมีสินค้า ชำระเงินหรือพักบิลนี้ก่อน แล้วค่อยเรียกบิลอื่น</div>}
      <ErrorBox error={err} />
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="empty">ไม่มีบิลที่พักไว้</div>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {rows.map((h) => (
            <div key={h.id} className="card row between" style={{ padding: 12 }}>
              <div>
                <strong>{h.name}</strong>
                <div className="muted small">
                  {dateTimeTH(h.created_at)} · {h.cart.lines.reduce((a, l) => a + l.qty, 0)} ชิ้น
                  {h.cart.member && ` · ${h.cart.member.nickname}`}
                </div>
              </div>
              <div className="row">
                <button type="button" className="btn ghost sm" onClick={() => remove(h.id)}>
                  ทิ้ง
                </button>
                <button type="button" className="btn primary" disabled={busyCart} onClick={() => recall(h)}>
                  เรียกกลับมา
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
