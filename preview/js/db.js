/* ============================================================
   db.js — PREVIEW / DEMO data layer
   Pure localStorage (no server, no login). Exposes the SAME
   `store` / `auth` / `initDB` / `today` interface as the real
   backend so the rest of the app runs completely unchanged.
   Data lives only in the visitor's own browser.
   ============================================================ */

const DEMO_KEY = "res_preview_v1";

const CACHE = {
  properties: [], requests: [], contracts: [], receipts: [],
  tenants: [], expenses: [], employees: [], salaries: [], commissions: [],
};
let COUNTERS = {};
let SETTINGS = {
  office_name: "", office_phone: "", office_address: "", default_currency: "IQD",
  brand_ar: "", tagline_ar: "", tagline_ku: "", logo_top: "", logo_bottom: "",
  court_city: "", logo_image: "",
};

function today() { return new Date().toISOString().slice(0, 10); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function nextCode(prefix) {
  COUNTERS[prefix] = (COUNTERS[prefix] || 0) + 1;
  return prefix + "-" + String(COUNTERS[prefix]).padStart(4, "0");
}

function demoSave() {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify({ c: CACHE, k: COUNTERS, s: SETTINGS })); } catch (e) {}
}
function demoLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(DEMO_KEY));
    if (!d) return false;
    for (const k in CACHE) CACHE[k] = d.c[k] || [];
    COUNTERS = d.k || {};
    SETTINGS = { ...SETTINGS, ...(d.s || {}) };
    return true;
  } catch (e) { return false; }
}

async function initDB() {
  if (!demoLoad()) { demoSeed(); demoSave(); }
}

const store = {
  all(coll) { return CACHE[coll] || []; },
  get(coll, id) { return (CACHE[coll] || []).find((x) => x.id === id); },
  async insert(coll, obj, codePrefix) {
    const rec = { ...obj, id: uid(), createdAt: new Date().toISOString() };
    if (codePrefix && !rec.code) rec.code = nextCode(codePrefix);
    CACHE[coll].push(rec);
    demoSave();
    return rec;
  },
  async update(coll, id, patch) {
    const i = CACHE[coll].findIndex((x) => x.id === id);
    if (i < 0) return null;
    CACHE[coll][i] = { ...CACHE[coll][i], ...patch };
    demoSave();
    return CACHE[coll][i];
  },
  async remove(coll, id) {
    CACHE[coll] = CACHE[coll].filter((x) => x.id !== id);
    demoSave();
  },
  settings() { return SETTINGS; },
  async saveSettings(patch) { SETTINGS = { ...SETTINGS, ...patch }; demoSave(); return SETTINGS; },
  async backup() {
    const out = {};
    for (const k in CACHE) out[k] = CACHE[k];
    out.counters = COUNTERS; out.settings = SETTINGS;
    return JSON.parse(JSON.stringify(out));
  },
  async restore(payload) {
    for (const k in CACHE) CACHE[k] = payload[k] || [];
    COUNTERS = payload.counters || {};
    SETTINGS = { ...SETTINGS, ...(payload.settings || {}) };
    demoSave();
  },
  async reset() {
    for (const k in CACHE) CACHE[k] = [];
    COUNTERS = {};
    demoSeed();
    demoSave();
  },
};

// No real authentication in the demo — always "logged in".
const auth = {
  isLoggedIn() { return true; },
  username() { return "demo"; },
  async login() { return { token: "demo", username: "demo" }; },
  async change() { return { ok: true, username: "demo" }; },
  async logout() { return; },
};

