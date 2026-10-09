import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * พิมพ์ใบเสร็จ: เรนเดอร์เนื้อหาลงพื้นที่พิมพ์แยก แล้วเรียก window.print()
 * ถ้าเปิดเบราว์เซอร์ด้วย --kiosk-printing จะพิมพ์ทันทีโดยไม่ถาม
 */
type PrintFn = (node: ReactNode) => void;
const PrintContext = createContext<PrintFn>(() => {});
export const usePrint = () => useContext(PrintContext);

export function PrintProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<{ id: number; node: ReactNode } | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    if (!job) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      document.body.classList.remove('print-receipt');
      window.removeEventListener('afterprint', finish);
      setJob(null);
    };
    // รอให้บาร์โค้ดและฟอนต์พร้อมก่อน
    const t = window.setTimeout(() => {
      document.body.classList.add('print-receipt');
      window.addEventListener('afterprint', finish);
      window.print();
      window.setTimeout(finish, 1500);
    }, 120);
    return () => window.clearTimeout(t);
  }, [job]);

  const print: PrintFn = (node) => {
    counter.current += 1;
    setJob({ id: counter.current, node });
  };

  return (
    <PrintContext.Provider value={print}>
      {children}
      {job && createPortal(<div id="print-area" key={job.id}>{job.node}</div>, document.body)}
    </PrintContext.Provider>
  );
}
