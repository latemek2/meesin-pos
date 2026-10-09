-- =====================================================================
-- ระบบ POS ร้านมีศิลป์ · ชุดที่ 004 ลบสินค้า
-- วิธีใช้: คัดลอกทั้งไฟล์ วางใน Supabase > SQL Editor แล้วกด Run ครั้งเดียว
-- (รันหลังไฟล์ 001–003 รันซ้ำได้ไม่เสียหาย)
--
-- กติกา: สินค้าหรือสีไซซ์ที่ "ไม่เคยมีประวัติ" ลบจริงได้
--        ถ้าเคยขาย รับของเข้า หรือนับสต็อกแล้ว จะปิดขายแทน
--        เพื่อให้บิลเก่า ใบรับของ และรายงานกำไรยังถูกต้อง
-- =====================================================================

create or replace function private.variant_has_history(p_vid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sale_items where variant_id = p_vid)
      or exists (select 1 from public.goods_receipt_items where variant_id = p_vid)
      or exists (select 1 from public.stock_count_items where variant_id = p_vid)
$$;

-- ลบสีไซซ์เดียว คืนค่า 'deleted' หรือ 'archived'
create or replace function public.delete_variant(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'เฉพาะเจ้าของร้านเท่านั้น'; end if;
  if not exists (select 1 from public.variants where id = p_id) then raise exception 'ไม่พบสีไซซ์นี้'; end if;
  if private.variant_has_history(p_id) then
    update public.variants set active = false where id = p_id;
    return 'archived';
  end if;
  delete from public.stock_movements where variant_id = p_id;
  delete from public.variants where id = p_id;
  return 'deleted';
end $$;

-- ลบสินค้าหลายรุ่นพร้อมกัน
create or replace function public.delete_products(p_ids bigint[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pid      bigint;
  v_name     text;
  v_deleted  int := 0;
  v_archived text[] := '{}';
begin
  if not public.is_owner() then raise exception 'เฉพาะเจ้าของร้านเท่านั้น'; end if;

  foreach v_pid in array coalesce(p_ids, '{}') loop
    select name into v_name from public.products where id = v_pid;
    if v_name is null then continue; end if;

    if exists (select 1 from public.variants v where v.product_id = v_pid and private.variant_has_history(v.id)) then
      update public.products set active = false, updated_at = now() where id = v_pid;
      v_archived := v_archived || v_name;
    else
      delete from public.stock_movements where variant_id in (select id from public.variants where product_id = v_pid);
      delete from public.variants where product_id = v_pid;
      delete from public.promotion_targets where product_id = v_pid;
      delete from public.product_costs where product_id = v_pid;
      delete from public.products where id = v_pid;
      v_deleted := v_deleted + 1;
    end if;
  end loop;

  return jsonb_build_object('deleted', v_deleted, 'archived', coalesce(array_length(v_archived, 1), 0), 'archived_names', to_jsonb(v_archived));
end $$;

revoke execute on function private.variant_has_history(bigint) from public;
revoke execute on function public.delete_variant(bigint) from public, anon;
revoke execute on function public.delete_products(bigint[]) from public, anon;
grant execute on function public.delete_variant(bigint) to authenticated;
grant execute on function public.delete_products(bigint[]) to authenticated;
