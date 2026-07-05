/* ============================================================
   db.js — API-backed data layer (SQLite via /api on the server)
   Keeps a synchronous in-memory cache so the UI code stays simple;
   every write is persisted to the database through the REST API.
   ============================================================ */

const CACHE = {
  properties: [], requests: [], contracts: [], receipts: [],
  tenants: [], expenses: [], employees: [], salaries: [], commissions: [],
};
let COUNTERS = {};
let SETTINGS = {
  office_name: "", office_phone: "", office_address: "", default_currency: "IQD",
};

let AUTH_TOKEN = sessionStorage.getItem("res_token") || "";
let AUTH_USER = sessionStorage.getItem("res_user") || "";

async function apiJSON(method, path, body) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (AUTH_TOKEN) headers["X-Auth-Token"] = AUTH_TOKEN;
  const res = await fetch(path, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !path.includes("/api/auth/")) {
    // token expired or missing → force re-login
    AUTH_TOKEN = ""; sessionStorage.removeItem("res_token");
    if (typeof onAuthFail === "function") onAuthFail();
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const auth = {
  isLoggedIn() { return !!AUTH_TOKEN; },
  username() { return AUTH_USER; },
  async login(username, password) {
    const res = await apiJSON("POST", "/api/auth/login", { username, password });
    AUTH_TOKEN = res.token; AUTH_USER = res.username;
    sessionStorage.setItem("res_token", AUTH_TOKEN);
    sessionStorage.setItem("res_user", AUTH_USER);
    return res;
  },
  async change(username, password) {
    const res = await apiJSON("POST", "/api/auth/change", { username, password });
    if (res.username) { AUTH_USER = res.username; sessionStorage.setItem("res_user", AUTH_USER); }
    return res;
  },
  async logout() {
    try { await apiJSON("POST", "/api/auth/logout", {}); } catch (e) { /* ignore */ }
    AUTH_TOKEN = ""; AUTH_USER = "";
    sessionStorage.removeItem("res_token"); sessionStorage.removeItem("res_user");
  },
};

// Load full state from the database into the cache (called once at boot).
async function initDB() {
  const s = await apiJSON("GET", "/api/state");
  for (const k in CACHE) CACHE[k] = s[k] || [];
  COUNTERS = s.counters || {};
  SETTINGS = { ...SETTINGS, ...(s.settings || {}) };
}

const store = {
  all(coll) {
    return CACHE[coll] || [];
  },
  get(coll, id) {
    return (CACHE[coll] || []).find((x) => x.id === id);
  },
  async insert(coll, obj, codePrefix) {
    const rec = await apiJSON("POST", `/api/${coll}`, { data: obj, codePrefix });
    CACHE[coll].push(rec);
    return rec;
  },
  async update(coll, id, patch) {
    const rec = await apiJSON("PUT", `/api/${coll}/${id}`, { data: patch });
    const i = CACHE[coll].findIndex((x) => x.id === id);
    if (i >= 0) CACHE[coll][i] = rec;
    return rec;
  },
  async remove(coll, id) {
    await apiJSON("DELETE", `/api/${coll}/${id}`);
    CACHE[coll] = CACHE[coll].filter((x) => x.id !== id);
  },
  settings() {
    return SETTINGS;
  },
  async saveSettings(patch) {
    SETTINGS = { ...SETTINGS, ...(await apiJSON("PUT", "/api/settings", { settings: patch })) };
    return SETTINGS;
  },
  async backup() {
    return apiJSON("GET", "/api/backup");
  },
  async restore(payload) {
    await apiJSON("POST", "/api/restore", payload);
    await initDB();
  },
  async reset() {
    await apiJSON("POST", "/api/reset", {});
    await initDB();
  },
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

/* ---------- Legal clauses for printed contracts ----------
   Placeholder wording — replace with your exact clauses.
   Provided per language (ar / ku) and per contract type.
---------------------------------------------------------- */
const CONTRACT_CLAUSES = {
  sale: {
    ar: [
      "اتفق الطرفان وهما بكامل الأهلية المعتبرة شرعاً وقانوناً على بيع العقار الموصوف أعلاه بالثمن المتفق عليه والمذكور في هذا العقد.",
      "أقرّ الطرف الأول (البائع) بأنه المالك الشرعي للعقار وأنه خالٍ من كل الحقوق والالتزامات والرهون والدعاوى تجاه الغير.",
      "استلم الطرف الأول كامل الثمن المتفق عليه من الطرف الثاني (المشتري)، وأصبح العقار ملكاً خالصاً للطرف الثاني.",
      "يلتزم الطرف الأول بنقل الملكية رسمياً في دائرة التسجيل العقاري وتسليم كافة المستندات اللازمة للطرف الثاني.",
      "يتحمل الطرف الأول أي التزامات أو مستحقات مترتبة على العقار قبل تاريخ هذا العقد، ويتحمل الطرف الثاني ما بعده.",
      "في حال ظهور أي حق للغير على العقار يضمن الطرف الأول للطرف الثاني كامل الثمن والتعويض عن الأضرار.",
      "حُرِّر هذا العقد من نسختين بيد كل طرف نسخة للعمل بموجبها عند الاقتضاء.",
    ],
    ku: [
      "هەردوو لایەن بە ئازادی و ڕەزامەندی تەواو ڕێککەوتن لەسەر فرۆشتنی ئەو موڵکەی سەرەوە بەو نرخەی لەم گرێبەستەدا دیاریکراوە.",
      "لایەنی یەکەم (فرۆشیار) دان بەوەدا دەنێت کە خاوەنی یاسایی موڵکەکەیە و موڵکەکە بێ هیچ کێشە و قەرز و ماف بۆ لایەنی سێیەم.",
      "لایەنی یەکەم تەواوی نرخی ڕێککەوتووی وەرگرت لە لایەنی دووەم (کڕیار)، و موڵکەکە بووە موڵکی تەواوی لایەنی دووەم.",
      "لایەنی یەکەم پابەندە بە گواستنەوەی فەرمی خاوەندارێتی لە فەرمانگەی خاوەندارێتی و ڕادەستکردنی هەموو بەڵگەنامە پێویستەکان.",
      "هەر قەرز یان ئەرکێک پێش ئەم بەروارە لەسەر لایەنی یەکەمە، و دوای ئەم بەروارە لەسەر لایەنی دووەمە.",
      "ئەگەر هیچ مافێکی لایەنی سێیەم دەرکەوت لەسەر موڵکەکە، لایەنی یەکەم گەرەنتی نرخ و قەرەبووی زیانەکان دەکات بۆ لایەنی دووەم.",
      "ئەم گرێبەستە لە دوو نوسخە دروستکراوە، نوسخەیەک لای هەر لایەنێک بۆ کارپێکردن لە کاتی پێویستدا.",
    ],
  },
  rent: {
    ar: [
      "اتفق الطرفان على إيجار العقار الموصوف أعلاه للمدة وبقيمة الإيجار الشهري المذكورة في هذا العقد.",
      "دفع الطرف الثاني (المستأجر) مبلغ التأمين المذكور، ويُعاد إليه عند انتهاء العقد بعد خصم أي أضرار أو مستحقات.",
      "يلتزم المستأجر بدفع الإيجار في موعده المحدد شهرياً، ويعتبر التأخير عن السداد إخلالاً بالعقد.",
      "يستعمل المستأجر العقار للغرض المتفق عليه فقط، ولا يجوز له تأجيره من الباطن أو التنازل عنه للغير دون موافقة خطية من المالك.",
      "يلتزم المستأجر بالمحافظة على العقار وإعادته بحالته التي استلمه عليها ما عدا الاستهلاك الطبيعي.",
      "تكون فواتير الماء والكهرباء والخدمات على عاتق المستأجر طوال مدة الإيجار ما لم يُتفق على خلاف ذلك.",
      "لا يحق لأي طرف فسخ العقد قبل انتهاء مدته إلا باتفاق الطرفين أو للأسباب المنصوص عليها قانوناً.",
      "حُرِّر هذا العقد من نسختين بيد كل طرف نسخة للعمل بموجبها.",
    ],
    ku: [
      "هەردوو لایەن ڕێککەوتن لەسەر بەکرێدانی موڵکەکەی سەرەوە بۆ ئەو ماوە و کرێی مانگانەی لەم گرێبەستەدا دیاریکراوە.",
      "لایەنی دووەم (کرێچی) بڕی بیعانەی دیاریکراوی داوە، و لە کۆتایی گرێبەستدا دەگەڕێتەوە بۆی دوای لابردنی هەر زیان یان قەرزێک.",
      "کرێچی پابەندە بە دانی کرێ لە کاتی دیاریکراوی مانگانەدا، و دواکەوتن لە پارەدان بە پێشێلکردنی گرێبەست دادەنرێت.",
      "کرێچی تەنها بۆ ئەو مەبەستەی ڕێککەوتوون موڵکەکە بەکاردەهێنێت، و بۆی نییە بەبێ ڕەزامەندی نووسراوی خاوەن موڵک بیداتە کەسی تر.",
      "کرێچی پابەندە بە پاراستنی موڵکەکە و گەڕاندنەوەی بەو بارەی وەریگرتووە جگە لە بەکارهێنانی سروشتی.",
      "پسووڵەی ئاو و کارەبا و خزمەتگوزاریەکان لەسەر کرێچییە بە درێژایی ماوەی کرێ، مەگەر بە پێچەوانەوە ڕێککەوتبن.",
      "بۆ هیچ لایەنێک نییە گرێبەستەکە هەڵبوەشێنێتەوە پێش کۆتایی ماوەکەی، مەگەر بە ڕەزامەندی هەردوو لایەن یان بەو هۆکارانەی یاسا دیاری دەکات.",
      "ئەم گرێبەستە لە دوو نوسخە دروستکراوە، نوسخەیەک لای هەر لایەنێک بۆ کارپێکردن.",
    ],
  },
};
