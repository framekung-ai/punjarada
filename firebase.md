# Firebase — การตั้งค่าและ Security Rules ของ PunjadaraPOS

โปรเจกต์ Firebase: **`punjadarapos`** · ผู้ใช้ไม่เกิน 20 คน · ใช้ได้บนแพ็กเกจฟรี (Spark)

แอปใช้ Firebase 3 ส่วน:

| บริการ | ใช้ทำอะไร | จำเป็นในเฟส 1 |
| --- | --- | --- |
| Authentication (Email/Password) | ล็อกอิน Sales / Admin | ✓ |
| Cloud Firestore | เมนู เซ็ต บริการ กฎ FOC เอกสาร BEO ลูกค้า | ✓ |
| Hosting | เว็บแอป (`https://punjadarapos.web.app`) | ✓ |
| Cloud Storage | รูปเมนู / เก็บ PDF ย้อนหลัง | ยังไม่ใช้ (มี rules เตรียมไว้) |

ไม่ใช้ Cloud Functions ในเฟส 1 จึงไม่ต้องผูกบัตร (Blaze) — เลขที่เอกสารออกด้วย Firestore transaction ฝั่งแอป และ rules บังคับให้เลขเพิ่มทีละ 1 เท่านั้น

---

## 1. ตั้งค่าครั้งแรก (ทำครั้งเดียว ~15 นาที)

### 1.1 เปิดบริการใน Firebase Console
1. **Authentication → Sign-in method → Email/Password → Enable** (ไม่ต้องเปิด Email link)
2. **Authentication → Settings → User actions → เปิด “Email enumeration protection”** (กันคนเดาว่าอีเมลไหนมีบัญชี)
3. **Authentication → Settings → Authorized domains** ควรมีแค่ `localhost`, `punjadarapos.firebaseapp.com`, `punjadarapos.web.app` และโดเมน Vercel ที่ใช้จริง (เช่น `punjadara-pos.vercel.app`)
4. **Firestore Database → Create database → Production mode**
   - Location: **`asia-southeast1` (Singapore)** — ใกล้ไทยที่สุด *เปลี่ยนภายหลังไม่ได้*
   - ถ้าสร้างไว้แล้วด้วย test mode ให้ deploy rules ในข้อ 1.2 ทันที (test mode เปิดให้ทุกคนอ่าน/เขียนได้ 30 วัน)

### 1.2 ติดตั้ง CLI และ deploy rules + index
```bash
cd app
npm install                 # ครั้งแรก
npx firebase login          # ล็อกอินบัญชี Google ที่เป็นเจ้าของโปรเจกต์
npm run deploy:rules        # = firebase deploy --only firestore:rules,firestore:indexes
```
Index ที่ต้องมี (อยู่ใน `firestore.indexes.json` แล้ว): `beos` — `salesUid ↑` + `event.date ↓` (ใช้กับหน้า “เอกสารของฉัน”) ถ้าเห็นข้อความ “ต้องสร้าง index” แปลว่ายังไม่ได้ deploy ข้อนี้ หรือ index ยังสร้างไม่เสร็จ (รอ 1–5 นาที)

### 1.3 สร้าง Admin คนแรก
Rules ไม่ยอมให้ใครตั้งตัวเองเป็น Admin ได้ จึงต้องสร้างคนแรกจาก Console:
1. **Authentication → Users → Add user** ใส่อีเมล + รหัสผ่าน → คัดลอก **User UID**
2. **Firestore → Start collection** ชื่อ `users` → Document ID = **UID ที่คัดลอก** → เพิ่มฟิลด์

   | ฟิลด์ | ชนิด | ค่า |
   | --- | --- | --- |
   | `email` | string | อีเมลเดียวกับข้อ 1 |
   | `displayName` | string | ชื่อที่จะแสดงบนเอกสาร |
   | `role` | string | `admin` |
   | `active` | boolean | `true` |

   ต้องมีแค่ 4 ฟิลด์นี้ (rules ตรวจ `keys().hasOnly`)
