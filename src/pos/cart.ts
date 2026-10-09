import type { StockRow } from '../lib/types';

/** ปัดเป็นทศนิยม 2 ตำแหน่ง */
export const r2 = (n: number) => Math.round(n * 100) / 100;

export interface Promo {
  id: number;
  name: string;
  type: 'percent' | 'amount' | 'qty' | 'bill_min';
  value: number;
  min_qty: number | null;
  min_amount: number | null;
  scope: 'all' | 'category' | 'product';
  starts_on: string | null;
  ends_on: string | null;
  active: boolean;
  promotion_targets: { category_id: number | null; product_id: number | null }[];
}

export interface Member {
  id: number;
  phone: string;
  nickname: string;
  points: number;
}

/** รายการในตะกร้า: discount = ส่วนลดที่ใส่เอง (บาท) ของทั้งรายการ */
export interface CartLine {
  row: StockRow;
  qty: number;
  discount: number;
}

export interface PricedLine extends CartLine {
  gross: number;
  promo: number;
  promoId: number | null;
  promoName: string | null;
  net: number;
}

export interface BillDiscount {
  mode: 'baht' | 'pct';
  value: number;
}

export function activePromos(promos: Promo[], today: string) {
  return promos.filter(
    (p) => p.active && (!p.starts_on || p.starts_on <= today) && (!p.ends_on || p.ends_on >= today),
  );
}

function applies(p: Promo, row: StockRow) {
  if (p.scope === 'all') return true;
  if (p.scope === 'category') return p.promotion_targets.some((t) => t.category_id === row.category_id);
  return p.promotion_targets.some((t) => t.product_id === row.product_id);
}

/**
 * คิดราคาแต่ละรายการ พร้อมเลือกโปรที่ลดได้มากที่สุดให้ (โปรเดียวต่อรายการ)
 * - percent: ลด % ต่อชิ้น
 * - amount: ลดบาทต่อชิ้น
 * - qty: ซื้อสินค้าที่ร่วมโปรครบจำนวน ลด %
 * - bill_min: ซื้อสินค้าที่ร่วมโปรครบยอด ลดบาท (แบ่งตามสัดส่วนราคา)
 */
export function priceLines(lines: CartLine[], promos: Promo[]): PricedLine[] {
  const base = lines.map((l) => ({ ...l, gross: r2(Number(l.row.price) * l.qty) }));
  const best = base.map(() => ({ amt: 0, promo: null as Promo | null }));

  for (const p of promos) {
    const idx = base.map((l, i) => (applies(p, l.row) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const v = Number(p.value);
    let amounts: number[];
    if (p.type === 'percent') {
      amounts = idx.map((i) => r2((base[i].gross * v) / 100));
    } else if (p.type === 'amount') {
      amounts = idx.map((i) => r2(Math.min(v * base[i].qty, base[i].gross)));
    } else if (p.type === 'qty') {
      const q = idx.reduce((a, i) => a + base[i].qty, 0);
      amounts = idx.map((i) => (q >= (p.min_qty ?? 1) ? r2((base[i].gross * v) / 100) : 0));
    } else {
      const sub = idx.reduce((a, i) => a + base[i].gross, 0);
      if (sub > 0 && sub >= Number(p.min_amount ?? 0)) {
        const pool = Math.min(v, sub);
        let left = pool;
        amounts = idx.map((i, k) => {
          if (k === idx.length - 1) return r2(left);
          const a = r2((pool * base[i].gross) / sub);
          left = r2(left - a);
          return a;
        });
      } else amounts = idx.map(() => 0);
    }
    idx.forEach((i, k) => {
      if (amounts[k] > best[i].amt) best[i] = { amt: amounts[k], promo: p };
    });
  }

  return base.map((l, i) => {
    const promo = Math.min(best[i].amt, l.gross);
    const discount = Math.min(l.discount, r2(l.gross - promo));
    return {
      ...l,
      discount,
      promo,
      promoId: promo > 0 ? best[i].promo!.id : null,
      promoName: promo > 0 ? best[i].promo!.name : null,
      net: r2(l.gross - promo - discount),
    };
  });
}

export function billTotals(priced: PricedLine[], bd: BillDiscount | null, pointsDisc: number) {
  const gross = r2(priced.reduce((a, l) => a + l.gross, 0));
  const promo = r2(priced.reduce((a, l) => a + l.promo, 0));
  const itemDisc = r2(priced.reduce((a, l) => a + l.discount, 0));
  const pcs = priced.reduce((a, l) => a + l.qty, 0);
  const after = r2(gross - promo - itemDisc);
  const billDisc = bd ? r2(Math.min(bd.mode === 'pct' ? (after * Math.min(bd.value, 100)) / 100 : bd.value, after)) : 0;
  const pts = r2(Math.min(pointsDisc, after - billDisc));
  const total = r2(after - billDisc - pts);
  return { gross, promo, itemDisc, billDisc, pointsDisc: pts, total, pcs, afterBill: r2(after - billDisc) };
}

/** จัดกลุ่มสต็อกตามรุ่นสินค้า */
export interface ProductGroup {
  product_id: number;
  name: string;
  brand: string | null;
  category_id: number;
  category_name: string;
  price: number;
  total: number;
  negatives: number;
  rows: StockRow[];
}

export function groupStock(stock: StockRow[]): ProductGroup[] {
  const map = new Map<number, ProductGroup>();
  for (const r of stock) {
    let g = map.get(r.product_id);
    if (!g) {
      g = {
        product_id: r.product_id,
        name: r.product_name,
        brand: r.brand,
        category_id: r.category_id,
        category_name: r.category_name,
        price: Number(r.price),
        total: 0,
        negatives: 0,
        rows: [],
      };
      map.set(r.product_id, g);
    }
    g.rows.push(r);
    g.total += r.stock_qty;
    if (r.stock_qty < 0) g.negatives++;
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'));
}

/** ปุ่มลัดรับเงินสด: พอดี และแบงก์ที่มากกว่ายอด */
export function cashShortcuts(total: number) {
  const out = new Set<number>([total]);
  for (const step of [20, 100, 500, 1000]) {
    const v = Math.ceil(total / step) * step;
    if (v > total) out.add(v);
  }
  for (const v of [500, 1000, 2000]) if (v > total) out.add(v);
  return [...out].sort((a, b) => a - b).slice(0, 5);
}
