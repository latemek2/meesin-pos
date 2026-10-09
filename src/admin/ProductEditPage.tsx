import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { getCategories, getSettings, must, useLoad } from '../lib/data';
import { baht, num } from '../lib/format';
import { sizeDetail } from '../lib/sizes';
import { ErrorBox, Loading, Modal, MoneyInput, QtyCell, useToast } from '../components/ui';
import VariantBuilder, { makeSku, type NewVariant } from './VariantBuilder';
import type { Category, Product, Variant } from '../lib/types';

interface FormState {
  name: string;
  category_id: string;
  brand: string;
  price: string;
  cost: string;
  note: string;
  active: boolean;
}

export default function ProductEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const toast = useToast();

  const { data, error, loading, reload } = useLoad(async () => {
    const [cats, settings] = await Promise.all([getCategories(), getSettings()]);
    if (isNew) return { cats, settings, product: null, cost: 0, variants: [] as Variant[] };
    const [product, cost, variants] = await Promise.all([
      must<Product>(supabase.from('products').select('*').eq('id', id).single()),
      must<{ cost: number } | null>(supabase.from('product_costs').select('cost').eq('product_id', id).maybeSingle()),
      must<Variant[]>(supabase.from('variants').select('*').eq('product_id', id).order('color').order('sort_order')),
    ]);
    return { cats, settings, product, cost: Number(cost?.cost ?? 0), variants };
  }, [id]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  return <Editor key={id ?? 'new'} {...data} isNew={isNew} reload={reload} nav={nav} toast={toast} />;
}

