import { useEffect, useState } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { ErrorBox, Modal } from '../components/ui';
import { baht, baht2, num } from '../lib/format';
import { sizeDetail } from '../lib/sizes';
import type { Settings } from '../lib/types';
import { r2, type BillDiscount, type Member, type PricedLine } from './cart';

/* ---------- สมาชิก ---------- */
export function MemberModal({ onPick, onClose }: { onPick: (m: Member) => void; onClose: () => void }) {
  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<Member[] | null>(null);
  const [nickname, setNickname] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const digits = phone.replace(/\D/g, '');

  useEffect(() => {
    if (digits.length < 4) {
      setFound(null);
      return;
    }
    let alive = true;
    const t = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from('members')
        .select('id, phone, nickname, points')
        .like('phone', `%${digits}%`)
        .order('nickname')
        .limit(8);
      if (!alive) return;
      if (error) setErr(errorText(error));
      else setFound((data as Member[]) ?? []);
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [digits]);

  async function create() {
    setErr(null);
    if (!/^0[0-9]{8,9}$/.test(digits)) return setErr('เบอร์โทรต้องขึ้นต้นด้วย 0 และยาว 9–10 หลัก');
    if (!nickname.trim()) return setErr('กรุณาใส่ชื่อเล่น');
    if (!consent) return setErr('ต้องได้รับความยินยอมจากลูกค้าก่อนเก็บข้อมูล');
    setBusy(true);
    const { data, error } = await supabase.rpc('create_member', { p_phone: digits, p_nickname: nickname.trim() });
    setBusy(false);
    if (error) return setErr(errorText(error));
    onPick(data as Member);
  }

  const exact = found?.find((m) => m.phone === digits);

  return (
    <Modal title="สมาชิก" onClose={onClose}>
      <label className="field">
        <span>เบอร์โทรลูกค้า</span>
        <input
          id="member-phone"
          className="input num"
          style={{ fontSize: '1.4rem', minHeight: 52 }}
          inputMode="tel"
          autoFocus
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^0-9-\s]/g, ''))}
          placeholder="08x-xxx-xxxx"
        />
      </label>
      {found && found.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          {found.map((m) => (
            <button key={m.id} type="button" className="btn lg" style={{ justifyContent: 'space-between' }} onClick={() => onPick(m)}>
              <span>
                <strong>{m.nickname}</strong> <span className="muted num">{m.phone}</span>
              </span>
              <span className="badge ok">{m.points} แต้ม</span>
            </button>
          ))}
        </div>
      )}
      {found && !exact && digits.length >= 9 && (
        <div className="card stack" style={{ background: 'var(--bg)' }}>
          <strong>ยังไม่เป็นสมาชิก สมัครใหม่</strong>
          <label className="field">
            <span>ชื่อเล่น</span>
            <input id="member-nick" className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </label>
          <label className="check small">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            ลูกค้ายินยอมให้ร้านเก็บชื่อเล่นและเบอร์โทร เพื่อสะสมแต้ม
          </label>
          <button type="button" className="btn primary lg" disabled={busy} onClick={create}>
            {busy ? 'กำลังบันทึก…' : 'สมัครและใช้กับบิลนี้'}
          </button>
        </div>
      )}
      {found && found.length === 0 && digits.length < 9 && <p className="muted">ไม่พบเบอร์นี้ พิมพ์เบอร์ให้ครบเพื่อสมัครใหม่</p>}
      <ErrorBox error={err} />
    </Modal>
  );
}

