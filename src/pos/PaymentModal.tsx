import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { ErrorBox, Modal } from '../components/ui';
import { baht, baht2, num } from '../lib/format';
import type { Settings } from '../lib/types';
import { cashShortcuts } from './cart';
import { PAY_LABEL } from './bill';
import { promptPayPayload } from './promptpay';

export interface PayInput {
  method: string;
  cash: number | null;
  ref: string | null;
}

/**
 * หน้าต่างชำระเงิน
 * total > 0 = ลูกค้าจ่าย, total < 0 = ร้านคืนเงิน (เลือกได้เฉพาะเงินสดหรือโอน)
 */
export function PaymentModal({
  total,
  settings,
  onClose,
  onConfirm,
}: {
  total: number;
  settings: Settings;
  onClose: () => void;
  onConfirm: (p: PayInput) => Promise<string | null>;
}) {
  const refund = total < 0;
  const amount = Math.abs(total);
  const methods = refund
    ? settings.pay_methods.filter((m) => m === 'cash' || m === 'transfer' || m === 'promptpay')
    : settings.pay_methods;
  const [method, setMethod] = useState(methods[0] ?? 'cash');
  const [cash, setCash] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const received = num(cash);
  const cashOk = method !== 'cash' || refund || (cash !== '' && received >= amount);

  async function confirm() {
    if (!cashOk || busy) return;
    setBusy(true);
    setErr(null);
    const e = await onConfirm({
      method,
      cash: method === 'cash' && !refund ? received : null,
      ref: ref.trim() || null,
    });
    setBusy(false);
    if (e) setErr(e);
  }

  return (
    <Modal title={refund ? 'คืนเงินลูกค้า' : 'ชำระเงิน'} onClose={onClose} wide>
      <div className="pay-layout">
        <div className="stack">
          <div>
            <div className="muted">{refund ? 'ยอดที่ต้องคืน' : 'ยอดที่ต้องชำระ'}</div>
            <div className="bigtotal num">฿{baht2(amount)}</div>
          </div>
          <div className="paygrid">
            {methods.map((m) => (
              <button key={m} type="button" aria-pressed={m === method} onClick={() => setMethod(m)}>
                {PAY_LABEL[m] ?? m}
              </button>
            ))}
          </div>
          {methods.length === 0 && <div className="notice danger">ยังไม่ได้เปิดวิธีชำระเงินที่ใช้ได้ ตั้งค่าที่หลังบ้าน</div>}
        </div>

        <div className="stack">
          {method === 'cash' && !refund && (
            <>
              <label className="field">
                <span>รับเงินมา (บาท)</span>
                <input
                  id="pay-cash"
                  className="input num"
                  style={{ fontSize: '1.6rem', minHeight: 56 }}
                  inputMode="decimal"
                  autoFocus
                  value={cash}
                  onChange={(e) => setCash(e.target.value.replace(/[^0-9.]/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && confirm()}
                />
              </label>
              <div className="row">
                {cashShortcuts(amount).map((v) => (
                  <button key={v} type="button" className="btn lg" onClick={() => setCash(String(v))}>
                    {v === amount ? 'พอดี' : `฿${baht(v)}`}
                  </button>
                ))}
              </div>
              {cash !== '' && (
                <div className={`change-box ${received >= amount ? 'ok' : 'short'}`}>
                  {received >= amount ? (
                    <>
                      เงินทอน <strong className="num">฿{baht2(received - amount)}</strong>
                    </>
                  ) : (
                    <>
                      ยังขาด <strong className="num">฿{baht2(amount - received)}</strong>
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {method === 'cash' && refund && (
            <div className="notice">หยิบเงินสด ฿{baht2(amount)} จากลิ้นชักคืนลูกค้า แล้วกดยืนยัน</div>
          )}
          {method === 'promptpay' && !refund && <PromptPayQR id={settings.promptpay_id} amount={amount} />}
          {method === 'promptpay' && refund && <div className="notice">โอนคืนลูกค้าผ่านพร้อมเพย์ของลูกค้า แล้วกดยืนยัน</div>}
          {method === 'transfer' && (
            <div className="card stack" style={{ gap: 6 }}>
              {refund ? (
                <span>โอนเงินคืนเข้าบัญชีลูกค้า แล้วกดยืนยัน</span>
              ) : settings.bank_account_no ? (
                <>
                  <span className="muted small">ให้ลูกค้าโอนเข้าบัญชี</span>
                  <strong>{settings.bank_name}</strong>
                  <span className="num" style={{ fontSize: '1.4rem', fontWeight: 600 }}>
                    {settings.bank_account_no}
                  </span>
                  <span>{settings.bank_account_name}</span>
                </>
              ) : (
                <span className="muted">ยังไม่ได้ใส่เลขบัญชีร้านที่หน้าตั้งค่าหลังบ้าน</span>
              )}
              <span className="muted small">ตรวจสลิปหรือแจ้งเตือนเงินเข้าก่อนกดยืนยัน</span>
            </div>
          )}
          {method === 'card' && (
            <>
              <div className="notice">รูดหรือแตะบัตรที่เครื่อง EDC ของธนาคาร รอสลิปอนุมัติ แล้วกดยืนยัน</div>
              <label className="field">
                <span>เลขอนุมัติจากสลิป (ไม่บังคับ)</span>
                <input id="pay-ref" className="input num" value={ref} onChange={(e) => setRef(e.target.value)} />
              </label>
            </>
          )}
          {method === 'thai_chuay_thai' && (
            <div className="notice">ให้ลูกค้าสแกนจ่ายผ่านแอปเป๋าตัง ตรวจยอดในแอปถุงเงินของร้าน แล้วกดยืนยัน</div>
          )}

          <ErrorBox error={err} />
          <div className="actions">
            <button type="button" className="btn lg" onClick={onClose}>
              ยกเลิก
            </button>
            <button type="button" className="btn primary lg grow" disabled={!cashOk || busy || !methods.length} onClick={confirm}>
              {busy ? 'กำลังบันทึก…' : refund ? `ยืนยันคืนเงิน ฿${baht2(amount)}` : 'ยืนยันรับเงิน'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function PromptPayQR({ id, amount }: { id: string | null; amount: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current || !id) return;
    QRCode.toCanvas(ref.current, promptPayPayload(id, amount), { margin: 2, width: 260, errorCorrectionLevel: 'M' }).catch(
      () => {},
    );
  }, [id, amount]);
  if (!id) return <div className="notice danger">ยังไม่ได้ใส่เลขพร้อมเพย์ร้านที่หน้าตั้งค่าหลังบ้าน</div>;
  return (
    <div className="stack" style={{ justifyItems: 'center', gap: 6 }}>
      <canvas ref={ref} style={{ background: '#fff', borderRadius: 8 }} />
      <div className="muted small">
        พร้อมเพย์ {id} · ยอด ฿{baht2(amount)}
      </div>
      <div className="muted small">ให้ลูกค้าสแกน ตรวจแจ้งเตือนเงินเข้า แล้วกดยืนยัน</div>
    </div>
  );
}
