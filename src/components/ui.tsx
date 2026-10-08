import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/* ---------- แจ้งเตือนมุมล่าง ---------- */
type ToastFn = (msg: string, kind?: 'ok' | 'danger') => void;
const ToastContext = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'danger' } | null>(null);
  const timer = useRef<number>();
  const show = useCallback<ToastFn>((msg, kind = 'ok') => {
    setToast({ msg, kind });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), kind === 'danger' ? 4000 : 2200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast ${toast.kind === 'danger' ? 'danger' : ''}`} role="status">
          {toast.msg}
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

/* ---------- หน้าต่างลอย ---------- */
export function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between">
          <h2>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="ปิด">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Loading({ text = 'กำลังโหลด…' }: { text?: string }) {
  return <div className="empty">{text}</div>;
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="notice danger">{error}</div>;
}

/** ช่องตัวเลขเงินที่จัดรูปแบบให้อ่านง่าย */
export function MoneyInput(props: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      id={props.id}
      className="input num"
      inputMode="decimal"
      value={props.value}
      placeholder={props.placeholder ?? '0'}
      autoFocus={props.autoFocus}
      onChange={(e) => props.onChange(e.target.value.replace(/[^0-9.]/g, ''))}
    />
  );
}

/** ช่องสถานะสต็อกตามจำนวน */
export function QtyCell({ qty, low = 2 }: { qty: number | null | undefined; low?: number }) {
  if (qty === null || qty === undefined) return <div className="qty-cell none">–</div>;
  const cls = qty < 0 ? 'neg' : qty === 0 ? 'zero' : qty <= low ? 'low' : '';
  return <div className={`qty-cell ${cls}`}>{qty}</div>;
}
