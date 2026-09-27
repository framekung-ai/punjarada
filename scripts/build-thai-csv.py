#!/usr/bin/env python3
"""Build the Thai import files from the hotel's Thai menu CSV and the Thai set-menu posters.

    python3 scripts/build-thai-csv.py

Input : data/menu-thai-original.csv   (= "อาหารปัญจดารา - อาหารไทย.csv")
Output: data/import-menu-thai.csv     เมนูเลือกเองไทย  (รายการ,สไตล์,หมวด,ราคา (บาท),หน่วย,ตัวเลือก,แท็ก)
        data/import-sets-thai.csv     เซ็ตเมนูไทย 9 ชุด (ชุด,สไตล์,ราคาต่อโต๊ะ (บาท),ที่นั่ง,เครื่องดื่ม,รายการอาหาร,หมายเหตุ)
Both open in Excel (UTF-8 with BOM) and are imported in Admin → นำเข้าข้อมูล.
"""
import csv, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "menu-thai-original.csv"
OUT_MENU = ROOT / "data" / "import-menu-thai.csv"
OUT_SETS = ROOT / "data" / "import-sets-thai.csv"

# category in file -> (display name, unit); order = tab order for Sales
CATS = [
    ("น้ำพริก-ผัก", "น้ำพริก - ผัก", "ชุด"),
    ("ของทอด", "ของทอด", "จาน"),
    ("ผัด - คั่ว", "ผัด - คั่ว", "จาน"),
    ("ตำ - ยำ", "ตำ - ยำ", "จาน"),
    ("ต้ม - แกง", "ต้ม - แกง", "หม้อ"),
    ("จานเดียว", "จานเดียว", "จาน"),
    ("ของหวาน", "ของหวาน", "ชุด"),
    ("เครื่องดื่ม", "เครื่องดื่ม", "รายการ"),
]
CAT = {k: (n, u) for k, n, u in CATS}

# names that need more than "base + variant" (variant sits in the middle) -> split into separate dishes
SPLIT = {
    "ข้าวหมู / ไก่ทอดกระเทียม": ["ข้าวหมูทอดกระเทียม", "ข้าวไก่ทอดกระเทียม"],
    "หมู / ไก่ทอดกรกระเทียม": ["หมูทอดกระเทียม", "ไก่ทอดกระเทียม"],  # "กรกระเทียม" in the file = กระเทียม
}
PROTEIN = "หมู|ไก่|กุ้ง|ปลา|ทะเล|เนื้อ|ปู"


def split_variants(name):
    """ข้าวผัดหมู / ไก่ -> (ข้าวผัด, [หมู, ไก่]) ; plain names unchanged"""
    m = re.match(rf"^(.+?)({PROTEIN})\s*/\s*(.+)$", name)
    if not m:
        return name, []
    rest = [x.strip() for x in m.group(3).split("/")]
    if not all(re.fullmatch(PROTEIN, x) for x in rest):
        return name, []
    return m.group(1).strip(), [m.group(2)] + rest


def menu_rows():
    rows = list(csv.DictReader(SRC.open(encoding="utf-8-sig")))
    out = {k: [] for k, _, _ in CATS}
    for r in rows:
        raw, cat, price = r["รายการ"].strip(), r["ประเภท"].strip(), r["ราคา (บาท)"].strip()
        if cat not in CAT:
            raise SystemExit(f"unknown category {cat!r} for {raw!r}")
        names = [(n, []) for n in SPLIT[raw]] if raw in SPLIT else [split_variants(raw)]
        for base, variants in names:
            p = re.sub(r"\s*/\s*", " / ", price)
            unit = CAT[cat][1]
            out[cat].append([base, "ไทย", CAT[cat][0], p, unit, " / ".join(variants), ""])
    return [row for k, _, _ in CATS for row in out[k]]


