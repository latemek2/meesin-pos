import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { ErrorBox, Modal } from '../components/ui';

/** แป้นตัวเลขใส่ PIN 4–6 หลัก ใช้ได้ทั้งจอสัมผัสและคีย์บอร์ด */
export function PinPad({ onSubmit, label = 'ตกลง' }: { onSubmit: (pin: string) => Promise<boolean>; label?: string }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const pinRef = useRef('');
  pinRef.current = pin;

  const submit = useCallback(async () => {
    const p = pinRef.current;
    if (p.length < 4 || busy) return;
    setBusy(true);
    const ok = await onSubmit(p);
    setBusy(false);
    if (!ok) setPin('');
  }, [onSubmit, busy]);

  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (/^[0-9]$/.test(e.key)) setPin((p) => (p.length < 6 ? p + e.key : p));
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter') submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submit]);

  const press = (d: string) => setPin((p) => (p.length < 6 ? p + d : p));

  return (
    <div className="stack" style={{ justifyItems: 'center' }}>
      <div className="pindots" aria-label={`ใส่แล้ว ${pin.length} หลัก`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <div className="pinpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" className="soft" onClick={() => setPin('')}>
          ล้าง
        </button>
        <button type="button" onClick={() => press('0')}>
          0
        </button>
        <button type="button" className="soft" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="ลบ">
          ⌫
        </button>
      </div>
      <button type="button" className="btn primary lg" style={{ width: 236 }} disabled={pin.length < 4 || busy} onClick={submit}>
        {busy ? 'กำลังตรวจ…' : label}
      </button>
    </div>
  );
}

/** หน้าต่างให้เจ้าของร้านใส่ PIN อนุมัติ */
export function OwnerPinModal({ title, detail, onDone }: { title: string; detail?: string; onDone: (pin: string | null) => void }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={title} onClose={() => onDone(null)}>
      <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
        {detail ?? 'ให้เจ้าของร้านใส่ PIN อนุมัติ'}
      </p>
      <PinPad
        label="อนุมัติ"
        onSubmit={async (pin) => {
          const { data, error } = await supabase.rpc('verify_owner_pin', { p_pin: pin });
          if (error) {
            setErr(errorText(error));
            return false;
          }
          if (!data) {
            setErr('PIN อนุมัติไม่ถูกต้อง');
            return false;
          }
          onDone(pin);
          return true;
        }}
      />
      <ErrorBox error={err} />
    </Modal>
  );
}
