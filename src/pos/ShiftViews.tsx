import { useEffect, useState } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { ErrorBox, Loading, useToast } from '../components/ui';
import { baht, baht2, num } from '../lib/format';
import type { Settings } from '../lib/types';
import { PAY_LABEL } from './bill';
import { usePrint } from './print';
import { ShiftSlip, type ShiftSummary } from './Receipt';

/* ---------- เปิดร้าน ---------- */
export function OpenShift({ settings, onOpened, onLock }: { settings: Settings; onOpened: () => void; onLock: () => void }) {
  const [cash, setCash] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function open() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc('open_shift', { p_opening_cash: num(cash) });
    setBusy(false);
    if (error) setErr(errorText(error));
    else onOpened();
  }
  return (
    <div className="login">
      <div className="card" style={{ width: 'min(440px, 100%)' }}>
        <div className="logo">
          <img src="/favicon.svg" alt="" />
          <div>
            <h1>เปิดร้าน{settings.shop_name}</h1>
            <div className="muted small">{new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
        </div>
        <label className="field">
          <span>เงินทอนตั้งต้นในลิ้นชัก (บาท)</span>
          <input
            id="open-cash"
            className="input num"
            style={{ fontSize: '1.6rem', minHeight: 56 }}
            inputMode="decimal"
            autoFocus
            placeholder="0"
            value={cash}
            onChange={(e) => setCash(e.target.value.replace(/[^0-9.]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && open()}
          />
        </label>
        <div className="row">
          {[0, 500, 1000, 2000].map((v) => (
            <button key={v} type="button" className="btn" onClick={() => setCash(String(v))}>
              ฿{baht(v)}
            </button>
          ))}
        </div>
        <ErrorBox error={err} />
        <button type="button" className="btn primary lg" disabled={busy} onClick={open}>
          {busy ? 'กำลังเปิดร้าน…' : 'เปิดร้าน เริ่มขาย'}
        </button>
        <button type="button" className="btn ghost" onClick={onLock}>
          ล็อกหน้าจอ
        </button>
      </div>
    </div>
  );
}

/* ---------- ปิดยอด ---------- */
const DENOMS = [1000, 500, 100, 50, 20, 10, 5, 2, 1];

export function CloseShiftView({ settings, onClosed, onCancel }: { settings: Settings; onClosed: () => void; onCancel: () => void }) {
  const toast = useToast();
  const print = usePrint();
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [extra, setExtra] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    supabase.rpc('shift_summary').then(({ data, error }) => {
      if (error) setErr(errorText(error));
      else setSummary(data as ShiftSummary);
    });
  }, []);

  if (!summary) return err ? <div className="exchange"><ErrorBox error={err} /></div> : <Loading />;

  const counted = DENOMS.reduce((a, d) => a + d * (Number(counts[d]) || 0), 0) + num(extra);
  const anyCount = Object.values(counts).some((v) => v !== '') || extra !== '';
  const diff = Math.round((counted - Number(summary.expected_cash)) * 100) / 100;

  async function close() {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    setBusy(true);
    setErr(null);
    const denoms = Object.fromEntries(DENOMS.filter((d) => counts[d]).map((d) => [d, Number(counts[d])]));
    if (num(extra)) Object.assign(denoms, { coins_other: num(extra) });
    const { data, error } = await supabase.rpc('close_shift', {
      p_counted_cash: counted,
      p_denominations: denoms,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) {
      setConfirmed(false);
      return setErr(errorText(error));
    }
    print(<ShiftSlip summary={data as ShiftSummary} settings={settings} note={note.trim() || undefined} />);
    toast('ปิดยอดเรียบร้อย');
    onClosed();
  }

  return (
    <div className="exchange">
      <section className="card stack">
        <h2>สรุปยอดรอบนี้</h2>
        <div className="muted small">
          เปิดร้าน {new Date(summary.opened_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
          {summary.bills} บิล · ยกเลิก {summary.void_bills} บิล
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>วิธีชำระ</th>
                <th className="r">บิล</th>
                <th className="r">ยอด (บาท)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.methods).map(([k, v]) => (
                <tr key={k}>
                  <td>{PAY_LABEL[k] ?? k}</td>
                  <td className="r num">{v.bills}</td>
                  <td className="r num">{baht2(v.total)}</td>
                </tr>
              ))}
              {Object.keys(summary.methods).length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    ยังไม่มียอดขายในรอบนี้
                  </td>
                </tr>
              )}
              <tr>
                <td>
                  <strong>ยอดสุทธิ</strong>
                </td>
                <td />
                <td className="r num">
                  <strong>{baht2(summary.net_total)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="r-list">
          <div className="row between">
            <span>เงินทอนตั้งต้น</span>
            <span className="num">{baht2(summary.opening_cash)}</span>
          </div>
          <div className="row between">
            <strong>เงินสดที่ควรมีในลิ้นชัก</strong>
            <strong className="num">฿{baht2(summary.expected_cash)}</strong>
          </div>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          โอน บัตร พร้อมเพย์ และไทยช่วยไทย ให้เทียบกับแอปธนาคาร สลิป EDC และแอปถุงเงิน
        </p>
      </section>

      <section className="card stack">
        <h2>นับเงินในลิ้นชัก</h2>
        <div className="denoms">
          {DENOMS.map((d) => (
            <label key={d} className="denom">
              <span className="num">{d >= 20 ? `แบงก์ ${baht(d)}` : `เหรียญ ${d}`}</span>
              <input
                className="input num"
                inputMode="numeric"
                placeholder="0"
                aria-label={`จำนวน ${d} บาท`}
                value={counts[d] ?? ''}
                onChange={(e) => setCounts((c) => ({ ...c, [d]: e.target.value.replace(/\D/g, '') }))}
              />
              <span className="num muted">{baht(d * (Number(counts[d]) || 0))}</span>
            </label>
          ))}
          <label className="denom">
            <span>เศษสตางค์ / อื่น ๆ</span>
            <input
              className="input num"
              inputMode="decimal"
              placeholder="0"
              value={extra}
              onChange={(e) => setExtra(e.target.value.replace(/[^0-9.]/g, ''))}
            />
            <span />
          </label>
        </div>
        <div className="cart-sum" style={{ padding: 0, border: 0 }}>
          <div className="r">
            <span>นับได้</span>
            <span className="num">฿{baht2(counted)}</span>
          </div>
          <div className={`r grand ${!anyCount ? '' : diff < 0 ? 'danger-text' : diff > 0 ? 'warn-text' : 'ok-text'}`}>
            <span>{!anyCount ? 'ยังไม่ได้นับ' : diff < 0 ? 'เงินขาด' : diff > 0 ? 'เงินเกิน' : 'ตรงยอด'}</span>
            <span className="num">฿{baht2(Math.abs(diff))}</span>
          </div>
        </div>
        <label className="field">
          <span>หมายเหตุ (ถ้าเงินขาดหรือเกิน)</span>
          <input id="close-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <ErrorBox error={err} />
        <div className="actions">
          <button type="button" className="btn lg" onClick={onCancel}>
            กลับหน้าขาย
          </button>
          <button type="button" className={`btn lg grow ${confirmed ? 'danger' : 'primary'}`} disabled={busy || !anyCount} onClick={close}>
            {busy ? 'กำลังปิดยอด…' : confirmed ? 'แตะอีกครั้งเพื่อยืนยันปิดยอด' : 'ปิดยอดและพิมพ์สรุป'}
          </button>
        </div>
      </section>
    </div>
  );
}
