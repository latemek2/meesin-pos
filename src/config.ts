// ค่าเชื่อมต่อ Supabase ของร้านมีศิลป์
// Publishable key ออกแบบมาให้ใส่ในหน้าเว็บได้ ความปลอดภัยจริงอยู่ที่กฎในฐานข้อมูล
// ห้ามใส่ service_role / secret key ในไฟล์นี้เด็ดขาด
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://lxiriuamvpkegadxdbzq.supabase.co';
export const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_3yxYKECfSSxc00SFZeLsIQ_ulhJJMls';
