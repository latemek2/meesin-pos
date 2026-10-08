# ขั้นที่ 2: เอาเว็บขึ้นออนไลน์ด้วย Cloudflare Pages

ใช้เวลาประมาณ 15 นาที ทำครั้งเดียว หลังจากนี้ทุกครั้งที่โค้ดใน GitHub เปลี่ยน เว็บจะอัปเดตเองภายในไม่กี่นาที

> หน้าเว็บของ Cloudflare เปลี่ยนบ่อย ชื่อปุ่มอาจต่างเล็กน้อย ถ้าหาไม่เจอ ถ่ายภาพหน้าจอส่งมาได้เลย

---

## 1. สมัคร Cloudflare

1. เข้า https://dash.cloudflare.com/sign-up
2. สมัครด้วยอีเมลและรหัสผ่าน แล้วยืนยันอีเมล
3. ไม่ต้องเพิ่มโดเมนใด ๆ ข้ามขั้นนั้นได้

## 2. สร้างโปรเจกต์ Pages ที่เชื่อมกับ GitHub

1. เมนูซ้าย เลือก **Workers & Pages** (หรือ **Compute (Workers)**)
2. กด **Create** (หรือ **Create application**)
3. เลือกแท็บ **Pages** ถ้าเห็นแต่ Workers ให้มองหาลิงก์ **Looking to deploy Pages? Get started**
4. กด **Connect to Git** (หรือ **Import an existing Git repository**)
5. เลือก **GitHub** แล้วอนุญาตให้ Cloudflare เข้าถึง repository `meesin-pos`
6. เลือก `latemek2/meesin-pos` แล้วกด **Begin setup**

## 3. ตั้งค่าการ build

| ช่อง | ใส่ค่า |
| --- | --- |
| Project name | `meesin-pos` |
| Production branch | `main` |
| Framework preset | `React (Vite)` หรือ `None` |
| Build command | `npm run build` |
| Build output directory | `dist` |

จากนั้นเปิด **Environment variables (advanced)** แล้วเพิ่ม 1 ตัว

| Variable name | Value |
| --- | --- |
| `NODE_VERSION` | `20` |

กด **Save and Deploy** แล้วรอ 2–3 นาที เสร็จแล้วจะได้ลิงก์แบบ `https://meesin-pos.pages.dev`

## 4. บอก Supabase ว่าเว็บอยู่ที่ไหน

1. ที่ Supabase เลือก **Authentication** แล้วเลือก **URL Configuration**
2. ช่อง **Site URL** ใส่ลิงก์ที่ได้จาก Cloudflare เช่น `https://meesin-pos.pages.dev`
3. กด **Save**

## 5. ลองเข้าใช้งาน

1. เปิดลิงก์ของเว็บ
2. เข้าสู่ระบบด้วยบัญชีเจ้าของร้าน ระบบจะพาไปหน้าหลังบ้าน
3. ทำตามรายการ "เริ่มต้นใช้งาน" ที่หน้าภาพรวม
   - เปลี่ยน PIN ทั้งสองตัวที่หน้า **ตั้งค่า**
   - ใส่เลขพร้อมเพย์และบัญชีธนาคารที่หน้า **ตั้งค่า**
   - เพิ่มซัพพลายเออร์
   - ลองเพิ่มสินค้า 1 รุ่น พร้อมสีและไซซ์

ถ้าเข้าแล้วขึ้นว่า "บัญชีนี้ยังไม่ได้กำหนดสิทธิ์" แปลว่าข้อ 5 ในคู่มือ Supabase ยังไม่สำเร็จ

---

## ติดตั้งเป็นแอปบนคอมหน้าร้าน (ทำตอนหน้าขายเสร็จแล้ว)

ขั้นนี้จะมีคู่มือแยก พร้อมวิธีตั้งเครื่องพิมพ์ใบเสร็จให้พิมพ์ทันทีโดยไม่ถามทุกครั้ง
