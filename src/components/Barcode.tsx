import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export default function Barcode({ value, height = 40, fontSize = 14, width = 1.6 }: { value: string; height?: number; fontSize?: number; width?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, { format: 'CODE128', displayValue: true, fontSize, height, margin: 0, width });
    } catch {
      /* รหัสที่ไม่รองรับจะไม่แสดง */
    }
  }, [value, height, fontSize, width]);
  return <svg ref={ref} />;
}
