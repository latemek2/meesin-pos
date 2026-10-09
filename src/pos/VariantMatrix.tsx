import { useMemo } from 'react';
import type { StockRow } from '../lib/types';
import { baht } from '../lib/format';
import { Modal } from '../components/ui';
import type { ProductGroup } from './cart';

/** ตารางสี × ไซซ์ ของรุ่นเดียว แตะช่องเพื่อเลือก (ขายได้แม้สต็อก 0 หรือติดลบ) */
export function VariantMatrix({
  rows,
  low,
  inCart,
  onPick,
}: {
  rows: StockRow[];
  low: number;
  inCart?: Map<number, number>;
  onPick: (row: StockRow) => void;
}) {
  const colors = useMemo(() => [...new Set(rows.map((r) => r.color))], [rows]);
  const sizes = useMemo(() => {
    const m = new Map<string, StockRow>();
    rows.forEach((r) => {
      const cur = m.get(r.size_label);
      if (!cur || r.sort_order < cur.sort_order) m.set(r.size_label, r);
    });
    return [...m.values()].sort((a, b) => a.sort_order - b.sort_order);
  }, [rows]);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="matrix">
        <thead>
          <tr>
            <th></th>
            {sizes.map((s) => (
              <th key={s.size_label}>
                <div className="size-h">
                  <span>{s.size_eu ? s.size_eu : s.size_label}</span>
                  {(s.size_us || s.size_uk || s.size_cm) && (
                    <small>
                      {[s.size_us && `US ${s.size_us}`, s.size_uk && `UK ${s.size_uk}`, s.size_cm && `${s.size_cm}ซม.`]
                        .filter(Boolean)
                        .join(' ')}
                    </small>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {colors.map((c) => (
            <tr key={c}>
              <th className="color">{c}</th>
              {sizes.map((s) => {
                const v = rows.find((r) => r.color === c && r.size_label === s.size_label);
                if (!v)
                  return (
                    <td key={s.size_label}>
                      <div className="qty-cell none">–</div>
                    </td>
                  );
                const q = v.stock_qty - (inCart?.get(v.variant_id) ?? 0);
                const cls = q < 0 ? 'neg' : q === 0 ? 'zero' : q <= low ? 'low' : '';
                return (
                  <td key={s.size_label}>
                    <button
                      type="button"
                      className="cell"
                      onClick={() => onPick(v)}
                      aria-label={`${c} ไซซ์ ${s.size_label} เหลือ ${q}`}
                    >
                      <div className={`qty-cell ${cls}`}>{q}</div>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row small muted" style={{ marginTop: 8, gap: 16 }}>
        <span>
          <i className="dot" style={{ background: 'var(--surface-2)' }} /> มีของ
        </span>
        <span>
          <i className="dot" style={{ background: 'var(--warn-soft)' }} /> เหลือน้อย
        </span>
        <span>
          <i className="dot" style={{ background: '#f1f0eb' }} /> หมด
        </span>
        <span>
          <i className="dot" style={{ background: 'var(--danger-soft)' }} /> ติดลบ
        </span>
        {inCart && <span>ตัวเลขหักของในตะกร้าแล้ว</span>}
      </div>
    </div>
  );
}

export function VariantPickerModal({
  group,
  low,
  inCart,
  onPick,
  onClose,
}: {
  group: ProductGroup;
  low: number;
  inCart: Map<number, number>;
  onPick: (row: StockRow) => void;
  onClose: () => void;
}) {
  return (
    <Modal title={group.name} onClose={onClose} wide>
      <div className="row muted" style={{ marginTop: -8 }}>
        <span>{group.category_name}</span>
        {group.brand && <span>· {group.brand}</span>}
        <strong style={{ color: 'var(--ink)', marginLeft: 'auto', fontSize: '1.2rem' }}>฿{baht(group.price)}</strong>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        แตะช่องสีและไซซ์ที่ลูกค้าเลือก เพื่อใส่ตะกร้า
      </p>
      <VariantMatrix rows={group.rows} low={low} inCart={inCart} onPick={onPick} />
    </Modal>
  );
}
