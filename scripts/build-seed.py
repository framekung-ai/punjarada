#!/usr/bin/env python3
"""Build src/seed/seed.json from data/menu-original.csv.

Cleans the hotel's menu file (duplicates, typos, variants, non-numeric prices),
assigns category / course / tags, and adds the 5 set menus, services,
FOC rules and settings. Re-run after editing the CSV:
    python3 scripts/build-seed.py
"""
import csv, json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "menu-original.csv"
OUT = ROOT / "src" / "seed" / "seed.json"

TYPO = {
    "ผัดโหงวก๊๊วย": "ผัดโหงวก๊วย",
    "ผัดสี่สหายน้ำแแดง": "ผัดสี่สหายน้ำแดง",
    "หัวปลาต้มเเผือก": "หัวปลาต้มเผือก",
    "เบีนร์สิงห์": "เบียร์สิงห์",
    "ข้าวผัดกุญเชียง": "ข้าวผัดกุนเชียง",
    "กระเพาะปลาน้ำแดง": "ซุปกระเพาะปลาน้ำแดง",
    "ปลาหิมะนึ่งซีอิ้ว": "ปลาหิมะนึ่งซีอิ๊ว",
    "ปลากะพงนึ่งซีอิ้ว": "ปลากะพงนึ่งซีอิ๊ว",
    "ข้าวผัดหนำเลี๊ยบ": "ข้าวผัดหนำเลี้ยบ",
    "ปูนิ่มผัดผงกระหรี่": "ปูนิ่มผัดผงกะหรี่",
}

# name in file -> (base name, [variants])
VARIANTS = {
    "โกยซีหมี่หมู/ไก่": ("โกยซีหมี่", ["หมู", "ไก่"]),
    "โกยซีหมี่หมู / ไก่": ("โกยซีหมี่", ["หมู", "ไก่"]),
    "โกยซีหมี่กุ้ง / ทะเล": ("โกยซีหมี่", ["กุ้ง", "ทะเล"]),
    "ต้มแซ่บเอ็นหมู / ซี่โครงอ่อน": ("ต้มแซ่บ", ["เอ็นหมู", "ซี่โครงอ่อน"]),
    "ต้มยำกุ้งน้ำข้น / น้ำใส": ("ต้มยำกุ้ง", ["น้ำข้น", "น้ำใส"]),
    "ต้มยำรวมมิตรทะเลน้ำข้น / น้ำใส": ("ต้มยำรวมมิตรทะเล", ["น้ำข้น", "น้ำใส"]),
    "เนื้อปลาต้มยำน้ำข้น / น้ำใส": ("เนื้อปลาต้มยำ", ["น้ำข้น", "น้ำใส"]),
    "ข้าวผัดหมู / ไก่": ("ข้าวผัด", ["หมู", "ไก่"]),
    "ข้าวผัดปู / กุ้ง": ("ข้าวผัด", ["ปู", "กุ้ง"]),
    "เส้นหมี่ราดหน้าหมู / ไก่": ("เส้นหมี่ราดหน้า", ["หมู", "ไก่"]),
    "เส้นเซี่ยงไฮ้ผัดซีอิ๊วหมู / ไก่": ("เส้นเซี่ยงไฮ้ผัดซีอิ๊ว", ["หมู", "ไก่"]),
    "แป๊ะก๊วยนมสด ร้อน / เย็น": ("แป๊ะก๊วยนมสด", ["ร้อน", "เย็น"]),
    "แป๊ะก๊วย ร้อน / เย็น": ("แป๊ะก๊วย", ["ร้อน", "เย็น"]),
}

# categories shown to Sales (order = tab order)
CATEGORIES = [
    ("appetizer", "ออเดิร์ฟ"), ("yum", "ยำ"), ("main", "จานหลัก"), ("fish", "ปลา"),
    ("shrimp", "กุ้ง"), ("crab", "ปู"), ("veg", "ผัก"), ("soup", "ซุป"),
    ("rice", "ข้าว"), ("noodle", "เส้น"), ("dessert", "ของหวาน"), ("drink", "เครื่องดื่ม"),
]

FILE_CAT = {"ออเดิร์ฟ": "appetizer", "ปลา": "fish", "ผัก": "veg", "ยำ": "yum", "ซุป": "soup",
            "กุ้ง": "shrimp", "ปู": "crab", "ของหวาน": "dessert", "เครื่องดื่ม": "drink"}

NOODLE_WORDS = ("หมี่", "เส้น", "บะหมี่", "หมี่ซั่ว")


