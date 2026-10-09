-- =====================================================================
-- ระบบ POS ร้านมีศิลป์ · ชุดที่ 002 สำหรับหน้าขาย
-- วิธีใช้: คัดลอกทั้งไฟล์ วางใน Supabase > SQL Editor แล้วกด Run ครั้งเดียว
-- (รันหลังไฟล์ 001 รันซ้ำได้ไม่เสียหาย)
-- =====================================================================

-- ---------------------------------------------------------------------
-- ค้นบิลด้วยเลขบิล: ใช้กับเปลี่ยนคืนสินค้า ยกเลิกบิล และพิมพ์ใบเสร็จซ้ำ
-- returned_qty = จำนวนที่ลูกค้านำมาคืนแล้วจากบิลอื่น (นับเฉพาะบิลที่ไม่ถูกยกเลิก)
-- ---------------------------------------------------------------------
create or replace function public.get_bill(p_bill_no text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sale public.sales;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์ใช้งาน'; end if;
  select * into v_sale from public.sales where bill_no = trim(p_bill_no);
  if v_sale.id is null then return null; end if;

  return jsonb_build_object(
    'sale', to_jsonb(v_sale) - 'created_by',
    'ref_bill_no', (select bill_no from public.sales where id = v_sale.ref_sale_id),
    'member', (select jsonb_build_object('id', m.id, 'nickname', m.nickname, 'phone', m.phone, 'points', m.points)
                 from public.members m where m.id = v_sale.member_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', si.id, 'variant_id', si.variant_id, 'product_name', si.product_name,
               'color', si.color, 'size_label', si.size_label, 'qty', si.qty, 'unit_price', si.unit_price,
               'discount', si.discount, 'promo_discount', si.promo_discount, 'promo_name', pr.name,
               'line_total', si.line_total, 'returned_item_id', si.returned_item_id,
               'return_to_stock', si.return_to_stock,
               'returned_qty', (select coalesce(sum(-r.qty), 0)
                                  from public.sale_items r join public.sales rs on rs.id = r.sale_id
                                 where r.returned_item_id = si.id and rs.status = 'paid'))
             order by si.qty > 0, si.id)
        from public.sale_items si
        left join public.promotions pr on pr.id = si.promo_id
       where si.sale_id = v_sale.id), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
-- ตรวจส่วนลดโปรโมชันทุกครั้งที่บันทึกรายการขาย
-- กันไม่ให้หน้าเว็บส่งส่วนลดโปรที่ไม่มีอยู่จริง หมดอายุ หรือมากกว่าที่ตั้งไว้
-- ---------------------------------------------------------------------
create or replace function private.check_promo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_p     public.promotions;
  v_prod  public.products;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_gross numeric := new.unit_price * new.qty;
  v_max   numeric;
  v_used  numeric;
begin
  if coalesce(new.promo_discount, 0) = 0 then
    new.promo_id := null;
    return new;
  end if;
  if new.promo_discount < 0 then raise exception 'ส่วนลดโปรโมชันไม่ถูกต้อง'; end if;

  select * into v_p from public.promotions where id = new.promo_id;
  if v_p.id is null or not v_p.active
     or (v_p.starts_on is not null and v_p.starts_on > v_today)
     or (v_p.ends_on is not null and v_p.ends_on < v_today) then
    raise exception 'โปรโมชันนี้หมดอายุหรือปิดใช้งานแล้ว กรุณาลบรายการแล้วเพิ่มใหม่';
  end if;

  select pr.* into v_prod from public.variants v join public.products pr on pr.id = v.product_id where v.id = new.variant_id;
  if (v_p.scope = 'category' and not exists (select 1 from public.promotion_targets
                                               where promotion_id = v_p.id and category_id = v_prod.category_id))
     or (v_p.scope = 'product' and not exists (select 1 from public.promotion_targets
                                                where promotion_id = v_p.id and product_id = v_prod.id)) then
    raise exception 'โปรโมชัน % ใช้กับ % ไม่ได้', v_p.name, v_prod.name;
  end if;

  v_max := case v_p.type
             when 'percent'  then v_gross * v_p.value / 100
             when 'qty'      then v_gross * v_p.value / 100
             when 'amount'   then v_p.value * new.qty
             when 'bill_min' then v_p.value
           end;
  if new.promo_discount > least(v_max, v_gross) + 0.01 then
    raise exception 'ส่วนลดโปรโมชัน % เกินกว่าที่ตั้งไว้', v_p.name;
  end if;

  -- โปรแบบซื้อครบยอด: ส่วนลดรวมทั้งบิลต้องไม่เกินที่ตั้งไว้
  if v_p.type = 'bill_min' then
    select coalesce(sum(promo_discount), 0) into v_used
      from public.sale_items where sale_id = new.sale_id and promo_id = v_p.id;
    if v_used + new.promo_discount > v_p.value + 0.01 then
      raise exception 'ส่วนลดโปรโมชัน % เกินกว่าที่ตั้งไว้', v_p.name;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists sale_items_check_promo on public.sale_items;
create trigger sale_items_check_promo
before insert on public.sale_items
for each row when (new.qty > 0)
execute function private.check_promo();

-- ---------------------------------------------------------------------
-- สิทธิ์
-- ---------------------------------------------------------------------
revoke execute on function private.check_promo() from public;
revoke execute on function public.get_bill(text) from public, anon;
grant execute on function public.get_bill(text) to authenticated;
