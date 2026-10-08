import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const LINKS = [
  { to: '/admin', label: 'ภาพรวม', end: true },
  { group: 'สินค้าและสต็อก' },
  { to: '/admin/products', label: 'สินค้า' },
  { to: '/admin/receive', label: 'รับของเข้า' },
  { to: '/admin/labels', label: 'พิมพ์สติกเกอร์บาร์โค้ด' },
  { to: '/admin/suppliers', label: 'ซัพพลายเออร์' },
  { soon: 'นับสต็อก' },
  { group: 'การขาย' },
  { soon: 'บิลขาย' },
  { soon: 'สมาชิก' },
  { soon: 'โปรโมชัน' },
  { soon: 'รายงาน' },
  { group: 'ร้าน' },
  { to: '/admin/settings', label: 'ตั้งค่า' },
] as const;

export default function AdminLayout() {
  const { displayName, session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  return (
    <div className="admin">
      <div className="mobile-bar no-print">
        <button className="btn sm" onClick={() => setOpen(true)} aria-label="เปิดเมนู">
          ☰ เมนู
        </button>
        <strong>มีศิลป์ · หลังบ้าน</strong>
      </div>
      <nav className={`side no-print ${open ? 'open' : ''}`} onClick={() => setOpen(false)} key={loc.pathname}>
        <div className="brand">
          <strong>มีศิลป์</strong>
          <span>ระบบหลังบ้าน</span>
        </div>
        {LINKS.map((l, i) => {
          if ('group' in l) return <div key={i} className="group">{l.group}</div>;
          if ('soon' in l)
            return (
              <div key={i} className="soon" title="อยู่ในขั้นถัดไป">
                {l.soon} <small>เร็ว ๆ นี้</small>
              </div>
            );
          return (
            <NavLink key={l.to} to={l.to} end={'end' in l ? l.end : false}>
              {l.label}
            </NavLink>
          );
        })}
        <div className="foot">
          <a href="/pos" style={{ padding: '6px 2px' }}>
            ไปหน้าขาย (POS) →
          </a>
          <div className="small" style={{ opacity: 0.7 }}>
            {displayName ?? session?.user.email}
          </div>
          <button className="btn sm" onClick={signOut}>
            ออกจากระบบ
          </button>
        </div>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
