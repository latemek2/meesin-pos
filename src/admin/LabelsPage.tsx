import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import { getSettings, getStock, useLoad } from '../lib/data';
import { baht } from '../lib/format';
import { sizeDetail } from '../lib/sizes';
import { ErrorBox, Loading } from '../components/ui';
import ProductPicker from '../components/ProductPicker';
import type { StockRow } from '../lib/types';

const PRESETS = {
  roll40: { label: 'ม้วน 40 × 30 มม. (เครื่องพิมพ์ฉลาก)', w: 40, h: 30, sheet: false },
  roll50: { label: 'ม้วน 50 × 30 มม. (เครื่องพิมพ์ฉลาก)', w: 50, h: 30, sheet: false },
  a4: { label: 'กระดาษสติกเกอร์ A4 (3 × 8 ดวง, 70 × 37 มม.)', w: 70, h: 37, sheet: true },
} as const;
type PresetKey = keyof typeof PRESETS;

const PREF_KEY = 'meesin.label.preset';

export default function LabelsPage() {
  const loc = useLocation();
  const [params] = useSearchParams();
  const { data, error, loading } = useLoad(async () => {
    const [stock, settings] = await Promise.all([getStock(), getSettings()]);
    return { stock, settings };
  });
  const [items, setItems] = useState<{ row: StockRow; qty: number }[]>([]);
  const [preset, setPreset] = useState<PresetKey>(() => {
    try {
      return (localStorage.getItem(PREF_KEY) as PresetKey) || 'roll40';
    } catch {
      return 'roll40';
    }
  });
  const [showPrice, setShowPrice] = useState(true);
  const [seeded, setSeeded] = useState(false);

  // เติมรายการจากหน้ารับของเข้า หรือจากหน้าสินค้า
  useEffect(() => {
    if (!data || seeded) return;
    const fromState = (loc.state as { items?: { variant_id: number; qty: number }[] } | null)?.items;
    const productId = Number(params.get('product'));
    let seed: { row: StockRow; qty: number }[] = [];
    if (fromState?.length) {
      seed = fromState
        .map((i) => ({ row: data.stock.find((s) => s.variant_id === i.variant_id)!, qty: i.qty }))
        .filter((i) => i.row);
    } else if (productId) {
      seed = data.stock.filter((s) => s.product_id === productId).map((row) => ({ row, qty: Math.max(row.stock_qty, 1) }));
    }
    setItems(seed);
    setSeeded(true);
  }, [data, seeded, loc.state, params]);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, preset);
    } catch {
      /* ไม่เป็นไร */
    }
  }, [preset]);

  const labels = useMemo(() => items.flatMap((i) => Array.from({ length: i.qty }, () => i.row)), [items]);
  const p = PRESETS[preset];

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;

  function add(row: StockRow) {
    setItems((its) => {
      const i = its.findIndex((x) => x.row.variant_id === row.variant_id);
      if (i >= 0) return its.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x));
      return [...its, { row, qty: 1 }];
    });
  }

  return (
    <>
      <style>{`@page { size: ${p.sheet ? 'A4' : `${p.w}mm ${p.h}mm`}; margin: ${p.sheet ? '13mm 0 0 0' : '0'}; }`}</style>
      <div className="page-head">
        <div>
          <h1>พิมพ์สติกเกอร์บาร์โค้ด</h1>
          <p>สำหรับสินค้าที่ไม่มีบาร์โค้ดโรงงาน บาร์โค้ดที่พิมพ์คือรหัส SKU ยิงขายที่หน้าร้านได้ทันที</p>
        </div>
        <button className="btn primary lg" disabled={!labels.length} onClick={() => window.print()}>
          พิมพ์ {labels.length} ดวง
        </button>
      </div>

      <div className="card stack no-print">
        <div className="form-grid">
          <label className="field">
            <span>ขนาดสติกเกอร์</span>
            <select id="l-preset" className="input" value={preset} onChange={(e) => setPreset(e.target.value as PresetKey)}>
              {Object.entries(PRESETS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <label className="check">
              <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
              แสดงราคาบนสติกเกอร์
            </label>
          </div>
        </div>
        <ProductPicker stock={data.stock} onPick={add} autoFocus={false} placeholder="เพิ่มสินค้าที่จะพิมพ์ (ยิงบาร์โค้ดหรือพิมพ์ชื่อ)" />
        {items.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th>สี / ไซซ์</th>
                  <th>บาร์โค้ด</th>
                  <th className="c">จำนวนดวง</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.row.variant_id}>
                    <td>{it.row.product_name}</td>
                    <td>
                      {it.row.color} · {sizeDetail(it.row)}
                    </td>
                    <td className="num small">{it.row.barcode ?? it.row.sku}</td>
                    <td className="c">
                      <input
                        className="input cell num"
                        style={{ width: 70, textAlign: 'center' }}
                        inputMode="numeric"
                        aria-label="จำนวนดวง"
                        value={it.qty}
                        onChange={(e) =>
                          setItems((its) => its.map((x, j) => (j === i ? { ...x, qty: Math.min(Number(e.target.value.replace(/\D/g, '')) || 0, 500) } : x)))
                        }
                      />
                    </td>
                    <td className="r">
                      <button className="btn sm ghost" aria-label="ลบ" onClick={() => setItems((its) => its.filter((_, j) => j !== i))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {labels.length > 0 ? (
        <div>
          <p className="muted small no-print">ตัวอย่างก่อนพิมพ์</p>
          <div
            className={`labels ${p.sheet ? 'sheet' : 'roll'}`}
            style={
              p.sheet
                ? { display: 'grid', gridTemplateColumns: `repeat(3, ${p.w}mm)`, gap: 0, width: '210mm' }
                : undefined
            }
          >
            {labels.map((row, i) => (
              <Label key={i} row={row} w={p.w} h={p.h} shop={data.settings.shop_name} showPrice={showPrice} />
            ))}
          </div>
        </div>
      ) : (
        <div className="card empty no-print">ยังไม่มีรายการที่จะพิมพ์</div>
      )}
    </>
  );
}

function Label({ row, w, h, shop, showPrice }: { row: StockRow; w: number; h: number; shop: string; showPrice: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const code = row.barcode ?? row.sku;
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, code, { format: 'CODE128', displayValue: true, fontSize: 14, height: 40, margin: 0, width: 1.6 });
    } catch {
      /* รหัสที่ไม่รองรับจะแสดงเป็นช่องว่าง */
    }
  }, [code]);
  return (
    <div className="label" style={{ ['--lw' as string]: `${w}mm`, ['--lh' as string]: `${h}mm` }}>
      <div className="shop">{shop}</div>
      <div className="name">{row.product_name}</div>
      <svg ref={ref} preserveAspectRatio="none" />
      <div className="meta">
        <span>
          {row.color} · {row.size_label}
        </span>
        {showPrice && <span className="price">฿{baht(row.price)}</span>}
      </div>
    </div>
  );
}
