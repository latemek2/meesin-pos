import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCategories, must, useLoad } from '../lib/data';
import { baht } from '../lib/format';
import { ErrorBox, Loading } from '../components/ui';
import type { Product } from '../lib/types';

interface Row extends Product {
  cost: number;
  variants: number;
  stock: number;
  negative: number;
}

export default function ProductsPage() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<number | 'all'>('all');
  const [showInactive, setShowInactive] = useState(false);

  const { data, error, loading } = useLoad(async () => {
    const [cats, products, costs, variants] = await Promise.all([
      getCategories(),
      must<Product[]>(supabase.from('products').select('*').order('name')),
      must<{ product_id: number; cost: number }[]>(supabase.from('product_costs').select('product_id, cost')),
      must<{ product_id: number; stock_qty: number; sku: string; barcode: string | null; active: boolean }[]>(
        supabase.from('variants').select('product_id, stock_qty, sku, barcode, active'),
      ),
    ]);
    const costMap = new Map(costs.map((c) => [c.product_id, Number(c.cost)]));
    const rows: Row[] = products.map((p) => {
      const vs = variants.filter((v) => v.product_id === p.id && v.active);
      return {
        ...p,
        cost: costMap.get(p.id) ?? 0,
        variants: vs.length,
        stock: vs.reduce((a, v) => a + v.stock_qty, 0),
        negative: vs.filter((v) => v.stock_qty < 0).length,
      };
    });
    // ค้นด้วยบาร์โค้ด / SKU ได้ด้วย
    const codes = new Map<number, string>();
    variants.forEach((v) => codes.set(v.product_id, (codes.get(v.product_id) ?? '') + ` ${v.sku} ${v.barcode ?? ''}`));
    return { cats, rows, codes };
  });

  const list = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    return data.rows.filter(
      (r) =>
        (showInactive || r.active) &&
        (cat === 'all' || r.category_id === cat) &&
        (!s ||
          r.name.toLowerCase().includes(s) ||
          (r.brand ?? '').toLowerCase().includes(s) ||
          (data.codes.get(r.id) ?? '').toLowerCase().includes(s)),
    );
  }, [data, q, cat, showInactive]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const catName = new Map(data.cats.map((c) => [c.id, c.name]));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>สินค้า</h1>
          <p>
            {data.rows.filter((r) => r.active).length} รุ่น · คลิกที่สินค้าเพื่อแก้ไข เพิ่มสีไซซ์ หรือปรับสต็อก
          </p>
        </div>
        <Link className="btn primary" to="/admin/products/new">
          + เพิ่มสินค้า
        </Link>
      </div>

      <div className="row">
        <input
          id="product-search"
          className="input grow"
          style={{ maxWidth: 360 }}
          placeholder="ค้นหาชื่อ ยี่ห้อ หรือยิงบาร์โค้ด"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          id="product-cat"
          className="input"
          style={{ width: 'auto' }}
          value={cat}
          onChange={(e) => setCat(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          <option value="all">ทุกหมวด</option>
          {data.cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="check small">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          แสดงสินค้าที่ปิดขาย
        </label>
      </div>

      {list.length === 0 ? (
        <div className="card empty">
          {data.rows.length === 0 ? 'ยังไม่มีสินค้า กด "+ เพิ่มสินค้า" เพื่อเริ่ม' : 'ไม่พบสินค้าที่ค้นหา'}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>สินค้า</th>
                <th>หมวด</th>
                <th className="r">ราคาขาย</th>
                <th className="r">ต้นทุน</th>
                <th className="r">กำไร/ชิ้น</th>
                <th className="c">สี × ไซซ์</th>
                <th className="r">คงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="click" onClick={() => nav(`/admin/products/${r.id}`)}>
                  <td>
                    <strong>{r.name}</strong>
                    {r.brand && <span className="muted small"> · {r.brand}</span>}
                    {!r.active && <span className="badge" style={{ marginLeft: 8 }}>ปิดขาย</span>}
                  </td>
                  <td>{catName.get(r.category_id)}</td>
                  <td className="r num">{baht(r.price)}</td>
                  <td className="r num muted">{baht(r.cost)}</td>
                  <td className="r num">{baht(Number(r.price) - r.cost)}</td>
                  <td className="c num">{r.variants}</td>
                  <td className="r num">
                    {r.negative > 0 && <span className="badge danger" style={{ marginRight: 6 }}>ติดลบ {r.negative}</span>}
                    {baht(r.stock)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
