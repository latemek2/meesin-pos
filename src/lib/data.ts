import { useCallback, useEffect, useState } from 'react';
import { supabase, errorText } from './supabase';
import type { Category, Settings, StockRow, Supplier } from './types';

/** โหลดข้อมูลแบบง่าย พร้อมสถานะกำลังโหลด / ผิดพลาด และฟังก์ชันโหลดใหม่ */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await run());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [run]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

/** เรียก supabase แล้วโยน error ถ้ามี ใช้ร่วมกับ useLoad */
export async function must<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

export const getCategories = () =>
  must<Category[]>(supabase.from('categories').select('*').order('sort_order'));

export const getSettings = () => must<Settings>(supabase.from('settings').select('*').eq('id', 1).single());

export const getSuppliers = () =>
  must<Supplier[]>(supabase.from('suppliers').select('*').order('name'));

/**
 * ดึงทุกแถว ไม่ว่าจะมีกี่แถว
 * Supabase ส่งได้ครั้งละไม่เกิน 1,000 แถว จึงดึงทีละหน้าจนหมด
 * ต้องเรียงลำดับด้วยคอลัมน์ที่ไม่ซ้ำ (เช่น id) ปิดท้ายเสมอ ไม่อย่างนั้นแถวอาจซ้ำหรือหายระหว่างหน้า
 */
export const PAGE_SIZE = 1000;
export async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await must<T[] | null>(query(from, from + PAGE_SIZE - 1));
    const rows = page ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}

export const getStock = () =>
  fetchAll<StockRow>((a, b) =>
    supabase
      .from('v_stock')
      .select('*')
      .order('product_name')
      .order('color')
      .order('sort_order')
      .order('variant_id')
      .range(a, b),
  );

/** ต้นทุนทุกรุ่น (เห็นได้เฉพาะเจ้าของร้าน) */
export const getCosts = () =>
  fetchAll<{ product_id: number; cost: number }>((a, b) =>
    supabase.from('product_costs').select('product_id, cost').order('product_id').range(a, b),
  );

/** ดึงสต็อกเฉพาะบางรายการ ใช้หลังขาย จะได้ไม่ต้องดึงทั้งร้าน */
export const getStockOf = (variantIds: number[]) =>
  must<StockRow[]>(supabase.from('v_stock').select('*').in('variant_id', variantIds));

/** หาสินค้าจากบาร์โค้ดหรือ SKU ที่ยิงหรือพิมพ์มา */
export async function findByCode(code: string): Promise<StockRow | null> {
  const c = code.trim();
  if (!c) return null;
  const { data, error } = await supabase
    .from('v_stock')
    .select('*')
    .or(`barcode.eq.${c},sku.ilike.${c}`)
    .limit(1);
  if (error) throw error;
  return (data?.[0] as StockRow) ?? null;
}