/* ---------- แก้รายการในตะกร้า ---------- */
export function LineModal({
  line,
  onQty,
  onDiscount,
  onRemove,
  onClose,
}: {
  line: PricedLine;
  onQty: (q: number) => void;
  onDiscount: (amount: number) => Promise<boolean>;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'baht' | 'pct'>('baht');
  const [value, setValue] = useState(line.discount ? String(line.discount) : '');
  const max = r2(line.gross - line.promo);
  const amount = r2(Math.min(mode === 'pct' ? (max * num(value)) / 100 : num(value), max));

  return (
    <Modal title={line.row.product_name} onClose={onClose}>
      <div className="muted" style={{ marginTop: -8 }}>
        {line.row.color} · {sizeDetail(line.row)} · ฿{baht(line.row.price)} / ชิ้น
      </div>
      <div className="row between">
        <span>จำนวน</span>
        <div className="qtybox big">
          <button type="button" onClick={() => onQty(line.qty - 1)} aria-label="ลด">
            −
          </button>
          <span className="num">{line.qty}</span>
          <button type="button" onClick={() => onQty(line.qty + 1)} aria-label="เพิ่ม">
            +
          </button>
        </div>
      </div>
      {line.promo > 0 && (
        <div className="notice ok">
          โปรโมชัน {line.promoName} ลด ฿{baht2(line.promo)}
        </div>
      )}
      <div className="stack" style={{ gap: 8 }}>
        <div className="row between">
          <strong>ส่วนลดรายการนี้</strong>
          <div className="seg">
            <button type="button" aria-pressed={mode === 'baht'} onClick={() => setMode('baht')}>
              บาท
            </button>
            <button type="button" aria-pressed={mode === 'pct'} onClick={() => setMode('pct')}>
              %
            </button>
          </div>
        </div>
        <input
          id="line-disc"
          className="input num"
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
        />
        <div className="muted small">
          ลด ฿{baht2(amount)} · เหลือ ฿{baht2(max - amount)} · ต้องใช้ PIN เจ้าของร้าน
        </div>
      </div>
      <div className="actions">
        <button type="button" className="btn danger" onClick={onRemove}>
          ลบรายการ
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={async () => {
            if (amount === line.discount) return onClose();
            if (await onDiscount(amount)) onClose();
          }}
        >
          บันทึกส่วนลด
        </button>
      </div>
    </Modal>
  );
}

/* ---------- ส่วนลดท้ายบิล ---------- */
export function BillDiscountModal({
  base,
  current,
  onSave,
  onClose,
}: {
  base: number;
  current: BillDiscount | null;
  onSave: (d: BillDiscount | null) => Promise<boolean>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'baht' | 'pct'>(current?.mode ?? 'baht');
  const [value, setValue] = useState(current ? String(current.value) : '');
  const v = num(value);
  const amount = r2(Math.min(mode === 'pct' ? (base * Math.min(v, 100)) / 100 : v, base));
  return (
    <Modal title="ส่วนลดท้ายบิล" onClose={onClose}>
      <div className="row between">
        <span className="muted">ยอดหลังหักส่วนลดรายการ ฿{baht2(base)}</span>
        <div className="seg">
          <button type="button" aria-pressed={mode === 'baht'} onClick={() => setMode('baht')}>
            บาท
          </button>
          <button type="button" aria-pressed={mode === 'pct'} onClick={() => setMode('pct')}>
            %
          </button>
        </div>
      </div>
      <input
        id="bill-disc"
        className="input num"
        style={{ fontSize: '1.4rem', minHeight: 52 }}
        inputMode="decimal"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
      />
      <div className="muted">
        ลด ฿{baht2(amount)} · ต้องใช้ PIN เจ้าของร้าน
      </div>
      <div className="actions">
        {current && (
          <button type="button" className="btn danger" onClick={() => onSave(null).then((ok) => ok && onClose())}>
            ยกเลิกส่วนลด
          </button>
        )}
        <button
          type="button"
          className="btn primary"
          disabled={v <= 0}
          onClick={() => onSave({ mode, value: v }).then((ok) => ok && onClose())}
        >
          ใช้ส่วนลด
        </button>
      </div>
    </Modal>
  );
}

/* ---------- ใช้แต้ม ---------- */
export function PointsModal({
  member,
  settings,
  maxBaht,
  current,
  onSave,
  onClose,
}: {
  member: Member;
  settings: Settings;
  maxBaht: number;
  current: number;
  onSave: (points: number) => void;
  onClose: () => void;
}) {
  const step = settings.redeem_points;
  const value = Number(settings.redeem_value);
  const maxSteps = Math.min(Math.floor(member.points / step), value > 0 ? Math.floor(maxBaht / value) : 0);
  const options = Array.from({ length: maxSteps }, (_, i) => (i + 1) * step);
  return (
    <Modal title={`ใช้แต้ม · ${member.nickname} มี ${member.points} แต้ม`} onClose={onClose}>
      <p className="muted" style={{ margin: 0 }}>
        ใช้ครั้งละ {step} แต้ม = ลด ฿{baht(value)}
      </p>
      {options.length === 0 ? (
        <div className="notice">แต้มยังไม่พอใช้ หรือยอดบิลน้อยกว่าส่วนลดขั้นต่ำ</div>
      ) : (
        <div className="paygrid">
          {options.slice(0, 12).map((p) => (
            <button key={p} type="button" aria-pressed={p === current} onClick={() => (onSave(p), onClose())}>
              {p} แต้ม
              <br />
              <small>ลด ฿{baht((p / step) * value)}</small>
            </button>
          ))}
        </div>
      )}
      <div className="actions">
        {current > 0 && (
          <button type="button" className="btn danger" onClick={() => (onSave(0), onClose())}>
            ไม่ใช้แต้ม
          </button>
        )}
        <button type="button" className="btn" onClick={onClose}>
          ปิด
        </button>
      </div>
    </Modal>
  );
}

/* ---------- พักบิล ---------- */
export function HoldModal({ onSave, onClose }: { onSave: (name: string) => Promise<string | null>; onClose: () => void }) {
  const [name, setName] = useState(
    `บิล ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="พักบิล" onClose={onClose}>
      <label className="field">
        <span>ตั้งชื่อให้จำได้ เช่น ลูกค้าเสื้อแดง</span>
        <input id="hold-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <ErrorBox error={err} />
      <div className="actions">
        <button type="button" className="btn" onClick={onClose}>
          ยกเลิก
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            const e = await onSave(name.trim());
            setBusy(false);
            if (e) setErr(e);
          }}
        >
          พักบิล
        </button>
      </div>
    </Modal>
  );
}
