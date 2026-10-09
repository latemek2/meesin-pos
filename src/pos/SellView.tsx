import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { useToast } from '../components/ui';
import { baht, baht2, todayISO } from '../lib/format';
import type { Category, Settings, StockRow } from '../lib/types';
import { activePromos, billTotals, groupStock, priceLines, type ProductGroup, type Promo } from './cart';
import type { Cart } from './useCart';
import { VariantPickerModal } from './VariantMatrix';
import { BillDiscountModal, HoldModal, LineModal, MemberModal, PointsModal } from './CartModals';
import { PaymentModal, type PayInput } from './PaymentModal';
import { DoneModal, getAutoPrint } from './DoneModal';
import { Receipt } from './Receipt';
import { usePrint } from './print';
import { fetchBill, type BillData } from './bill';

export type AskOwner = (title: string, detail?: string) => Promise<string | null>;

export function findCode(stock: StockRow[], code: string) {
  const c = code.trim();
  if (!c) return null;
  return stock.find((r) => r.barcode === c) ?? stock.find((r) => r.sku.toLowerCase() === c.toLowerCase()) ?? null;
}

/** ใช้เครื่องสแกนบาร์โค้ดได้ตลอด แม้ไม่ได้คลิกที่ช่องค้นหา */
export function useScanner(onScan: (code: string) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let buf = '';
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (document.querySelector('.modal-back')) return;
      const now = Date.now();
      if (now - last > 80) buf = '';
      last = now;
      if (e.key === 'Enter') {
        if (buf.length >= 3) {
          e.preventDefault();
          onScan(buf);
        }
        buf = '';
      } else if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onScan, enabled]);
}