3. เปิดแอป → ล็อกอิน → เมนู **นำเข้าข้อมูล → ติดตั้งข้อมูลเริ่มต้น** (เมนู 147 รายการ, 5 เซ็ต, 6 บริการ, 4 กฎ FOC, 10 ห้อง — เขียนประมาณ 180 ครั้ง ครั้งเดียว)
4. เพิ่ม Sales ที่เมนู **ผู้ใช้งาน → + เพิ่มผู้ใช้** (แอปสร้างบัญชีให้โดย Admin ไม่หลุดจากระบบ)

### 1.4 Deploy เว็บ

**ทางเลือก A — Vercel (ผ่าน GitHub)**
1. สร้าง repo แบบ **Private** โดยให้ root ของ repo = โฟลเดอร์ `app` (อย่า push โฟลเดอร์ `BEO Sample` เพราะมีชื่อและเบอร์โทรลูกค้าจริง)
2. Vercel → Add New Project → เลือก repo → Framework = Vite (ไฟล์ `vercel.json` ตั้งค่า build / output / SPA rewrite ไว้แล้ว ไม่ต้องใส่ Environment Variables)
3. ถ้า repo มีโฟลเดอร์อื่นด้วย ให้ตั้ง **Root Directory = `app`**
4. เอาโดเมน `.vercel.app` ที่ได้ไปใส่ใน Authorized domains (ข้อ 1.1) และ API key restrictions (ข้อ 5)
5. Rules / index ยัง deploy ด้วย `npm run deploy:rules` จากเครื่อง — Vercel ไม่ได้ deploy ให้

**ทางเลือก B — Firebase Hosting**
```bash
npm run deploy              # build + deploy hosting และ firestore rules
```

---

## 2. โมเดลสิทธิ์

บทบาทเก็บใน `users/{uid}` (`role`: `sales` | `admin`, `active`: true/false) และ **มีแค่ Admin ที่แก้ได้** บัญชีที่ล็อกอินได้แต่ไม่มีเอกสาร `users` (หรือ `active=false`) จะอ่าน/เขียนอะไรไม่ได้เลย — ดังนั้นถึงมีคนสมัครบัญชีเองผ่าน API ก็ไม่เห็นข้อมูล

| Collection | Sales | Admin | หมายเหตุ |
| --- | --- | --- | --- |
| `users` | อ่านของตัวเอง | อ่าน/เขียนทั้งหมด | Admin ลดสิทธิ์/ปิดตัวเองไม่ได้ (กันล็อกตัวเองออก) |
| `categories`, `menuItems`, `menuSets`, `services`, `focRules`, `settings`, `meta` | อ่าน | อ่าน/เขียน | ตรวจชื่อ ≤150 ตัว, ราคา ≥ 0 |
| `customers/{เบอร์โทร}` | อ่าน/สร้าง/แก้ | + ลบ, ค้นหาในเมนู “ลูกค้า” | ID ต้องเป็นตัวเลข 9–10 หลัก |
| `counters/beo-{พ.ศ.}` | อ่าน, เพิ่มทีละ 1 | เหมือนกัน | ข้ามเลข/ลดเลข/ลบ ไม่ได้ |
| `beos` | สร้างในชื่อตัวเอง, อ่านของตัวเอง, แก้ได้ตอน **แบบร่าง** และ **รอการยืนยัน**, ส่งงาน = สถานะ `pending` | ทุกอย่าง รวมถึงกด **ยืนยันงาน** | Sales ยืนยันงานเองไม่ได้ — หลัง Admin ยืนยันแก้ได้เฉพาะ Admin |
| `beos/{id}/revisions` | อ่าน/เพิ่ม ของงานตัวเอง | อ่าน/เพิ่ม | แก้ไข/ลบไม่ได้ (audit trail) |
| `bookings/{beoId}` | อ่านทั้งหมด, เขียนของงานตัวเอง | ทุกอย่าง | ใช้เช็กห้องชนกัน — มีแค่ วัน/ห้อง/เวลา/ชื่องาน ไม่มีข้อมูลลูกค้า |
| อื่นๆ ทั้งหมด | ✗ | ✗ | ปิดเป็นค่าเริ่มต้น |

