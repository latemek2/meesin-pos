export type Role = 'owner' | 'pos';
export type SizeType = 'shoe' | 'kid_shoe' | 'apparel' | 'free';

export interface Category {
  id: number;
  name: string;
  size_type: SizeType;
  sort_order: number;
}

export interface Product {
  id: number;
  name: string;
  category_id: number;
  brand: string | null;
  price: number;
  image_url: string | null;
  note: string | null;
  active: boolean;
  created_at: string;
}

export interface Variant {
  id: number;
  product_id: number;
  color: string;
  size_label: string;
  size_eu: string | null;
  size_us: string | null;
  size_uk: string | null;
  size_cm: string | null;
  sort_order: number;
  sku: string;
  barcode: string | null;
  stock_qty: number;
  active: boolean;
}

export interface Supplier {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  note: string | null;
  active: boolean;
}

export interface Settings {
  id: 1;
  shop_name: string;
  address: string | null;
  phone: string | null;
  receipt_header: string;
  receipt_footer: string | null;
  vat_note: string | null;
  promptpay_id: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
  pay_methods: string[];
  baht_per_point: number;
  redeem_points: number;
  redeem_value: number;
  low_stock_level: number;
}

/** แถวจากมุมมอง v_stock (ไม่มีต้นทุน ใช้ได้ทั้ง POS และหลังบ้าน) */
export interface StockRow {
  variant_id: number;
  product_id: number;
  product_name: string;
  brand: string | null;
  category_id: number;
  category_name: string;
  size_type: SizeType;
  price: number;
  image_url: string | null;
  color: string;
  size_label: string;
  size_eu: string | null;
  size_us: string | null;
  size_uk: string | null;
  size_cm: string | null;
  sku: string;
  barcode: string | null;
  stock_qty: number;
  sort_order: number;
}

export const PAY_METHODS: { key: string; label: string }[] = [
  { key: 'cash', label: 'เงินสด' },
  { key: 'promptpay', label: 'QR พร้อมเพย์' },
  { key: 'transfer', label: 'โอนเข้าบัญชี' },
  { key: 'card', label: 'บัตร (EDC)' },
  { key: 'thai_chuay_thai', label: 'ไทยช่วยไทย' },
];

export const SIZE_TYPE_LABEL: Record<SizeType, string> = {
  shoe: 'รองเท้า (EU / US / UK)',
  kid_shoe: 'รองเท้าเด็ก (EU / US / UK / ซม.)',
  apparel: 'เสื้อผ้า (S–XXL)',
  free: 'ฟรีไซซ์',
};