/* ---------------- Sample data ---------------- */
function demoImg(color, label) {
  return "data:image/svg+xml;base64," + btoa(
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='260'><rect width='400' height='260' fill='${color}'/><text x='200' y='140' fill='white' font-size='26' text-anchor='middle' font-family='sans-serif'>${label}</text></svg>`);
}

function demoSeed() {
  SETTINGS = {
    ...SETTINGS,
    office_name: "Demo Real Estate", brand_ar: "ئۆفیسی خانووبەرەی نمونە",
    tagline_ar: "لبيع وشراء وتأجير العقارات", tagline_ku: "بۆ فرۆشتن و کڕین و بەکرێدانی موڵک",
    office_phone: "0750 000 0000", office_address: "هەولێر", court_city: "هەولێر",
    default_currency: "IQD",
  };

  const pHouse = store.__seedInsert("properties", { title: "خانووی دوو نهۆم - سلێمانی", listing: "sale", ptype: "house", address: "سلێمانی - سەرچنار", area: 200, rooms: 4, price: 250000000, currency: "IQD", status: "available", owner: "ئەحمەد کەریم", phone: "0770 123 4567", photos: [demoImg("#1d6fb8", "Front"), demoImg("#16a085", "Living"), demoImg("#8e44ad", "Garden")], notes: "" }, "P");
  store.__seedInsert("properties", { title: "ڤێلا - هەولێر", listing: "sale", ptype: "villa", address: "هەولێر - دریم سیتی", area: 350, rooms: 5, price: 480000000, currency: "IQD", status: "reserved", owner: "سارا حەمە", phone: "0750 987 6543", photos: [demoImg("#e67e22", "Villa")], notes: "" }, "P");
  const pApt = store.__seedInsert("properties", { title: "شوقە بۆ کرێ - هەولێر", listing: "rent", ptype: "apartment", address: "هەولێر - ٦٠ مەتری", area: 120, rooms: 3, price: 750000, currency: "IQD", status: "available", owner: "کاروان ئازاد", phone: "0771 222 3333", photos: [demoImg("#2980b9", "Apartment")], notes: "" }, "P");
  store.__seedInsert("properties", { title: "دووکان - بازاڕ", listing: "rent", ptype: "shop", address: "هەولێر - قەیسەری", area: 45, rooms: 1, price: 1200000, currency: "IQD", status: "rented", owner: "دیار عومەر", phone: "0773 444 5555", photos: [], notes: "" }, "P");

  store.__seedInsert("contracts", { ctype: "sale", currency: "USD", firstParty: "محمد عبدالله", firstPhone: "0770 111 2222", secondParty: "سعد مسحود", secondPhone: "0751 333 4444", organizer: "ئەمین زیاد", ptype: "apartment", propNo: "12A", area: "130", location: "جیهان ستی", price: 95000, moneyAdvance: 5000, moneyLeft: 90000, amountDissuade: 5000, punishment: 5000, lawyerName: "", paymentDateLeft: "2026-07-08", dateSurrender: "2026-09-04", status: "active", note: "" }, "C");
  store.__seedInsert("contracts", { ctype: "rent", currency: "USD", firstParty: "ئەمین زیاد", firstPhone: "0770 555 6666", secondParty: "محمد", secondPhone: "0751 777 8888", organizer: "ئەمین زیاد خضر", ptype: "house", propNo: "12354", area: "200", location: "برایەتی", amount: 500, moneyAdvance: 1500, monthlyAdvance: "3", assurances: 500, forPurposes: "نیشتەجێبوون", punishPerDay: 50, rentalPeriod: "12", dateOf: "2026-02-16", forDate: "2027-02-16", dateSurrender: "", status: "active", note: "" }, "C");

  store.__seedInsert("requests", { rtype: "buy", client: "کاروان ئازاد", phone: "0771 222 3333", ptype: "house", budget: 200000000, currency: "IQD", address: "سلێمانی", status: "open", notes: "دەیەوێت خانوو لە ناوچەی باش", date: today() }, "R");
  store.__seedInsert("requests", { rtype: "rent", client: "هێمن ستار", phone: "0770 909 1010", ptype: "apartment", budget: 800000, currency: "IQD", address: "هەولێر", status: "open", notes: "", date: today() }, "R");

  store.__seedInsert("receipts", { direction: "in", party: "سعد مسحود", desc: "پێشەکی گرێبەستی فرۆشتن", amount: 5000, currency: "USD", method: "cash", date: today(), ref: "C-0001" }, "RC");
  store.__seedInsert("receipts", { direction: "out", party: "کۆمپانیای ئاوەدانی", desc: "کرێی ئۆفیس", amount: 500000, currency: "IQD", method: "transfer", date: today(), ref: "" }, "PY");

  store.__seedInsert("tenants", { name: "محمد", phone: "0751 777 8888", property: pApt.id, rent: 750000, currency: "IQD", dueDay: 1, paidUntil: today(), start: today(), notes: "" }, "T");
  store.__seedInsert("expenses", { category: "کارەبا", desc: "پسووڵەی کارەبای ئۆفیس", amount: 120000, currency: "IQD", date: today() }, "E");
  store.__seedInsert("employees", { name: "ئارام", phone: "0770 121 2121", salary: 900000, currency: "IQD" }, "EMP");
}

// synchronous seed helper (mirrors store.insert without async)
store.__seedInsert = function (coll, obj, codePrefix) {
  const rec = { ...obj, id: uid(), createdAt: new Date().toISOString() };
  if (codePrefix && !rec.code) rec.code = nextCode(codePrefix);
  CACHE[coll].push(rec);
  return rec;
};
