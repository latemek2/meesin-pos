-- =====================================================================
-- ระบบ POS ร้านมีศิลป์ · ไฟล์ตั้งค่าฐานข้อมูล ชุดที่ 001
-- วิธีใช้: คัดลอกทั้งไฟล์ วางใน Supabase > SQL Editor แล้วกด Run ครั้งเดียว
-- ไฟล์นี้สร้างตาราง กฎความปลอดภัย ฟังก์ชันการขาย และข้อมูลเริ่มต้น
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

-- =====================================================================
-- 1) ผู้ใช้และสิทธิ์
--    owner = พี่สาว (หลังบ้าน สิทธิ์เต็ม)
--    pos   = บัญชีเครื่องขายหน้าร้าน (ขายได้ แต่แก้สินค้าและดูต้นทุนไม่ได้)
-- =====================================================================
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner', 'pos')),
  display_name text,
  created_at   timestamptz not null default now()
);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'owner', false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('owner', 'pos'), false)
$$;

-- =====================================================================
-- 2) ตั้งค่าร้าน
-- =====================================================================
create table public.settings (
  id                int primary key default 1 check (id = 1),
  shop_name         text not null default 'มีศิลป์',
  address           text,
  phone             text,
  receipt_header    text not null default 'ใบเสร็จรับเงิน',
  receipt_footer    text default 'โอกาสหน้าเชิญใหม่ค่ะ',
  vat_note          text default 'ราคารวมภาษีมูลค่าเพิ่มแล้ว',
  promptpay_id      text,
  bank_name         text,
  bank_account_name text,
  bank_account_no   text,
  pay_methods       text[] not null default array['cash', 'promptpay', 'transfer', 'card', 'thai_chuay_thai'],
  baht_per_point    numeric(10,2) not null default 100 check (baht_per_point > 0),
  redeem_points     int not null default 100 check (redeem_points > 0),
  redeem_value      numeric(10,2) not null default 50 check (redeem_value >= 0),
  low_stock_level   int not null default 2,
  updated_at        timestamptz not null default now()
);

-- PIN เก็บแบบเข้ารหัส ไม่มีใครอ่านตารางนี้ได้ตรง ๆ ต้องผ่านฟังก์ชันเท่านั้น
create table public.secrets (
  id             int primary key default 1 check (id = 1),
  pos_pin_hash   text not null,
  owner_pin_hash text not null,
  updated_at     timestamptz not null default now()
);

-- =====================================================================
-- 3) สินค้า สี ไซซ์ และต้นทุน
-- =====================================================================
create table public.categories (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  size_type  text not null check (size_type in ('shoe', 'kid_shoe', 'apparel', 'free')),
  sort_order int not null default 0
);

