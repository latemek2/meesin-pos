-- =====================================================================
-- ล้างข้อมูลทดลองทั้งหมด ก่อนเริ่มใช้งานจริง
-- !! ลบถาวร กู้คืนไม่ได้ !! ใช้ครั้งเดียวก่อนเปิดใช้จริงเท่านั้น
--
-- ลบ:  สินค้า สีไซซ์ สต็อก ต้นทุน บิลขายทั้งหมด รอบขาย บิลพัก สมาชิกและแต้ม
--      ใบรับของ รอบนับสต็อก โปรโมชัน และเลขบิล (บิลแรกจะเริ่มที่ 0001 ใหม่)
-- เก็บ: ตั้งค่าร้าน PIN บัญชีผู้ใช้ หมวดหมู่ และซัพพลายเออร์
--
-- วิธีใช้: Supabase > SQL Editor > New query วางทั้งไฟล์ แล้วกด Run
-- =====================================================================
truncate table
  public.sale_item_costs,
  public.sale_items,
  public.approvals,
  public.point_transactions,
  public.sales,
  public.bill_counters,
  public.shifts,
  public.held_bills,
  public.stock_count_items,
  public.stock_counts,
  public.goods_receipt_items,
  public.goods_receipts,
  public.stock_movements,
  public.promotion_targets,
  public.promotions,
  public.members,
  public.variants,
  public.product_costs,
  public.products,
  public.tax_customers
restart identity cascade;
