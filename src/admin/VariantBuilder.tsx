import { useMemo, useState, type KeyboardEvent } from 'react';
import { sizeCode, sizeTemplate, type SizeRow } from '../lib/sizes';
import type { SizeType, Variant } from '../lib/types';

export interface NewVariant {
  color: string;
  size: SizeRow;
  sort_order: number;
  qty: number;
}

/**
 * ตัวสร้างสี × ไซซ์ทั้งชุด
 * - พิมพ์สีแล้วกด Enter
 * - ติ๊กไซซ์ที่มี แก้ค่า EU/US/UK/ซม. ได้ก่อนสร้าง
 * - ใส่จำนวนที่นับได้ในตาราง เป็นสต็อกตั้งต้น
 */
export default function VariantBuilder({
  sizeType,
  existing,
  busy,
  submitLabel,
  onSubmit,
}: {
  sizeType: SizeType;
  existing: Variant[];
  busy?: boolean;
  submitLabel: (n: number) => string;
  onSubmit: (rows: NewVariant[]) => void;
}) {
  const existingColors = useMemo(() => [...new Set(existing.map((v) => v.color))], [existing]);
  const [colors, setColors] = useState<string[]>([]);
  const [colorInput, setColorInput] = useState('');
  const [sizes, setSizes] = useState<(SizeRow & { on: boolean })[]>(() =>
    sizeTemplate(sizeType).map((s) => ({ ...s, on: sizeType === 'apparel' || sizeType === 'free' })),
  );
  const [customSize, setCustomSize] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({});

  const usedKeys = useMemo(() => new Set(existing.map((v) => `${v.color}|${v.size_label}`)), [existing]);
  const showEU = sizeType === 'shoe' || sizeType === 'kid_shoe';
  const showCM = sizeType === 'kid_shoe';

  function addColor() {
    const parts = colorInput
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setColors((c) => [...c, ...parts.filter((p) => !c.includes(p))]);
    setColorInput('');
  }
  function onColorKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addColor();
    }
  }
  function toggleExistingColor(c: string) {
    setColors((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  }
  function setSize(i: number, patch: Partial<SizeRow & { on: boolean }>) {
    setSizes((ss) =>
      ss.map((s, j) => {
        if (j !== i) return s;
        const next = { ...s, ...patch };
        if (patch.eu !== undefined && showEU) next.label = patch.eu ? `EU ${patch.eu}` : s.label;
        return next;
      }),
    );
  }
  function addCustomSize() {
    const v = customSize.trim();
    if (!v) return;
    setSizes((ss) => [
      ...ss,
      showEU ? { label: `EU ${v}`, eu: v, us: '', uk: '', cm: '', on: true } : { label: v, eu: '', us: '', uk: '', cm: '', on: true },
    ]);
    setCustomSize('');
  }

  const chosen = sizes.map((s, i) => ({ ...s, idx: i })).filter((s) => s.on);
  const combos: NewVariant[] = [];
  colors.forEach((c) =>
    chosen.forEach((s) => {
      if (usedKeys.has(`${c}|${s.label}`)) return;
      const { on: _on, idx, ...size } = s;
      combos.push({ color: c, size, sort_order: idx, qty: Number(qty[`${c}|${s.label}`] || 0) });
    }),
  );

  return (
    <div className="stack">
      <div className="stack" style={{ gap: 8 }}>
        <h3>1. สี</h3>
        <div className="row">
          <input
            id="color-input"
            className="input"
            style={{ maxWidth: 280 }}
            placeholder="พิมพ์สีแล้วกด Enter เช่น ขาว, ดำ"
            value={colorInput}
            onChange={(e) => setColorInput(e.target.value)}
            onKeyDown={onColorKey}
          />
          <button type="button" className="btn" onClick={addColor}>
            เพิ่มสี
          </button>
        </div>
        {existingColors.length > 0 && (
          <div className="row small">
            <span className="muted">สีที่มีอยู่แล้ว (แตะเพื่อเพิ่มไซซ์ใหม่ให้สีนั้น):</span>
            {existingColors.map((c) => (
              <button
                type="button"
                key={c}
                className={`btn sm ${colors.includes(c) ? 'primary' : ''}`}
                onClick={() => toggleExistingColor(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="row">
          {colors.map((c) => (
            <span key={c} className="chip">
              {c}
              <button type="button" aria-label={`ลบสี ${c}`} onClick={() => setColors((cs) => cs.filter((x) => x !== c))}>
                ✕
              </button>
            </span>
          ))}
          {colors.length === 0 && <span className="muted small">ยังไม่ได้เลือกสี</span>}
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <h3>2. ไซซ์ที่มี</h3>
        {showEU && (
          <p className="muted small" style={{ margin: 0 }}>
            ค่า US / UK {showCM ? '/ ซม. ' : ''}ที่ใส่ไว้เป็นค่าโดยประมาณ ตรวจกับป้ายของยี่ห้อนี้แล้วแก้ได้เลย
          </p>
        )}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="c">มี</th>
                {showEU ? (
                  <>
                    <th>EU</th>
                    <th>US</th>
                    <th>UK</th>
                    {showCM && <th>ซม.</th>}
                  </>
                ) : (
                  <th>ไซซ์</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sizes.map((s, i) => (
                <tr key={i} style={{ opacity: s.on ? 1 : 0.55 }}>
                  <td className="c">
                    <input
                      type="checkbox"
                      aria-label={`เลือกไซซ์ ${s.label}`}
                      checked={s.on}
                      onChange={(e) => setSize(i, { on: e.target.checked })}
                      style={{ width: 20, height: 20, accentColor: 'var(--brand)' }}
                    />
                  </td>
                  {showEU ? (
                    <>
                      <td>
                        <input className="input cell" style={{ width: 70 }} value={s.eu} onChange={(e) => setSize(i, { eu: e.target.value })} />
                      </td>
                      <td>
                        <input className="input cell" style={{ width: 70 }} value={s.us} onChange={(e) => setSize(i, { us: e.target.value })} />
                      </td>
                      <td>
                        <input className="input cell" style={{ width: 70 }} value={s.uk} onChange={(e) => setSize(i, { uk: e.target.value })} />
                      </td>
                      {showCM && (
                        <td>
                          <input className="input cell" style={{ width: 70 }} value={s.cm} onChange={(e) => setSize(i, { cm: e.target.value })} />
                        </td>
                      )}
                    </>
                  ) : (
                    <td>
                      <input className="input cell" style={{ width: 120 }} value={s.label} onChange={(e) => setSize(i, { label: e.target.value })} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row">
          <input
            id="custom-size"
            className="input"
            style={{ maxWidth: 200 }}
            placeholder={showEU ? 'เพิ่มไซซ์ EU อื่น เช่น 40.5' : 'เพิ่มไซซ์อื่น เช่น 3XL'}
            value={customSize}
            onChange={(e) => setCustomSize(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomSize();
              }
            }}
          />
          <button type="button" className="btn" onClick={addCustomSize}>
            เพิ่มไซซ์
          </button>
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <h3>3. จำนวนที่มีอยู่ตอนนี้ (สต็อกตั้งต้น)</h3>
        {colors.length === 0 || chosen.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>เลือกสีและไซซ์ก่อน ตารางจะขึ้นที่นี่</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="matrix">
              <thead>
                <tr>
                  <th></th>
                  {chosen.map((s) => (
                    <th key={s.idx}>{s.label.replace('EU ', '')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colors.map((c) => (
                  <tr key={c}>
                    <th className="color">{c}</th>
                    {chosen.map((s) => {
                      const k = `${c}|${s.label}`;
                      if (usedKeys.has(k))
                        return (
                          <td key={k}>
                            <div className="qty-cell none" title="มีอยู่แล้ว">มีแล้ว</div>
                          </td>
                        );
                      return (
                        <td key={k}>
                          <input
                            inputMode="numeric"
                            aria-label={`จำนวน ${c} ${s.label}`}
                            value={qty[k] ?? ''}
                            placeholder="0"
                            onChange={(e) => setQty((q) => ({ ...q, [k]: e.target.value.replace(/[^0-9]/g, '') }))}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="row">
        <button
          type="button"
          className="btn primary lg"
          disabled={busy || combos.length === 0}
          onClick={() => onSubmit(combos)}
        >
          {busy ? 'กำลังบันทึก…' : submitLabel(combos.length)}
        </button>
        {combos.length > 0 && (
          <span className="muted small">
            รวม {combos.reduce((a, c) => a + c.qty, 0)} ชิ้น
          </span>
        )}
      </div>
    </div>
  );
}

/** สร้าง SKU: รหัสสินค้า-ลำดับสี-ไซซ์ เช่น 12-1-40 */
export function makeSku(productId: number, colorNo: number, size: SizeRow) {
  return `${productId}-${colorNo}-${sizeCode(size)}`;
}
