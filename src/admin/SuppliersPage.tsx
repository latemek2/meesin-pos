import { useState, type FormEvent } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { getSuppliers, useLoad } from '../lib/data';
import { ErrorBox, Loading, Modal, useToast } from '../components/ui';
import type { Supplier } from '../lib/types';

export default function SuppliersPage() {
  const { data, error, loading, reload } = useLoad(getSuppliers);
  const [edit, setEdit] = useState<Partial<Supplier> | null>(null);
  const toast = useToast();

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>ซัพพลายเออร์</h1>
          <p>ร้านหรือโรงงานที่ส่งของให้ร้าน ใช้เลือกตอนรับของเข้า</p>
        </div>
        <button className="btn primary" onClick={() => setEdit({ active: true })}>
          + เพิ่มซัพพลายเออร์
        </button>
      </div>
      {data.length === 0 ? (
        <div className="card empty">ยังไม่มีซัพพลายเออร์</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th>ผู้ติดต่อ</th>
                <th>เบอร์โทร</th>
                <th>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} className="click" onClick={() => setEdit(s)} style={{ opacity: s.active ? 1 : 0.5 }}>
                  <td>
                    <strong>{s.name}</strong>
                    {!s.active && <span className="badge" style={{ marginLeft: 8 }}>เลิกใช้</span>}
                  </td>
                  <td>{s.contact}</td>
                  <td className="num">{s.phone}</td>
                  <td className="muted">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <SupplierModal
          value={edit}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            setEdit(null);
            toast('บันทึกซัพพลายเออร์แล้ว');
            await reload();
          }}
        />
      )}
    </>
  );
}

function SupplierModal({ value, onClose, onSaved }: { value: Partial<Supplier>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: value.name ?? '',
    contact: value.contact ?? '',
    phone: value.phone ?? '',
    note: value.note ?? '',
    active: value.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setErr('กรุณาใส่ชื่อซัพพลายเออร์');
    setBusy(true);
    const row = {
      name: f.name.trim(),
      contact: f.contact.trim() || null,
      phone: f.phone.trim() || null,
      note: f.note.trim() || null,
      active: f.active,
    };
    const { error } = value.id
      ? await supabase.from('suppliers').update(row).eq('id', value.id)
      : await supabase.from('suppliers').insert(row);
    setBusy(false);
    if (error) setErr(errorText(error));
    else onSaved();
  }

  return (
    <Modal title={value.id ? 'แก้ไขซัพพลายเออร์' : 'เพิ่มซัพพลายเออร์'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>ชื่อร้าน / บริษัท</span>
          <input id="s-name" className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <div className="form-grid">
          <label className="field">
            <span>ผู้ติดต่อ</span>
            <input id="s-contact" className="input" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} />
          </label>
          <label className="field">
            <span>เบอร์โทร</span>
            <input id="s-phone" className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>หมายเหตุ</span>
          <input id="s-note" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
        {value.id && (
          <label className="check">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
            ยังใช้งานอยู่
          </label>
        )}
        <ErrorBox error={err} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