def course_of(name, file_cat):
    """course = slot used by the meal-balance checker"""
    if file_cat == "เครื่องดื่ม":
        return "drink"
    if file_cat == "ของหวาน":
        return "dessert"
    if name.startswith(("ยำ", "พล่า")):
        return "yum"
    if name.startswith("ข้าว"):
        return "rice"
    if any(w in name for w in NOODLE_WORDS) and "วุ้นเส้น" not in name:
        return "noodle"
    if file_cat in ("ซุป",) or name.startswith(("ซุป", "ต้ม", "แกง")) or "ต้ม" in name[:6]:
        return "soup"
    if file_cat == "ปลา" or name.startswith(("ปลา", "เนื้อปลา")):
        return "fish"
    if file_cat == "ยำ" or name.startswith(("ยำ", "พล่า", "สลัด")) and "สลัดกุ้งร้อน" not in name:
        return "yum"
    if file_cat == "ออเดิร์ฟ" or name in ("สลัดกุ้งร้อน",):
        return "appetizer"
    if file_cat == "ผัก" or name.startswith(("ผัก", "ผัด", "ปวยเล้ง", "เห็ด", "หน่อไม้")):
        return "veg"
    return "main"


def category_of(course, file_cat):
    if file_cat in FILE_CAT:
        c = FILE_CAT[file_cat]
        # noodle/rice dishes that sit in other file categories
        if course in ("noodle", "rice") and c not in ("dessert", "drink"):
            return course
        return c
    if file_cat == "ข้าวราด":
        return course if course in ("rice", "noodle") else "rice"
    # เมนูแนะนำ / อาหารเจ -> by course
    return {"appetizer": "appetizer", "yum": "yum", "fish": "fish", "veg": "veg", "soup": "soup",
            "rice": "rice", "noodle": "noodle", "dessert": "dessert", "drink": "drink"}.get(course, "main")


PROTEIN = [("กุ้ง", "shrimp"), ("ปู", "crab"), ("ปลา", "fish"), ("หมู", "pork"), ("ไก่", "chicken"),
           ("เป็ด", "duck"), ("ทะเล", "seafood"), ("เนื้อ", "beef")]


def slug(i):
    return f"m{i:03d}"