# Thai set menus, read from Data/Set_Thai/1.png, 2.png, 3.png
# left column first, then right column; rice and fruit moved to the end (serving order)
SUPHANNAHONG = "น้ำเปล่า, เก๊กฮวย, น้ำแข็ง"
MEETING = "น้ำดื่ม, น้ำแข็ง"
SETS = [
    ("ชุดอาหารไทย A", 2500, "10 ที่", SUPHANNAHONG, "เมนูห้องอาหารสุพรรณหงส์", [
        "น้ำพริกไข่เค็ม - ผักสด", "ปลาทับทิมราดพริกสามรส", "ทอดมันปลากราย", "ผัดผักสี่สหาย",
        "แกงมัสมั่นไก่", "เต้าหู้ไข่ทรงเครื่อง", "ข้าวหอมมะลิ", "ผลไม้รวม"]),
    ("ชุดอาหารไทย B", 2500, "10 ที่", SUPHANNAHONG, "เมนูห้องอาหารสุพรรณหงส์", [
        "หลนเต้าเจี้ยว - ผักสด", "ปลาทับทิมผัดขึ้นฉ่าย", "ถั่วลันเตาผัดเห็ดฟาง", "ไก่ตุ๋นฟักมะนาวดอง",
        "ห่อหมกหมูใบยอ", "ยำไก่ยอ", "ข้าวหอมมะลิ", "ผลไม้รวม"]),
    ("ชุดอาหารไทย C", 2500, "10 ที่", SUPHANNAHONG, "เมนูห้องอาหารสุพรรณหงส์", [
        "น้ำพริกลงเรือ - ผักสด", "ปลาทับทิมผัดฉ่า", "ไก่ทอดเกลือ", "ผัดเห็ดสามอย่างโหระพา",
        "แกงเขียวหวานลูกชิ้นปลา", "หมูผัดพริกไทยดำ", "ข้าวหอมมะลิ ขนมจีน", "ผลไม้รวม"]),
    ("ชุดอาหารไทย D", 2500, "10 ที่", SUPHANNAHONG, "เมนูห้องอาหารสุพรรณหงส์", [
        "น้ำพริกไข่เค็ม - ผักสด", "ลูกชิ้นกุ้งผัดบร็อคโคลี", "แกงส้มปลาทอดผักรวม", "ผัดผักสี่สหาย",
        "แพนงหมู หรือไก่", "ห่อหมกหมูใบยอ", "ข้าวหอมมะลิ", "ผลไม้รวม"]),
    ("ชุดอาหารไทย E", 2500, "10 ที่", SUPHANNAHONG, "เมนูห้องอาหารสุพรรณหงส์", [
        "หลนเต้าเจี้ยว - ผักสด", "ปลาทับทิมผัดขึ้นฉ่าย", "ถั่วลันเตาผัดเห็ดฟาง", "ต้มไก่ใบมะขามอ่อน",
        "แกงเขียวหวานลูกชิ้นปลา", "ลาบหมูทอด", "ข้าวหอมมะลิ ขนมจีน", "ผลไม้รวม"]),
    ("ชุดอาหารไทย F", 2500, "10 ที่", SUPHANNAHONG, "เมนูห้องอาหารสุพรรณหงส์", [
        "น้ำพริกลงเรือ - ผักสด", "ผัดพริกขิงหมู", "ไก่ทอดเกลือ", "ผัดเห็ดสามอย่างโหระพา",
        "แกงเลียงผักรวมกุ้งสด", "ไข่ลูกเขย", "ข้าวหอมมะลิ", "ผลไม้รวม"]),
    ("ชุดอาหารไทยประชุม A", 2000, "", MEETING, "ชุดอาหารไทยสำหรับงานประชุม สัมมนา", [
        "น้ำพริกกะปิ - ผักต้ม", "กะหล่ำปลีผัดน้ำปลา", "ไข่เจียวสมุนไพร", "ปลาทับทิมราดซอส 3 รส",
        "ต้มแซ่บหมู", "หมูผัดเปรี้ยวหวาน", "ข้าวสวย", "ผลไม้รวม"]),
    ("ชุดอาหารไทยประชุม B", 2000, "", MEETING, "ชุดอาหารไทยสำหรับงานประชุม สัมมนา", [
        "หลนเต้าเจี้ยว - ผักสด", "ปลาดุกทอดกรอบผัดเผ็ด", "ไข่เจียวสมุนไพร", "ต้มจืดซี่โครงหมู",
        "ยำรวมมิตร", "ไก่ผัดพริกไทยดำ", "ข้าวสวย", "ผลไม้รวมตามฤดูกาล"]),
    ("ชุดอาหารไทยประชุม C", 2000, "", MEETING, "ชุดอาหารไทยสำหรับงานประชุม สัมมนา", [
        "น้ำพริกหมูโคราช - ผักสด", "ผัดเห็ดสามอย่างโหระพา", "ปลาทับทิมผัดฉ่า", "แกงเลียงผักรวม",
        "ไข่เจียวสมุนไพร", "หมูคลุกฝุ่น", "ข้าวสวย", "ผลไม้รวม"]),
]


def write(path, header, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
        w.writerow(header)
        w.writerows(rows)


menu = menu_rows()
write(OUT_MENU, ["รายการ", "สไตล์", "หมวด", "ราคา (บาท)", "หน่วย", "ตัวเลือก", "แท็ก"], menu)
write(OUT_SETS, ["ชุด", "สไตล์", "ราคาต่อโต๊ะ (บาท)", "ที่นั่ง", "เครื่องดื่ม", "รายการอาหาร", "หมายเหตุ"],
      [[n, "ไทย", p, seats, drinks, " | ".join(items), note] for n, p, seats, drinks, note, items in SETS])
print(f"{len(menu)} Thai dishes -> {OUT_MENU.name}\n{len(SETS)} Thai sets -> {OUT_SETS.name}")