function Editor({
  cats,
  settings,
  product,
  cost,
  variants,
  isNew,
  reload,
  nav,
  toast,
}: {
  cats: Category[];
  settings: { low_stock_level: number };
  product: Product | null;
  cost: number;
  variants: Variant[];
  isNew: boolean;
  reload: () => Promise<void>;
  nav: ReturnType<typeof useNavigate>;
  toast: ReturnType<typeof useToast>;
}) {
  const [form, setForm] = useState<FormState>({
    name: product?.name ?? '',
    category_id: String(product?.category_id ?? cats[0]?.id ?? ''),
    brand: product?.brand ?? '',
    price: product ? String(Number(product.price)) : '',
    cost: product ? String(cost) : '',
    note: product?.note ?? '',
    active: product?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [adjust, setAdjust] = useState<Variant | null>(null);
  const [showBuilder, setShowBuilder] = useState(isNew);

  const category = cats.find((c) => String(c.id) === form.category_id);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  async function saveProduct(): Promise<number> {
    if (!form.name.trim()) throw new Error('กรุณาใส่ชื่อสินค้า');
    if (!form.category_id) throw new Error('กรุณาเลือกหมวด');
    if (form.price === '') throw new Error('กรุณาใส่ราคาขาย');
    const row = {
      name: form.name.trim(),
      category_id: Number(form.category_id),
      brand: form.brand.trim() || null,
      price: num(form.price),
      note: form.note.trim() || null,
      active: form.active,
      updated_at: new Date().toISOString(),
    };
    let pid = product?.id;
    if (pid) {
      const { error } = await supabase.from('products').update(row).eq('id', pid);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('products').insert(row).select('id').single();
      if (error) throw error;
      pid = data.id as number;
    }
    const { error: ce } = await supabase
      .from('product_costs')
      .upsert({ product_id: pid, cost: num(form.cost), updated_at: new Date().toISOString() });
    if (ce) throw ce;
    return pid!;
  }

  async function createVariants(pid: number, rows: NewVariant[]) {
    const colorOrder = [...new Set(variants.map((v) => v.color))];
    rows.forEach((r) => !colorOrder.includes(r.color) && colorOrder.push(r.color));
    const insert = rows.map((r) => ({
      product_id: pid,
      color: r.color,
      size_label: r.size.label,
      size_eu: r.size.eu || null,
      size_us: r.size.us || null,
      size_uk: r.size.uk || null,
      size_cm: r.size.cm || null,
      sort_order: r.sort_order,
      sku: makeSku(pid, colorOrder.indexOf(r.color) + 1, r.size),
    }));
    const { data, error } = await supabase.from('variants').insert(insert).select('id, color, size_label');
    if (error) throw error;
    for (const r of rows) {
      if (r.qty <= 0) continue;
      const v = data.find((d) => d.color === r.color && d.size_label === r.size.label);
      if (!v) continue;
      const { error: ae } = await supabase.rpc('adjust_stock', {
        p_variant_id: v.id,
        p_qty_change: r.qty,
        p_note: 'สต็อกตั้งต้น',
        p_kind: 'opening',
      });
      if (ae) throw ae;
    }
  }

  async function onSave(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await saveProduct();
      toast('บันทึกข้อมูลสินค้าแล้ว');
      await reload();
    } catch (ex) {
      setErr(errorText(ex));
    } finally {
      setBusy(false);
    }
  }

  async function onBuild(rows: NewVariant[]) {
    setBusy(true);
    setErr(null);
    let pid: number | undefined;
    try {
      pid = await saveProduct();
      await createVariants(pid, rows);
      toast(`เพิ่ม ${rows.length} รายการแล้ว`);
      if (isNew) nav(`/admin/products/${pid}`, { replace: true });
      else {
        setShowBuilder(false);
        await reload();
      }
    } catch (ex) {
      setErr(errorText(ex));
      if (isNew && pid) {
        toast(`บันทึกสินค้าแล้ว แต่สร้างสีไซซ์ไม่สำเร็จ: ${errorText(ex)}`, 'danger');
        nav(`/admin/products/${pid}`, { replace: true });
      }
    } finally {
      setBusy(false);
    }
  }

  async function updateVariant(v: Variant, patch: Partial<Variant>) {
    const { error } = await supabase.from('variants').update(patch).eq('id', v.id);
    if (error) toast(errorText(error), 'danger');
    else {
      toast('บันทึกแล้ว');
      await reload();
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/admin/products" className="small">
            ← สินค้าทั้งหมด
          </Link>
          <h1>{isNew ? 'เพิ่มสินค้าใหม่' : product?.name}</h1>
        </div>
        {!isNew && (
          <Link className="btn" to={`/admin/labels?product=${product?.id}`}>
            พิมพ์สติกเกอร์รุ่นนี้
          </Link>
        )}
      </div>

      <form className="card stack" onSubmit={onSave}>
        <h2>ข้อมูลสินค้า</h2>
        <div className="form-grid">
          <label className="field" style={{ gridColumn: 'span 2' }}>
            <span>ชื่อสินค้า (รุ่น)</span>
            <input id="p-name" className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus={isNew} />
          </label>
          <label className="field">
            <span>หมวด</span>
            <select
              id="p-cat"
              className="input"
              value={form.category_id}
              onChange={(e) => set({ category_id: e.target.value })}
            >
              {/* สินค้าที่มีสีไซซ์แล้ว ย้ายได้เฉพาะหมวดที่ใช้ไซซ์ชนิดเดียวกัน */}
              {cats
                .filter((c) => isNew || variants.length === 0 || c.size_type === cats.find((x) => x.id === product?.category_id)?.size_type)
                .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>ยี่ห้อ (ไม่บังคับ)</span>
            <input id="p-brand" className="input" value={form.brand} onChange={(e) => set({ brand: e.target.value })} />
          </label>
          <label className="field">
            <span>ราคาขาย (บาท)</span>
            <MoneyInput id="p-price" value={form.price} onChange={(v) => set({ price: v })} />
          </label>
          <label className="field">
            <span>ต้นทุนต่อชิ้น (บาท)</span>
            <MoneyInput id="p-cost" value={form.cost} onChange={(v) => set({ cost: v })} />
          </label>
          <div className="field">
            <span>กำไรต่อชิ้น</span>
            <div className="input num" style={{ background: 'var(--surface-2)' }}>
              {baht(num(form.price) - num(form.cost))}
            </div>
          </div>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>หมายเหตุ (ไม่บังคับ)</span>
            <input id="p-note" className="input" value={form.note} onChange={(e) => set({ note: e.target.value })} />
          </label>
        </div>
        {!isNew && (
          <div className="row between">
            <label className="check">
              <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
              เปิดขายสินค้านี้ (ปิดแล้วจะไม่ขึ้นในหน้าขาย แต่ประวัติยังอยู่)
            </label>
            <button className="btn primary" disabled={busy}>
              {busy ? 'กำลังบันทึก…' : 'บันทึกข้อมูลสินค้า'}
            </button>
          </div>
        )}
        <ErrorBox error={err} />
      </form>

      {!isNew && variants.length > 0 && (
        <StockMatrix variants={variants} low={settings.low_stock_level} onAdjust={setAdjust} />
      )}

      {!isNew && variants.length > 0 && (
        <div className="card stack">
          <div className="row between">
            <h2>สีและไซซ์ทั้งหมด</h2>
            <span className="muted small">ยิงบาร์โค้ดโรงงานลงช่องบาร์โค้ดได้เลย ระบบบันทึกเมื่อออกจากช่อง</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>สี</th>
                  <th>ไซซ์</th>
                  <th>SKU</th>
                  <th>บาร์โค้ดโรงงาน</th>
                  <th className="c">คงเหลือ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.id} style={{ opacity: v.active ? 1 : 0.5 }}>
                    <td>{v.color}</td>
                    <td>{sizeDetail(v)}</td>
                    <td className="num small">{v.sku}</td>
                    <td>
                      <input
                        className="input cell num"
                        style={{ width: 170 }}
                        defaultValue={v.barcode ?? ''}
                        placeholder="ไม่มี"
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        onBlur={(e) => {
                          const val = e.target.value.trim() || null;
                          if (val !== v.barcode) updateVariant(v, { barcode: val });
                        }}
                      />
                    </td>
                    <td className="c">
                      <QtyCell qty={v.stock_qty} low={settings.low_stock_level} />
                    </td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm" onClick={() => setAdjust(v)}>
                        ปรับสต็อก
                      </button>{' '}
                      <button className="btn sm ghost" onClick={() => updateVariant(v, { active: !v.active })}>
                        {v.active ? 'ปิดขาย' : 'เปิดขาย'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {category && (isNew || showBuilder) && (
        <div className="card stack">
          <h2>{isNew ? 'สีและไซซ์' : 'เพิ่มสีหรือไซซ์'}</h2>
          <VariantBuilder
            sizeType={category.size_type}
            existing={variants}
            busy={busy}
            submitLabel={(n) => (isNew ? `บันทึกสินค้าและสร้าง ${n} รายการ` : `เพิ่ม ${n} รายการ`)}
            onSubmit={onBuild}
          />
        </div>
      )}
      {!isNew && !showBuilder && (
        <div>
          <button className="btn" onClick={() => setShowBuilder(true)}>
            + เพิ่มสีหรือไซซ์
          </button>
        </div>
      )}

      {adjust && (
        <AdjustModal
          variant={adjust}
          onClose={() => setAdjust(null)}
          onDone={async () => {
            setAdjust(null);
            toast('ปรับสต็อกแล้ว');
            await reload();
          }}
        />
      )}
    </>
  );
}

function StockMatrix({ variants, low, onAdjust }: { variants: Variant[]; low: number; onAdjust: (v: Variant) => void }) {
  const colors = useMemo(() => [...new Set(variants.map((v) => v.color))], [variants]);
  const sizes = useMemo(() => {
    const m = new Map<string, number>();
    variants.forEach((v) => m.set(v.size_label, Math.min(m.get(v.size_label) ?? 999, v.sort_order)));
    return [...m.entries()].sort((a, b) => a[1] - b[1]).map(([s]) => s);
  }, [variants]);
  const total = variants.filter((v) => v.active).reduce((a, v) => a + v.stock_qty, 0);
  return (
    <div className="card stack">
      <div className="row between">
        <h2>สต็อกตามสีและไซซ์</h2>
        <span className="muted">รวม {baht(total)} ชิ้น · แตะช่องเพื่อปรับสต็อก</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="matrix">
          <thead>
            <tr>
              <th></th>
              {sizes.map((s) => (
                <th key={s}>{s.replace('EU ', '')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {colors.map((c) => (
              <tr key={c}>
                <th className="color">{c}</th>
                {sizes.map((s) => {
                  const v = variants.find((x) => x.color === c && x.size_label === s && x.active);
                  return (
                    <td key={s}>
                      {v ? (
                        <button
                          style={{ border: 0, padding: 0, background: 'none', cursor: 'pointer', width: '100%' }}
                          onClick={() => onAdjust(v)}
                          aria-label={`ปรับสต็อก ${c} ${s}`}
                        >
                          <QtyCell qty={v.stock_qty} low={low} />
                        </button>
                      ) : (
                        <QtyCell qty={null} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdjustModal({ variant, onClose, onDone }: { variant: Variant; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'set' | 'change'>('set');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = Number(value.replace(/[^0-9-]/g, '')) || 0;
  const change = mode === 'set' ? n - variant.stock_qty : n;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (value === '') return setErr('กรุณาใส่จำนวน');
    if (change === 0) return onClose();
    if (!reason.trim()) return setErr('กรุณาใส่เหตุผล');
    setBusy(true);
    const { error } = await supabase.rpc('adjust_stock', {
      p_variant_id: variant.id,
      p_qty_change: change,
      p_note: reason.trim(),
      p_kind: 'adjust',
    });
    setBusy(false);
    if (error) setErr(errorText(error));
    else onDone();
  }

  return (
    <Modal title={`ปรับสต็อก ${variant.color} · ${variant.size_label}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="row">
          <span className="muted">คงเหลือในระบบ</span>
          <QtyCell qty={variant.stock_qty} />
        </div>
        <div className="row">
          <button type="button" className={`btn sm ${mode === 'set' ? 'primary' : ''}`} onClick={() => setMode('set')}>
            ตั้งเป็นจำนวนที่นับได้
          </button>
          <button type="button" className={`btn sm ${mode === 'change' ? 'primary' : ''}`} onClick={() => setMode('change')}>
            เพิ่มหรือลด
          </button>
        </div>
        <label className="field">
          <span>{mode === 'set' ? 'จำนวนที่นับได้จริง' : 'จำนวนที่เพิ่ม (ใส่ลบถ้าลด เช่น -1)'}</span>
          <input
            id="adj-value"
            className="input num"
            inputMode="numeric"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9-]/g, ''))}
          />
        </label>
        <label className="field">
          <span>เหตุผล</span>
          <input
            id="adj-reason"
            className="input"
            list="adj-reasons"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น ชำรุด, สูญหาย, นับใหม่"
          />
          <datalist id="adj-reasons">
            <option value="นับใหม่ ยอดไม่ตรง" />
            <option value="ชำรุด" />
            <option value="สูญหาย" />
            <option value="ลูกค้าคืนกรณีพิเศษ" />
            <option value="ของมาแล้ว ลืมคีย์รับเข้า" />
          </datalist>
        </label>
        {value !== '' && (
          <div className="notice">
            ยอดจะเปลี่ยนจาก <strong>{variant.stock_qty}</strong> เป็น <strong>{variant.stock_qty + change}</strong> (
            {change > 0 ? `+${change}` : change})
          </div>
        )}
        <ErrorBox error={err} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
