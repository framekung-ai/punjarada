# PunjadaraPOS — ระบบสร้างเอกสาร BEO

Web App (React + Vite + Firebase) สำหรับ Sales สร้าง Banquet Event Order และ Admin จัดการเมนู/เซ็ต/บริการ/กฎ FOC
ใช้ได้บนมือถือ แท็บเล็ต และคอมพิวเตอร์ · ภาษาไทย · วันที่ พ.ศ. · ราคาไม่รวม VAT 7%

## เริ่มต้น

```bash
npm install
npm run demo      # ลองใช้ทั้งแอปแบบไม่ต่อ Firebase (ไม่ใช้โควตา) → http://localhost:5173
npm run dev       # ต่อ Firebase จริง (punjadarapos)
npm test          # ทดสอบการคำนวณราคา / FOC / VAT / บาทถ้วน
npm run test:rules  # ทดสอบ security rules บน emulator ในเครื่อง (ต้องมี Java 11+)
npm run deploy    # build + deploy ขึ้น Firebase Hosting พร้อม rules
```

ในโหมด demo: ล็อกอินด้วยอีเมลอะไรก็ได้ = Sales, อีเมลที่มีคำว่า `admin` = Admin

**ตั้งค่า Firebase ครั้งแรก / Security Rules / โควตา → ดู [firebase.md](firebase.md)**

## โครงสร้าง

| โฟลเดอร์ | เนื้อหา |
| --- | --- |
| `src/lib/pricing.ts` | คำนวณราคา, กฎ FOC, VAT, ตัวช่วยเช็กองค์ประกอบมื้อ (มี test) |
| `src/lib/db.ts` | อ่าน/เขียน Firestore ทั้งหมด (แคชเมนูเพื่อประหยัดโควตา) |
| `src/pages/wizard/` | ฟอร์ม Sales 6 ขั้น |
| `src/beo/` | เอกสาร BEO (A4) + ส่งออก PDF / JPG |
| `src/pages/admin/` | หน้า Admin |
| `src/seed/seed.json` | ข้อมูลเริ่มต้น สร้างจาก `data/menu-original.csv` ด้วย `python3 scripts/build-seed.py` |
| `src/demo/` | ตัวจำลอง Firebase สำหรับ `npm run demo` |
| `firestore.rules`, `storage.rules`, `tests/` | Security rules และชุดทดสอบ |
