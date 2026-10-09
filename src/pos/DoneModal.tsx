import { useState } from 'react';
import { Modal } from '../components/ui';
import { baht2 } from '../lib/format';
import type { Settings } from '../lib/types';
import { usePrint } from './print';
import { Receipt } from './Receipt';
import type { BillData } from './bill';

const AUTO_KEY = 'meesin.pos.autoprint';
export function getAutoPrint() {
  try {
    return localStorage.getItem(AUTO_KEY) !== '0';
  } catch {
    return true;
  }
}

/** หลังบันทึกบิลสำเร็จ: แสดงเงินทอนตัวใหญ่ และปุ่มพิมพ์ใบเสร็จ */
export function DoneModal({ bill, settings, onClose }: { bill: BillData; settings: Settings; onClose: () => void }) {
  const print = usePrint();
  const [auto, setAuto] = useState(getAutoPrint);
  const s = bill.sale;
  return (
    <Modal title={`บันทึกบิล ${s.bill_no} แล้ว`} onClose={onClose}>
      <div className="done-hero">
        {s.pay_method === 'cash' && s.total > 0 ? (
          <>
            <div className="muted">เงินทอน</div>
            <div className="bigtotal num">฿{baht2(s.change_amount ?? 0)}</div>
            <div className="muted small num">
              รับมา ฿{baht2(s.cash_received ?? 0)} · ยอด ฿{baht2(s.total)}
            </div>
          </>
        ) : s.total < 0 ? (
          <>
            <div className="muted">คืนเงินลูกค้า</div>
            <div className="bigtotal num">฿{baht2(-s.total)}</div>
          </>
        ) : (
          <>
            <div className="muted">ยอดชำระ</div>
            <div className="bigtotal num">฿{baht2(s.total)}</div>
          </>
        )}
        {bill.member && s.points_earned > 0 && (
          <div className="badge ok" style={{ fontSize: '0.9rem' }}>
            {bill.member.nickname} ได้ {s.points_earned} แต้ม · คงเหลือ {bill.member.points}
          </div>
        )}
      </div>
      <label className="check small">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => {
            setAuto(e.target.checked);
            try {
              localStorage.setItem(AUTO_KEY, e.target.checked ? '1' : '0');
            } catch {
              /* ไม่เป็นไร */
            }
          }}
        />
        พิมพ์ใบเสร็จอัตโนมัติทุกบิล
      </label>
      <div className="actions">
        <button type="button" className="btn lg" onClick={() => print(<Receipt bill={bill} settings={settings} />)}>
          พิมพ์ใบเสร็จ
        </button>
        <button type="button" className="btn primary lg" autoFocus onClick={onClose}>
          เริ่มบิลใหม่
        </button>
      </div>
    </Modal>
  );
}