create table public.products (
  id          bigint generated always as identity primary key,
  name        text not null,
  category_id bigint not null references public.categories(id),
  brand       text,
  price       numeric(10,2) not null check (price >= 0),
  image_url   text,
  note        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.products (category_id);

-- ต้นทุนแยกตาราง เพื่อให้เครื่อง POS มองไม่เห็น
create table public.product_costs (
  product_id bigint primary key references public.products(id) on delete cascade,
  cost       numeric(10,2) not null default 0 check (cost >= 0),
  updated_at timestamptz not null default now()
);

create table public.variants (
  id         bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  color      text not null,
  size_label text not null,          -- ป้ายที่แสดง เช่น 'EU 40' หรือ 'M' หรือ 'ฟรีไซซ์'
  size_eu    text,
  size_us    text,
  size_uk    text,
  size_cm    text,
  sort_order int not null default 0,
  sku        text not null unique,
  barcode    text unique,
  stock_qty  int not null default 0,  -- ติดลบได้ คำนวณจาก stock_movements อัตโนมัติ
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (product_id, color, size_label)
);
create index on public.variants (product_id);

-- =====================================================================
-- 4) สต็อก: ทุกการเปลี่ยนแปลงเป็นหนึ่งแถว ยอดคงเหลือคำนวณจากที่นี่
-- =====================================================================
create table public.stock_movements (
  id         bigint generated always as identity primary key,
  variant_id bigint not null references public.variants(id),
  qty_change int not null check (qty_change <> 0),
  kind       text not null check (kind in ('opening', 'receive', 'sale', 'return', 'void', 'adjust', 'count')),
  ref_type   text,
  ref_id     bigint,
  unit_cost  numeric(10,2),
  note       text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.stock_movements (variant_id, created_at);
create index on public.stock_movements (ref_type, ref_id);

create or replace function private.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.variants set stock_qty = stock_qty + new.qty_change where id = new.variant_id;
  return new;
end $$;

create trigger stock_movements_apply
after insert on public.stock_movements
for each row execute function private.apply_stock_movement();

create table public.suppliers (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  contact    text,
  phone      text,
  note       text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.goods_receipts (
  id          bigint generated always as identity primary key,
  supplier_id bigint references public.suppliers(id),
  invoice_no  text,
  received_on date not null default ((now() at time zone 'Asia/Bangkok')::date),
  total_cost  numeric(12,2) not null default 0,
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.goods_receipt_items (
  id         bigint generated always as identity primary key,
  receipt_id bigint not null references public.goods_receipts(id) on delete cascade,
  variant_id bigint not null references public.variants(id),
  qty        int not null check (qty > 0),
  unit_cost  numeric(10,2) not null check (unit_cost >= 0)
);

create table public.stock_counts (
  id           bigint generated always as identity primary key,
  name         text not null,
  status       text not null default 'open' check (status in ('open', 'confirmed', 'cancelled')),
  started_at   timestamptz not null default now(),
  confirmed_at timestamptz,
  note         text
);

create table public.stock_count_items (
  id          bigint generated always as identity primary key,
  count_id    bigint not null references public.stock_counts(id) on delete cascade,
  variant_id  bigint not null references public.variants(id),
  system_qty  int not null,
  counted_qty int,
  unique (count_id, variant_id)
);

-- =====================================================================
-- 5) สมาชิกและแต้ม
-- =====================================================================
create table public.members (
  id         bigint generated always as identity primary key,
  phone      text not null unique check (phone ~ '^0[0-9]{8,9}$'),
  nickname   text not null,
  points     int not null default 0,
  consent_at timestamptz not null default now(),
  note       text,
  created_at timestamptz not null default now()
);

create table public.point_transactions (
  id         bigint generated always as identity primary key,
  member_id  bigint not null references public.members(id),
  sale_id    bigint,
  points     int not null check (points <> 0),
  reason     text not null check (reason in ('earn', 'redeem', 'return', 'void', 'adjust')),
  note       text,
  created_at timestamptz not null default now()
);
create index on public.point_transactions (member_id, created_at);

create or replace function private.apply_points() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.members set points = points + new.points where id = new.member_id;
  return new;
end $$;

create trigger point_transactions_apply
after insert on public.point_transactions
for each row execute function private.apply_points();

-- =====================================================================
-- 6) โปรโมชัน (ระบบรองรับไว้ ยังไม่มีโปรที่เปิด)
-- =====================================================================
create table public.promotions (
  id         bigint generated always as identity primary key,
  name       text not null,
  type       text not null check (type in ('percent', 'amount', 'qty', 'bill_min')),
  value      numeric(10,2) not null check (value > 0),   -- % หรือ บาท
  min_qty    int,                                         -- สำหรับแบบ qty
  min_amount numeric(10,2),                               -- สำหรับแบบ bill_min
  scope      text not null default 'all' check (scope in ('all', 'category', 'product')),
  starts_on  date,
  ends_on    date,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.promotion_targets (
  id           bigint generated always as identity primary key,
  promotion_id bigint not null references public.promotions(id) on delete cascade,
  category_id  bigint references public.categories(id),
  product_id   bigint references public.products(id),
  check (category_id is not null or product_id is not null)
);

-- =====================================================================
-- 7) รอบขาย บิล และการอนุมัติ
-- =====================================================================
create table public.shifts (
  id            bigint generated always as identity primary key,
  status        text not null default 'open' check (status in ('open', 'closed')),
  opened_at     timestamptz not null default now(),
  opening_cash  numeric(12,2) not null default 0,
  closed_at     timestamptz,
  expected_cash numeric(12,2),
  counted_cash  numeric(12,2),
  difference    numeric(12,2),
  denominations jsonb,
  note          text
);
-- เปิดได้ทีละรอบเท่านั้น
create unique index shifts_one_open on public.shifts ((status)) where status = 'open';

create table public.bill_counters (
  yymm    text primary key,
  last_no int not null
);

create table public.sales (
  id              bigint generated always as identity primary key,
  bill_no         text not null unique,
  kind            text not null default 'sale' check (kind in ('sale', 'exchange', 'refund')),
  status          text not null default 'paid' check (status in ('paid', 'void')),
  shift_id        bigint references public.shifts(id),
  member_id       bigint references public.members(id),
  ref_sale_id     bigint references public.sales(id),
  subtotal        numeric(12,2) not null default 0,
  item_discount   numeric(12,2) not null default 0,
  promo_discount  numeric(12,2) not null default 0,
  bill_discount   numeric(12,2) not null default 0,
  points_used     int not null default 0,
  points_discount numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,  -- ติดลบ = ร้านคืนเงินให้ลูกค้า
  pay_method      text check (pay_method in ('cash', 'promptpay', 'transfer', 'card', 'thai_chuay_thai', 'none')),
  cash_received   numeric(12,2),
  change_amount   numeric(12,2),
  pay_ref         text,
  points_earned   int not null default 0,
  note            text,
  backdated_at    timestamptz,                         -- ใช้กับบิลที่คีย์ย้อนหลังตอนเน็ตหลุด
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  voided_at       timestamptz,
  voided_shift_id bigint references public.shifts(id),
  void_reason     text
);
create index on public.sales (created_at);
create index on public.sales (shift_id);
create index on public.sales (ref_sale_id);
create index on public.sales (member_id);

create table public.sale_items (
  id               bigint generated always as identity primary key,
  sale_id          bigint not null references public.sales(id) on delete cascade,
  variant_id       bigint not null references public.variants(id),
  product_name     text not null,
  color            text not null,
  size_label       text not null,
  qty              int not null check (qty <> 0),      -- ติดลบ = รับคืน
  unit_price       numeric(10,2) not null,
  discount         numeric(10,2) not null default 0,
  promo_discount   numeric(10,2) not null default 0,
  promo_id         bigint references public.promotions(id),
  line_total       numeric(12,2) not null,
  returned_item_id bigint references public.sale_items(id),
  return_to_stock  boolean
);
create index on public.sale_items (sale_id);
create index on public.sale_items (variant_id);
create index on public.sale_items (returned_item_id);

-- ต้นทุน ณ วันขาย แยกตาราง เพื่อให้ POS มองไม่เห็น และกำไรบิลเก่าไม่เพี้ยน
create table public.sale_item_costs (
  sale_item_id bigint primary key references public.sale_items(id) on delete cascade,
  unit_cost    numeric(10,2) not null default 0
);

create table public.held_bills (
  id         bigint generated always as identity primary key,
  name       text not null,
  cart       jsonb not null,
  created_at timestamptz not null default now()
);

create table public.approvals (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('discount', 'refund', 'void')),
  sale_id    bigint references public.sales(id),
  amount     numeric(12,2),
  note       text,
  created_at timestamptz not null default now()
);