export default function SellView({
  settings,
  categories,
  stock,
  promos,
  cart,
  askOwner,
  onStockChanged,
  onHeldChanged,
}: {
  settings: Settings;
  categories: Category[];
  stock: StockRow[];
  promos: Promo[];
  cart: Cart;
  askOwner: AskOwner;
  onStockChanged: (variantIds?: number[]) => void;
  onHeldChanged: () => void;
}) {
  const toast = useToast();
  const print = usePrint();
  const groups = useMemo(() => groupStock(stock), [stock]);
  const [cat, setCat] = useState<number | 'all'>('all');
  const [q, setQ] = useState('');
  const [picker, setPicker] = useState<ProductGroup | null>(null);
  const [modal, setModal] = useState<null | 'member' | 'billDisc' | 'points' | 'pay' | 'hold'>(null);
  const [lineEdit, setLineEdit] = useState<number | null>(null);
  const [done, setDone] = useState<BillData | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<string | null>(null);

  const promosNow = useMemo(() => activePromos(promos, todayISO()), [promos]);
  const priced = useMemo(() => priceLines(cart.lines, promosNow), [cart.lines, promosNow]);
  const pointsDisc =
    cart.member && cart.pointsUsed ? (cart.pointsUsed / settings.redeem_points) * Number(settings.redeem_value) : 0;
  const t = billTotals(priced, cart.billDiscount, pointsDisc);
  const inCart = useMemo(() => new Map(cart.lines.map((l) => [l.row.variant_id, l.qty])), [cart.lines]);
  const editing = priced.find((l) => l.row.variant_id === lineEdit) ?? null;

  // ถ้ายอดลดลงจนแต้มที่เลือกไว้เกินยอด ให้ลดแต้มลงอัตโนมัติ
  useEffect(() => {
    if (cart.pointsUsed > 0 && pointsDisc > t.afterBill) {
      const v = Number(settings.redeem_value);
      const steps = v > 0 ? Math.floor(t.afterBill / v) : 0;
      cart.setPointsUsed(steps * settings.redeem_points);
    }
  }, [cart, pointsDisc, t.afterBill, settings]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return groups.filter(
      (g) =>
        (cat === 'all' || g.category_id === cat) &&
        (!s ||
          g.name.toLowerCase().includes(s) ||
          (g.brand ?? '').toLowerCase().includes(s) ||
          g.rows.some((r) => r.sku.toLowerCase().startsWith(s) || (r.barcode ?? '').startsWith(s))),
    );
  }, [groups, cat, q]);

  const addRow = useCallback(
    (row: StockRow) => {
      const left = row.stock_qty - (inCart.get(row.variant_id) ?? 0) - 1;
      cart.add(row);
      if (left < 0) toast(`เพิ่ม ${row.product_name} ${row.color} ${row.size_label} · สต็อกในระบบไม่พอ จะบันทึกยอดติดลบ`, 'danger');
      else toast(`เพิ่ม ${row.product_name} ${row.color} ${row.size_label}`);
    },
    [cart, inCart, toast],
  );

  const onScan = useCallback(
    (code: string) => {
      const row = findCode(stock, code);
      if (row) addRow(row);
      else toast(`ไม่พบสินค้ารหัส ${code}`, 'danger');
    },
    [stock, addRow, toast],
  );
  useScanner(onScan, !done);

  function onSearchEnter() {
    const row = findCode(stock, q);
    if (row) {
      addRow(row);
      setQ('');
    } else if (filtered.length === 1) setPicker(filtered[0]);
    else if (q.trim()) toast(`ไม่พบสินค้ารหัส ${q.trim()}`, 'danger');
  }

  async function approve(detail: string) {
    if (cart.approvedPin) return true;
    const pin = await askOwner('อนุมัติส่วนลด', detail);
    if (!pin) return false;
    cart.setApprovedPin(pin);
    return true;
  }

  async function startPay() {
    if (!cart.lines.length) return;
    pinRef.current = cart.approvedPin;
    if ((t.itemDisc > 0 || t.billDisc > 0) && !pinRef.current) {
      const pin = await askOwner('อนุมัติส่วนลด', 'บิลนี้มีส่วนลด ให้เจ้าของร้านใส่ PIN ก่อนชำระเงิน');
      if (!pin) return;
      cart.setApprovedPin(pin);
      pinRef.current = pin;
    }
    if (t.total === 0) {
      const e = await submitSale({ method: 'none', cash: null, ref: null });
      if (e) toast(e, 'danger');
      return;
    }
    setModal('pay');
  }

  async function submitSale(p: PayInput): Promise<string | null> {
    const payload = {
      kind: 'sale',
      member_id: cart.member?.id ?? null,
      owner_pin: pinRef.current,
      pay_method: p.method,
      cash_received: p.cash,
      pay_ref: p.ref,
      bill_discount: t.billDisc,
      points_used: cart.member ? cart.pointsUsed : 0,
      items: priced.map((l) => ({
        variant_id: l.row.variant_id,
        qty: l.qty,
        discount: l.discount,
        promo_discount: l.promo,
        promo_id: l.promoId,
      })),
    };
    const { data, error } = await supabase.rpc('create_sale', { p: payload });
    if (error) return errorText(error);
    const billNo = (data as { bill_no: string }).bill_no;
    const sold = priced.map((l) => l.row.variant_id);
    cart.clear();
    setModal(null);
    onStockChanged(sold);
    const bill = await fetchBill(billNo).catch(() => null);
    if (bill) {
      if (getAutoPrint()) print(<Receipt bill={bill} settings={settings} />);
      setDone(bill);
    } else toast(`บันทึกบิล ${billNo} แล้ว`);
    return null;
  }

  async function hold(name: string): Promise<string | null> {
    const { error } = await supabase.from('held_bills').insert({
      name,
      cart: {
        lines: cart.lines.map((l) => ({ variant_id: l.row.variant_id, qty: l.qty, discount: l.discount })),
        member: cart.member,
        billDiscount: cart.billDiscount,
        pointsUsed: cart.pointsUsed,
      },
    });
    if (error) return errorText(error);
    cart.clear();
    setModal(null);
    onHeldChanged();
    toast(`พักบิล "${name}" แล้ว`);
    return null;
  }

  return (
    <div className="pos-body">
      <section className="pos-left">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input
            ref={searchRef}
            id="pos-search"
            className="input pos-search"
            placeholder="ยิงบาร์โค้ด หรือพิมพ์ชื่อสินค้า แล้วกด Enter"
            autoComplete="off"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearchEnter()}
          />
          {q && (
            <button type="button" className="btn lg" onClick={() => (setQ(''), searchRef.current?.focus())}>
              ล้าง
            </button>
          )}
        </div>
        <div className="pos-cats" role="tablist">
          <button type="button" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
            ทั้งหมด
          </button>
          {categories.map((c) => (
            <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="pos-grid">
          {filtered.map((g) => (
            <button key={g.product_id} type="button" className="pcard" onClick={() => setPicker(g)}>
              <span className="n">{g.name}</span>
              <span className="b">{g.brand ?? g.category_name}</span>
              <span className="f">
                <span className="p num">฿{baht(g.price)}</span>
                <span className={`badge ${g.negatives ? 'danger' : g.total <= 0 ? '' : 'ok'}`}>
                  {g.negatives ? `ติดลบ ${g.negatives}` : `เหลือ ${g.total}`}
                </span>
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="empty" style={{ gridColumn: '1 / -1' }}>
              {groups.length === 0 ? 'ยังไม่มีสินค้า เพิ่มสินค้าที่หลังบ้านก่อน' : 'ไม่พบสินค้าที่ค้นหา'}
            </div>
          )}
        </div>
      </section>

      <aside className="pos-cart" aria-label="บิลปัจจุบัน">
        <div className="cart-head">
          <strong>บิลปัจจุบัน {t.pcs > 0 && <span className="muted">· {t.pcs} ชิ้น</span>}</strong>
          {cart.member ? (
            <span className="chip">
              <button type="button" className="chip-main" onClick={() => setModal('member')}>
                {cart.member.nickname} · {cart.member.points} แต้ม
              </button>
              <button type="button" aria-label="เอาสมาชิกออก" onClick={() => cart.setMember(null)}>
                ✕
              </button>
            </span>
          ) : (
            <button type="button" className="btn sm" onClick={() => setModal('member')}>
              + สมาชิก
            </button>
          )}
        </div>

        <div className="cart-lines">
          {priced.length === 0 && <div className="empty">ยิงบาร์โค้ด หรือแตะสินค้าทางซ้ายเพื่อเริ่มขาย</div>}
          {priced.map((l) => (
            <div key={l.row.variant_id} className="cline" role="button" tabIndex={0} onClick={() => setLineEdit(l.row.variant_id)}>
              <div style={{ minWidth: 0 }}>
                <div className="name">{l.row.product_name}</div>
                <div className="meta">
                  {l.row.color} · {l.row.size_label} · ฿{baht(l.row.price)}
                  {l.row.stock_qty - l.qty < 0 && <span className="badge danger" style={{ marginLeft: 6 }}>สต็อกไม่พอ</span>}
                </div>
                {l.promo > 0 && (
                  <div className="promo">
                    {l.promoName} −฿{baht2(l.promo)}
                  </div>
                )}
                {l.discount > 0 && <div className="disc">ส่วนลด −฿{baht2(l.discount)}</div>}
              </div>
              <div className="cline-r">
                <div className="qtybox" onClick={(e) => e.stopPropagation()}>
                  <button type="button" aria-label="ลด" onClick={() => cart.setQty(l.row.variant_id, l.qty - 1)}>
                    −
                  </button>
                  <span className="num">{l.qty}</span>
                  <button type="button" aria-label="เพิ่ม" onClick={() => cart.setQty(l.row.variant_id, l.qty + 1)}>
                    +
                  </button>
                </div>
                <strong className="num">{baht2(l.net)}</strong>
              </div>
            </div>
          ))}
        </div>

        <div className="cart-sum">
          <div className="r">
            <span>รวม</span>
            <span className="num">{baht2(t.gross)}</span>
          </div>
          {t.promo > 0 && (
            <div className="r ok-text">
              <span>โปรโมชัน</span>
              <span className="num">−{baht2(t.promo)}</span>
            </div>
          )}
          {t.itemDisc > 0 && (
            <div className="r">
              <span>ส่วนลดรายการ</span>
              <span className="num">−{baht2(t.itemDisc)}</span>
            </div>
          )}
          {t.billDisc > 0 && (
            <div className="r">
              <span>ส่วนลดท้ายบิล</span>
              <span className="num">−{baht2(t.billDisc)}</span>
            </div>
          )}
          {t.pointsDisc > 0 && (
            <div className="r">
              <span>ใช้ {cart.pointsUsed} แต้ม</span>
              <span className="num">−{baht2(t.pointsDisc)}</span>
            </div>
          )}
          <div className="r grand">
            <span>ยอดสุทธิ</span>
            <span className="num">฿{baht2(t.total)}</span>
          </div>
        </div>

        <div className="cart-actions">
          <button type="button" className="btn lg" disabled={!cart.lines.length} onClick={() => setModal('hold')}>
            พักบิล
          </button>
          <button type="button" className="btn lg" disabled={!cart.lines.length} onClick={() => setModal('billDisc')}>
            ส่วนลดท้ายบิล
          </button>
          {cart.member && (
            <button type="button" className="btn lg" disabled={!cart.lines.length} onClick={() => setModal('points')}>
              ใช้แต้ม
            </button>
          )}
          <button
            type="button"
            className={`btn lg ${confirmClear ? 'danger' : ''}`}
            disabled={!cart.lines.length && !cart.member}
            onClick={() => {
              if (!confirmClear) {
                setConfirmClear(true);
                window.setTimeout(() => setConfirmClear(false), 3000);
              } else {
                cart.clear();
                setConfirmClear(false);
              }
            }}
          >
            {confirmClear ? 'แตะอีกครั้งเพื่อล้าง' : 'ล้างบิล'}
          </button>
          <button type="button" className="btn primary pay" disabled={!cart.lines.length} onClick={startPay}>
            ชำระเงิน ฿{baht2(t.total)}
          </button>
        </div>
      </aside>

      {picker && (
        <VariantPickerModal
          group={picker}
          low={settings.low_stock_level}
          inCart={inCart}
          onClose={() => setPicker(null)}
          onPick={(row) => {
            addRow(row);
            setPicker(null);
            setQ('');
          }}
        />
      )}
      {editing && (
        <LineModal
          line={editing}
          onClose={() => setLineEdit(null)}
          onQty={(qty) => {
            cart.setQty(editing.row.variant_id, qty);
            if (qty <= 0) setLineEdit(null);
          }}
          onRemove={() => {
            cart.setQty(editing.row.variant_id, 0);
            setLineEdit(null);
          }}
          onDiscount={async (amount) => {
            if (amount > 0 && !(await approve('ให้ส่วนลดรายการ ต้องให้เจ้าของร้านใส่ PIN'))) return false;
            cart.setLineDiscount(editing.row.variant_id, amount);
            return true;
          }}
        />
      )}
      {modal === 'member' && (
        <MemberModal
          onClose={() => setModal(null)}
          onPick={(m) => {
            cart.setMember(m);
            setModal(null);
            toast(`สมาชิก ${m.nickname} · ${m.points} แต้ม`);
          }}
        />
      )}
      {modal === 'billDisc' && (
        <BillDiscountModal
          base={Math.max(0, t.gross - t.promo - t.itemDisc)}
          current={cart.billDiscount}
          onClose={() => setModal(null)}
          onSave={async (d) => {
            if (d && !(await approve('ให้ส่วนลดท้ายบิล ต้องให้เจ้าของร้านใส่ PIN'))) return false;
            cart.setBillDiscount(d);
            return true;
          }}
        />
      )}
      {modal === 'points' && cart.member && (
        <PointsModal
          member={cart.member}
          settings={settings}
          maxBaht={t.afterBill}
          current={cart.pointsUsed}
          onSave={cart.setPointsUsed}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'hold' && <HoldModal onSave={hold} onClose={() => setModal(null)} />}
      {modal === 'pay' && (
        <PaymentModal total={t.total} settings={settings} onClose={() => setModal(null)} onConfirm={submitSale} />
      )}
      {done && (
        <DoneModal
          bill={done}
          settings={settings}
          onClose={() => {
            setDone(null);
            searchRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