ทำไมต้องมี `bookings`: Sales อ่าน BEO ของคนอื่นไม่ได้ (มีชื่อ/เบอร์ลูกค้า) แต่ต้องรู้ว่าห้องว่างไหม จึงแยกข้อมูลจองห้องที่ไม่มีข้อมูลส่วนตัวออกมาให้ทุกคนอ่าน

ข้อจำกัดที่รู้อยู่: ยอดเงินคำนวณในแอป (ไม่มี Cloud Functions) — Sales ที่ตั้งใจแก้ request เองอาจส่งยอดผิดได้ในงานของตัวเองที่ยังไม่ยืนยัน แต่ Admin ต้องตรวจและกดยืนยันก่อนทุกครั้ง หลังยืนยันแล้ว Sales แก้ไม่ได้ และ Admin เห็นประวัติทุก revision ถ้าต้องการบังคับยอดฝั่งเซิร์ฟเวอร์ ให้เพิ่ม Cloud Function `onBeoConfirm` ในเฟส 3 (ต้องใช้ Blaze)

---

## 3. `firestore.rules`

คัดลอกไปวางใน **Firestore → Rules** ได้ทันที หรือ `npm run deploy:rules`

```
rules_version = '2';

// PunjadaraPOS — Firestore security rules
// Roles live in /users/{uid} (role: 'sales' | 'admin', active: bool) and can only be
// written by an Admin. A signed-in account WITHOUT a users doc (or with active=false)
// can read or write nothing.

service cloud.firestore {
  match /databases/{database}/documents {

    // ---------- helpers ----------
    function signedIn() { return request.auth != null; }
    function userPath() { return /databases/$(database)/documents/users/$(request.auth.uid); }
    function isActive() {
      return signedIn() && exists(userPath()) && get(userPath()).data.active == true;
    }
    function isAdmin() { return isActive() && get(userPath()).data.role == 'admin'; }
    function isOwner(d) { return d.salesUid == request.auth.uid; }
    function str(v, max) { return v is string && v.size() <= max; }

    // ---------- users ----------
    match /users/{uid} {
      allow read: if signedIn() && (request.auth.uid == uid || isAdmin());
      allow create, update: if isAdmin()
        && request.resource.data.keys().hasOnly(['email', 'displayName', 'role', 'active'])
        && request.resource.data.role in ['sales', 'admin']
        && request.resource.data.active is bool
        && str(request.resource.data.displayName, 100)
        // an Admin cannot demote or deactivate themself (prevents lock-out)
        && (uid != request.auth.uid
            || (request.resource.data.role == 'admin' && request.resource.data.active == true));
      allow delete: if isAdmin() && uid != request.auth.uid;
    }

    // ---------- catalog: read by staff, written by Admin ----------
    match /categories/{id} {
      allow read: if isActive();
      allow write: if isAdmin();
    }
    match /menuItems/{id} {
      allow read: if isActive();
      allow delete: if isAdmin();
      allow create, update: if isAdmin()
        && str(request.resource.data.name, 150)
        && request.resource.data.price is number && request.resource.data.price >= 0;
    }
    match /menuSets/{id} {
      allow read: if isActive();
      allow delete: if isAdmin();
      allow create, update: if isAdmin()
        && str(request.resource.data.name, 150)
        && request.resource.data.pricePerTable is number && request.resource.data.pricePerTable >= 0
        && request.resource.data.items is list && request.resource.data.items.size() <= 40;
    }
    match /services/{id} {
      allow read: if isActive();
      allow delete: if isAdmin();
      allow create, update: if isAdmin()
        && str(request.resource.data.name, 150)
        && request.resource.data.price is number && request.resource.data.price >= 0;
    }
    match /focRules/{id} {
      allow read: if isActive();
      allow write: if isAdmin();
    }
    match /settings/{id} {
      allow read: if isActive();
      allow write: if isAdmin();
    }
    match /meta/{id} {
      allow read: if isActive();
      allow write: if isAdmin();
    }

    // ---------- customers (doc id = phone digits) ----------
    match /customers/{phone} {
      allow read: if isActive();
      allow create, update: if isActive()
        && phone.matches('^[0-9]{9,10}$')
        && str(request.resource.data.name, 200)
        && request.resource.data.beoCount is int;
      allow delete: if isAdmin();
    }

    // ---------- running numbers ----------
    match /counters/{id} {
      allow read: if isActive();
      allow create: if isActive() && id.matches('^beo-[0-9]{4}$')
        && request.resource.data.keys().hasOnly(['seq']) && request.resource.data.seq == 1;
      allow update: if isActive()
        && request.resource.data.keys().hasOnly(['seq'])
        && request.resource.data.seq == resource.data.seq + 1;
      allow delete: if false;
    }

    // ---------- BEO documents ----------
    function validBeo(d) {
      return d.keys().hasAll(['status', 'customer', 'event', 'seating', 'lines', 'totals', 'salesUid', 'salesName'])
        && d.status in ['draft', 'pending', 'confirmed', 'completed', 'cancelled']
        && str(d.customer.name, 200)
        && str(d.event.date, 10)
        && d.lines is list && d.lines.size() <= 200
        && d.totals.grandTotal is number
        && str(d.note, 5000)
        && str(d.salesUid, 128);
    }

    match /beos/{id} {
      allow read: if isAdmin() || (isActive() && isOwner(resource.data));

      // Sales create their own drafts, or submit straight away ("pending" = รอการยืนยัน).
      // Only Admin can confirm.
      allow create: if isActive()
        && validBeo(request.resource.data)
        && (isAdmin()
            || (isOwner(request.resource.data) && request.resource.data.status in ['draft', 'pending']));

      // Sales may edit their own BEO while it is a draft or waiting for confirmation.
      // After Admin confirms, only Admin edits.
      allow update: if isActive()
        && validBeo(request.resource.data)
        && (isAdmin()
            || (isOwner(resource.data)
                && resource.data.status in ['draft', 'pending']
                && isOwner(request.resource.data)
                && request.resource.data.status in ['draft', 'pending']));

      allow delete: if isAdmin();

      // revision history: append-only audit trail
      match /revisions/{rev} {
        allow read: if isAdmin()
          || (isActive() && get(/databases/$(database)/documents/beos/$(id)).data.salesUid == request.auth.uid);
        allow create: if isAdmin()
          || (isActive() && getAfter(/databases/$(database)/documents/beos/$(id)).data.salesUid == request.auth.uid);
        allow update, delete: if false;
      }
    }

    // ---------- room bookings (public to staff, no customer data) ----------
    match /bookings/{beoId} {
      allow read: if isActive();
      allow create, update: if isAdmin()
        || (isActive()
            && request.resource.data.salesUid == request.auth.uid
            && getAfter(/databases/$(database)/documents/beos/$(beoId)).data.salesUid == request.auth.uid);
      allow delete: if isAdmin();
    }

    // everything else is closed
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 4. `storage.rules` (ยังไม่ใช้ในเฟส 1)

ปิดทุกอย่างไว้ก่อน เตรียมโฟลเดอร์ `public/` (รูปเมนู — Admin อัปโหลด) และ `beo-pdf/` (PDF ย้อนหลัง) ไว้ rules นี้อ่านบทบาทจาก Firestore ครั้งแรกที่ deploy Console จะขอสิทธิ์ให้ Storage อ่าน Firestore ได้ — กด Allow

> หมายเหตุ: โปรเจกต์ที่สร้างหลัง ต.ค. 2024 ต้องใช้แพ็กเกจ Blaze จึงจะเปิด Cloud Storage ได้ — เฟส 1 จึงไม่ใช้ Storage (โลโก้ฝังในแอป, PDF สร้างในเครื่อง)

```
rules_version = '2';

