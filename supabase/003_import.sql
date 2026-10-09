-- =====================================================================
-- ระบบ POS ร้านมีศิลป์ · ชุดที่ 003 นำเข้าสินค้าจาก Excel
-- วิธีใช้: คัดลอกทั้งไฟล์ วางใน Supabase > SQL Editor แล้วกด Run ครั้งเดียว
-- (รันหลังไฟล์ 001 และ 002 รันซ้ำได้ไม่เสียหาย)
-- =====================================================================

-- ---------------------------------------------------------------------
-- นำเข้าสินค้าทั้งไฟล์ในครั้งเดียว ถ้าแถวใดผิด จะไม่บันทึกอะไรเลย
--
-- p = {
--   categories: [{ name, size_type }],            ← หมวดที่ต้องสร้างใหม่
--   products: [{
--     name, category, brand, price, cost,
--     variants: [{ color, size_label, size_eu, size_us, size_uk, size_cm, barcode, qty, sort_order }]
--   }]
-- }
-- สินค้าชื่อเดิมในหมวดเดิม = เพิ่มสีไซซ์ให้รุ่นเดิม (ไม่แก้ราคา)
-- สีไซซ์ที่มีอยู่แล้ว = ข้าม (ไม่แก้สต็อก ให้ใช้รับของเข้าหรือปรับสต็อกแทน)
-- ---------------------------------------------------------------------
create or replace function public.import_products(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c          jsonb;
  pr         jsonb;
  v          jsonb;
  v_cat      public.categories;
  v_pid      bigint;
  v_vid      bigint;
  v_colors   text[];
  v_cidx     int;
  v_code     text;
  v_sku      text;
  v_n        int;
  v_cost     numeric;
  v_qty      int;
  v_label    text;
  v_barcode  text;
  r_cats     int := 0;
  r_new      int := 0;
  r_existing int := 0;
  r_vars     int := 0;
  r_skip     int := 0;
  r_pcs      int := 0;
begin
  if not public.is_owner() then raise exception 'เฉพาะเจ้าของร้านเท่านั้น'; end if;

  for c in select * from jsonb_array_elements(coalesce(p->'categories', '[]'::jsonb)) loop
    if not exists (select 1 from public.categories where lower(name) = lower(trim(c->>'name'))) then
      insert into public.categories (name, size_type, sort_order)
      values (trim(c->>'name'), coalesce(c->>'size_type', 'free'),
              (select coalesce(max(sort_order), 0) + 1 from public.categories));
      r_cats := r_cats + 1;
    end if;
  end loop;

  for pr in select * from jsonb_array_elements(coalesce(p->'products', '[]'::jsonb)) loop
    if coalesce(trim(pr->>'name'), '') = '' then raise exception 'มีสินค้าที่ไม่มีชื่อ'; end if;
    select * into v_cat from public.categories where lower(name) = lower(trim(pr->>'category'));
    if v_cat.id is null then raise exception 'ไม่พบหมวด "%" ของสินค้า %', pr->>'category', pr->>'name'; end if;

    select id into v_pid from public.products
     where lower(name) = lower(trim(pr->>'name')) and category_id = v_cat.id
     order by id limit 1;

    v_cost := nullif(pr->>'cost', '')::numeric;
    if v_pid is null then
      if nullif(pr->>'price', '') is null then raise exception 'สินค้า % ไม่มีราคาขาย', pr->>'name'; end if;
      insert into public.products (name, category_id, brand, price)
      values (trim(pr->>'name'), v_cat.id, nullif(trim(pr->>'brand'), ''), (pr->>'price')::numeric)
      returning id into v_pid;
      insert into public.product_costs (product_id, cost) values (v_pid, coalesce(v_cost, 0));
      r_new := r_new + 1;
    else
      r_existing := r_existing + 1;
    end if;
    select cost into v_cost from public.product_costs where product_id = v_pid;

    -- ลำดับสีที่มีอยู่แล้ว ใช้ทำ SKU ให้ต่อกัน
    select coalesce(array_agg(color order by first_id), '{}') into v_colors
      from (select color, min(id) first_id from public.variants where product_id = v_pid group by color) t;

    for v in select * from jsonb_array_elements(coalesce(pr->'variants', '[]'::jsonb)) loop
      if coalesce(trim(v->>'color'), '') = '' then raise exception 'สินค้า % มีแถวที่ไม่ระบุสี', pr->>'name'; end if;
      v_label := coalesce(nullif(trim(v->>'size_label'), ''), 'ฟรีไซซ์');

      if exists (select 1 from public.variants where product_id = v_pid and color = trim(v->>'color') and size_label = v_label) then
        r_skip := r_skip + 1;
        continue;
      end if;

      v_barcode := nullif(trim(v->>'barcode'), '');
      if v_barcode is not null and exists (select 1 from public.variants where barcode = v_barcode) then
        raise exception 'บาร์โค้ด % ของ % (% %) ซ้ำกับสินค้าที่มีอยู่แล้ว', v_barcode, pr->>'name', v->>'color', v_label;
      end if;

      v_cidx := array_position(v_colors, trim(v->>'color'));
      if v_cidx is null then
        v_colors := v_colors || trim(v->>'color');
        v_cidx := array_length(v_colors, 1);
      end if;
      v_code := coalesce(nullif(regexp_replace(coalesce(v->>'size_eu', ''), '\s', '', 'g'), ''),
                         case when v_label = 'ฟรีไซซ์' then 'F' else upper(regexp_replace(v_label, '\s', '', 'g')) end);
      v_sku := v_pid || '-' || v_cidx || '-' || v_code;
      v_n := 1;
      while exists (select 1 from public.variants where sku = v_sku) loop
        v_n := v_n + 1;
        v_sku := v_pid || '-' || v_cidx || '-' || v_code || '-' || v_n;
      end loop;

      insert into public.variants (product_id, color, size_label, size_eu, size_us, size_uk, size_cm, sort_order, sku, barcode)
      values (v_pid, trim(v->>'color'), v_label, nullif(trim(v->>'size_eu'), ''), nullif(trim(v->>'size_us'), ''),
              nullif(trim(v->>'size_uk'), ''), nullif(trim(v->>'size_cm'), ''),
              coalesce((v->>'sort_order')::int, 0), v_sku, v_barcode)
      returning id into v_vid;
      r_vars := r_vars + 1;

      v_qty := coalesce(nullif(v->>'qty', '')::int, 0);
      if v_qty <> 0 then
        insert into public.stock_movements (variant_id, qty_change, kind, ref_type, unit_cost, note)
        values (v_vid, v_qty, 'opening', 'import', coalesce(v_cost, 0), 'นำเข้าจาก Excel');
        r_pcs := r_pcs + v_qty;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('categories_created', r_cats, 'products_created', r_new, 'products_existing', r_existing,
                            'variants_created', r_vars, 'variants_skipped', r_skip, 'pieces', r_pcs);
end $$;

revoke execute on function public.import_products(jsonb) from public, anon;
grant execute on function public.import_products(jsonb) to authenticated;
