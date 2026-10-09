import { Link } from 'react-router-dom';
import { getCosts, getSettings, getStock, useLoad } from '../lib/data';
import { baht } from '../lib/format';
import { ErrorBox, Loading, QtyCell } from '../components/ui';
import { sizeDetail } from '../lib/sizes';

export default function Dashboard() {
  const { data, error, loading } = useLoad(async () => {
    const [stock, costs, settings] = await Promise.all([
      getStock(),
      getCosts(),
      getSettings(),
    ]);
    return { stock, costs: new Map(costs.map((c) => [c.product_id, Number(c.cost)])), settings };
  });

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;

  const { stock, costs, settings } = data;
  const products = new Set(stock.map((s) => s.product_id)).size;
  const pcs = stock.reduce((a, s) => a + Math.max(s.stock_qty, 0), 0);
  const valueCost = stock.reduce((a, s) => a + Math.max(s.stock_qty, 0) * (costs.get(s.product_id) ?? 0), 0);
  const valueSale = stock.reduce((a, s) => a + Math.max(s.stock_qty, 0) * Number(s.price), 0);
  const negative = stock.filter((s) => s.stock_qty < 0);
  const low = stock.filter((s) => s.stock_qty >= 0 && s.stock_qty <= settings.low_stock_level);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>ภาพรวมร้าน{settings.shop_name}</h1>
          <p>ยอดขายรายวันจะขึ้นที่นี่เมื่อเปิดใช้หน้าขาย (POS)</p>
        </div>
        <div className="row">
          <Link className="btn" to="/admin/receive">
            รับของเข้า
          </Link>
          <Link className="btn primary" to="/admin/products/new">
            + เพิ่มสินค้า
          </Link>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="k">สินค้า</div>
          <div className="v">{products} รุ่น</div>
          <div className="muted small">{stock.length} รายการ (สี × ไซซ์)</div>
        </div>
        <div className="stat">
          <div className="k">ของในร้าน</div>
          <div className="v">{baht(pcs)} ชิ้น</div>
        </div>
        <div className="stat">
          <div className="k">มูลค่าสต็อก (ราคาทุน)</div>
          <div className="v">฿{baht(valueCost)}</div>
          <div className="muted small">ราคาขาย ฿{baht(valueSale)}</div>
        </div>
        <div className={`stat ${negative.length ? 'alert' : ''}`}>
          <div className="k">สต็อกติดลบ</div>
          <div className="v">{negative.length} รายการ</div>
          <div className="muted small">ใกล้หมด {low.length} รายการ</div>
        </div>
      </div>

      {stock.length === 0 && (
        <div className="card stack">
          <h2>เริ่มต้นใช้งาน</h2>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
            <li>
              เปลี่ยน PIN เริ่มต้นที่หน้า <Link to="/admin/settings">ตั้งค่า</Link> (เข้า POS 1234 / อนุมัติ 0000)
            </li>
            <li>
              เพิ่มซัพพลายเออร์ที่หน้า <Link to="/admin/suppliers">ซัพพลายเออร์</Link>
            </li>
            <li>
              เพิ่มสินค้าทีละรุ่นที่หน้า <Link to="/admin/products/new">เพิ่มสินค้า</Link> หรือหลายรุ่นพร้อมกันที่หน้า{' '}
              <Link to="/admin/import">นำเข้าจาก Excel</Link> พร้อมจำนวนที่นับได้เป็นสต็อกตั้งต้น
            </li>
            <li>
              พิมพ์สติกเกอร์ให้สินค้าที่ไม่มีบาร์โค้ดที่หน้า <Link to="/admin/labels">พิมพ์สติกเกอร์</Link>
            </li>
          </ol>
        </div>
      )}

      {negative.length > 0 && (
        <div className="card">
          <h2>สต็อกติดลบ รอคีย์รับของเข้า</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th>สี</th>
                  <th>ไซซ์</th>
                  <th className="c">คงเหลือ</th>
                </tr>
              </thead>
              <tbody>
                {negative.map((s) => (
                  <tr key={s.variant_id}>
                    <td>
                      <Link to={`/admin/products/${s.product_id}`}>{s.product_name}</Link>
                    </td>
                    <td>{s.color}</td>
                    <td>{sizeDetail(s)}</td>
                    <td className="c">
                      <QtyCell qty={s.stock_qty} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