// PunjadaraPOS — Cloud Storage rules
// The MVP does not upload files (logo is bundled with the app, PDFs are generated in the
// browser). These rules are ready for later: menu photos / logo under /public, and archived
// BEO PDFs under /beo-pdf. Roles are read from Firestore /users/{uid}.

service firebase.storage {
  match /b/{bucket}/o {
    function profile() {
      return firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data;
    }
    function isActive() {
      return request.auth != null
        && firestore.exists(/databases/(default)/documents/users/$(request.auth.uid))
        && profile().active == true;
    }
    function isAdmin() { return isActive() && profile().role == 'admin'; }

    // menu photos, logo (Admin uploads, staff read)
    match /public/{file=**} {
      allow read: if isActive();
      allow write: if isAdmin()
        && request.resource.size < 5 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }

    // archived BEO PDFs (any active staff can upload a PDF for a BEO, Admin can delete)
    match /beo-pdf/{beoId}/{file} {
      allow read: if isActive();
      allow create: if isActive()
        && request.resource.size < 10 * 1024 * 1024
        && request.resource.contentType == 'application/pdf';
      allow delete: if isAdmin();
    }

    match /{all=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 5. API key และความปลอดภัยอื่น

- ค่า `apiKey` ใน config **ไม่ใช่ความลับ** มันแค่บอกว่าเป็นโปรเจกต์ไหน ความปลอดภัยจริงอยู่ที่ Auth + Rules ข้างบน
- ควรจำกัด key ใน **Google Cloud Console → APIs & Services → Credentials → Browser key (auto created by Firebase)**:
  - Application restrictions → **Websites**: `https://punjadara-pos.vercel.app/*` (โดเมน Vercel จริงของคุณ), `https://punjadarapos.web.app/*`, `https://punjadarapos.firebaseapp.com/*`, `http://localhost:5173/*`
  - ถ้าใช้ Preview deployments ของ Vercel ให้เพิ่ม `https://*-<ชื่อทีม>.vercel.app/*` ด้วย ไม่งั้นหน้า preview จะล็อกอินไม่ได้
  - API restrictions: Identity Toolkit API, Token Service API, Cloud Firestore API, Firebase Installations API
- **Authentication → Settings → Password policy**: ขั้นต่ำ 8 ตัวอักษร (หน้าเพิ่มผู้ใช้บังคับ 8 ตัวอยู่แล้ว)
- ปิดบัญชีคนที่ลาออก: หน้า **ผู้ใช้งาน** → เอาติ๊ก “ใช้งาน” ออก (มีผลทันที ไม่ต้องลบ)
- ตัวเลือกเพิ่มเติมภายหลัง: **App Check** (reCAPTCHA Enterprise) กันสคริปต์ที่ไม่ได้มาจากแอปจริง

---

## 6. โควตา (แพ็กเกจฟรี Spark)

| ทรัพยากร | ฟรีต่อวัน | ประมาณการใช้จริง (20 คน) |
| --- | --- | --- |
| Firestore อ่าน | 50,000 | ~1,000–3,000 |
| Firestore เขียน | 20,000 | ~200–500 |
| Firestore ลบ | 20,000 | < 50 |
| พื้นที่ Firestore | 1 GiB รวม | BEO 1 ใบ ≈ 5–10 KB → ~100,000 ใบ |
| Hosting | 10 GB/เดือน | แอป ≈ 0.5 MB ต่อการเปิดครั้งแรก |

สิ่งที่แอปทำเพื่อประหยัดโควตา:

1. **แคชเมนูทั้งชุดในเครื่อง** — เปิดแอปอ่านแค่ 1 เอกสาร (`meta/catalog`) ดาวน์โหลดเมนู ~170 เอกสารใหม่เฉพาะตอน Admin แก้ข้อมูล
2. **Offline persistence** ของ Firestore — เอกสารที่เคยอ่านแล้วไม่ต้องอ่านซ้ำจากเซิร์ฟเวอร์
3. รายการเอกสารจำกัด 50 ใบล่าสุด (Sales) / เฉพาะเดือนที่เลือก (Admin)
4. บันทึกแบบร่างอัตโนมัติเฉพาะตอนเปลี่ยนขั้นและมีการแก้ไขจริง
5. **ทดสอบโดยไม่ใช้โควตา**:
   - `npm run demo` — แอปทั้งตัวแบบไม่ต่อ Firebase (ข้อมูลเก็บในเบราว์เซอร์) ใช้ทดลอง UI/ฝึก Sales
   - `npm run test` — ทดสอบการคำนวณราคา/FOC/VAT/บาทถ้วน (16 เคส)
   - `npm run test:rules` — ทดสอบ rules บน **Firestore emulator ในเครื่อง** (ต้องมี Java 11+) ไม่แตะโปรเจกต์จริง

ดูการใช้งานจริงได้ที่ **Firebase Console → Usage and billing** ถ้าย้ายไป Blaze ให้ตั้ง **Budget alert** (เช่น 100 บาท/เดือน) ไว้ด้วย

---

## 7. ทดสอบ Rules ในเครื่อง

```bash
cd app
npm install
npm run test:rules
```

ครอบคลุม 32 กรณี เช่น คนไม่มีโปรไฟล์อ่านเมนูไม่ได้, Sales แก้ราคาไม่ได้, Sales อ่าน BEO ของคนอื่นไม่ได้, แก้หลังยืนยันไม่ได้, Admin ล็อกตัวเองออกไม่ได้, เลขที่เอกสารข้ามเลขไม่ได้ (ไฟล์ `tests/firestore.rules.test.ts`)

> ยังไม่ได้รันชุดนี้จากฝั่งผู้พัฒนา เพราะเครือข่ายที่ใช้สร้างโปรเจกต์ดาวน์โหลดตัว emulator ไม่ได้ — ควรรันบนเครื่องจริงหนึ่งครั้งก่อน deploy rules

---

## 8. สำรองข้อมูล

- แพ็กเกจฟรีไม่มี scheduled backup — ใช้หน้า **เอกสาร BEO → ส่งออก Excel (CSV)** รายเดือน และ **นำเข้าข้อมูล → ส่งออกเมนูเป็น CSV**
- ถ้าย้ายไป Blaze: เปิด **Firestore → Disaster recovery → Backups** (รายวัน, เก็บ 7 วัน)

---

## 9. Checklist ก่อนใช้งานจริง

- [ ] Email/Password เปิด, Email enumeration protection เปิด
- [ ] Firestore สร้างที่ `asia-southeast1` แบบ Production mode
- [ ] `npm run test:rules` ผ่าน
- [ ] `npm run deploy:rules` แล้ว index `beos` สถานะ Enabled
- [ ] สร้าง Admin คนแรก (ข้อ 1.3) แล้วติดตั้งข้อมูลเริ่มต้น
- [ ] ตรวจเมนูที่ติด ⚠ “ต้องตรวจสอบ” (ราคาเส้นหมี่ราดหน้าปลาเต้าซี่, ขนาดโค้ก)
- [ ] จำกัด API key ตามข้อ 5
- [ ] `npm run deploy` แล้วเปิด `https://punjadarapos.web.app` บนมือถือ → Add to Home Screen