-- เตรียมไว้สำหรับใบกำกับภาษีเต็มรูปในอนาคต (ยังไม่ใช้)
create table public.tax_customers (
  id         bigint generated always as identity primary key,
  name       text not null,
  tax_id     text not null,
  branch     text default 'สำนักงานใหญ่',
  address    text not null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 8) ฟังก์ชันภายใน
-- =====================================================================
create or replace function private.check_pin(p_pin text, p_which text) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_hash text;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then return false; end if;
  select case when p_which = 'owner' then owner_pin_hash else pos_pin_hash end
    into v_hash from public.secrets where id = 1;
  return v_hash is not null and extensions.crypt(p_pin, v_hash) = v_hash;
end $$;

create or replace function private.next_bill_no() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_key text := to_char(now() at time zone 'Asia/Bangkok', 'YYMM');
  v_n   int;
begin
  insert into public.bill_counters (yymm, last_no) values (v_key, 1)
  on conflict (yymm) do update set last_no = public.bill_counters.last_no + 1
  returning last_no into v_n;
  return v_key || '-' || lpad(v_n::text, 4, '0');
end $$;

-- เงินสดที่ควรมีในลิ้นชักของรอบขาย
create or replace function private.shift_expected_cash(p_shift_id bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select s.opening_cash
    -- บิลเงินสดของรอบนี้ ที่ยังไม่ถูกยกเลิกภายในรอบเดียวกัน
    + coalesce((select sum(total) from public.sales
                where shift_id = s.id and pay_method = 'cash'
                  and (status = 'paid' or voided_shift_id is distinct from s.id)), 0)
    -- บิลเงินสดของรอบก่อน ที่มายกเลิกในรอบนี้ (คืนเงินจากลิ้นชักรอบนี้)
    - coalesce((select sum(total) from public.sales
                where voided_shift_id = s.id and shift_id <> s.id and pay_method = 'cash'), 0)
  from public.shifts s where s.id = p_shift_id
$$;

-- =====================================================================
-- 9) ฟังก์ชันที่หน้าเว็บเรียกใช้
-- =====================================================================

