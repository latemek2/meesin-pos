import { useState, type FormEvent } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { fetchAll, must, useLoad } from '../lib/data';
import { ErrorBox, Loading, Modal, useToast } from '../components/ui';
import { SIZE_TYPE_LABEL, type Category, type SizeType } from '../lib/types';

const SIZE_TYPES = Object.keys(SIZE_TYPE_LABEL) as SizeType[];

interface Row extends Category {
  products: number;
}

export default function CategoriesPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(async () => {
    const [cats, products] = await Promise.all([
      must<Category[]>(supabase.from('categories').select('*').order('sort_order').order('id')),
      fetchAll<{ category_id: number }>((a, b) => supabase.from('products').select('category_id').order('id').range(a, b)),
    ]);
    return cats.map((c) => ({ ...c, products: products.filter((p) => p.category_id === c.id).length })) as Row[];
  });
  const [edit, setEdit] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;

  async function move(i: number, dir: -1 | 1) {
    const list = data!.slice();
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setBusy(true);
    const results = await Promise.all(
      list.map((c, k) => (c.sort_order === k + 1 ? null : supabase.from('categories').update({ sort_order: k + 1 }).eq('id', c.id))),
    );
    setBusy(false);
    const err = results.find((r) => r?.error)?.error;
    if (err) toast(errorText(err), 'danger');
    await reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>หมวดหมู่สินค้า</h1>
          <p>ลำดับในหน้านี้คือลำดับของแถบหมวดในหน้าขาย</p>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>
          + เพิ่มหมวดหมู่
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="c">ลำดับ</th>
              <th>ชื่อหมวด</th>
              <th>ชนิดไซซ์</th>
              <th className="r">สินค้า</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((c, i) => (
              <tr key={c.id}>
                <td className="c" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn sm ghost" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`เลื่อน ${c.name} ขึ้น`}>
                    ↑
                  </button>
                  <button
                    className="btn sm ghost"
                    disabled={busy || i === data.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={`เลื่อน ${c.name} ลง`}
                  >
                    ↓
                  </button>
                </td>
                <td>
                  <strong>{c.name}</strong>
                </td>
                <td className="muted">{SIZE_TYPE_LABEL[c.size_type]}</td>
                <td className="r num">{c.products} รุ่น</td>
                <td className="r" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn sm" onClick={() => setEdit(c)}>
                    แก้ไข
                  </button>{' '}
                  <button className="btn sm danger" onClick={() => setDel(c)}>
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  ยังไม่มีหมวดหมู่
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        ชนิดไซซ์ใช้ตอนสร้างสีและไซซ์ของสินค้าใหม่ในหมวดนั้น เปลี่ยนแล้วไม่กระทบสินค้าที่มีอยู่
      </p>

      {(adding || edit) && (
        <CategoryModal
          value={edit}
          nextOrder={(data[data.length - 1]?.sort_order ?? 0) + 1}
          onClose={() => (setAdding(false), setEdit(null))}
          onSaved={async (msg) => {
            setAdding(false);
            setEdit(null);
            toast(msg);
            await reload();
          }}
        />
      )}
      {del && (
        <DeleteModal
          cat={del}
          onClose={() => setDel(null)}
          onDone={async () => {
            setDel(null);
            toast(`ลบหมวด ${del.name} แล้ว`);
            await reload();
          }}
        />
      )}
    </>
  );
}

function CategoryModal({
  value,
  nextOrder,
  onClose,
  onSaved,
}: {
  value: Row | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = useState(value?.name ?? '');
  const [type, setType] = useState<SizeType>(value?.size_type ?? 'shoe');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr('กรุณาใส่ชื่อหมวด');
    setBusy(true);
    const { error } = value
      ? await supabase.from('categories').update({ name: name.trim(), size_type: type }).eq('id', value.id)
      : await supabase.from('categories').insert({ name: name.trim(), size_type: type, sort_order: nextOrder });
    setBusy(false);
    if (error) return setErr(error.message.includes('duplicate') ? 'มีหมวดชื่อนี้อยู่แล้ว' : errorText(error));
    onSaved(value ? 'บันทึกหมวดหมู่แล้ว' : `เพิ่มหมวด ${name.trim()} แล้ว`);
  }

  return (
    <Modal title={value ? `แก้ไขหมวด ${value.name}` : 'เพิ่มหมวดหมู่'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>ชื่อหมวด</span>
          <input id="cat-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น กระเป๋า" />
        </label>
        <label className="field">
          <span>ชนิดไซซ์</span>
          <select id="cat-type" className="input" value={type} onChange={(e) => setType(e.target.value as SizeType)}>
            {SIZE_TYPES.map((t) => (
              <option key={t} value={t}>
                {SIZE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        {value && value.products > 0 && type !== value.size_type && (
          <div className="notice">สินค้า {value.products} รุ่นที่มีอยู่ยังใช้ไซซ์เดิม ชนิดใหม่ใช้กับสีไซซ์ที่สร้างหลังจากนี้</div>
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

function DeleteModal({ cat, onClose, onDone }: { cat: Row; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function remove() {
    setBusy(true);
    const { error } = await supabase.from('categories').delete().eq('id', cat.id);
    setBusy(false);
    if (!error) return onDone();
    setErr(
      error.message.includes('promotion_targets')
        ? 'หมวดนี้ถูกใช้ในโปรโมชัน ลบโปรโมชันนั้นก่อน'
        : error.message.includes('products')
          ? 'หมวดนี้ยังมีสินค้าอยู่ ย้ายสินค้าไปหมวดอื่นก่อน'
          : errorText(error),
    );
  }
  return (
    <Modal title={`ลบหมวด ${cat.name}`} onClose={onClose}>
      {cat.products > 0 ? (
        <>
          <div className="notice">
            หมวดนี้ยังมีสินค้า {cat.products} รุ่น ลบไม่ได้ เปิดสินค้าแต่ละรุ่นแล้วเปลี่ยนหมวดก่อน หรือปิดขายสินค้าแทนการลบหมวด
          </div>
          <div className="actions">
            <button className="btn" onClick={onClose}>
              ปิด
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ margin: 0 }}>หมวดนี้ไม่มีสินค้าแล้ว ลบได้เลย</p>
          <ErrorBox error={err} />
          <div className="actions">
            <button className="btn" onClick={onClose}>
              ยกเลิก
            </button>
            <button className="btn danger" disabled={busy} onClick={remove}>
              {busy ? 'กำลังลบ…' : 'ลบหมวดนี้'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
