import { useCallback, useMemo, useState } from 'react';
import { baht } from '../lib/format';
import type { Category, Settings, StockRow } from '../lib/types';
import { groupStock } from './cart';
import { VariantMatrix } from './VariantMatrix';
import { findCode, useScanner } from './SellView';
import { useToast } from '../components/ui';

/** เช็กสต็อกจากหน้าร้าน: ดูได้อย่างเดียว ไม่เห็นต้นทุน แตะช่องเพื่อใส่ตะกร้า */
export default function StockView({
  settings,
  categories,
  stock,
  inCart,
  onAdd,
}: {
  settings: Settings;
  categories: Category[];
  stock: StockRow[];
  inCart: Map<number, number>;
  onAdd: (row: StockRow) => void;
}) {
  const toast = useToast();
  const groups = useMemo(() => groupStock(stock), [stock]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<number | 'all'>('all');
  const [filter, setFilter] = useState<'all' | 'low' | 'neg'>('all');
  const [selected, setSelected] = useState<number | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return groups.filter((g) => {
      if (cat !== 'all' && g.category_id !== cat) return false;
      if (filter === 'neg' && !g.negatives) return false;
      if (filter === 'low' && !g.rows.some((r) => r.stock_qty <= settings.low_stock_level)) return false;
      return (
        !s ||
        g.name.toLowerCase().includes(s) ||
        (g.brand ?? '').toLowerCase().includes(s) ||
        g.rows.some((r) => r.sku.toLowerCase().startsWith(s) || (r.barcode ?? '').startsWith(s))
      );
    });
  }, [groups, q, cat, filter, settings.low_stock_level]);

  const group = groups.find((g) => g.product_id === selected) ?? null;

  const onScan = useCallback(
    (code: string) => {
      const row = findCode(stock, code);
      if (row) setSelected(row.product_id);
      else toast(`ไม่พบสินค้ารหัส ${code}`, 'danger');
    },
    [stock, toast],
  );
  useScanner(onScan);

  return (
    <div className="stock-view">
      <section className="stock-list">
        <input
          id="stock-search"
          className="input pos-search"
          placeholder="ค้นชื่อสินค้า หรือยิงบาร์โค้ด"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            const row = findCode(stock, q);
            if (row) {
              setSelected(row.product_id);
              setQ('');
            } else if (list.length === 1) setSelected(list[0].product_id);
          }}
        />
        <div className="row">
          <select id="stock-cat" className="input" style={{ width: 'auto' }} value={cat} onChange={(e) => setCat(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">ทุกหมวด</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="seg">
            <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              ทั้งหมด
            </button>
            <button type="button" aria-pressed={filter === 'low'} onClick={() => setFilter('low')}>
              ใกล้หมด
            </button>
            <button type="button" aria-pressed={filter === 'neg'} onClick={() => setFilter('neg')}>
              ติดลบ
            </button>
          </div>
        </div>
        <div className="stock-items">
          {list.map((g) => (
            <button
              key={g.product_id}
              type="button"
              className={`stock-item ${selected === g.product_id ? 'on' : ''}`}
              onClick={() => setSelected(g.product_id)}
            >
              <span style={{ minWidth: 0 }}>
                <strong>{g.name}</strong>
                <span className="muted small"> · {g.category_name}</span>
              </span>
              <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                {g.negatives > 0 && <span className="badge danger">ติดลบ {g.negatives}</span>}
                <span className="num">{g.total}</span>
              </span>
            </button>
          ))}
          {list.length === 0 && <div className="empty">ไม่พบสินค้า</div>}
        </div>
      </section>
      <section className="stock-detail">
        {group ? (
          <div className="card stack">
            <div className="row between">
              <div>
                <h2>{group.name}</h2>
                <div className="muted">
                  {group.category_name}
                  {group.brand && ` · ${group.brand}`} · รวม {group.total} ชิ้น
                </div>
              </div>
              <strong style={{ fontSize: '1.4rem' }}>฿{baht(group.price)}</strong>
            </div>
            <VariantMatrix rows={group.rows} low={settings.low_stock_level} inCart={inCart} onPick={onAdd} />
            <p className="muted small" style={{ margin: 0 }}>
              แตะช่องเพื่อใส่ตะกร้าบิลปัจจุบัน · แก้ยอดสต็อกได้ที่หลังบ้านเท่านั้น
            </p>
          </div>
        ) : (
          <div className="empty card">เลือกสินค้าทางซ้าย หรือยิงบาร์โค้ด เพื่อดูสต็อกแยกสีและไซซ์</div>
        )}
      </section>
    </div>
  );
}
