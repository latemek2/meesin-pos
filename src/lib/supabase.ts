import { createClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '../config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** แปลง error จากฐานข้อมูลเป็นข้อความภาษาไทยที่อ่านรู้เรื่อง */
export function errorText(err: unknown): string {
  const msg =
    typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  if (msg.includes('Invalid login credentials')) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ลองตรวจสัญญาณแล้วลองใหม่';
  if (msg.includes('duplicate key') && msg.includes('barcode')) return 'บาร์โค้ดนี้ถูกใช้กับสินค้าอื่นแล้ว';
  if (msg.includes('duplicate key') && msg.includes('sku')) return 'รหัส SKU นี้ซ้ำกับสินค้าอื่น';
  if (msg.includes('duplicate key') && msg.includes('product_id_color_size_label')) return 'มีสีและไซซ์นี้ในสินค้าอยู่แล้ว';
  if (msg.includes('duplicate key')) return 'ข้อมูลนี้มีอยู่แล้ว';
  if (msg.includes('row-level security') || msg.includes('permission denied')) return 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้';
  return msg;
}
