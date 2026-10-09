import { useCallback, useMemo, useRef, useState } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { ErrorBox, useToast } from '../components/ui';
import { baht, baht2, dateTimeTH } from '../lib/format';
import type { Settings, StockRow } from '../lib/types';
import { groupStock, r2, type CartLine, type ProductGroup } from './cart';
import { BillLookup } from './BillTools';
import { fetchBill, KIND_LABEL, type BillData } from './bill';
import { VariantPickerModal } from './VariantMatrix';
import { PaymentModal, type PayInput } from './PaymentModal';
import { DoneModal, getAutoPrint } from './DoneModal';
import { Receipt } from './Receipt';
import { usePrint } from './print';
import { findCode, useScanner, type AskOwner } from './SellView';

interface ReturnPick {
  qty: number;
  back: boolean;
}

/** เปลี่ยนหรือคืนสินค้า: เลือกชิ้นที่ลูกค้านำมาคืนจากบิลเดิม แล้วเพิ่มชิ้นใหม่ ระบบคิดส่วนต่างให้ */
export default function ExchangeView({
  settings,
  stock,
  askOwner,
  onDone,
  onExit,
}: {
  settings: Settings;
  stock: StockRow[];
  askOwner: AskOwner;
  onDone: () => void;
  onExit: () => void;
}) {
  const toast = useToast();
  const print = usePrint();
  const groups = useMemo(() => groupStock(stock), [stock]);
  const [bill, setBill] = useState<BillData | null>(null);
  const [picks, setPicks] = useState<Record<number, ReturnPick>>({});
  const [lines, setLines] = useState<CartLine[]>([]);
  const [q, setQ] = useState('');
  const [picker, setPicker] = useState<ProductGroup | null>(null);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState<BillData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pinRef = useRef<string | null>(null);

  const sold = bill ? bill.items.filter((i) => i.qty > 0) : [];
  const returnValue = r2(
    sold.reduce((a, i) => a + r2(i.line_total / i.qty) * (picks[i.id]?.qty ?? 0), 0),
  );
  const newValue = r2(lines.reduce((a, l) => a + Number(l.row.price) * l.qty, 0));
  const diff = r2(newValue - returnValue);
  const returning = Object.values(picks).reduce((a, p) => a + p.qty, 0);

  const add = useCallback((row: StockRow) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.row.variant_id === row.variant_id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { row, qty: 1, discount: 0 }];
    });
  }, []);

  const onScan = useCallback(
    (code: string) => {
      const row = findCode(stock, code);
      if (row) add(row);
      else toast(`ไม่พบสินค้ารหัส ${code}`, 'danger');
    },
    [stock, add, toast],
  );
  useScanner(onScan, !!bill && !done);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return groups.filter((g) => g.name.toLowerCase().includes(s) || (g.brand ?? '').toLowerCase().includes(s)).slice(0, 8);
  }, [groups, q]);

  function reset() {
    setBill(null);
    setPicks({});
    setLines([]);
    setQ('');
    setErr(null);
    pinRef.current = null;
  }

  async function confirm() {
    setErr(null);
    if (!bill) return;
    if (!returning) return setErr('เลือกสินค้าที่ลูกค้านำมาคืนก่อน');
    pinRef.current = null;
    if (diff < 0) {
      const pin = await askOwner('อนุมัติคืนเงิน', `ร้านต้องคืนเงินลูกค้า ฿${baht2(-diff)}`);
      if (!pin) return;
      pinRef.current = pin;
    }
    if (diff === 0) {
      setBusy(true);
      const e = await submit({ method: 'none', cash: null, ref: null });
      setBusy(false);
      if (e) setErr(e);
      return;
    }
    setPaying(true);
  }

  async function submit(p: PayInput): Promise<string | null> {
    if (!bill) return 'ไม่พบบิลเดิม';
    const items = [
      ...sold
        .filter((i) => (picks[i.id]?.qty ?? 0) > 0)
        .map((i) => ({ sale_item_id: i.id, qty: -picks[i.id].qty, return_to_stock: picks[i.id].back })),
      ...lines.map((l) => ({ variant_id: l.row.variant_id, qty: l.qty })),
    ];
    const { data, error } = await supabase.rpc('create_sale', {
      p: {
        kind: lines.length ? 'exchange' : 'refund',
        ref_sale_id: bill.sale.id,
        owner_pin: pinRef.current,
        pay_method: p.method,
        cash_received: p.cash,
        pay_ref: p.ref,
        items,
      },
    });
    if (error) return errorText(error);
    const billNo = (data as { bill_no: string }).bill_no;
    setPaying(false);
    onDone();
    const nb = await fetchBill(billNo).catch(() => null);
    if (nb) {
      if (getAutoPrint()) print(<Receipt bill={nb} settings={settings} />);
      setDone(nb);
    } else {
      toast(`บันทึกบิล ${billNo} แล้ว`);
      reset();
      onExit();
    }
    return null;
  }

  return (
    <div className="exchange">
      <section className="card stack">
        <div className="row between">
          <h2>1. บิลเดิมของลูกค้า</h2>
          {bill && (
            <button type="button" className="btn sm" onClick={reset}>
              ค้นบิลอื่น
            </button>
          )}
        </div>
        {!bill ? (
          <BillLookup
            onFound={(b) => {
              if (b.sale.status !== 'paid') return toast('บิลนี้ถูกยกเลิกไปแล้ว เปลี่ยนคืนไม่ได้', 'danger');
              if (!b.items.some((i) => i.qty > 0)) return toast('บิลนี้ไม่มีสินค้าที่ขายออก', 'danger');
              setBill(b);
            }}
          />
        ) : (
          <>
            <div className="muted">
              บิล <strong className="num">{bill.sale.bill_no}</strong> · {KIND_LABEL[bill.sale.kind]} · {dateTimeTH(bill.sale.created_at)}
              {bill.member && ` · สมาชิก ${bill.member.nickname}`}
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              เลือกจำนวนที่ลูกค้านำมาคืน ราคาคืนคิดตามที่ลูกค้าจ่ายจริงหลังหักส่วนลดรายการ
            </p>
            <div className="stack" style={{ gap: 8 }}>
              {sold.map((i) => {
                const max = i.qty - i.returned_qty;
                const p = picks[i.id] ?? { qty: 0, back: true };
                const set = (patch: Partial<ReturnPick>) => setPicks((ps) => ({ ...ps, [i.id]: { ...p, ...patch } }));
                return (
                  <div key={i.id} className={`ret-item ${p.qty > 0 ? 'on' : ''}`}>
                    <div style={{ minWidth: 0 }}>
                      <strong>{i.product_name}</strong>
                      <div className="muted small">
                        {i.color} · {i.size_label} · ซื้อ {i.qty} · จ่ายชิ้นละ ฿{baht2(r2(i.line_total / i.qty))}
                        {i.returned_qty > 0 && ` · คืนไปแล้ว ${i.returned_qty}`}
                      </div>
                      {p.qty > 0 && (
                        <div className="seg" style={{ marginTop: 6 }}>
                          <button type="button" aria-pressed={p.back} onClick={() => set({ back: true })}>
                            สภาพดี กลับเข้าสต็อก
                          </button>
                          <button type="button" aria-pressed={!p.back} onClick={() => set({ back: false })}>
                            ชำรุด ไม่นับสต็อก
                          </button>
                        </div>
                      )}
                    </div>
                    {max > 0 ? (
                      <div className="qtybox">
                        <button type="button" aria-label="ลด" disabled={p.qty <= 0} onClick={() => set({ qty: p.qty - 1 })}>
                          −
                        </button>
                        <span className="num">{p.qty}</span>
                        <button type="button" aria-label="เพิ่ม" disabled={p.qty >= max} onClick={() => set({ qty: p.qty + 1 })}>
                          +
                        </button>
                      </div>
                    ) : (
                      <span className="badge">คืนครบแล้ว</span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="card stack">
        <h2>2. สินค้าใหม่ที่ลูกค้าเปลี่ยนไป</h2>
        <p className="small muted" style={{ margin: 0 }}>
          ถ้าคืนเงินอย่างเดียว ไม่ต้องเพิ่มสินค้า
        </p>
        {bill && (
          <div className="row">
            {[...new Map(sold.map((i) => [i.variant_id, i])).values()].map((i) => {
              const g = groups.find((x) => x.rows.some((r) => r.variant_id === i.variant_id));
              return g ? (
                <button key={i.id} type="button" className="btn" onClick={() => setPicker(g)}>
                  เปลี่ยนไซซ์หรือสี · {i.product_name}
                </button>
              ) : null;
            })}
          </div>
        )}
        <div style={{ position: 'relative' }}>
          <input
            id="ex-search"
            className="input pos-search"
            placeholder="ยิงบาร์โค้ด หรือพิมพ์ชื่อรุ่นอื่น"
            value={q}
            disabled={!bill}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const row = findCode(stock, q);
              if (row) {
                add(row);
                setQ('');
              } else if (matches.length === 1) setPicker(matches[0]);
            }}
          />
          {matches.length > 0 && (
            <div className="stack" style={{ gap: 4, marginTop: 6 }}>
              {matches.map((g) => (
                <button key={g.product_id} type="button" className="btn" style={{ justifyContent: 'space-between' }} onClick={() => setPicker(g)}>
                  <span>{g.name}</span>
                  <span className="num muted">฿{baht(g.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {lines.map((l) => (
          <div key={l.row.variant_id} className="ret-item on">
            <div style={{ minWidth: 0 }}>
              <strong>{l.row.product_name}</strong>
              <div className="muted small">
                {l.row.color} · {l.row.size_label} · ฿{baht(l.row.price)}
                {l.row.stock_qty - l.qty < 0 && <span className="badge danger" style={{ marginLeft: 6 }}>สต็อกไม่พอ</span>}
              </div>
            </div>
            <div className="qtybox">
              <button
                type="button"
                aria-label="ลด"
                onClick={() =>
                  setLines((ls) =>
                    l.qty <= 1 ? ls.filter((x) => x !== l) : ls.map((x) => (x === l ? { ...x, qty: x.qty - 1 } : x)),
                  )
                }
              >
                −
              </button>
              <span className="num">{l.qty}</span>
              <button type="button" aria-label="เพิ่ม" onClick={() => setLines((ls) => ls.map((x) => (x === l ? { ...x, qty: x.qty + 1 } : x)))}>
                +
              </button>
            </div>
          </div>
        ))}

        <div className="cart-sum" style={{ padding: 0, border: 0 }}>
          <div className="r">
            <span>รับคืน {returning} ชิ้น</span>
            <span className="num">−{baht2(returnValue)}</span>
          </div>
          <div className="r">
            <span>สินค้าใหม่ {lines.reduce((a, l) => a + l.qty, 0)} ชิ้น</span>
            <span className="num">{baht2(newValue)}</span>
          </div>
          <div className="r grand">
            <span>{diff > 0 ? 'ลูกค้าจ่ายเพิ่ม' : diff < 0 ? 'ร้านคืนเงิน' : 'ไม่มีส่วนต่าง'}</span>
            <span className="num">฿{baht2(Math.abs(diff))}</span>
          </div>
        </div>
        <ErrorBox error={err} />
        <div className="actions">
          <button type="button" className="btn lg" onClick={() => (reset(), onExit())}>
            กลับหน้าขาย
          </button>
          <button type="button" className="btn primary lg grow" disabled={!bill || !returning || busy} onClick={confirm}>
            {diff > 0 ? `รับเงินส่วนต่าง ฿${baht2(diff)}` : diff < 0 ? `คืนเงิน ฿${baht2(-diff)}` : 'ยืนยันเปลี่ยนสินค้า'}
          </button>
        </div>
      </section>

      {picker && (
        <VariantPickerModal
          group={picker}
          low={settings.low_stock_level}
          inCart={new Map(lines.map((l) => [l.row.variant_id, l.qty]))}
          onClose={() => setPicker(null)}
          onPick={(row) => {
            add(row);
            setPicker(null);
            setQ('');
          }}
        />
      )}
      {paying && <PaymentModal total={diff} settings={settings} onClose={() => setPaying(false)} onConfirm={submit} />}
      {done && (
        <DoneModal
          bill={done}
          settings={settings}
          onClose={() => {
            setDone(null);
            reset();
            onExit();
          }}
        />
      )}
    </div>
  );
}
