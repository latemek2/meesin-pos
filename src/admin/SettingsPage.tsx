import { useState, type FormEvent } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { getSettings, useLoad } from '../lib/data';
import { ErrorBox, Loading, useToast } from '../components/ui';
import { PAY_METHODS, type Settings } from '../lib/types';

export default function SettingsPage() {
  const { data, error, loading, reload } = useLoad(getSettings);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>ตั้งค่า</h1>
          <p>ข้อมูลบนใบเสร็จ วิธีรับเงิน แต้มสมาชิก และ PIN</p>
        </div>
      </div>
      <PinCard />
      <ShopForm settings={data} onSaved={reload} />
    </>
  );
}

function ShopForm({ settings, onSaved }: { settings: Settings; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({
    shop_name: settings.shop_name,
    address: settings.address ?? '',
    phone: settings.phone ?? '',
    receipt_header: settings.receipt_header,
    receipt_footer: settings.receipt_footer ?? '',
    vat_note: settings.vat_note ?? '',
    promptpay_id: settings.promptpay_id ?? '',
    bank_name: settings.bank_name ?? '',
    bank_account_name: settings.bank_account_name ?? '',
    bank_account_no: settings.bank_account_no ?? '',
    pay_methods: settings.pay_methods,
    baht_per_point: String(settings.baht_per_point),
    redeem_points: String(settings.redeem_points),
    redeem_value: String(settings.redeem_value),
    low_stock_level: String(settings.low_stock_level),
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const text = (k: keyof typeof f, label: string, opts: { placeholder?: string; inputMode?: 'numeric' | 'decimal' | 'tel'; span?: boolean } = {}) => (
    <label className="field" style={opts.span ? { gridColumn: '1 / -1' } : undefined}>
      <span>{label}</span>
      <input
        id={`set-${k}`}
        className="input"
        inputMode={opts.inputMode}
        placeholder={opts.placeholder}
        value={f[k] as string}
        onChange={(e) => set({ [k]: e.target.value } as Partial<typeof f>)}
      />
    </label>
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!f.pay_methods.length) return setErr('ต้องเปิดใช้วิธีชำระเงินอย่างน้อย 1 วิธี');
    const pp = f.promptpay_id.replace(/[^0-9]/g, '');
    if (pp && !(pp.length === 10 || pp.length === 13)) return setErr('เลขพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน / เลขผู้เสียภาษี 13 หลัก');
    setBusy(true);
    const { error } = await supabase
      .from('settings')
      .update({
        shop_name: f.shop_name.trim() || 'มีศิลป์',
        address: f.address.trim() || null,
        phone: f.phone.trim() || null,
        receipt_header: f.receipt_header.trim() || 'ใบเสร็จรับเงิน',
        receipt_footer: f.receipt_footer.trim() || null,
        vat_note: f.vat_note.trim() || null,
        promptpay_id: pp || null,
        bank_name: f.bank_name.trim() || null,
        bank_account_name: f.bank_account_name.trim() || null,
        bank_account_no: f.bank_account_no.trim() || null,
        pay_methods: f.pay_methods,
        baht_per_point: Number(f.baht_per_point) || 100,
        redeem_points: Number(f.redeem_points) || 100,
        redeem_value: Number(f.redeem_value) || 0,
        low_stock_level: Number(f.low_stock_level) || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    setBusy(false);
    if (error) return setErr(errorText(error));
    toast('บันทึกการตั้งค่าแล้ว');
    await onSaved();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="card stack">
        <h2>ใบเสร็จ</h2>
        <div className="form-grid">
          {text('shop_name', 'ชื่อร้าน')}
          {text('phone', 'เบอร์โทรร้าน (ไม่บังคับ)', { inputMode: 'tel' })}
          {text('address', 'ที่อยู่', { span: true })}
          {text('receipt_header', 'หัวใบเสร็จ')}
          {text('vat_note', 'ข้อความเรื่องภาษี')}
          {text('receipt_footer', 'ข้อความท้ายใบเสร็จ', { span: true })}
        </div>
      </div>

      <div className="card stack">
        <h2>วิธีรับเงิน</h2>
        <div className="row">
          {PAY_METHODS.map((m) => (
            <label key={m.key} className="check" style={{ marginRight: 12 }}>
              <input
                type="checkbox"
                checked={f.pay_methods.includes(m.key)}
                onChange={(e) =>
                  set({
                    pay_methods: e.target.checked
                      ? PAY_METHODS.map((x) => x.key).filter((k) => k === m.key || f.pay_methods.includes(k))
                      : f.pay_methods.filter((k) => k !== m.key),
                  })
                }
              />
              {m.label}
            </label>
          ))}
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          ปิดวิธีที่ไม่ใช้แล้วได้ เช่น ไทยช่วยไทยหลังหมดโครงการ (30 พ.ย. 2569) บิลเก่ายังอยู่ครบ
        </p>
        <div className="form-grid">
          {text('promptpay_id', 'เลขพร้อมเพย์ร้าน (เบอร์มือถือหรือเลข 13 หลัก)', { inputMode: 'numeric' })}
          {text('bank_name', 'ธนาคารสำหรับรับโอน', { placeholder: 'เช่น กสิกรไทย' })}
          {text('bank_account_name', 'ชื่อบัญชี')}
          {text('bank_account_no', 'เลขบัญชี', { inputMode: 'numeric' })}
        </div>
      </div>

      <div className="card stack">
        <h2>แต้มสมาชิกและสต็อก</h2>
        <div className="form-grid">
          {text('baht_per_point', 'ซื้อกี่บาท ได้ 1 แต้ม', { inputMode: 'decimal' })}
          {text('redeem_points', 'ใช้ครั้งละกี่แต้ม', { inputMode: 'numeric' })}
          {text('redeem_value', 'แลกเป็นส่วนลดกี่บาท', { inputMode: 'decimal' })}
          {text('low_stock_level', 'เตือนใกล้หมดเมื่อเหลือไม่เกิน (ชิ้น)', { inputMode: 'numeric' })}
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          ตอนนี้: ซื้อ {f.baht_per_point || '–'} บาท ได้ 1 แต้ม · ใช้ {f.redeem_points || '–'} แต้ม ลด {f.redeem_value || '–'} บาท
        </p>
      </div>

      <ErrorBox error={err} />
      <div>
        <button className="btn primary lg" disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
        </button>
      </div>
    </form>
  );
}

function PinCard() {
  const toast = useToast();
  const [pos, setPos] = useState('');
  const [pos2, setPos2] = useState('');
  const [owner, setOwner] = useState('');
  const [owner2, setOwner2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = (p: string) => /^[0-9]{4,6}$/.test(p);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!pos && !owner) return setErr('ใส่ PIN ใหม่อย่างน้อย 1 ตัว');
    if (pos && (!valid(pos) || pos !== pos2)) return setErr('PIN เข้า POS ต้องเป็นตัวเลข 4–6 หลัก และพิมพ์ซ้ำให้ตรงกัน');
    if (owner && (!valid(owner) || owner !== owner2)) return setErr('PIN อนุมัติต้องเป็นตัวเลข 4–6 หลัก และพิมพ์ซ้ำให้ตรงกัน');
    if (pos && owner && pos === owner) return setErr('PIN สองตัวต้องไม่เหมือนกัน ไม่เช่นนั้นพนักงานจะอนุมัติส่วนลดเองได้');
    setBusy(true);
    const { error } = await supabase.rpc('set_pins', { p_pos_pin: pos || null, p_owner_pin: owner || null });
    setBusy(false);
    if (error) return setErr(errorText(error));
    setPos('');
    setPos2('');
    setOwner('');
    setOwner2('');
    toast('เปลี่ยน PIN แล้ว');
  }

  const pinInput = (id: string, v: string, on: (s: string) => void, label: string) => (
    <label className="field">
      <span>{label}</span>
      <input
        id={id}
        className="input num"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        value={v}
        onChange={(e) => on(e.target.value.replace(/\D/g, ''))}
      />
    </label>
  );

  return (
    <form className="card stack" onSubmit={submit}>
      <div>
        <h2>PIN</h2>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          PIN เริ่มต้นคือ เข้า POS <strong>1234</strong> และอนุมัติ <strong>0000</strong> ควรเปลี่ยนก่อนเปิดใช้จริง
        </p>
      </div>
      <div className="form-grid">
        {pinInput('pin-pos', pos, setPos, 'PIN เข้า POS ใหม่ (พนักงานใช้)')}
        {pinInput('pin-pos2', pos2, setPos2, 'พิมพ์ PIN เข้า POS ซ้ำ')}
        {pinInput('pin-owner', owner, setOwner, 'PIN อนุมัติใหม่ (เจ้าของร้านเท่านั้น)')}
        {pinInput('pin-owner2', owner2, setOwner2, 'พิมพ์ PIN อนุมัติซ้ำ')}
      </div>
      <ErrorBox error={err} />
      <div>
        <button className="btn primary" disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'เปลี่ยน PIN'}
        </button>
      </div>
    </form>
  );
}
