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

export const getStock = () =>
  must<StockRow[]>(
    supabase.from('v_stock').select('*').order('product_name').order('color').order('sort_order'),
  );

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
