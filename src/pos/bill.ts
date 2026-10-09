import { supabase } from '../lib/supabase';

export interface BillSale {
  id: number;
  bill_no: string;
  kind: 'sale' | 'exchange' | 'refund';
  status: 'paid' | 'void';
  member_id: number | null;
  ref_sale_id: number | null;
  subtotal: number;
  item_discount: number;
  promo_discount: number;
  bill_discount: number;
  points_used: number;
  points_discount: number;
  total: number;
  pay_method: string | null;
  cash_received: number | null;
  change_amount: number | null;
  pay_ref: string | null;
  points_earned: number;
  note: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

export interface BillItem {
  id: number;
  variant_id: number;
  product_name: string;
  color: string;
  size_label: string;
  qty: number;
  unit_price: number;
  discount: number;
  promo_discount: number;
  promo_name: string | null;
  line_total: number;
  returned_item_id: number | null;
  return_to_stock: boolean | null;
  returned_qty: number;
}

export interface BillData {
  sale: BillSale;
  ref_bill_no: string | null;
  member: { id: number; nickname: string; phone: string; points: number } | null;
  items: BillItem[];
}

export async function fetchBill(billNo: string): Promise<BillData | null> {
  const { data, error } = await supabase.rpc('get_bill', { p_bill_no: billNo.trim() });
  if (error) throw error;
  return (data as BillData) ?? null;
}

export const PAY_LABEL: Record<string, string> = {
  cash: 'เงินสด',
  promptpay: 'QR พร้อมเพย์',
  transfer: 'โอนเข้าบัญชี',
  card: 'บัตร (EDC)',
  thai_chuay_thai: 'ไทยช่วยไทย',
  none: 'ไม่มีการรับเงิน',
};

export const KIND_LABEL: Record<string, string> = {
  sale: 'ขาย',
  exchange: 'เปลี่ยนสินค้า',
  refund: 'คืนสินค้า',
};
