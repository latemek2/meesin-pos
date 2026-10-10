import { useRegisterSW } from 'virtual:pwa-register/react';

/** ตรวจหาเวอร์ชันใหม่ทุก 30 นาที เพราะหน้าขายเปิดค้างไว้ทั้งวัน */
const CHECK_EVERY = 30 * 60 * 1000;

/**
 * แถบแจ้งเมื่อมีระบบเวอร์ชันใหม่
 * ไม่รีโหลดเอง เพราะถ้ากำลังขายอยู่ บิลที่ยังไม่ชำระจะหาย ให้กดอัปเดตเองตอนว่าง
 */
export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      window.setInterval(() => {
        if (navigator.onLine) reg.update().catch(() => undefined);
      }, CHECK_EVERY);
    },
  });

  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status">
      <span>มีระบบเวอร์ชันใหม่ กดอัปเดตตอนไม่มีบิลค้างอยู่</span>
      <button type="button" className="btn sm primary" onClick={() => updateServiceWorker(true)}>
        อัปเดตเลย
      </button>
      <button type="button" className="btn sm" onClick={() => setNeedRefresh(false)}>
        ภายหลัง
      </button>
    </div>
  );
}