def main():
    rows = list(csv.DictReader(open(SRC, encoding="utf-8")))
    items = {}
    issues = []
    for r in rows:
        raw = r["รายการ"].strip()
        file_cat = r["ประเภท"].strip()
        price_raw = r["ราคา (บาท)"].strip()
        name = TYPO.get(raw, raw)
        base, variants = VARIANTS.get(raw, (name, []))
        base = TYPO.get(base, base)
        key = re.sub(r"\s+", "", base) + ("|" + "/".join(variants) if variants else "")
        rec = items.get(key)
        if rec is None:
            rec = {"name": base, "variants": variants, "fileCats": [], "prices": [], "raw": raw}
            items[key] = rec
        rec["fileCats"].append(file_cat)
        rec["prices"].append(price_raw)

    out = []
    for i, (key, rec) in enumerate(items.items(), start=1):
        cats = [c for c in rec["fileCats"] if c != "เมนูแนะนำ"]
        file_cat = cats[0] if cats else "เมนูแนะนำ"
        tags = []
        if "เมนูแนะนำ" in rec["fileCats"]:
            tags.append("แนะนำ")
        if "อาหารเจ" in rec["fileCats"] or rec["name"].endswith("เจ"):
            tags.append("เจ")
        if "ทะเล" in rec["name"]:
            tags.append("ทะเล")
        course = course_of(rec["name"], file_cat if file_cat not in ("อาหารเจ", "เมนูแนะนำ") else "")
        category = category_of(course, file_cat)
        prices = sorted(set(rec["prices"]))
        item = {"id": slug(i), "name": rec["name"], "categoryId": category, "course": course,
                "tags": tags, "variants": rec["variants"], "priceType": "fixed", "price": 0,
                "unit": "จาน", "setOnly": False, "active": True, "sort": i}
        protein = [p for w, p in PROTEIN if w in rec["name"]]
        if protein:
            item["protein"] = protein[0]
        p = prices[-1]
        if len(prices) > 1:
            nums = [int(x) for x in prices if x.isdigit()]
            item["price"] = max(nums)
            item["needsReview"] = f"ราคาในไฟล์ไม่ตรงกัน: {', '.join(prices)} (ใช้ {max(nums)})"
            issues.append(f"{rec['name']}: {item['needsReview']}")
        elif p.isdigit():
            item["price"] = int(p)
        elif p.startswith("ขีดละ"):
            item["priceType"] = "perWeight"
            item["price"] = int(re.findall(r"\d+", p)[0])
            item["unit"] = "ขีด"
        elif "/" in p:
            a, b = [int(x) for x in re.findall(r"\d+", p)]
            item["priceType"] = "byOption"
            item["options"] = [{"label": "ขนาดเล็ก", "price": a}, {"label": "ขนาดใหญ่", "price": b}]
            item["price"] = a
            item["needsReview"] = f"ราคา {p} — ยืนยันชื่อขนาด"
            issues.append(f"{rec['name']}: {item['needsReview']}")
        if category == "drink":
            item["unit"] = "รายการ"
        if category == "dessert":
            item["unit"] = "ชุด"
        if course == "soup":
            item["unit"] = "หม้อ"
        if len(rec["fileCats"]) > 1 and len(set(prices)) == 1:
            issues.append(f"{rec['name']}: รวมรายการซ้ำจาก {', '.join(rec['fileCats'])}")
        out.append(item)

    by_name = {m["name"]: m for m in out}
    next_id = len(out) + 1

    def ensure(name, course, category, price=0, set_only=True, variant=None):
        nonlocal next_id
        if name in by_name:
            return by_name[name]["id"]
        m = {"id": slug(next_id), "name": name, "categoryId": category, "course": course, "tags": [],
             "variants": [], "priceType": "fixed", "price": price, "unit": "จาน", "setOnly": set_only,
             "active": True, "sort": next_id}
        next_id += 1
        out.append(m)
        by_name[name] = m
        return m["id"]

    def ref(name, course, category="main", variant=None):
        # link to a menu item; set-only items are created when missing
        lookup = {"ปลาหิมะนึ่งซีอิ้ว": "ปลาหิมะนึ่งซีอิ๊ว", "ผลไม้รวมตามฤดูกาล": "ผลไม้ตามฤดูกาล",
                  "ไข่เยี่ยวม้ากะเพรากรอบ": "ไข่เยี่ยวม้ากะเพรากรอบ"}
        base = lookup.get(name, name)
        if variant:
            m = next((x for x in out if x["name"] == base and variant in x["variants"]), None)
            if m:
                return {"course": course, "menuItemId": m["id"], "name": base + variant, "variant": variant}
        mid = by_name[base]["id"] if base in by_name else ensure(base, course, category)
        return {"course": course, "menuItemId": mid, "name": name}

    sets = [
        {"id": "set-emperor", "name": "ชุดจักรพรรดิ", "pricePerTable": 4500, "servingSize": "large",
         "items": [ref("สลัดกุ้งร้อน", "appetizer"), ref("เป็ดเทียมเทียม", "main"),
                   ref("ปลาหิมะนึ่งซีอิ้ว", "fish"), ref("ยำรวมมิตรทะเล", "yum"),
                   ref("ผักบุ้งจักรพรรดิ", "veg", "veg"), ref("ซุปกระเพาะปลาน้ำแดง", "soup"),
                   ref("เส้นหมี่ราดหน้า", "noodle", variant="หมู"), ref("ผลไม้รวมตามฤดูกาล", "dessert")],
         "drinksText": "เก๊กฮวยเย็น × 2, น้ำดื่มเย็นสะอาด", "includes": ["water", "chrysanthemum"]},
        {"id": "set-hongte", "name": "ชุดฮ่องเต้", "pricePerTable": 3400, "servingSize": "large",
         "items": [ref("ออเดิร์ฟร้อน", "appetizer"), ref("เป็ดเทียมเทียม", "main"),
                   ref("ปลากะพงทอดน้ำปลา", "fish"), ref("ผักบุ้งฮ่องเต้", "veg"),
                   ref("ยำรวมมิตรทะเล", "yum"), ref("ซุปเยื่อไผ่เห็ดหอมน้ำใส", "soup"),
                   ref("ข้าวผัด", "rice", variant="ปู"), ref("สาคูแคนตาลูป", "dessert")],
         "drinksText": "เก๊กฮวย ร้อน-เย็น, น้ำดื่ม-น้ำแข็ง", "includes": ["water", "chrysanthemum"]},
        {"id": "set-chaosua", "name": "ชุดเจ้าสัว", "pricePerTable": 3000, "servingSize": "large",
         "items": [ref("ออเดิร์ฟร้อน", "appetizer"), ref("หมูมะนาว", "yum"), ref("ไก่แช่เหล้า", "main"),
                   ref("ปลาทับทิมยำสมุนไพร", "fish"), ref("ผักบุ้งเจ้าสัว", "veg", "veg"),
                   ref("ซุปเต้าหู้ทรงเครื่องน้ำแดง", "soup"), ref("เส้นหมี่ราดหน้า", "noodle", variant="หมู"),
                   ref("ผลไม้รวมตามฤดูกาล", "dessert")],
         "drinksText": "เก๊กฮวย ร้อน-เย็น, น้ำดื่ม-น้ำแข็ง", "includes": ["water", "chrysanthemum"]},
        {"id": "set-crownprince", "name": "ชุดองค์รัชทายาท", "pricePerTable": 2500, "servingSize": "medium",
         "items": [ref("สลัดกุ้งร้อน", "appetizer"), ref("ไก่ทอดเกลือ", "main"),
                   ref("กะหล่ำปลีทอดน้ำปลา", "veg", "veg"), ref("ไข่เยี่ยวม้ากะเพรากรอบ", "appetizer"),
                   ref("ต้มแซ่บ", "soup", variant="เอ็นหมู"), ref("ข้าวผัดหยางโจว", "rice"),
                   ref("ปลาทับทิมยำสมุนไพร", "fish"), ref("ผลไม้รวมตามฤดูกาล", "dessert")],
         "drinksText": "น้ำดื่ม-น้ำแข็ง", "includes": ["water"],
         "addOnOffers": [{"menuItemId": by_name["เป็ดเทียมเทียม"]["id"], "name": "เป็ดเทียมเทียม", "specialPrice": 620, "maxQty": 1},
                         {"menuItemId": by_name["บะหมี่อบขาเป็ด"]["id"], "name": "บะหมี่อบขาเป็ด", "specialPrice": 350, "maxQty": 1}]},
        {"id": "set-sonInLaw", "name": "ชุดราชบุตรเขย", "pricePerTable": 2500, "servingSize": "large",
         "visibility": "regularOnly", "note": "ชุดจัดให้ตามคำเรียกร้องสำหรับลูกค้าประจำ (รอยืนยันขนาดจานและเครื่องดื่ม)",
         "items": [ref("ไก่ทอดเกลือ", "main"), ref("ผักบุ้งฮ่องเต้", "veg"), ref("ยำขาหมูยัดไส้", "yum"),
                   ref("โกยซีหมี่", "noodle", variant="ไก่"), ref("แกงส้มผักปลาทอด", "soup", "soup"),
                   ref("ปลาทับทิมยำสมุนไพร", "fish"), ref("ข้าวผัด", "rice", variant="ปู"),
                   ref("ผลไม้รวมตามฤดูกาล", "dessert")],
         "drinksText": "", "includes": []},
    ]
    for i, s in enumerate(sets):
        s.setdefault("visibility", "all")
        s.setdefault("addOnOffers", [])
        s.setdefault("note", "")
        s["active"] = True
        s["sort"] = i + 1
        s["seats"] = "10–12 ที่" if s["servingSize"] == "large" else "5–6 ที่"

    services = [
        {"id": "svc-music", "name": "นักดนตรี", "type": "music", "price": 600, "unit": "งาน", "priceEditable": False},
        {"id": "svc-room", "name": "ห้องพักพร้อมอาหารเช้า", "type": "room", "price": 750, "unit": "ห้อง", "priceEditable": True},
        {"id": "svc-overtime", "name": "ค่าล่วงเวลา", "type": "overtime", "price": 1000, "unit": "ชั่วโมง", "priceEditable": False},
        {"id": "svc-decor", "name": "ค่าตกแต่งสถานที่", "type": "decor", "price": 0, "unit": "งาน", "priceEditable": True},
        {"id": "svc-photobooth", "name": "ซุ้มถ่ายรูป", "type": "decor", "price": 0, "unit": "ซุ้ม", "priceEditable": True},
        {"id": "svc-sound", "name": "เครื่องเสียง", "type": "equipment", "price": 0, "unit": "ชุด", "priceEditable": True},
    ]
    for i, s in enumerate(services):
        s["active"] = True
        s["sort"] = i + 1

    foc = [
        {"id": "foc-drink-3500", "group": "drinks", "order": 1, "name": "เครื่องดื่มฟรี (โต๊ะละ 3,500 ขึ้นไป)",
         "conditions": [{"field": "pricePerTable", "op": ">=", "value": 3500}],
         "effect": {"kind": "free", "items": [
             {"key": "water", "label": "น้ำเปล่า-น้ำแข็ง", "qtyPer": "table", "qty": 1, "unit": "ชุด/โต๊ะ", "unitValue": 0},
             {"key": "chrysanthemum", "label": "เก๊กฮวย", "qtyPer": "table", "qty": 1, "unit": "ชุด/โต๊ะ", "unitValue": 0}]}},
        {"id": "foc-drink-3000", "group": "drinks", "order": 2, "name": "น้ำเปล่า-น้ำแข็งฟรี (โต๊ะละ 3,000 ขึ้นไป)",
         "conditions": [{"field": "pricePerTable", "op": ">=", "value": 3000}],
         "effect": {"kind": "free", "items": [
             {"key": "water", "label": "น้ำเปล่า-น้ำแข็ง", "qtyPer": "table", "qty": 1, "unit": "ชุด/โต๊ะ", "unitValue": 0}]}},
        {"id": "foc-music-free", "group": "music", "order": 1, "name": "นักดนตรีฟรี",
         "conditions": [{"field": "pricePerTable", "op": ">", "value": 3000}, {"field": "tables", "op": ">", "value": 5}],
         "effect": {"kind": "setPrice", "serviceId": "svc-music", "price": 0}},
        {"id": "foc-music-half", "group": "music", "order": 2, "name": "นักดนตรีลด 50%",
         "conditions": [{"field": "pricePerTable", "op": ">=", "value": 3000}, {"field": "tables", "op": ">=", "value": 3}],
         "effect": {"kind": "setPrice", "serviceId": "svc-music", "price": 300}},
    ]
    for r in foc:
        r["active"] = True

    settings = {
        "hotelName": "โรงแรมปัญจดารา",
        "hotelNameEn": "Punjadara Hotel",
        "address": "",
        "phone": "044-257567, 063-8614696",
        "vatRate": 0.07,
        "rooms": [{"name": "สุพรรณหงส์", "floor": "ชั้น 1"}, {"name": "เมขลา", "floor": "ชั้น 1"}]
                 + [{"name": f"ปัญจดารา {i}", "floor": ""} for i in range(1, 7)]
                 + [{"name": "กินรี", "floor": "ชั้น 7"}, {"name": "นอกสถานที่", "floor": ""}],
        "eventTypes": ["ประชุม", "กินเลี้ยง", "เกษียณอายุ", "ส่งอาหารนอกสถานที่", "อื่นๆ"],
        "tableLayouts": ["โต๊ะจีน", "โต๊ะกลม", "โต๊ะเหลี่ยม", "ชั้นเรียน", "ตัวยู", "ใส่จาน (ไม่จัดโต๊ะ)"],
        "remarkPresets": ["ราคาอาหารยังไม่รวมภาษีมูลค่าเพิ่ม 7%", "เครื่องดื่มขายแยกทุกชนิด",
                          "ลูกค้านำเครื่องดื่มมาเอง", "เกินเวลาคิดชั่วโมงละ 1,000 บาท",
                          "ชำระมัดจำแล้ว ____ บาท เมื่อวันที่ ____"],
        "mealTemplates": [
            {"id": "chinese", "name": "โต๊ะจีน / กินเลี้ยง", "slots": [
                {"label": "ทานเล่น / ออเดิร์ฟ", "courses": ["appetizer"]},
                {"label": "ยำ / สลัด", "courses": ["yum"]},
                {"label": "ทอด / จานหลัก", "courses": ["main", "shrimp", "crab"]},
                {"label": "ปลา / นึ่ง", "courses": ["fish"]},
                {"label": "ผัด / ผัก", "courses": ["veg"]},
                {"label": "ต้ม / ซุป", "courses": ["soup"]},
                {"label": "เส้น หรือ ข้าว", "courses": ["noodle", "rice"]},
                {"label": "ของหวาน / ผลไม้", "courses": ["dessert"]}]},
            {"id": "plated", "name": "ใส่จาน / ส่งนอกสถานที่", "slots": [
                {"label": "ยำ / สลัด", "courses": ["yum", "appetizer"]},
                {"label": "ต้ม / ซุป", "courses": ["soup"]},
                {"label": "ผัด / ผัก", "courses": ["veg"]},
                {"label": "เส้น หรือ ข้าว", "courses": ["noodle", "rice"]},
                {"label": "ของหวาน / ผลไม้", "courses": ["dessert"]}]},
        ],
    }

    categories = [{"id": cid, "name": name, "sort": i + 1, "active": True} for i, (cid, name) in enumerate(CATEGORIES)]
    seed = {"categories": categories, "menuItems": out, "menuSets": sets, "services": services,
            "focRules": foc, "settings": settings, "importNotes": issues}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(seed, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"menu items: {len(out)} (set-only: {sum(1 for m in out if m['setOnly'])}), sets: {len(sets)}")
    print("notes:", len(issues))
    for n in issues:
        print(" -", n)


if __name__ == "__main__":
    main()
