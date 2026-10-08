import { useMemo, useRef, useState } from 'react';
import { sizeDetail } from '../lib/sizes';
import { baht } from '../lib/format';
import type { StockRow } from '../lib/types';

/**
 * ช่องค้นหาสินค้า: ยิงบาร์โค้ด / พิมพ์ SKU แล้วกด Enter = เพิ่มทันที
 * หรือพิมพ์ชื่อแล้วเลือกจากรายการ
 */
export default function ProductPicker({
  stock,
  onPick,
  placeholder = 'ยิงบาร์โค้ด หรือพิมพ์ชื่อสินค้า / SKU',
  autoFocus = true,
}: {
  stock: StockRow[];
  onPick: (row: StockRow) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const [miss, setMiss] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 1) return [];
    return stock
      .filter(
        (r) =>
          r.product_name.toLowerCase().includes(s) ||
          r.sku.toLowerCase().startsWith(s) ||
          (r.barcode ?? '').startsWith(s) ||
          r.color.toLowerCase().includes(s),
      )
      .slice(0, 12);
  }, [q, stock]);

  function pick(r: StockRow) {
    onPick(r);
    setQ('');
    setMiss(null);
    ref.current?.focus();
  }

  function onEnter() {
    const code = q.trim();
    if (!code) return;
    const exact = stock.find((r) => r.barcode === code || r.sku.toLowerCase() === code.toLowerCase());
    if (exact) return pick(exact);
    if (matches.length === 1) return pick(matches[0]);
    setMiss(code);
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={ref}
        id="picker"
        className="input"
        style={{ fontSize: '1.05rem', minHeight: 48 }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setMiss(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter();
          }
          if (e.key === 'Escape') setQ('');
        }}
      />
      {miss && <div className="notice danger small" style={{ marginTop: 6 }}>ไม่พบสินค้ารหัส “{miss}” ในระบบ</div>}
      {matches.length > 0 && !miss && (
        <div
          className="card"
          style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: 'calc(100% + 4px)', padding: 4, maxHeight: 360, overflowY: 'auto', boxShadow: '0 10px 30px rgb(0 0 0 / .12)' }}
        >
          {matches.map((r) => (
            <button
              key={r.variant_id}
              type="button"
              className="btn ghost"
              style={{ width: '100%', justifyContent: 'space-between', textAlign: 'left', whiteSpace: 'normal' }}
              onClick={() => pick(r)}
            >
              <span>
                <strong>{r.product_name}</strong> · {r.color} · {sizeDetail(r)}
                <span className="muted small"> · {r.sku}</span>
              </span>
              <span className="num muted">฿{baht(r.price)} · เหลือ {r.stock_qty}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
