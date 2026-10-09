import { useCallback, useState } from 'react';
import type { StockRow } from '../lib/types';
import type { BillDiscount, CartLine, Member } from './cart';

/** ตะกร้าของบิลปัจจุบัน */
export function useCart() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [member, setMemberState] = useState<Member | null>(null);
  const [billDiscount, setBillDiscount] = useState<BillDiscount | null>(null);
  const [pointsUsed, setPointsUsed] = useState(0);
  // PIN เจ้าของร้านที่อนุมัติส่วนลดของบิลนี้ เก็บไว้ในหน่วยความจำเท่านั้น
  const [approvedPin, setApprovedPin] = useState<string | null>(null);

  const add = useCallback((row: StockRow, qty = 1) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.row.variant_id === row.variant_id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, row, qty: l.qty + qty } : l));
      return [...ls, { row, qty, discount: 0 }];
    });
  }, []);

  const setQty = useCallback((variantId: number, qty: number) => {
    setLines((ls) =>
      qty <= 0 ? ls.filter((l) => l.row.variant_id !== variantId) : ls.map((l) => (l.row.variant_id === variantId ? { ...l, qty } : l)),
    );
  }, []);

  const setLineDiscount = useCallback((variantId: number, discount: number) => {
    setLines((ls) => ls.map((l) => (l.row.variant_id === variantId ? { ...l, discount } : l)));
  }, []);

  const setMember = useCallback((m: Member | null) => {
    setMemberState(m);
    setPointsUsed(0);
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setMemberState(null);
    setBillDiscount(null);
    setPointsUsed(0);
    setApprovedPin(null);
  }, []);

  /** อัปเดตข้อมูลสต็อกในตะกร้าให้เป็นปัจจุบัน */
  const refreshRows = useCallback((stock: StockRow[]) => {
    const map = new Map(stock.map((s) => [s.variant_id, s]));
    setLines((ls) => ls.map((l) => ({ ...l, row: map.get(l.row.variant_id) ?? l.row })));
  }, []);

  return {
    lines,
    setLines,
    member,
    setMember,
    billDiscount,
    setBillDiscount,
    pointsUsed,
    setPointsUsed,
    approvedPin,
    setApprovedPin,
    add,
    setQty,
    setLineDiscount,
    clear,
    refreshRows,
  };
}

export type Cart = ReturnType<typeof useCart>;
