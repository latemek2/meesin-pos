import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

// หน้าขายจริงจะมาแทนหน้านี้ในขั้นถัดไป
export default function PosHome() {
  const { role, signOut } = useAuth();
  return (
    <div className="login">
      <div className="card">
        <div className="logo">
          <img src="/favicon.svg" alt="" />
          <div>
            <h1>หน้าขาย (POS)</h1>
            <div className="muted small">กำลังสร้างในขั้นถัดไป</div>
          </div>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          ตอนนี้ใช้หลังบ้านเพิ่มสินค้า รับของเข้า และพิมพ์สติกเกอร์ได้แล้ว หน้าขายจะใช้ข้อมูลชุดเดียวกันทันทีที่เสร็จ
        </p>
        {role === 'owner' && (
          <Link className="btn primary lg" to="/admin">
            ไปหลังบ้าน
          </Link>
        )}
        <button className="btn" onClick={signOut}>
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
}
