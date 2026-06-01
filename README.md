# Nyit Computer — ระบบจัดการสต๊อกและการขาย

ระบบจัดการสต๊อกและการขายสำหรับร้านคอมพิวเตอร์ (UI ภาษาไทย) สร้างด้วย **Vite + React + TypeScript**

## เริ่มใช้งาน

```bash
npm install
npm run dev      # เปิด http://localhost:5173
```

เซิร์ฟเวอร์ dev เปิดให้เข้าถึงผ่าน LAN ด้วย (ดู URL "Network") — เปิดบนมือถือ/แท็บเล็ตในวง Wi‑Fi เดียวกันเพื่อทดสอบ responsive ได้ทันที

```bash
npm run build    # ตรวจชนิดข้อมูล + สร้างไฟล์ production ที่ dist/
npm run preview  # ดู build จริงในเครื่อง
```

## หน้าจอในระบบ

| เมนู | รายละเอียด |
|------|-----------|
| **แดชบอร์ด** | KPI, กราฟยอดขาย 7 วัน, สัดส่วนตามหมวด, สินค้าขายดี, แจ้งเตือนสต๊อกใกล้หมด |
| **คลังสินค้า** | ตารางค้นหา/กรอง/เรียง/แบ่งหน้า, สถานะสต๊อก, SKU & Serial |
| **เพิ่มสินค้า** | ฟอร์มสินค้าพร้อมคำนวณกำไรสด + ตัวอย่างการ์ดสินค้า |
| **ชุดสินค้า** | สร้าง bundle แบบ step-by-step รวมราคา/กำไรอัตโนมัติ |
| **ขายสินค้า** | เปิดบิลสินค้าเดี่ยว/ชุด, การชำระเงิน, สรุปกำไร, หน้ายืนยัน |
| **วิเคราะห์** | กราฟยอดขาย/กำไรรายเดือน, การเคลื่อนไหวสต๊อก, ประสิทธิภาพชุดสินค้า |

ปุ่มในแถบบน: สลับ **โหมดมืด/สว่าง**, ปรับ **สีหลัก** และ **ความหนาแน่นของแถว** (ค่าถูกจำไว้ใน localStorage)

## โครงสร้างโค้ด

```
src/
  main.tsx              จุดเริ่มต้น
  App.tsx               โครงหน้า: sidebar / topbar / router / toast / mobile drawer
  styles.css            design tokens + ทุกคอมโพเนนต์ + responsive layers
  types.ts              ชนิดข้อมูลหลัก (Product, Bundle, Txn, ...)
  data/
    catalog.ts          ข้อมูลตัวอย่าง (สินค้า/ชุด/ธุรกรรม) — เปลี่ยนเป็น API ภายหลังได้
    format.ts           ฟอร์แมตเงินบาท/ตัวเลขแบบไทย
  hooks/
    useTheme.ts         โหมดมืด + สีหลัก + ความหนาแน่น (persist)
    useMediaQuery.ts
  components/
    Sidebar.tsx  Topbar.tsx  MobileNav.tsx  SettingsMenu.tsx  Icons.tsx
    charts/ (Sparkline, BarChart, Donut, AreaChart — SVG ล้วน ไม่มี dependency)
  views/
    DashboardView  InventoryView  AddProductView
    BundlesView    SalesView      AnalyticsView
```

## Responsive

ทดสอบครอบคลุม โทรศัพท์ → แท็บเล็ต → โน้ตบุ๊ก → จอใหญ่:

- **> 900px** — sidebar ถาวร, เลย์เอาต์เต็ม
- **≤ 1100px** — คอลัมน์ 12-grid ยุบเป็นแถวเดียว, panel สรุปเลิก sticky
- **≤ 1024px** — ช่องค้นหาบนแถบบนยุบเป็นปุ่มไอคอน
- **≤ 900px** — sidebar กลายเป็น drawer (ปุ่ม ☰) + แถบเมนูล่างบนมือถือ, ตารางเลื่อนแนวนอนได้
- **≤ 600px** — การ์ด/ฟอร์มเรียงเป็นคอลัมน์เดียว, ปุ่มหัวหน้าเต็มความกว้าง
- รองรับ `prefers-color-scheme`, `prefers-reduced-motion` และ safe-area ของจอมีติ่ง

## หมายเหตุ

ข้อมูลทั้งหมดเป็น mock อยู่ใน `src/data/catalog.ts` — views อ้างอิงเฉพาะชนิดข้อมูล ไม่ผูกกับแหล่งข้อมูล จึงต่อ backend/ฐานข้อมูลจริงได้ภายหลังโดยไม่ต้องแก้หน้าจอ
