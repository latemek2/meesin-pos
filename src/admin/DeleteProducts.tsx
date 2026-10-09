import { useState } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { ErrorBox, Modal } from '../components/ui';
import { baht } from '../lib/format';

export interface DeleteResult {
  deleted: number;
  archived: number;
  archived_names: string[];
}

/** ข้อความสรุปหลังลบ */
export function deleteSummary(r: DeleteResult) {
  const parts: string[] = [];
  if (r.deleted) parts.push(`ลบแล้ว ${r.deleted} รุ่น`);
  if (r.archived) parts.push(`ปิดขายแทน ${r.archived} รุ่น เพราะเคยขายหรือรับของแล้ว`);
  return parts.join(' · ') || 'ไม่มีสินค้าที่ลบ';
}

/** ยืนยันก่อนลบสินค้า หนึ่งรุ่นหรือหลายรุ่น */
export function DeleteProductsModal({
  products,
  onClose,
  onDone,
}: {
  products: { id: number; name: string; stock: number }[];
  onClose: () => void;
  onDone: (r: DeleteResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pcs = products.reduce((a, p) => a + Math.max(p.stock, 0), 0);
  const one = products.length === 1;

  async function run() {
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc('delete_products', { p_ids: products.map((p) => p.id) });
    setBusy(false);
    if (error) return setErr(errorText(error));
    onDone(data as DeleteResult);
  }

  return (
    <Modal title={one ? `ลบ ${products[0].name}` : `ลบสินค้า ${products.length} รุ่น`} onClose={onClose}>
      {!one && (
        <div className="stack" style={{ gap: 2, maxHeight: 180, overflowY: 'auto' }}>
          {products.map((p) => (
            <div key={p.id} className="row between small">
              <span>{p.name}</span>
              <span className="muted num">{baht(p.stock)} ชิ้น</span>
            </div>
          ))}
        </div>
      )}
      {pcs > 0 && (
        <div className="notice">
          ยังมีของเหลือในระบบ {baht(pcs)} ชิ้น ถ้าของยังอยู่ในร้าน ลบแล้วจะขายด้วยระบบไม่ได้
        </div>
      )}
      <p className="muted small" style={{ margin: 0 }}>
        สินค้าที่เคยขาย รับของเข้า หรือนับสต็อกแล้ว ระบบจะปิดขายแทนการลบ เพื่อให้บิลเก่าและรายงานกำไรยังถูกต้อง
        สินค้าที่ปิดขายดูได้โดยติ๊ก "แสดงสินค้าที่ปิดขาย" และเปิดขายกลับได้
      </p>
      <ErrorBox error={err} />
      <div className="actions">
        <button type="button" className="btn" onClick={onClose}>
          ยกเลิก
        </button>
        <button type="button" className="btn danger" disabled={busy} onClick={run}>
          {busy ? 'กำลังลบ…' : one ? 'ลบสินค้านี้' : `ลบ ${products.length} รุ่น`}
        </button>
      </div>
    </Modal>
  );
}