-- ตรวจ PIN เข้า POS
create or replace function public.verify_pos_pin(p_pin text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then return false; end if;
  return private.check_pin(p_pin, 'pos') or private.check_pin(p_pin, 'owner');
end $$;

-- ตรวจ PIN อนุมัติของเจ้าของร้าน (ใช้ก่อนเปิดหน้าต่างส่วนลด เพื่อบอกผลทันที)
create or replace function public.verify_owner_pin(p_pin text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then return false; end if;
  return private.check_pin(p_pin, 'owner');
end $$;

-- เปลี่ยน PIN (เฉพาะเจ้าของร้าน) ส่ง null ถ้าไม่ต้องการเปลี่ยนตัวนั้น
create or replace function public.set_pins(p_pos_pin text, p_owner_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_owner() then raise exception 'เฉพาะเจ้าของร้านเท่านั้น'; end if;
  if p_pos_pin is not null then
    if p_pos_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN ต้องเป็นตัวเลข 4–6 หลัก'; end if;
    update public.secrets set pos_pin_hash = extensions.crypt(p_pos_pin, extensions.gen_salt('bf')), updated_at = now() where id = 1;
  end if;
  if p_owner_pin is not null then
    if p_owner_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN ต้องเป็นตัวเลข 4–6 หลัก'; end if;
    update public.secrets set owner_pin_hash = extensions.crypt(p_owner_pin, extensions.gen_salt('bf')), updated_at = now() where id = 1;
  end if;
end $$;

-- เปิดรอบขาย (ใส่เงินทอนตั้งต้น)
create or replace function public.open_shift(p_opening_cash numeric) returns public.shifts
language plpgsql security definer set search_path = public as $$
declare v public.shifts;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์ใช้งาน'; end if;
  if exists (select 1 from public.shifts where status = 'open') then
    raise exception 'มีรอบขายที่เปิดอยู่แล้ว ต้องปิดยอดรอบเดิมก่อน';
  end if;
  if coalesce(p_opening_cash, 0) < 0 then raise exception 'เงินทอนตั้งต้นติดลบไม่ได้'; end if;
  insert into public.shifts (opening_cash) values (coalesce(p_opening_cash, 0)) returning * into v;
  return v;
end $$;

-- สรุปยอดของรอบขาย (ไม่ส่ง id = รอบที่เปิดอยู่)
create or replace function public.shift_summary(p_shift_id bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_shift public.shifts;
  v_methods jsonb;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์ใช้งาน'; end if;
  if p_shift_id is null then
    select * into v_shift from public.shifts where status = 'open' limit 1;
  else
    select * into v_shift from public.shifts where id = p_shift_id;
  end if;
  if v_shift.id is null then return null; end if;

  select coalesce(jsonb_object_agg(pay_method, jsonb_build_object('bills', n, 'total', amt)), '{}'::jsonb)
    into v_methods
  from (select pay_method, count(*) n, sum(total) amt
        from public.sales
        where shift_id = v_shift.id and status = 'paid' and pay_method is not null and pay_method <> 'none'
        group by pay_method) t;

  return jsonb_build_object(
    'shift_id',      v_shift.id,
    'status',        v_shift.status,
    'opened_at',     v_shift.opened_at,
    'opening_cash',  v_shift.opening_cash,
    'expected_cash', private.shift_expected_cash(v_shift.id),
    'methods',       v_methods,
    'bills',         (select count(*) from public.sales where shift_id = v_shift.id and status = 'paid'),
    'net_total',     (select coalesce(sum(total), 0) from public.sales where shift_id = v_shift.id and status = 'paid'),
    'void_bills',    (select count(*) from public.sales where voided_shift_id = v_shift.id),
    'discounts',     (select coalesce(sum(item_discount + bill_discount + promo_discount + points_discount), 0)
                      from public.sales where shift_id = v_shift.id and status = 'paid')
  );
end $$;

-- ปิดยอด: นับเงินแล้วบันทึก
create or replace function public.close_shift(p_counted_cash numeric, p_denominations jsonb default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shift public.shifts;
  v_expected numeric;
  v_summary jsonb;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์ใช้งาน'; end if;
  select * into v_shift from public.shifts where status = 'open' for update;
  if v_shift.id is null then raise exception 'ไม่มีรอบขายที่เปิดอยู่'; end if;
  v_expected := private.shift_expected_cash(v_shift.id);
  v_summary := public.shift_summary(v_shift.id);
  update public.shifts set
    status = 'closed', closed_at = now(), expected_cash = v_expected,
    counted_cash = p_counted_cash, difference = p_counted_cash - v_expected,
    denominations = p_denominations, note = p_note
  where id = v_shift.id;
  return v_summary || jsonb_build_object('counted_cash', p_counted_cash, 'difference', p_counted_cash - v_expected);
end $$;

-- สมัครสมาชิกจากหน้าร้าน
create or replace function public.create_member(p_phone text, p_nickname text) returns public.members
language plpgsql security definer set search_path = public as $$
declare v public.members;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์ใช้งาน'; end if;
  p_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if p_phone !~ '^0[0-9]{8,9}$' then raise exception 'เบอร์โทรไม่ถูกต้อง'; end if;
  if coalesce(trim(p_nickname), '') = '' then raise exception 'กรุณาใส่ชื่อเล่นสมาชิก'; end if;
  if exists (select 1 from public.members where phone = p_phone) then
    raise exception 'เบอร์นี้เป็นสมาชิกอยู่แล้ว';
  end if;
  insert into public.members (phone, nickname) values (p_phone, trim(p_nickname)) returning * into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- บันทึกบิล: ขาย / เปลี่ยนสินค้า / คืนเงิน ในครั้งเดียว
-- ถ้าขั้นใดผิดพลาด ทุกอย่างถูกยกเลิก สต็อกจะไม่ถูกตัดโดยไม่มีบิล
--
-- p = {
--   kind: 'sale' | 'exchange' | 'refund',
--   ref_sale_id: เลข id บิลเดิม (เฉพาะ exchange/refund),
--   member_id, owner_pin, pay_method, cash_received, pay_ref, note, held_bill_id,
--   bill_discount, points_used,
--   items: [
--     { variant_id, qty (>0), discount, promo_discount, promo_id }      ← ชิ้นที่ขาย
--     { sale_item_id, qty (<0), return_to_stock }                       ← ชิ้นที่รับคืน
--   ]
-- }
-- ---------------------------------------------------------------------
create or replace function public.create_sale(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_set       public.settings;
  v_shift     public.shifts;
  v_kind      text := coalesce(p->>'kind', 'sale');
  v_ref       public.sales;
  v_member    public.members;
  v_item      jsonb;
  v_variant   public.variants;
  v_product   public.products;
  v_orig      public.sale_items;
  v_sale_id   bigint;
  v_bill      text;
  v_si_id     bigint;
  v_qty       int;
  v_price     numeric;
  v_cost      numeric;
  v_line_disc numeric;
  v_line_promo numeric;
  v_returned  int;
  v_back      boolean;
  v_subtotal  numeric := 0;
  v_item_disc numeric := 0;
  v_promo_disc numeric := 0;
  v_bill_disc numeric := coalesce((p->>'bill_discount')::numeric, 0);
  v_points_used int := coalesce((p->>'points_used')::int, 0);
  v_points_disc numeric := 0;
  v_total     numeric;
  v_method    text := nullif(p->>'pay_method', '');
  v_cash      numeric := (p->>'cash_received')::numeric;
  v_change    numeric;
  v_earn      int := 0;
  v_count     int := 0;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์ใช้งาน'; end if;
  if v_kind not in ('sale', 'exchange', 'refund') then raise exception 'ประเภทบิลไม่ถูกต้อง'; end if;

  select * into v_set from public.settings where id = 1;
  select * into v_shift from public.shifts where status = 'open' limit 1;
  if v_shift.id is null then raise exception 'ยังไม่ได้เปิดรอบขาย กรุณาเปิดร้านก่อน'; end if;

  if v_kind <> 'sale' then
    select * into v_ref from public.sales where id = (p->>'ref_sale_id')::bigint;
    if v_ref.id is null then raise exception 'ไม่พบบิลเดิม'; end if;
    if v_ref.status <> 'paid' then raise exception 'บิลเดิมถูกยกเลิกไปแล้ว'; end if;
  end if;

  if nullif(p->>'member_id', '') is not null then
    select * into v_member from public.members where id = (p->>'member_id')::bigint for update;
    if v_member.id is null then raise exception 'ไม่พบสมาชิก'; end if;
  elsif v_ref.member_id is not null then
    select * into v_member from public.members where id = v_ref.member_id for update;
  end if;

  v_bill := private.next_bill_no();
  insert into public.sales (bill_no, kind, shift_id, member_id, ref_sale_id, note)
  values (v_bill, v_kind, v_shift.id, v_member.id, v_ref.id, nullif(p->>'note', ''))
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    v_count := v_count + 1;
    v_qty := (v_item->>'qty')::int;
    if v_qty is null or v_qty = 0 then raise exception 'จำนวนสินค้าไม่ถูกต้อง'; end if;

    if v_qty > 0 then
      -- ชิ้นที่ขายออก (สต็อกติดลบได้)
      if v_kind = 'refund' then raise exception 'บิลคืนเงินเพิ่มสินค้าขายไม่ได้ ใช้แบบเปลี่ยนสินค้าแทน'; end if;
      select * into v_variant from public.variants where id = (v_item->>'variant_id')::bigint;
      if v_variant.id is null then raise exception 'ไม่พบสินค้าในระบบ'; end if;
      select * into v_product from public.products where id = v_variant.product_id;
      v_price := v_product.price;
      select cost into v_cost from public.product_costs where product_id = v_product.id;
      v_line_disc  := coalesce((v_item->>'discount')::numeric, 0);
      v_line_promo := coalesce((v_item->>'promo_discount')::numeric, 0);
      if v_line_disc < 0 or v_line_promo < 0 then raise exception 'ส่วนลดติดลบไม่ได้'; end if;
      if v_line_disc + v_line_promo > v_price * v_qty then
        raise exception 'ส่วนลดของ % มากกว่าราคาสินค้า', v_product.name;
      end if;

      insert into public.sale_items (sale_id, variant_id, product_name, color, size_label, qty, unit_price,
                                     discount, promo_discount, promo_id, line_total)
      values (v_sale_id, v_variant.id, v_product.name, v_variant.color, v_variant.size_label, v_qty, v_price,
              v_line_disc, v_line_promo, nullif(v_item->>'promo_id', '')::bigint,
              v_price * v_qty - v_line_disc - v_line_promo)
      returning id into v_si_id;
      insert into public.sale_item_costs values (v_si_id, coalesce(v_cost, 0));
      insert into public.stock_movements (variant_id, qty_change, kind, ref_type, ref_id, unit_cost)
      values (v_variant.id, -v_qty, 'sale', 'sale', v_sale_id, coalesce(v_cost, 0));

      v_subtotal   := v_subtotal + v_price * v_qty;
      v_item_disc  := v_item_disc + v_line_disc;
      v_promo_disc := v_promo_disc + v_line_promo;
    else
      -- ชิ้นที่ลูกค้านำมาคืน ต้องอยู่ในบิลเดิม และคืนไม่เกินที่ซื้อไป
      if v_kind = 'sale' then raise exception 'การรับคืนสินค้า ต้องทำผ่านเมนูเปลี่ยนหรือคืนสินค้า'; end if;
      select * into v_orig from public.sale_items
       where id = (v_item->>'sale_item_id')::bigint and sale_id = v_ref.id and qty > 0;
      if v_orig.id is null then raise exception 'สินค้าที่คืนไม่อยู่ในบิลเดิม'; end if;

      select coalesce(sum(-si.qty), 0) into v_returned
        from public.sale_items si join public.sales s on s.id = si.sale_id
       where si.returned_item_id = v_orig.id and s.status = 'paid';
      if v_returned + (-v_qty) > v_orig.qty then
        raise exception '% คืนเกินจำนวนที่ซื้อไป (ซื้อ % ชิ้น คืนไปแล้ว % ชิ้น)', v_orig.product_name, v_orig.qty, v_returned;
      end if;

      -- คืนตามราคาที่ลูกค้าจ่ายจริงต่อชิ้น (หลังหักส่วนลดรายชิ้น)
      v_price := round(v_orig.line_total / v_orig.qty, 2);
      select unit_cost into v_cost from public.sale_item_costs where sale_item_id = v_orig.id;
      v_back := coalesce((v_item->>'return_to_stock')::boolean, true);

      insert into public.sale_items (sale_id, variant_id, product_name, color, size_label, qty, unit_price,
                                     line_total, returned_item_id, return_to_stock)
      values (v_sale_id, v_orig.variant_id, v_orig.product_name, v_orig.color, v_orig.size_label, v_qty, v_price,
              v_price * v_qty, v_orig.id, v_back)
      returning id into v_si_id;
      insert into public.sale_item_costs values (v_si_id, coalesce(v_cost, 0));
      if v_back then
        insert into public.stock_movements (variant_id, qty_change, kind, ref_type, ref_id, unit_cost)
        values (v_orig.variant_id, -v_qty, 'return', 'sale', v_sale_id, coalesce(v_cost, 0));
      end if;

      v_subtotal := v_subtotal + v_price * v_qty;   -- ติดลบ
    end if;
  end loop;

  if v_count = 0 then raise exception 'ยังไม่มีสินค้าในบิล'; end if;

  -- ส่วนลดท้ายบิล และแต้ม
  if v_bill_disc < 0 then raise exception 'ส่วนลดติดลบไม่ได้'; end if;
  if v_points_used < 0 then raise exception 'จำนวนแต้มไม่ถูกต้อง'; end if;
  if v_points_used > 0 then
    if v_member.id is null then raise exception 'ต้องเลือกสมาชิกก่อนใช้แต้ม'; end if;
    if v_points_used % v_set.redeem_points <> 0 then
      raise exception 'ใช้แต้มได้ทีละ % แต้ม', v_set.redeem_points;
    end if;
    if v_points_used > v_member.points then raise exception 'แต้มไม่พอ (มี % แต้ม)', v_member.points; end if;
    v_points_disc := (v_points_used / v_set.redeem_points) * v_set.redeem_value;
  end if;

  v_total := v_subtotal - v_item_disc - v_promo_disc - v_bill_disc - v_points_disc;
  if v_kind = 'sale' and v_total < 0 then raise exception 'ส่วนลดรวมมากกว่ายอดขาย'; end if;
  if v_kind = 'refund' and v_total > 0 then raise exception 'บิลคืนเงินต้องมียอดติดลบ'; end if;

  -- ส่วนลดเอง และเงินออกจากร้าน ต้องใช้ PIN เจ้าของร้าน
  if v_item_disc > 0 or v_bill_disc > 0 or v_total < 0 then
    if not private.check_pin(p->>'owner_pin', 'owner') then raise exception 'PIN อนุมัติไม่ถูกต้อง'; end if;
    if v_item_disc > 0 or v_bill_disc > 0 then
      insert into public.approvals (kind, sale_id, amount) values ('discount', v_sale_id, v_item_disc + v_bill_disc);
    end if;
    if v_total < 0 then
      insert into public.approvals (kind, sale_id, amount) values ('refund', v_sale_id, -v_total);
    end if;
  end if;

  -- วิธีชำระเงิน
  if v_total = 0 then
    v_method := coalesce(v_method, 'none');
    v_cash := null;
  else
    if v_method is null or not (v_method = any (v_set.pay_methods)) then
      raise exception 'กรุณาเลือกวิธีชำระเงิน';
    end if;
    if v_method = 'cash' and v_total > 0 then
      if v_cash is null or v_cash < v_total then raise exception 'รับเงินมาไม่พอ'; end if;
      v_change := v_cash - v_total;
    elsif v_method = 'cash' then
      v_cash := null;
      v_change := -v_total;   -- เงินที่ทอนคืนลูกค้า
    else
      v_cash := null;
    end if;
  end if;

  -- แต้มสมาชิก
  if v_member.id is not null then
    if v_points_used > 0 then
      insert into public.point_transactions (member_id, sale_id, points, reason)
      values (v_member.id, v_sale_id, -v_points_used, 'redeem');
    end if;
    if v_total > 0 then
      v_earn := floor(v_total / v_set.baht_per_point)::int;
    elsif v_total < 0 then
      select points into v_member.points from public.members where id = v_member.id;
      v_earn := -least(floor(-v_total / v_set.baht_per_point)::int, greatest(v_member.points, 0));
    end if;
    if v_earn <> 0 then
      insert into public.point_transactions (member_id, sale_id, points, reason)
      values (v_member.id, v_sale_id, v_earn, case when v_earn > 0 then 'earn' else 'return' end);
    end if;
  end if;

  update public.sales set
    subtotal = v_subtotal, item_discount = v_item_disc, promo_discount = v_promo_disc,
    bill_discount = v_bill_disc, points_used = v_points_used, points_discount = v_points_disc,
    total = v_total, pay_method = v_method, cash_received = v_cash, change_amount = v_change,
    pay_ref = nullif(p->>'pay_ref', ''), points_earned = v_earn
  where id = v_sale_id;

  if nullif(p->>'held_bill_id', '') is not null then
    delete from public.held_bills where id = (p->>'held_bill_id')::bigint;
  end if;

  return jsonb_build_object('id', v_sale_id, 'bill_no', v_bill, 'total', v_total,
                            'change', v_change, 'points_earned', v_earn);
end $$;

-- ยกเลิกบิล: คืนสต็อก คืนแต้ม เก็บบิลไว้โดยมีสถานะยกเลิก
create or replace function public.void_sale(p_bill_no text, p_reason text, p_owner_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sale  public.sales;
  v_shift public.shifts;
  r record;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์ใช้งาน'; end if;
  if not private.check_pin(p_owner_pin, 'owner') then raise exception 'PIN อนุมัติไม่ถูกต้อง'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'กรุณาใส่เหตุผลที่ยกเลิก'; end if;

  select * into v_sale from public.sales where bill_no = trim(p_bill_no) for update;
  if v_sale.id is null then raise exception 'ไม่พบบิลเลขที่ %', p_bill_no; end if;
  if v_sale.status = 'void' then raise exception 'บิลนี้ถูกยกเลิกไปแล้ว'; end if;
  if exists (select 1 from public.sales where ref_sale_id = v_sale.id and status = 'paid') then
    raise exception 'บิลนี้มีการเปลี่ยนหรือคืนสินค้าแล้ว ต้องยกเลิกบิลเปลี่ยนคืนก่อน';
  end if;

  select * into v_shift from public.shifts where status = 'open' limit 1;

  for r in select variant_id, sum(qty_change) as q from public.stock_movements
           where ref_type = 'sale' and ref_id = v_sale.id group by variant_id loop
    if r.q <> 0 then
      insert into public.stock_movements (variant_id, qty_change, kind, ref_type, ref_id, note)
      values (r.variant_id, -r.q, 'void', 'sale', v_sale.id, 'ยกเลิกบิล ' || v_sale.bill_no);
    end if;
  end loop;

  for r in select member_id, sum(points) as pts from public.point_transactions
           where sale_id = v_sale.id group by member_id loop
    if r.pts <> 0 then
      insert into public.point_transactions (member_id, sale_id, points, reason, note)
      values (r.member_id, v_sale.id, -r.pts, 'void', 'ยกเลิกบิล ' || v_sale.bill_no);
    end if;
  end loop;

  update public.sales set status = 'void', voided_at = now(), voided_shift_id = v_shift.id,
                          void_reason = trim(p_reason)
  where id = v_sale.id;

  insert into public.approvals (kind, sale_id, amount, note) values ('void', v_sale.id, v_sale.total, trim(p_reason));

  return jsonb_build_object('bill_no', v_sale.bill_no, 'total', v_sale.total, 'pay_method', v_sale.pay_method);
end $$;

-- รับของเข้า (เจ้าของร้าน)
-- p = { supplier_id, invoice_no, received_on, note, update_cost (true/false),
--       items: [{ variant_id, qty, unit_cost }] }
create or replace function public.receive_goods(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id   bigint;
  v_item jsonb;
  v_total numeric := 0;
  v_pid  bigint;
begin
  if not public.is_owner() then raise exception 'เฉพาะเจ้าของร้านเท่านั้น'; end if;
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then raise exception 'ยังไม่มีรายการรับของ'; end if;

  insert into public.goods_receipts (supplier_id, invoice_no, received_on, note)
  values (nullif(p->>'supplier_id', '')::bigint, nullif(p->>'invoice_no', ''),
          coalesce(nullif(p->>'received_on', '')::date, (now() at time zone 'Asia/Bangkok')::date),
          nullif(p->>'note', ''))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p->'items') loop
    if coalesce((v_item->>'qty')::int, 0) <= 0 then raise exception 'จำนวนรับเข้าต้องมากกว่า 0'; end if;
    insert into public.goods_receipt_items (receipt_id, variant_id, qty, unit_cost)
    values (v_id, (v_item->>'variant_id')::bigint, (v_item->>'qty')::int, coalesce((v_item->>'unit_cost')::numeric, 0));
    insert into public.stock_movements (variant_id, qty_change, kind, ref_type, ref_id, unit_cost)
    values ((v_item->>'variant_id')::bigint, (v_item->>'qty')::int, 'receive', 'goods_receipt', v_id,
            coalesce((v_item->>'unit_cost')::numeric, 0));
    v_total := v_total + (v_item->>'qty')::int * coalesce((v_item->>'unit_cost')::numeric, 0);

    if coalesce((p->>'update_cost')::boolean, true) and (v_item->>'unit_cost') is not null then
      select product_id into v_pid from public.variants where id = (v_item->>'variant_id')::bigint;
      insert into public.product_costs (product_id, cost, updated_at)
      values (v_pid, (v_item->>'unit_cost')::numeric, now())
      on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
    end if;
  end loop;

  update public.goods_receipts set total_cost = v_total where id = v_id;
  return v_id;
end $$;

-- ปรับสต็อกเอง หรือใส่สต็อกตั้งต้น (เจ้าของร้าน)
create or replace function public.adjust_stock(p_variant_id bigint, p_qty_change int, p_note text,
                                               p_kind text default 'adjust') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'เฉพาะเจ้าของร้านเท่านั้น'; end if;
  if p_kind not in ('adjust', 'opening') then raise exception 'ประเภทการปรับไม่ถูกต้อง'; end if;
  if coalesce(p_qty_change, 0) = 0 then return; end if;
  insert into public.stock_movements (variant_id, qty_change, kind, ref_type, note)
  values (p_variant_id, p_qty_change, p_kind, 'manual', nullif(p_note, ''));
end $$;

-- เริ่มรอบนับสต็อก: บันทึกยอดในระบบของทุกรายการไว้
create or replace function public.start_stock_count(p_name text, p_category_id bigint default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not public.is_owner() then raise exception 'เฉพาะเจ้าของร้านเท่านั้น'; end if;
  insert into public.stock_counts (name) values (coalesce(nullif(trim(p_name), ''), 'นับสต็อก')) returning id into v_id;
  insert into public.stock_count_items (count_id, variant_id, system_qty)
  select v_id, v.id, v.stock_qty
    from public.variants v join public.products pr on pr.id = v.product_id
   where v.active and pr.active and (p_category_id is null or pr.category_id = p_category_id);
  return v_id;
end $$;

-- ยืนยันผลนับ: ปรับสต็อกให้ตรงกับที่นับได้ (เฉพาะรายการที่กรอกจำนวนแล้ว)
create or replace function public.confirm_stock_count(p_count_id bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_n int := 0;
begin
  if not public.is_owner() then raise exception 'เฉพาะเจ้าของร้านเท่านั้น'; end if;
  if not exists (select 1 from public.stock_counts where id = p_count_id and status = 'open') then
    raise exception 'รอบนับนี้ยืนยันหรือยกเลิกไปแล้ว';
  end if;
  for r in select ci.variant_id, ci.counted_qty - v.stock_qty as diff
             from public.stock_count_items ci join public.variants v on v.id = ci.variant_id
            where ci.count_id = p_count_id and ci.counted_qty is not null loop
    if r.diff <> 0 then
      insert into public.stock_movements (variant_id, qty_change, kind, ref_type, ref_id, note)
      values (r.variant_id, r.diff, 'count', 'stock_count', p_count_id, 'ปรับตามการนับสต็อก');
      v_n := v_n + 1;
    end if;
  end loop;
  update public.stock_counts set status = 'confirmed', confirmed_at = now() where id = p_count_id;
  return v_n;
end $$;

-- ปรับแต้มสมาชิกเอง (เจ้าของร้าน)
create or replace function public.adjust_points(p_member_id bigint, p_points int, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'เฉพาะเจ้าของร้านเท่านั้น'; end if;
  if coalesce(p_points, 0) = 0 then return; end if;
  insert into public.point_transactions (member_id, points, reason, note)
  values (p_member_id, p_points, 'adjust', nullif(p_note, ''));
end $$;

-- =====================================================================
-- 10) มุมมองสต็อก สำหรับหน้าเช็กสต็อกและหน้าขาย (ไม่มีต้นทุน)
-- =====================================================================
create or replace view public.v_stock with (security_invoker = true) as
select v.id as variant_id, v.product_id, p.name as product_name, p.brand, p.category_id,
       c.name as category_name, c.size_type, p.price, p.image_url,
       v.color, v.size_label, v.size_eu, v.size_us, v.size_uk, v.size_cm,
       v.sku, v.barcode, v.stock_qty, v.sort_order
  from public.variants v
  join public.products p on p.id = v.product_id
  join public.categories c on c.id = p.category_id
 where v.active and p.active;

-- =====================================================================
-- 11) กฎความปลอดภัยระดับแถว (RLS)
-- =====================================================================
alter table public.profiles            enable row level security;
alter table public.settings            enable row level security;
alter table public.secrets             enable row level security;
alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.product_costs       enable row level security;
alter table public.variants            enable row level security;
alter table public.stock_movements     enable row level security;
alter table public.suppliers           enable row level security;
alter table public.goods_receipts      enable row level security;
alter table public.goods_receipt_items enable row level security;
alter table public.stock_counts        enable row level security;
alter table public.stock_count_items   enable row level security;
alter table public.members             enable row level security;
alter table public.point_transactions  enable row level security;
alter table public.promotions          enable row level security;
alter table public.promotion_targets   enable row level security;
alter table public.shifts              enable row level security;
alter table public.bill_counters       enable row level security;
alter table public.sales               enable row level security;
alter table public.sale_items          enable row level security;
alter table public.sale_item_costs     enable row level security;
alter table public.held_bills          enable row level security;
alter table public.approvals           enable row level security;
alter table public.tax_customers       enable row level security;

-- อ่านเห็นของตัวเอง เจ้าของร้านจัดการได้ทั้งหมด
create policy profiles_read  on public.profiles for select to authenticated using (user_id = auth.uid() or public.is_owner());
create policy profiles_owner on public.profiles for all    to authenticated using (public.is_owner()) with check (public.is_owner());

-- พนักงานอ่านได้ เจ้าของร้านแก้ได้
create policy settings_read  on public.settings for select to authenticated using (public.is_staff());
create policy settings_owner on public.settings for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy categories_read  on public.categories for select to authenticated using (public.is_staff());
create policy categories_owner on public.categories for all    to authenticated using (public.is_owner()) with check (public.is_owner());
create policy products_read    on public.products   for select to authenticated using (public.is_staff());
create policy products_owner   on public.products   for all    to authenticated using (public.is_owner()) with check (public.is_owner());
create policy variants_read    on public.variants   for select to authenticated using (public.is_staff());
create policy variants_owner   on public.variants   for all    to authenticated using (public.is_owner()) with check (public.is_owner());
create policy promotions_read  on public.promotions for select to authenticated using (public.is_staff());
create policy promotions_owner on public.promotions for all    to authenticated using (public.is_owner()) with check (public.is_owner());
create policy promo_targets_read  on public.promotion_targets for select to authenticated using (public.is_staff());
create policy promo_targets_owner on public.promotion_targets for all    to authenticated using (public.is_owner()) with check (public.is_owner());

-- เจ้าของร้านเท่านั้น
create policy product_costs_owner on public.product_costs       for all    to authenticated using (public.is_owner()) with check (public.is_owner());
create policy suppliers_owner     on public.suppliers           for all    to authenticated using (public.is_owner()) with check (public.is_owner());
create policy gr_owner            on public.goods_receipts      for select to authenticated using (public.is_owner());
create policy gri_owner           on public.goods_receipt_items for select to authenticated using (public.is_owner());
create policy counts_owner        on public.stock_counts        for select to authenticated using (public.is_owner());
create policy counts_owner_upd    on public.stock_counts        for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy count_items_owner   on public.stock_count_items   for select to authenticated using (public.is_owner());
create policy count_items_upd     on public.stock_count_items   for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy movements_owner     on public.stock_movements     for select to authenticated using (public.is_owner());
create policy sale_costs_owner    on public.sale_item_costs     for select to authenticated using (public.is_owner());
create policy approvals_owner     on public.approvals           for select to authenticated using (public.is_owner());
create policy tax_customers_owner on public.tax_customers       for all    to authenticated using (public.is_owner()) with check (public.is_owner());

-- สมาชิก: พนักงานค้นหาได้ สมัครผ่านฟังก์ชัน create_member เจ้าของร้านแก้ไขได้
create policy members_read   on public.members for select to authenticated using (public.is_staff());
create policy members_owner  on public.members for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy members_delete on public.members for delete to authenticated using (public.is_owner());
create policy points_read    on public.point_transactions for select to authenticated using (public.is_staff());

-- บิลและรอบขาย: พนักงานอ่านได้ (ใช้ค้นบิลเดิม พิมพ์ซ้ำ) บันทึกผ่านฟังก์ชันเท่านั้น
create policy shifts_read     on public.shifts     for select to authenticated using (public.is_staff());
create policy sales_read      on public.sales      for select to authenticated using (public.is_staff());
create policy sale_items_read on public.sale_items for select to authenticated using (public.is_staff());

-- บิลพัก: พนักงานจัดการได้เอง
create policy held_bills_staff on public.held_bills for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- secrets และ bill_counters ไม่มี policy = ไม่มีใครเข้าถึงตรง ๆ ได้

-- =====================================================================
-- 12) สิทธิ์ระดับตารางและฟังก์ชัน
-- =====================================================================
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
-- ตาราง PIN และตัวนับเลขบิล ปิดสนิท เข้าถึงได้ผ่านฟังก์ชันเท่านั้น
revoke all on public.secrets, public.bill_counters from authenticated;

revoke all on schema private from public;
revoke execute on all functions in schema private from public;
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;

-- =====================================================================
-- 13) ข้อมูลเริ่มต้น
-- =====================================================================
insert into public.settings (id, address) values (1, '170 ต.ดอนขมิ้น อ.ท่ามะกา จ.กาญจนบุรี');

-- PIN เริ่มต้น: เข้า POS = 1234, อนุมัติ = 0000  (เปลี่ยนทันทีหลังติดตั้งในหน้าตั้งค่าหลังบ้าน)
insert into public.secrets (id, pos_pin_hash, owner_pin_hash)
values (1, extensions.crypt('1234', extensions.gen_salt('bf')), extensions.crypt('0000', extensions.gen_salt('bf')));

insert into public.categories (name, size_type, sort_order) values
  ('รองเท้าผ้าใบ',   'shoe',     1),
  ('รองเท้าแฟชั่น',  'shoe',     2),
  ('รองเท้าแตะ',     'shoe',     3),
  ('รองเท้าเด็ก',    'kid_shoe', 4),
  ('ถุงเท้า',        'free',     5),
  ('เสื้อผ้า',       'apparel',  6);
