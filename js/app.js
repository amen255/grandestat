/* ============================================================
   app.js — Router, views, CRUD (async DB), printing, UX
   ============================================================ */

/* ---------------- Small helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function fmtMoney(n, cur) {
  if (n === "" || n === null || n === undefined || isNaN(n)) return "-";
  const v = Number(n).toLocaleString("en-US");
  return cur ? `${v} ${cur}` : v;
}
function dayWord() { return CURRENT_LANG === "ar" ? "يوم" : "ڕۆژ"; }
function optionsHtml(list, selected) {
  return list.map((o) => `<option value="${esc(o.v)}" ${o.v === selected ? "selected" : ""}>${esc(o.l)}</option>`).join("");
}
function propName(id) {
  const p = store.get("properties", id);
  return p ? `${p.code} — ${p.title}` : "-";
}

/* ---------------- Toast + confirm dialog (UX) ---------------- */
function toast(msg, type = "success") {
  let box = $("#toasts");
  if (!box) { box = el(`<div id="toasts"></div>`); document.body.appendChild(box); }
  const icon = type === "error" ? "⚠️" : type === "info" ? "ℹ️" : "✓";
  const t1 = el(`<div class="toast toast-${type}"><span class="ti">${icon}</span><span>${esc(msg)}</span></div>`);
  box.appendChild(t1);
  setTimeout(() => { t1.classList.add("hide"); setTimeout(() => t1.remove(), 300); }, 2600);
}
function confirmDialog(message) {
  return new Promise((resolve) => {
    const ov = el(`
      <div class="modal-overlay">
        <div class="modal confirm-modal">
          <div class="modal-body" style="text-align:center;padding:28px 22px">
            <div style="font-size:40px;margin-bottom:8px">🗑️</div>
            <p style="font-size:16px;margin:0 0 4px">${esc(message)}</p>
          </div>
          <div class="modal-foot" style="justify-content:center">
            <button class="btn btn-danger" id="cf-yes">${t("yes")}</button>
            <button class="btn btn-light" id="cf-no">${t("no")}</button>
          </div>
        </div>
      </div>`);
    document.body.appendChild(ov);
    const done = (v) => { ov.remove(); resolve(v); };
    $("#cf-yes", ov).onclick = () => done(true);
    $("#cf-no", ov).onclick = () => done(false);
    ov.onclick = (e) => { if (e.target === ov) done(false); };
  });
}

/* ---------------- Option lists ---------------- */
const OPT = {
  ptype: () => ["house","apartment","land","shop","villa","office","building","farm"].map((v) => ({ v, l: t("pt_" + v) })),
  currency: () => [{ v: "IQD", l: "IQD" }, { v: "USD", l: "USD" }],
  propStatus: () => ["available","reserved","sold","rented"].map((v) => ({ v, l: t("st_" + v) })),
  reqStatus: () => ["open","closed"].map((v) => ({ v, l: t("st_" + v) })),
  contractStatus: () => ["active","expired"].map((v) => ({ v, l: t("st_" + v) })),
  payMethod: () => ["cash","transfer","check"].map((v) => ({ v, l: t("pm_" + v) })),
  properties: () => store.all("properties").map((p) => ({ v: p.id, l: `${p.code} — ${p.title}` })),
};

/* ---------------- Routes ---------------- */
const ROUTES = {
  dashboard:        { render: renderDashboard },
  properties_sale:  { render: () => renderProperties("sale") },
  properties_rent:  { render: () => renderProperties("rent") },
  requests_buy:     { render: () => renderRequests("buy") },
  requests_rent:    { render: () => renderRequests("rent") },
  contracts_sale:   { render: () => renderContracts("sale") },
  contracts_rent:   { render: () => renderContracts("rent") },
  receipts_in:      { render: () => renderReceipts("in") },
  receipts_out:     { render: () => renderReceipts("out") },
  tenants:          { render: renderTenants },
  expenses:         { render: renderExpenses },
  reports:          { render: renderReports },
  accounting:       { render: renderAccounting },
};
let CURRENT_ROUTE = "dashboard";

/* ---------------- Sidebar nav ---------------- */
const NAV = [
  { key: "dashboard", icon: "🏠", label: "nav_dashboard" },
  { group: "nav_properties", icon: "🏢", items: [
    { key: "properties_sale", label: "nav_properties_sale" },
    { key: "properties_rent", label: "nav_properties_rent" }] },
  { group: "nav_requests", icon: "📝", items: [
    { key: "requests_buy", label: "nav_requests_buy" },
    { key: "requests_rent", label: "nav_requests_rent" }] },
  { group: "nav_contracts", icon: "📄", items: [
    { key: "contracts_sale", label: "nav_contracts_sale" },
    { key: "contracts_rent", label: "nav_contracts_rent" }] },
  { group: "nav_receipts", icon: "🧾", items: [
    { key: "receipts_in", label: "nav_receipts_in" },
    { key: "receipts_out", label: "nav_receipts_out" }] },
  { key: "tenants", icon: "👥", label: "nav_tenants" },
  { key: "expenses", icon: "💸", label: "nav_expenses" },
  { key: "reports", icon: "📊", label: "nav_reports" },
  { key: "accounting", icon: "🧮", label: "nav_accounting" },
];

function renderSidebar() {
  const nav = $("#nav");
  nav.innerHTML = "";
  NAV.forEach((n) => {
    if (n.items) {
      const active = n.items.some((it) => it.key === CURRENT_ROUTE);
      const g = el(`<div class="nav-group"></div>`);
      g.appendChild(el(`<div class="nav-item head ${active ? "open" : ""}"><span class="ic">${n.icon}</span><span>${t(n.group)}</span></div>`));
      n.items.forEach((it) => {
        const sub = el(`<div class="nav-sub ${it.key === CURRENT_ROUTE ? "active" : ""}" data-route="${it.key}">${t(it.label)}</div>`);
        sub.onclick = () => navigate(it.key);
        g.appendChild(sub);
      });
      nav.appendChild(g);
    } else {
      const item = el(`<div class="nav-item ${n.key === CURRENT_ROUTE ? "active" : ""}"><span class="ic">${n.icon}</span><span>${t(n.label)}</span></div>`);
      item.onclick = () => navigate(n.key);
      nav.appendChild(item);
    }
  });
}
function navigate(route) {
  CURRENT_ROUTE = route;
  renderSidebar();
  const r = ROUTES[route];
  if (r) r.render();
  window.scrollTo(0, 0);
}

/* ---------------- Generic list ---------------- */
function renderList(config) {
  const rows = store.all(config.coll).filter(config.filter || (() => true)).slice().reverse();
  const content = $("#content");
  content.innerHTML = "";
  $("#page-title").textContent = config.title;

  const filters = config.filters || [];
  const filtersHtml = filters.map((f, i) => {
    if (f.type === "daterange") {
      return `<span class="date-range" title="${esc(f.label || t("f_date"))}"><input type="date" class="input list-dfrom" data-fi="${i}"><span class="dr-sep">→</span><input type="date" class="input list-dto" data-fi="${i}"></span>`;
    }
    const opts = [{ v: "", l: `${t("all")} · ${f.label}` }, ...f.options()];
    return `<select class="input list-filter" data-fi="${i}">${optionsHtml(opts, "")}</select>`;
  }).join("");

  const sortState = { idx: null, dir: 1 };
  let currentRows = rows;

  const panel = el(`
    <div class="panel">
      <div class="panel-head">
        <h2>${esc(config.title)} <span class="count-pill" id="list-count">${rows.length}</span></h2>
        <div class="toolbar">
          ${filtersHtml}
          <div class="search-wrap"><span class="si">🔍</span><input class="input search-box" id="list-search" placeholder="${t("search")}"></div>
          <button class="btn btn-light btn-sm" id="btn-print-list" title="${t("print")}">🖨️</button>
          <button class="btn btn-light btn-sm" id="btn-export" title="CSV">⬇️ CSV</button>
          <button class="btn btn-primary" id="btn-add">＋ ${esc(config.addLabel || t("add_new"))}</button>
        </div>
      </div>
      <div class="panel-body">
        <table>
          <thead><tr>${config.columns.map((c, i) => c.label === "" || c.sortable === false
            ? `<th></th>`
            : `<th class="sortable" data-col="${i}">${esc(c.label)}<span class="sort-ic"></span></th>`).join("")}<th>${t("actions")}</th></tr></thead>
          <tbody id="list-body"></tbody>
          <tfoot id="list-foot"></tfoot>
        </table>
        <div class="empty" id="empty-msg" style="display:none">📭<br>${t("no_data")}</div>
      </div>
    </div>`);
  content.appendChild(panel);

  const draw = () => {
    const ft = ($("#list-search").value || "").trim().toLowerCase();
    const passesFilters = (r) => filters.every((f, i) => {
      if (f.type === "daterange") {
        const from = $(`.list-dfrom[data-fi="${i}"]`)?.value || "";
        const to = $(`.list-dto[data-fi="${i}"]`)?.value || "";
        const d = f.field(r) || "";
        if (from && (!d || d < from)) return false;
        if (to && (!d || d > to)) return false;
        return true;
      }
      const v = $(`.list-filter[data-fi="${i}"]`)?.value || "";
      return !v || f.match(r, v);
    });
    let filtered = rows.filter((r) => (!ft || JSON.stringify(r).toLowerCase().includes(ft)) && passesFilters(r));
    if (sortState.idx !== null) {
      const col = config.columns[sortState.idx];
      filtered = filtered.slice().sort((a, b) => {
        const av = cellSortValue(col, a), bv = cellSortValue(col, b);
        const c = (typeof av === "number" && typeof bv === "number")
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
        return c * sortState.dir;
      });
    }
    currentRows = filtered;
    $("#list-count").textContent = filtered.length;
    const tc = totalsCells(config.columns, filtered);
    $("#list-foot").innerHTML = tc ? `<tr>${tc}<td></td></tr>` : "";
    $$("th.sortable").forEach((th) => {
      const i = Number(th.dataset.col);
      th.querySelector(".sort-ic").textContent = sortState.idx === i ? (sortState.dir === 1 ? " ▲" : " ▼") : "";
    });
    const body = $("#list-body");
    body.innerHTML = "";
    $("#empty-msg").style.display = filtered.length ? "none" : "block";
    filtered.forEach((row) => {
      const extra = config.rowActions ? config.rowActions(row) : "";
      const tr = el(`<tr>${config.columns.map((c) => `<td>${c.get(row)}</td>`).join("")}
        <td class="nowrap act-cell">${extra}
          <button class="btn-icon" data-act="edit" title="${t("edit")}">✏️</button>
          <button class="btn-icon del" data-act="del" title="${t("delete")}">🗑️</button></td></tr>`);
      tr.querySelector('[data-act="edit"]').onclick = () => openForm(config, row);
      tr.querySelector('[data-act="del"]').onclick = async () => {
        if (await confirmDialog(t("confirm_delete"))) {
          try { await store.remove(config.coll, row.id); toast(t("delete") + " ✓"); navigate(CURRENT_ROUTE); }
          catch (e) { toast(e.message, "error"); }
        }
      };
      if (config.onRowAction) config.onRowAction(tr, row);
      body.appendChild(tr);
    });
  };
  draw();
  $("#list-search").oninput = draw;
  $$(".list-filter").forEach((sel) => (sel.onchange = draw));
  $$(".list-dfrom, .list-dto").forEach((inp) => (inp.onchange = draw));
  $$("th.sortable").forEach((th) => {
    th.onclick = () => {
      const i = Number(th.dataset.col);
      if (sortState.idx === i) sortState.dir *= -1;
      else { sortState.idx = i; sortState.dir = 1; }
      draw();
    };
  });
  $("#btn-add").onclick = () => openForm(config, null);
  $("#btn-print-list").onclick = () => printList(config, currentRows);
  $("#btn-export").onclick = () => exportCSV(config, currentRows);
}

// Columns to include in list export/print (skip photo-thumbnail / opted-out cols)
function listExportColumns(config) {
  return config.columns.filter((c) => c.label !== "" && c.export !== false);
}

// Build the <td> cells for a totals row (per-currency sums for columns with `sum`).
// Returns null if no column is summable. Does NOT include the trailing actions cell.
function totalsCells(columns, rows) {
  if (!columns.some((c) => c.sum)) return null;
  return columns.map((c, i) => {
    if (!c.sum) return i === 0 ? `<td><b>${t("total")}</b></td>` : "<td></td>";
    const g = {};
    rows.forEach((r) => { const s = c.sum(r); if (s) g[s.currency || ""] = (g[s.currency || ""] || 0) + Number(s.amount || 0); });
    const txt = Object.entries(g).filter(([, v]) => v).map(([cur, v]) => fmtMoney(v, cur)).join(" · ") || "0";
    return `<td class="foot-sum"><bdi>${txt}</bdi></td>`;
  }).join("");
}
function cellText(html) {
  return String(html).replace(/<br\s*\/?>/gi, " – ").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// Print the currently filtered + sorted rows as a GRAND VIEW table sheet.
function printList(config, rows) {
  const cols = listExportColumns(config);
  const L = (k) => tLang(CURRENT_LANG, k);
  const html = `
    <div class="doc rcpt-doc list-print">
      ${contractLetterhead()}
      <div class="rcpt-head">
        <div class="rcpt-title">${esc(config.title)}</div>
        <div class="rcpt-meta"><span>${L("total")}: <b>${rows.length}</b></span><span>${L("f_date")}: <b><bdi>${today()}</bdi></b></span></div>
      </div>
      <table class="doc-table list-table">
        <thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${c.get(r)}</td>`).join("")}</tr>`).join("")}</tbody>
        ${(() => { const tc = totalsCells(cols, rows); return tc ? `<tfoot><tr>${tc}</tr></tfoot>` : ""; })()}
      </table>
      ${contractFooter()}
    </div>`;
  printHTML(html);
}

// Export the currently filtered + sorted rows to a UTF-8 CSV (opens in Excel).
function exportCSV(config, rows) {
  const cols = listExportColumns(config);
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [cols.map((c) => q(c.label)).join(",")];
  rows.forEach((r) => lines.push(cols.map((c) => q(cellText(c.get(r)))).join(",")));
  const csv = "﻿" + lines.join("\r\n"); // BOM so Excel reads UTF-8 (Arabic/Kurdish)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${config.coll}-${today()}.csv`;
  a.click();
  toast("CSV ✓");
}

// Derive a sortable value from a column: use col.sortVal if given, else parse the
// rendered cell — numeric (money/area) as a number, otherwise text.
function cellSortValue(col, row) {
  if (col.sortVal) return col.sortVal(row);
  const text = String(col.get(row)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const nonNumeric = text.replace(/[\d.,\s]/g, "").replace(/(IQD|USD|\$|م²|م)/gi, "");
  if (text !== "" && text !== "-" && nonNumeric === "") return Number(text.replace(/[^\d.-]/g, "")) || 0;
  return text.toLowerCase();
}

/* ---------------- Generic form modal ---------------- */
function openForm(config, row) {
  const isEdit = !!row;
  const data = row ? { ...row } : { ...(config.defaults ? config.defaults() : {}) };

  const fieldHtml = (f) => {
    const val = data[f.name] ?? f.default ?? "";
    let input;
    if (f.type === "select") {
      const opts = typeof f.options === "function" ? f.options() : f.options;
      input = `<select name="${f.name}">${optionsHtml(opts, val)}</select>`;
    } else if (f.type === "textarea") {
      input = `<textarea name="${f.name}" rows="3">${esc(val)}</textarea>`;
    } else if (f.type === "image") {
      input = `<input type="file" accept="image/*" name="${f.name}" data-image="1">
        <div class="img-prev">${val ? `<img src="${esc(val)}" alt=""><button type="button" class="img-clear" data-clear="${f.name}">✕</button>` : ""}</div>`;
    } else if (f.type === "images") {
      const arr = Array.isArray(val) ? val : [];
      input = `<input type="file" accept="image/*" multiple name="${f.name}" data-images="${f.name}">
        <div class="img-grid" data-grid="${f.name}">${arr.map((src, i) => `<div class="img-thumb"><img src="${esc(src)}" alt=""><button type="button" class="img-clear" data-del-idx="${i}">✕</button></div>`).join("")}</div>`;
    } else {
      input = `<input class="input" type="${f.type || "text"}" name="${f.name}" value="${esc(val)}" ${f.step ? `step="${f.step}"` : ""}>`;
    }
    return `<div class="field ${f.full ? "full" : ""}"><label>${esc(f.label)}</label>${input}</div>`;
  };

  const overlay = el(`
    <div class="modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>${isEdit ? "✏️ " + t("edit") : "＋ " + t("add_new")} — ${esc(config.title)}</h3>
          <button class="close-x">✕</button>
        </div>
        <div class="modal-body"><div class="form-grid">${config.fields.map(fieldHtml).join("")}</div></div>
        <div class="modal-foot">
          <button class="btn btn-primary" id="frm-save">💾 ${t("save")}</button>
          <button class="btn btn-light" id="frm-cancel">${t("cancel")}</button>
        </div>
      </div>
    </div>`);
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".close-x").onclick = close;
  $("#frm-cancel", overlay).onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  const first = overlay.querySelector("input,select,textarea"); if (first) first.focus();

  const readFile = (file) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });

  // single-image fields: clicking ✕ removes the current image
  const cleared = {};
  overlay.querySelectorAll(".img-prev > .img-clear").forEach((b) => {
    b.onclick = () => { cleared[b.dataset.clear] = true; b.closest(".img-prev").innerHTML = ""; };
  });

  // multi-image ("images") fields: keep a working array, add on upload, remove on ✕
  const imgState = {};
  config.fields.filter((f) => f.type === "images").forEach((f) => {
    imgState[f.name] = Array.isArray(data[f.name]) ? [...data[f.name]] : [];
    const inp = overlay.querySelector(`[name="${f.name}"]`);
    const grid = overlay.querySelector(`[data-grid="${f.name}"]`);
    const rerender = () => {
      grid.innerHTML = imgState[f.name].map((src, i) => `<div class="img-thumb"><img src="${esc(src)}" alt=""><button type="button" class="img-clear" data-del-idx="${i}">✕</button></div>`).join("");
      grid.querySelectorAll("[data-del-idx]").forEach((b) => { b.onclick = () => { imgState[f.name].splice(Number(b.dataset.delIdx), 1); rerender(); }; });
    };
    rerender();
    inp.onchange = async () => {
      for (const file of inp.files) imgState[f.name].push(await readFile(file));
      inp.value = "";
      rerender();
    };
  });

  $("#frm-save", overlay).onclick = async () => {
    const out = {};
    for (const f of config.fields) {
      const inp = overlay.querySelector(`[name="${f.name}"]`);
      if (f.type === "images") { out[f.name] = imgState[f.name]; continue; }
      if (f.type === "image") {
        if (inp.files && inp.files[0]) out[f.name] = await readFile(inp.files[0]);
        else out[f.name] = cleared[f.name] ? "" : (data[f.name] ?? "");
        continue;
      }
      let v = inp.value;
      if (f.type === "number") v = v === "" ? "" : Number(v);
      out[f.name] = v;
    }
    if (config.beforeSave) config.beforeSave(out, data);
    const btn = $("#frm-save", overlay); btn.disabled = true; btn.textContent = "…";
    try {
      if (config.onSave) await config.onSave(out, data);
      else if (isEdit) await store.update(config.coll, row.id, out);
      else await store.insert(config.coll, out, config.codePrefix);
      close();
      toast(t("save") + " ✓");
      navigate(CURRENT_ROUTE);
    } catch (e) {
      btn.disabled = false; btn.textContent = "💾 " + t("save");
      toast(e.message, "error");
    }
  };
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard() {
  $("#page-title").textContent = t("nav_dashboard");
  const content = $("#content");
  const props = store.all("properties");
  const contracts = store.all("contracts");
  const receipts = store.all("receipts");
  const requests = store.all("requests");
  const tenants = store.all("tenants");

  const income = receipts.filter((r) => r.direction === "in").reduce((s, r) => s + Number(r.amount || 0), 0);
  const payOut = receipts.filter((r) => r.direction === "out").reduce((s, r) => s + Number(r.amount || 0), 0);
  const expenses = store.all("expenses").reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalOut = payOut + expenses;

  const kpi = (icon, color, val, label) => `
    <div class="kpi">
      <div class="kpi-ic" style="background:${color}22;color:${color}">${icon}</div>
      <div class="kpi-val">${val}</div>
      <div class="kpi-label">${label}</div>
    </div>`;

  const overdue = tenants.map((tn) => ({ tn, m: rentMonthsOwed(tn) })).filter((x) => x.m >= 1).sort((a, b) => b.m - a.m);

  content.innerHTML = `
    <div class="kpi-grid">
      ${kpi("📄","#1d6fb8", contracts.filter((c) => c.ctype === "sale").length, t("kpi_sale_contracts"))}
      ${kpi("🔑","#16a085", contracts.filter((c) => c.ctype === "rent").length, t("kpi_rent_contracts"))}
      ${kpi("🧾","#8e44ad", receipts.length, t("kpi_receipts"))}
      ${kpi("🏢","#2980b9", props.length, t("kpi_properties"))}
      ${kpi("📝","#e67e22", requests.filter((r) => r.status === "open").length, t("kpi_requests"))}
      ${kpi("👥","#27ae60", tenants.length, t("kpi_tenants"))}
      ${kpi("⬇️","#16a085", fmtMoney(income), t("kpi_income"))}
      ${kpi("⬆️","#e74c3c", fmtMoney(totalOut), t("kpi_expense"))}
      ${kpi("💰","#0f2942", fmtMoney(income - totalOut), t("kpi_net"))}
    </div>
    ${overdue.length ? `<div class="panel alert-panel">
      <div class="panel-head"><h2>⚠️ ${t("dash_overdue")} <span class="count-pill count-red">${overdue.length}</span></h2></div>
      <div class="panel-body" id="dash-overdue"></div>
    </div>` : ""}
    <div class="panel">
      <div class="panel-head"><h2>📈 ${t("kpi_income")} / ${t("kpi_expense")} — 6 ${t("rep_month")}</h2></div>
      <div class="panel-body" id="dash-chart"></div>
    </div>
    <div class="dash-cols">
      <div class="panel"><div class="panel-head"><h2>${t("dash_recent_contracts")}</h2></div><div class="panel-body" id="dash-contracts"></div></div>
      <div class="panel"><div class="panel-head"><h2>${t("dash_due_soon")}</h2></div><div class="panel-body" id="dash-due"></div></div>
      <div class="panel"><div class="panel-head"><h2>${t("dash_recent_requests")}</h2></div><div class="panel-body" id="dash-requests"></div></div>
      <div class="panel"><div class="panel-head"><h2>${t("nav_properties")}</h2></div><div class="panel-body" id="dash-props"></div></div>
    </div>`;

  $("#dash-chart").innerHTML = chartSVG(monthlySeries(6));

  if (overdue.length) {
    const body = $("#dash-overdue");
    body.innerHTML = `<table><tbody>${overdue.map((x) => `
      <tr data-id="${x.tn.id}">
        <td>${esc(x.tn.name)}<br><span class="muted">${esc(x.tn.phone || "")}</span></td>
        <td>${propName(x.tn.property)}</td>
        <td><span class="badge badge-red">${x.m} ${t("ten_month")}</span></td>
        <td class="right">${fmtMoney(x.tn.rent, x.tn.currency)}</td>
        <td class="nowrap"><button class="btn btn-success btn-sm" data-act="collect">💵 ${t("ten_collect")}</button></td>
      </tr>`).join("")}</tbody></table>`;
    body.querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.querySelector('[data-act="collect"]').onclick = () => collectRent(store.get("tenants", tr.dataset.id));
    });
  }

  const rc = contracts.slice(-6).reverse();
  $("#dash-contracts").innerHTML = rc.length ? `<table><tbody>${rc.map((c) => `
    <tr><td>${esc(c.code)}</td>
    <td><span class="badge ${c.ctype === "sale" ? "badge-blue" : "badge-green"}">${c.ctype === "sale" ? t("for_sale") : t("for_rent")}</span></td>
    <td>${esc(c.secondParty) || "-"}</td>
    <td class="right">${fmtMoney(c.ctype === "sale" ? c.price : c.amount, c.currency)}</td></tr>`).join("")}</tbody></table>`
    : emptyMini();

  const due = tenants.map((tn) => ({ tn, days: daysUntilDue(tn) })).filter((x) => x.days !== null)
    .sort((a, b) => a.days - b.days).slice(0, 6);
  $("#dash-due").innerHTML = due.length ? `<table><tbody>${due.map((x) => `
    <tr><td>${esc(x.tn.name)}</td><td>${propName(x.tn.property)}</td>
    <td class="right">${fmtMoney(x.tn.rent, x.tn.currency)}</td><td>${dueBadge(x.days)}</td></tr>`).join("")}</tbody></table>`
    : emptyMini();

  const rq = requests.slice(-6).reverse();
  $("#dash-requests").innerHTML = rq.length ? `<table><tbody>${rq.map((r) => `
    <tr><td>${esc(r.code)}</td>
    <td><span class="badge ${r.rtype === "buy" ? "badge-blue" : "badge-orange"}">${r.rtype === "buy" ? t("buy") : t("rent")}</span></td>
    <td>${esc(r.client)}</td><td>${esc(r.phone)}</td></tr>`).join("")}</tbody></table>`
    : emptyMini();

  const dp = props.slice(-6).reverse();
  $("#dash-props").innerHTML = dp.length ? `<table><tbody>${dp.map((p) => `
    <tr><td>${esc(p.code)}</td><td>${esc(p.title)}</td>
    <td><span class="badge ${p.listing === "sale" ? "badge-blue" : "badge-green"}">${p.listing === "sale" ? t("for_sale") : t("for_rent")}</span></td>
    <td class="right">${fmtMoney(p.price, p.currency)}</td></tr>`).join("")}</tbody></table>`
    : emptyMini();
}
function emptyMini() { return `<div class="empty">📭<br>${t("no_data")}</div>`; }

function monthlySeries(n = 6) {
  const arr = [];
  const now = new Date();
  const receipts = store.all("receipts");
  const expenses = store.all("expenses");
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear(), m = d.getMonth();
    const same = (ds) => { if (!ds) return false; const dt = new Date(ds); return dt.getFullYear() === y && dt.getMonth() === m; };
    const income = receipts.filter((r) => r.direction === "in" && same(r.date)).reduce((s, r) => s + Number(r.amount || 0), 0);
    const payout = receipts.filter((r) => r.direction === "out" && same(r.date)).reduce((s, r) => s + Number(r.amount || 0), 0);
    const exp = expenses.filter((e) => same(e.date)).reduce((s, e) => s + Number(e.amount || 0), 0);
    arr.push({ label: `${m + 1}/${String(y).slice(2)}`, income, expense: payout + exp });
  }
  return arr;
}
function chartSVG(series) {
  const W = 640, H = 240, pad = 34, bw = 16, gap = 6;
  const max = Math.max(1, ...series.map((s) => Math.max(s.income, s.expense)));
  const cw = (W - pad * 2) / series.length;
  const y = (v) => H - pad - (v / max) * (H - pad * 2);
  let bars = "", labels = "", grid = "";
  for (let g = 0; g <= 4; g++) {
    const gy = pad + (g / 4) * (H - pad * 2);
    grid += `<line x1="${pad}" y1="${gy}" x2="${W - pad}" y2="${gy}" stroke="#eef1f6"/>
             <text x="${pad - 6}" y="${gy + 4}" text-anchor="end" class="cx-ax">${fmtMoney(Math.round(max * (1 - g / 4)))}</text>`;
  }
  series.forEach((s, i) => {
    const cx = pad + cw * i + cw / 2;
    const x1 = cx - bw - gap / 2, x2 = cx + gap / 2;
    bars += `<rect x="${x1}" y="${y(s.income)}" width="${bw}" height="${H - pad - y(s.income)}" rx="3" fill="#16a085"><title>${t("kpi_income")}: ${fmtMoney(s.income)}</title></rect>
             <rect x="${x2}" y="${y(s.expense)}" width="${bw}" height="${H - pad - y(s.expense)}" rx="3" fill="#e74c3c"><title>${t("kpi_expense")}: ${fmtMoney(s.expense)}</title></rect>`;
    labels += `<text x="${cx}" y="${H - pad + 16}" text-anchor="middle" class="cx-ax">${s.label}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">
    ${grid}<line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#d5dbe6"/>${bars}${labels}
    <g class="legend">
      <rect x="${W - 210}" y="6" width="12" height="12" rx="2" fill="#16a085"/><text x="${W - 194}" y="16" class="cx-ax">${t("kpi_income")}</text>
      <rect x="${W - 110}" y="6" width="12" height="12" rx="2" fill="#e74c3c"/><text x="${W - 94}" y="16" class="cx-ax">${t("kpi_expense")}</text>
    </g></svg>`;
}

function daysUntilDue(tn) {
  if (!tn.dueDay) return null;
  const now = new Date();
  let due = new Date(now.getFullYear(), now.getMonth(), Number(tn.dueDay));
  if (due < new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    due = new Date(now.getFullYear(), now.getMonth() + 1, Number(tn.dueDay));
  return Math.round((due - now) / 86400000);
}
function dueBadge(days) {
  if (days <= 3) return `<span class="badge badge-red">${days} ${dayWord()}</span>`;
  if (days <= 7) return `<span class="badge badge-orange">${days} ${dayWord()}</span>`;
  return `<span class="badge badge-gray">${days} ${dayWord()}</span>`;
}

/* ============================================================
   PROPERTIES
   ============================================================ */
function renderProperties(listing) {
  renderList({
    title: listing === "sale" ? t("nav_properties_sale") : t("nav_properties_rent"),
    coll: "properties", codePrefix: "P",
    filter: (r) => r.listing === listing,
    defaults: () => ({ listing, currency: store.settings().default_currency, status: "available" }),
    filters: [
      { label: t("f_property_type"), options: OPT.ptype, match: (r, v) => r.ptype === v },
      { label: t("f_status"), options: OPT.propStatus, match: (r, v) => r.status === v },
    ],
    columns: [
      { label: "", get: (r) => propThumb(r) },
      { label: t("f_code"), get: (r) => esc(r.code) },
      { label: t("f_title"), get: (r) => esc(r.title) },
      { label: t("f_property_type"), get: (r) => t("pt_" + r.ptype) },
      { label: t("f_address"), get: (r) => esc(r.address) },
      { label: t("f_area"), get: (r) => esc(r.area) },
      { label: listing === "sale" ? t("f_price") : t("f_rent_monthly"), get: (r) => `<b>${fmtMoney(r.price, r.currency)}</b>`, sum: (r) => ({ amount: r.price, currency: r.currency }) },
      { label: t("f_owner"), get: (r) => `${esc(r.owner)}<br><span class="muted">${esc(r.phone)}</span>` },
      { label: t("f_status"), get: (r) => propStatusBadge(r.status) },
    ],
    fields: [
      { name: "title", label: t("f_title"), full: true },
      { name: "ptype", label: t("f_property_type"), type: "select", options: OPT.ptype },
      { name: "address", label: t("f_address") },
      { name: "area", label: t("f_area"), type: "number" },
      { name: "rooms", label: t("f_rooms"), type: "number" },
      { name: "price", label: listing === "sale" ? t("f_price") : t("f_rent_monthly"), type: "number" },
      { name: "currency", label: t("f_currency"), type: "select", options: OPT.currency },
      { name: "owner", label: t("f_owner") },
      { name: "phone", label: t("f_phone") },
      { name: "status", label: t("f_status"), type: "select", options: OPT.propStatus },
      { name: "photos", label: t("f_photos"), type: "images", full: true },
      { name: "notes", label: t("f_notes"), type: "textarea", full: true },
    ],
    beforeSave: (o) => { o.listing = listing; },
    rowActions: () => `<button class="btn-icon" data-act="print" title="${t("print")}">🖨️</button>`,
    onRowAction: (tr, row) => {
      tr.querySelector('[data-act="print"]').onclick = () => printProperty(row);
      const th = tr.querySelector(".prop-thumb");
      if (th) th.onclick = () => openGallery(row);
    },
  });
}
function propThumb(r) {
  const first = Array.isArray(r.photos) && r.photos.length ? r.photos[0] : null;
  const count = Array.isArray(r.photos) ? r.photos.length : 0;
  if (!first) return `<div class="prop-thumb empty">🏠</div>`;
  return `<div class="prop-thumb" title="${count} 📷"><img src="${esc(first)}" alt="">${count > 1 ? `<span class="thumb-count">${count}</span>` : ""}</div>`;
}
function propStatusBadge(s) {
  const map = { available: "badge-green", reserved: "badge-orange", sold: "badge-blue", rented: "badge-gray" };
  return `<span class="badge ${map[s] || "badge-gray"}">${t("st_" + s)}</span>`;
}

// Lightbox gallery for a property's photos
function openGallery(r) {
  const photos = Array.isArray(r.photos) ? r.photos : [];
  if (!photos.length) return;
  let idx = 0;
  const ov = el(`
    <div class="modal-overlay gallery-ov">
      <div class="gallery">
        <button class="close-x gallery-x">✕</button>
        <div class="gallery-main"><img src="${esc(photos[0])}" alt=""></div>
        ${photos.length > 1 ? `<div class="gallery-nav"><button class="btn btn-light" data-g="prev">‹</button><span class="gallery-idx">1 / ${photos.length}</span><button class="btn btn-light" data-g="next">›</button></div>` : ""}
        <div class="gallery-strip">${photos.map((p, i) => `<img src="${esc(p)}" data-i="${i}" class="${i === 0 ? "active" : ""}">`).join("")}</div>
      </div>
    </div>`);
  document.body.appendChild(ov);
  const show = (i) => {
    idx = (i + photos.length) % photos.length;
    ov.querySelector(".gallery-main img").src = photos[idx];
    const ix = ov.querySelector(".gallery-idx"); if (ix) ix.textContent = `${idx + 1} / ${photos.length}`;
    ov.querySelectorAll(".gallery-strip img").forEach((im) => im.classList.toggle("active", Number(im.dataset.i) === idx));
  };
  ov.querySelector(".gallery-x").onclick = () => ov.remove();
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  ov.querySelectorAll(".gallery-strip img").forEach((im) => (im.onclick = () => show(Number(im.dataset.i))));
  const prev = ov.querySelector('[data-g="prev"]'), next = ov.querySelector('[data-g="next"]');
  if (prev) prev.onclick = () => show(idx - 1);
  if (next) next.onclick = () => show(idx + 1);
}

// Printable property listing sheet (letterhead + photos + details)
function printProperty(r) {
  const L = (k) => tLang(CURRENT_LANG, k);
  const photos = Array.isArray(r.photos) ? r.photos : [];
  const rows = [
    [L("f_code"), r.code],
    [L("f_property_type"), L("pt_" + r.ptype)],
    [L("f_address"), r.address],
    [L("f_area"), r.area],
    [L("f_rooms"), r.rooms],
    [r.listing === "sale" ? L("f_price") : L("f_rent_monthly"), fmtMoney(r.price, r.currency)],
    [L("f_owner"), r.owner],
    [L("f_phone"), r.phone],
    [L("f_status"), L("st_" + r.status)],
  ].filter(([, v]) => v !== undefined && v !== "" && v !== null);
  const html = `
    <div class="doc rcpt-doc">
      ${contractLetterhead()}
      <div class="rcpt-head">
        <div class="rcpt-title">${esc(r.title || "")}</div>
        <div class="rcpt-meta"><span>${L("f_code")}: <b><bdi>${esc(r.code)}</bdi></b></span><span>${r.listing === "sale" ? L("for_sale") : L("for_rent")}</span></div>
      </div>
      ${photos.length ? `<div class="print-photos">${photos.slice(0, 6).map((p) => `<img src="${esc(p)}" alt="">`).join("")}</div>` : ""}
      <table class="doc-table"><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td><bdi>${esc(v)}</bdi></td></tr>`).join("")}</tbody></table>
      ${r.notes ? `<div class="sec-title">${L("f_notes")}</div><p>${esc(r.notes)}</p>` : ""}
      ${contractFooter()}
    </div>`;
  printHTML(html);
}

/* ============================================================
   REQUESTS
   ============================================================ */
function renderRequests(rtype) {
  renderList({
    title: rtype === "buy" ? t("nav_requests_buy") : t("nav_requests_rent"),
    coll: "requests", codePrefix: "R",
    filter: (r) => r.rtype === rtype,
    filters: [
      { label: t("f_property_type"), options: OPT.ptype, match: (r, v) => r.ptype === v },
      { label: t("f_status"), options: OPT.reqStatus, match: (r, v) => r.status === v },
    ],
    defaults: () => ({ rtype, currency: store.settings().default_currency, status: "open", date: today() }),
    columns: [
      { label: t("f_code"), get: (r) => esc(r.code) },
      { label: t("f_client"), get: (r) => `${esc(r.client)}<br><span class="muted">${esc(r.phone)}</span>` },
      { label: t("f_property_type"), get: (r) => t("pt_" + r.ptype) },
      { label: t("f_address"), get: (r) => esc(r.address) },
      { label: rtype === "buy" ? t("f_price") : t("f_rent_monthly"), get: (r) => fmtMoney(r.budget, r.currency), sum: (r) => ({ amount: r.budget, currency: r.currency }) },
      { label: t("f_date"), get: (r) => `<bdi>${esc(r.date)}</bdi>` },
      { label: t("f_status"), get: (r) => `<span class="badge ${r.status === "open" ? "badge-green" : "badge-gray"}">${t("st_" + r.status)}</span>` },
    ],
    fields: [
      { name: "client", label: t("f_client") },
      { name: "phone", label: t("f_phone") },
      { name: "ptype", label: t("f_property_type"), type: "select", options: OPT.ptype },
      { name: "address", label: t("f_address") },
      { name: "budget", label: rtype === "buy" ? t("f_price") : t("f_rent_monthly"), type: "number" },
      { name: "currency", label: t("f_currency"), type: "select", options: OPT.currency },
      { name: "date", label: t("f_date"), type: "date" },
      { name: "status", label: t("f_status"), type: "select", options: OPT.reqStatus },
      { name: "notes", label: t("f_notes"), type: "textarea", full: true },
    ],
    beforeSave: (o) => { o.rtype = rtype; },
  });
}

/* ============================================================
   CONTRACTS (with print)
   ============================================================ */
// Single source of truth for contract fields — used by BOTH the form and the
// printed bullet-point document, so they always stay in sync.
// Groups: parties | property | financial | dates | other. Flags: money, ptype.
function contractFieldDefs(ctype) {
  const common = [
    { name: "firstParty", label: t("f_first_party"), group: "parties" },
    { name: "firstPhone", label: t("f_phone"), group: "parties" },
    { name: "secondParty", label: ctype === "sale" ? t("f_second_party_buyer") : t("f_second_party_tenant"), group: "parties" },
    { name: "secondPhone", label: t("f_phone"), group: "parties" },
    { name: "ptype", label: t("f_property_type"), type: "select", options: OPT.ptype, ptype: true, group: "property" },
    { name: "propNo", label: t("f_prop_no"), group: "property" },
    { name: "area", label: t("f_area"), group: "property" },
    { name: "location", label: t("f_location"), group: "property" },
    { name: "currency", label: t("f_currency"), type: "select", options: OPT.currency, group: "financial" },
  ];
  if (ctype === "sale") {
    return [
      ...common,
      { name: "price", label: t("f_price"), type: "number", money: true, group: "financial" },
      { name: "moneyAdvance", label: t("f_money_advance"), type: "number", money: true, group: "financial" },
      { name: "moneyLeft", label: t("f_money_left"), type: "number", money: true, group: "financial" },
      { name: "amountDissuade", label: t("f_amount_dissuade"), type: "number", money: true, group: "financial" },
      { name: "punishment", label: t("f_punishment"), type: "number", money: true, group: "financial" },
      { name: "lawyerName", label: t("f_lawyer"), group: "dates" },
      { name: "paymentDateLeft", label: t("f_payment_date_left"), type: "date", group: "dates" },
      { name: "dateSurrender", label: t("f_date_surrender"), type: "date", group: "dates" },
      { name: "organizer", label: t("f_organizer"), group: "other" },
      { name: "status", label: t("f_status"), type: "select", options: OPT.contractStatus, group: "other" },
      { name: "photos", label: t("f_photos"), type: "images", full: true, group: "other" },
      { name: "note", label: t("f_notes"), type: "textarea", full: true, group: "other" },
    ];
  }
  return [
    ...common,
    { name: "amount", label: t("f_amount"), type: "number", money: true, group: "financial" },
    { name: "balanceMade", label: t("f_balance_made"), group: "financial" },
    { name: "moneyAdvance", label: t("f_money_advance"), type: "number", money: true, group: "financial" },
    { name: "asIntroduction", label: t("f_as_introduction"), group: "financial" },
    { name: "monthlyAdvance", label: t("f_monthly_advance"), group: "financial" },
    { name: "punishment", label: t("f_punishment"), type: "number", money: true, group: "financial" },
    { name: "punishPerDay", label: t("f_punish_per_day"), type: "number", money: true, group: "financial" },
    { name: "assurances", label: t("f_assurances"), group: "financial" },
    { name: "dateOf", label: t("f_date_of"), type: "date", group: "dates" },
    { name: "forDate", label: t("f_for_date"), type: "date", group: "dates" },
    { name: "rentalPeriod", label: t("f_rental_period"), group: "dates" },
    { name: "forPurposes", label: t("f_for_purposes"), group: "dates" },
    { name: "dateSurrender", label: t("f_date_surrender"), type: "date", group: "dates" },
    { name: "organizer", label: t("f_organizer"), group: "other" },
    { name: "status", label: t("f_status"), type: "select", options: OPT.contractStatus, group: "other" },
    { name: "photos", label: t("f_photos"), type: "images", full: true, group: "other" },
    { name: "note", label: t("f_notes"), type: "textarea", full: true, group: "other" },
  ];
}

function renderContracts(ctype) {
  const fields = contractFieldDefs(ctype);
  const amountOf = (r) => (ctype === "sale" ? r.price : r.amount);
  const dateOf = (r) => (ctype === "sale" ? (r.paymentDateLeft || r.dateSurrender || "") : (r.dateOf || ""));
  const columns = [
    { label: t("f_code"), get: (r) => esc(r.code) },
    { label: t("f_first_party"), get: (r) => esc(r.firstParty) },
    { label: ctype === "sale" ? t("f_second_party_buyer") : t("f_second_party_tenant"), get: (r) => esc(r.secondParty) },
    { label: t("f_property_type"), get: (r) => (r.ptype ? t("pt_" + r.ptype) : "-") },
    { label: ctype === "sale" ? t("f_price") : t("f_amount"), get: (r) => `<b>${fmtMoney(amountOf(r), r.currency)}</b>`, sum: (r) => ({ amount: amountOf(r), currency: r.currency }) },
    { label: t("f_date"), get: (r) => `<bdi>${esc(dateOf(r))}</bdi>` },
    { label: t("f_status"), get: (r) => `<span class="badge ${r.status === "active" ? "badge-green" : "badge-gray"}">${t("st_" + (r.status || "active"))}</span>` },
  ];
  renderList({
    title: ctype === "sale" ? t("nav_contracts_sale") : t("nav_contracts_rent"),
    coll: "contracts", codePrefix: "C",
    filter: (r) => r.ctype === ctype,
    filters: [
      { label: t("f_property_type"), options: OPT.ptype, match: (r, v) => r.ptype === v },
      { label: t("f_status"), options: OPT.contractStatus, match: (r, v) => r.status === v },
    ],
    defaults: () => ({
      ctype, currency: store.settings().default_currency, status: "active",
      ...(ctype === "sale" ? { paymentDateLeft: today(), dateSurrender: today() } : { dateOf: today(), dateSurrender: today() }),
    }),
    columns, fields,
    beforeSave: (o) => { o.ctype = ctype; },
    rowActions: () => `<button class="btn-icon" data-act="print" title="${t("print")}">🖨️</button>`,
    onRowAction: (tr, row) => { const b = tr.querySelector('[data-act="print"]'); if (b) b.onclick = () => printContract(row); },
  });
}

/* ============================================================
   RECEIPTS (with print)
   ============================================================ */
function renderReceipts(direction) {
  renderList({
    title: direction === "in" ? t("nav_receipts_in") : t("nav_receipts_out"),
    coll: "receipts", codePrefix: direction === "in" ? "RC" : "PY",
    filter: (r) => r.direction === direction,
    filters: [
      { type: "daterange", field: (r) => r.date, label: t("f_date") },
      { label: t("f_method"), options: OPT.payMethod, match: (r, v) => r.method === v },
      { label: t("f_currency"), options: OPT.currency, match: (r, v) => r.currency === v },
    ],
    defaults: () => ({ direction, currency: store.settings().default_currency, date: today(), method: "cash" }),
    columns: [
      { label: t("f_code"), get: (r) => esc(r.code) },
      { label: t("f_client"), get: (r) => esc(r.party) },
      { label: t("f_desc"), get: (r) => esc(r.desc) },
      { label: t("f_amount"), get: (r) => `<b>${fmtMoney(r.amount, r.currency)}</b>`, sum: (r) => ({ amount: r.amount, currency: r.currency }) },
      { label: t("f_method"), get: (r) => t("pm_" + r.method) },
      { label: t("f_date"), get: (r) => `<bdi>${esc(r.date)}</bdi>` },
    ],
    fields: [
      { name: "party", label: t("f_client"), full: true },
      { name: "desc", label: t("f_desc"), full: true },
      { name: "amount", label: t("f_amount"), type: "number" },
      { name: "currency", label: t("f_currency"), type: "select", options: OPT.currency },
      { name: "method", label: t("f_method"), type: "select", options: OPT.payMethod },
      { name: "date", label: t("f_date"), type: "date" },
      { name: "ref", label: t("f_ref"), full: true },
    ],
    beforeSave: (o) => { o.direction = direction; },
    rowActions: () => `<button class="btn-icon" data-act="print" title="${t("print")}">🖨️</button>`,
    onRowAction: (tr, row) => { tr.querySelector('[data-act="print"]').onclick = () => printReceipt(row); },
  });
}

/* ============================================================
   TENANTS
   ============================================================ */
function renderTenants() {
  renderList({
    title: t("nav_tenants"), coll: "tenants", codePrefix: "T",
    defaults: () => ({ currency: store.settings().default_currency, dueDay: 1, start: today(), paidUntil: today() }),
    columns: [
      { label: t("f_code"), get: (r) => esc(r.code) },
      { label: t("f_tenant"), get: (r) => `${esc(r.name)}<br><span class="muted">${esc(r.phone)}</span>` },
      { label: t("f_property"), get: (r) => propName(r.property) },
      { label: t("f_rent_monthly"), get: (r) => `<b>${fmtMoney(r.rent, r.currency)}</b>`, sum: (r) => ({ amount: r.rent, currency: r.currency }) },
      { label: t("f_due_day"), get: (r) => esc(r.dueDay) },
      { label: t("f_paid_until"), get: (r) => `<bdi>${esc(r.paidUntil)}</bdi>` },
      { label: t("f_status"), get: (r) => tenantStatusBadge(r) },
    ],
    fields: [
      { name: "name", label: t("f_tenant") }, { name: "phone", label: t("f_phone") },
      { name: "property", label: t("f_property"), type: "select", options: OPT.properties, full: true },
      { name: "rent", label: t("f_rent_monthly"), type: "number" },
      { name: "currency", label: t("f_currency"), type: "select", options: OPT.currency },
      { name: "dueDay", label: t("f_due_day"), type: "number" },
      { name: "start", label: t("f_start"), type: "date" },
      { name: "paidUntil", label: t("f_paid_until"), type: "date" },
      { name: "notes", label: t("f_notes"), type: "textarea", full: true },
    ],
    rowActions: () => `<button class="btn-icon" data-act="collect" title="${t("ten_collect")}">💵</button>`,
    onRowAction: (tr, row) => { tr.querySelector('[data-act="collect"]').onclick = () => collectRent(row); },
  });
}

// Months of rent owed = whole months elapsed since paidUntil (0 if paid ahead).
function rentMonthsOwed(tn) {
  if (!tn.paidUntil) return 0;
  const paid = new Date(tn.paidUntil), now = new Date();
  if (paid >= now) return 0;
  let m = (now.getFullYear() - paid.getFullYear()) * 12 + (now.getMonth() - paid.getMonth());
  if (now.getDate() < paid.getDate()) m -= 1;
  return Math.max(0, m);
}
function tenantStatusBadge(tn) {
  const owed = rentMonthsOwed(tn);
  if (owed >= 1) return `<span class="badge badge-red">${t("ten_overdue")} · ${owed} ${t("ten_month")}</span>`;
  const d = daysUntilDue(tn);
  if (d !== null && d <= 7) return `<span class="badge badge-orange">${d} ${dayWord()}</span>`;
  return `<span class="badge badge-green">${t("ten_paid")}</span>`;
}

// One-click rent collection: records an income receipt + advances paid-until by a month.
async function collectRent(tn) {
  const prop = store.get("properties", tn.property);
  const label = CURRENT_LANG === "ar" ? "إيجار" : "کرێ";
  const desc = `${label} - ${prop ? prop.title : tn.name}`;
  const base = tn.paidUntil ? new Date(tn.paidUntil) : new Date();
  base.setMonth(base.getMonth() + 1);
  const newPaid = base.toISOString().slice(0, 10);
  try {
    await store.insert("receipts", {
      direction: "in", party: tn.name, desc, amount: tn.rent,
      currency: tn.currency, method: "cash", date: today(), ref: tn.code,
    }, "RC");
    await store.update("tenants", tn.id, { paidUntil: newPaid });
    toast(`${t("ten_collect")} ✓ · ${fmtMoney(tn.rent, tn.currency)}`);
    navigate(CURRENT_ROUTE);
  } catch (e) { toast(e.message, "error"); }
}

/* ============================================================
   EXPENSES
   ============================================================ */
function renderExpenses() {
  renderList({
    title: t("nav_expenses"), coll: "expenses", codePrefix: "E",
    filters: [
      { type: "daterange", field: (r) => r.date, label: t("f_date") },
      { label: t("f_currency"), options: OPT.currency, match: (r, v) => r.currency === v },
    ],
    defaults: () => ({ currency: store.settings().default_currency, date: today() }),
    columns: [
      { label: t("f_code"), get: (r) => esc(r.code) },
      { label: t("f_category"), get: (r) => esc(r.category) },
      { label: t("f_desc"), get: (r) => esc(r.desc) },
      { label: t("f_amount"), get: (r) => `<b>${fmtMoney(r.amount, r.currency)}</b>`, sum: (r) => ({ amount: r.amount, currency: r.currency }) },
      { label: t("f_date"), get: (r) => `<bdi>${esc(r.date)}</bdi>` },
    ],
    fields: [
      { name: "category", label: t("f_category") },
      { name: "desc", label: t("f_desc"), full: true },
      { name: "amount", label: t("f_amount"), type: "number" },
      { name: "currency", label: t("f_currency"), type: "select", options: OPT.currency },
      { name: "date", label: t("f_date"), type: "date" },
    ],
  });
}

/* ============================================================
   REPORTS
   ============================================================ */
function renderReports() {
  $("#page-title").textContent = t("rep_title");
  const content = $("#content");
  const now = new Date();
  content.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h2>${t("rep_title")}</h2>
        <div class="toolbar">
          <select id="rep-type" class="input">
            <option value="monthly">${t("rep_monthly")}</option>
            <option value="annual">${t("rep_annual")}</option>
          </select>
          <select id="rep-month" class="input">${Array.from({ length: 12 }, (_, i) => `<option value="${i}" ${i === now.getMonth() ? "selected" : ""}>${i + 1}</option>`).join("")}</select>
          <input id="rep-year" class="input" type="number" value="${now.getFullYear()}" style="width:100px">
          <button class="btn btn-primary" id="rep-go">📊 ${t("rep_generate")}</button>
          <button class="btn btn-light" id="rep-print">🖨️ ${t("print")}</button>
        </div>
      </div>
      <div class="panel-body" id="rep-out"></div>
    </div>`;
  const typeSel = $("#rep-type");
  typeSel.onchange = () => { $("#rep-month").style.display = typeSel.value === "monthly" ? "" : "none"; };
  $("#rep-go").onclick = build;
  $("#rep-print").onclick = () => printHTML($("#print-report").outerHTML);
  build();

  function build() {
    const type = typeSel.value;
    const year = Number($("#rep-year").value);
    const month = Number($("#rep-month").value);
    const inRange = (d) => { if (!d) return false; const dt = new Date(d); if (dt.getFullYear() !== year) return false; if (type === "monthly" && dt.getMonth() !== month) return false; return true; };
    const receipts = store.all("receipts").filter((r) => inRange(r.date));
    const expenses = store.all("expenses").filter((e) => inRange(e.date));
    const income = receipts.filter((r) => r.direction === "in").reduce((s, r) => s + Number(r.amount || 0), 0);
    const payOut = receipts.filter((r) => r.direction === "out").reduce((s, r) => s + Number(r.amount || 0), 0);
    const exp = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const contracts = store.all("contracts").filter((c) => inRange(c.dateOf || c.paymentDateLeft || c.date || c.start || c.createdAt));
    const label = type === "monthly" ? `${month + 1} / ${year}` : `${year}`;
    const inCount = receipts.filter((r) => r.direction === "in").length;
    const outCount = receipts.filter((r) => r.direction === "out").length;
    $("#rep-out").innerHTML = `
      <div id="print-report" class="doc rcpt-doc">
        ${contractLetterhead()}
        <div class="rcpt-head">
          <div class="rcpt-title">${type === "monthly" ? t("rep_monthly") : t("rep_annual")} — <bdi>${esc(label)}</bdi></div>
          <div class="rcpt-meta"><span>${t("rep_" + (type === "monthly" ? "month" : "year"))}: <b><bdi>${esc(label)}</bdi></b></span><span>${t("f_date")}: <b><bdi>${today()}</bdi></b></span></div>
        </div>
        <div class="kpi-grid">
          ${repCard(t("rep_income"), fmtMoney(income), "#16a085")}
          ${repCard(t("rep_expense"), fmtMoney(exp + payOut), "#e74c3c")}
          ${repCard(t("rep_net"), fmtMoney(income - exp - payOut), "#1d6fb8")}
          ${repCard(t("kpi_sale_contracts"), contracts.filter((c) => c.ctype === "sale").length, "#8e44ad")}
          ${repCard(t("kpi_rent_contracts"), contracts.filter((c) => c.ctype === "rent").length, "#e67e22")}
        </div>
        <table class="doc-table"><thead><tr><th>${t("f_desc")}</th><th>${t("total")}</th><th>${t("f_amount")}</th></tr></thead>
          <tbody>
            <tr><td>${t("nav_receipts_in")}</td><td>${inCount}</td><td><bdi>${fmtMoney(income)}</bdi></td></tr>
            <tr><td>${t("nav_receipts_out")}</td><td>${outCount}</td><td><bdi>${fmtMoney(payOut)}</bdi></td></tr>
            <tr><td>${t("nav_expenses")}</td><td>${expenses.length}</td><td><bdi>${fmtMoney(exp)}</bdi></td></tr>
            <tr style="font-weight:700;background:#f7f9fc"><td>${t("rep_net")}</td><td></td><td><bdi>${fmtMoney(income - exp - payOut)}</bdi></td></tr>
          </tbody></table>
        ${contractFooter()}
      </div>`;
  }
  function repCard(label, val, color) {
    return `<div class="kpi"><div class="kpi-ic" style="background:${color}22;color:${color}">•</div><div class="kpi-val">${val}</div><div class="kpi-label">${label}</div></div>`;
  }
}

/* ============================================================
   ACCOUNTING
   ============================================================ */
function renderAccounting() {
  $("#page-title").textContent = t("nav_accounting");
  const content = $("#content");
  content.innerHTML = `<div id="acc-emp"></div><div id="acc-com"></div>`;

  const empPanel = el(`<div class="panel">
    <div class="panel-head"><h2>${t("acc_salaries")}</h2><button class="btn btn-primary btn-sm" id="add-emp">＋ ${t("add_new")}</button></div>
    <div class="panel-body"><table><thead><tr><th>${t("f_employee")}</th><th>${t("f_phone")}</th><th>${t("f_salary")}</th><th>${t("actions")}</th></tr></thead><tbody id="emp-body"></tbody></table></div></div>`);
  content.querySelector("#acc-emp").appendChild(empPanel);
  const drawEmp = () => {
    $("#emp-body").innerHTML = store.all("employees").map((e) => `<tr data-id="${e.id}">
      <td>${esc(e.name)}</td><td>${esc(e.phone)}</td><td><b>${fmtMoney(e.salary, e.currency)}</b></td>
      <td class="act-cell"><button class="btn-icon" data-act="edit">✏️</button><button class="btn-icon del" data-act="del">🗑️</button></td></tr>`).join("")
      || `<tr><td colspan="4" class="empty">📭 ${t("no_data")}</td></tr>`;
    $$("#emp-body tr[data-id]").forEach((tr) => {
      const emp = store.get("employees", tr.dataset.id);
      tr.querySelector('[data-act="edit"]').onclick = () => empForm(emp);
      tr.querySelector('[data-act="del"]').onclick = async () => { if (await confirmDialog(t("confirm_delete"))) { await store.remove("employees", emp.id); toast(t("delete") + " ✓"); renderAccounting(); } };
    });
  };
  const empForm = (row) => openForm({
    title: t("f_employee"), coll: "employees", codePrefix: "EMP",
    defaults: () => ({ currency: store.settings().default_currency }),
    fields: [
      { name: "name", label: t("f_employee") }, { name: "phone", label: t("f_phone") },
      { name: "salary", label: t("f_salary"), type: "number" },
      { name: "currency", label: t("f_currency"), type: "select", options: OPT.currency },
    ],
  }, row);
  $("#add-emp").onclick = () => empForm(null);
  drawEmp();

  const comPanel = el(`<div class="panel">
    <div class="panel-head"><h2>${t("acc_commissions")}</h2><button class="btn btn-primary btn-sm" id="add-com">＋ ${t("add_new")}</button></div>
    <div class="panel-body"><table><thead><tr><th>${t("f_employee")}</th><th>${t("f_ref")}</th><th>${t("f_commission")}</th><th>${t("f_date")}</th><th>${t("actions")}</th></tr></thead><tbody id="com-body"></tbody></table></div></div>`);
  content.querySelector("#acc-com").appendChild(comPanel);
  const drawCom = () => {
    $("#com-body").innerHTML = store.all("commissions").map((c) => `<tr data-id="${c.id}">
      <td>${esc(c.employee)}</td><td>${esc(c.ref)}</td><td><b>${fmtMoney(c.amount, c.currency)}</b></td><td>${esc(c.date)}</td>
      <td class="act-cell"><button class="btn-icon" data-act="edit">✏️</button><button class="btn-icon del" data-act="del">🗑️</button></td></tr>`).join("")
      || `<tr><td colspan="5" class="empty">📭 ${t("no_data")}</td></tr>`;
    $$("#com-body tr[data-id]").forEach((tr) => {
      const com = store.get("commissions", tr.dataset.id);
      tr.querySelector('[data-act="edit"]').onclick = () => comForm(com);
      tr.querySelector('[data-act="del"]').onclick = async () => { if (await confirmDialog(t("confirm_delete"))) { await store.remove("commissions", com.id); toast(t("delete") + " ✓"); renderAccounting(); } };
    });
  };
  const comForm = (row) => openForm({
    title: t("acc_commissions"), coll: "commissions", codePrefix: "COM",
    defaults: () => ({ currency: store.settings().default_currency, date: today() }),
    fields: [
      { name: "employee", label: t("f_employee") }, { name: "ref", label: t("f_ref") },
      { name: "amount", label: t("f_commission"), type: "number" },
      { name: "currency", label: t("f_currency"), type: "select", options: OPT.currency },
      { name: "date", label: t("f_date"), type: "date" },
    ],
  }, row);
  $("#add-com").onclick = () => comForm(null);
  drawCom();
}

/* ============================================================
   PRINTING
   ============================================================ */

// English number-to-words (for amounts like "ninety-five thousand")
function numberToWordsEn(num) {
  num = Math.floor(Number(num) || 0);
  if (num === 0) return "zero";
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const below1000 = (n) => {
    let s = "";
    if (n >= 100) { s += ones[Math.floor(n / 100)] + " hundred"; n %= 100; if (n) s += " "; }
    if (n >= 20) { s += tens[Math.floor(n / 10)]; n %= 10; if (n) s += "-" + ones[n]; }
    else if (n > 0) { s += ones[n]; }
    return s;
  };
  const scales = [["billion", 1e9], ["million", 1e6], ["thousand", 1e3]];
  let words = "";
  for (const [name, val] of scales) {
    if (num >= val) { words += (words ? " " : "") + below1000(Math.floor(num / val)) + " " + name; num %= val; }
  }
  if (num > 0) words += (words ? " " : "") + below1000(num);
  return words.trim();
}
function curSymbol(cur) { return cur === "USD" ? "$" : (cur === "IQD" ? "IQD" : (cur || "")); }
function amountPhrase(n, cur) {
  const sym = curSymbol(cur);
  const v = Number(n) || 0;
  return `${sym}${v.toLocaleString("en-US")} (${numberToWordsEn(v)} (${sym}))`;
}

// Letterhead (fan logo + optional bilingual name + footer). All values come from
// ⚙️ Settings; blank by default so no company name is hardcoded on printouts.
function fanLogoSVG() {
  const cx = 50, cy = 92, rays = 9, spread = 150;
  let p = "";
  for (let i = 0; i < rays; i++) {
    const deg = -spread / 2 + i * (spread / (rays - 1));
    const a = (deg * Math.PI) / 180;
    const len = 70 - Math.abs(deg) * 0.12;
    const tx = cx + Math.sin(a) * len, ty = cy - Math.cos(a) * len;
    const w = 2.4;
    const b1x = cx + Math.cos(a) * w, b1y = cy + Math.sin(a) * w;
    const b2x = cx - Math.cos(a) * w, b2y = cy - Math.sin(a) * w;
    p += `<polygon points="${b1x.toFixed(1)},${b1y.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)} ${b2x.toFixed(1)},${b2y.toFixed(1)}"/>`;
  }
  return `<svg viewBox="0 0 100 100" width="58" height="58"><g fill="#c2a24c">${p}</g></svg>`;
}
// Branding helpers — all read from Settings, falling back to GRAND VIEW defaults.
// Branding — all values come from ⚙️ Settings; blank by default (no hardcoded
// company name on printouts). The user fills in their own office details.
const BRAND = {
  ar: () => store.settings().brand_ar || "",
  en: () => store.settings().office_name || "",
  tagAr: () => store.settings().tagline_ar || "",
  tagKu: () => store.settings().tagline_ku || "",
  logoTop: () => store.settings().logo_top || "",
  logoBottom: () => store.settings().logo_bottom || "",
  phone: () => store.settings().office_phone || "",
  location: () => store.settings().office_address || "",
  court: () => store.settings().court_city || "",
  logo: () => store.settings().logo_image || "",
};
function contractLetterhead() {
  const name = BRAND.ar() || BRAND.en();
  const lt = BRAND.logoTop(), lb = BRAND.logoBottom();
  const logoBlock = BRAND.logo()
    ? `<img src="${esc(BRAND.logo())}" class="lh-img" alt="">`
    : `${fanLogoSVG()}${(lt || lb) ? `<div class="lh-logo-txt">${esc(lt)}<span>${esc(lb)}</span></div>` : ""}`;
  const side = (tag) => `<div class="lh-side">${name ? `<div class="lh-name">${esc(name)}</div>` : ""}${tag ? `<div class="lh-tag">${esc(tag)}</div>` : ""}</div>`;
  return `
    <div class="lh">
      ${side(BRAND.tagAr())}
      <div class="lh-logo">${logoBlock}</div>
      ${side(BRAND.tagKu())}
    </div>
    <div class="lh-rule"></div>`;
}
function contractFooter() {
  const phone = BRAND.phone(), loc = BRAND.location();
  if (!phone && !loc) return `<div class="lh-rule bottom"></div>`;
  return `<div class="lh-rule bottom"></div><div class="lh-foot"><span>${phone ? "📞 " + esc(phone) : ""}</span><span>${loc ? "📍 " + esc(loc) : ""}</span></div>`;
}

// Optional property photos block for printed contracts (only if photos attached).
function contractPhotosHtml(c) {
  const photos = Array.isArray(c.photos) ? c.photos : [];
  if (!photos.length) return "";
  return `<div class="print-photos">${photos.slice(0, 6).map((p) => `<img src="${esc(p)}" alt="">`).join("")}</div>`;
}

// Printed contract — renders in the current UI language (Kurdish / Arabic /
// English) via CONTRACT_TEXT. Company name & court come from Settings
// (blank/generic when unset — no hardcoded branding).
function printContract(c) {
  const lang = CURRENT_LANG === "ar" ? "ar" : (CURRENT_LANG === "ku" ? "ku" : "en");
  const isSale = c.ctype === "sale";
  const T = CONTRACT_TEXT.labels[lang];
  const office = esc(BRAND.ar() || BRAND.en() || CONTRACT_TEXT.generic.office[lang]);
  const court = esc((store.settings().court_city || "").trim() || CONTRACT_TEXT.generic.court[lang]);
  const moneyFmt = lang === "en" ? (n) => amountPhrase(n, c.currency) : (n) => fmtMoney(Number(n) || 0, c.currency);
  const x = { m: moneyFmt, office, court };
  const clauses = CONTRACT_TEXT[isSale ? "sale" : "rent"][lang](c, x);
  const num = String(c.code || "").replace(/\D/g, "").replace(/^0+/, "") || String(c.code || "");
  const dateTop = isSale
    ? (String(c.createdAt || "").slice(0, 10) || today())
    : (c.dateOf || String(c.createdAt || "").slice(0, 10) || today());
  const ptypeTxt = c.ptype ? tLang(lang, "pt_" + c.ptype) : "";
  const signs = isSale
    ? [[T.s_seller, c.firstParty], [T.s_organizer, c.organizer], [T.s_buyer, c.secondParty]]
    : [[T.s_owner, c.firstParty], [T.s_organizer, c.organizer], [T.s_tenant, c.secondParty]];
  const rtl = lang !== "en";
  const html = `
    <div class="doc doc-en${rtl ? " rtl" : ""}">
      ${contractLetterhead()}
      <div class="en-top">
        <div class="en-date">${T.date} : <bdi>${esc(dateTop)}</bdi></div>
        <div class="en-title">${T[isSale ? "saleTitle" : "rentTitle"]}</div>
        <div class="en-num">${T.contractNo} #&nbsp; <bdi>${esc(num)}</bdi></div>
      </div>
      <div class="en-parties">
        <div class="en-col">
          <div><span class="en-lbl">${T.p_first}:</span> ${esc(c.firstParty || "")}</div>
          <div><span class="en-lbl">${T.p_location}:</span> ${esc(c.location || "")}</div>
          <div><span class="en-lbl">${T.p_number}:</span> ${esc(c.propNo || "")}</div>
        </div>
        <div class="en-col">
          <div><span class="en-lbl">${T.p_second}:</span> ${esc(c.secondParty || "")}</div>
          <div><span class="en-lbl">${T.p_type}:</span> ${esc(ptypeTxt)}</div>
          <div><span class="en-lbl">${T.p_area}:</span> ${esc(c.area || "")} m²</div>
        </div>
      </div>
      ${contractPhotosHtml(c)}
      <div class="en-banner">${T.banner}</div>
      <ol class="en-clauses">${clauses.map((cl) => `<li>${cl}</li>`).join("")}</ol>
      <div class="en-note"><b>${T.note} :</b> ${esc(c.note || "")}</div>
      <div class="en-signs">
        ${signs.map(([label, name]) => `<div class="en-sign"><div class="en-slabel">${label}</div><div class="en-sline"></div><div class="en-sname">${esc(name || "")}</div></div>`).join("")}
      </div>
      ${contractFooter()}
    </div>`;
  printHTML(html);
}

function printReceipt(r) {
  const lang = CURRENT_LANG;
  const L = (k) => tLang(lang, k);
  const title = r.direction === "in" ? L("nav_receipts_in") : L("nav_receipts_out");
  const partyLabel = r.direction === "in" ? L("rc_received_from") : L("rc_paid_to");
  const html = `
    <div class="doc rcpt-doc">
      ${contractLetterhead()}
      <div class="rcpt-head">
        <div class="rcpt-title">${title}</div>
        <div class="rcpt-meta"><span>${L("f_code")}: <b><bdi>${esc(r.code)}</bdi></b></span><span>${L("f_date")}: <b><bdi>${esc(r.date)}</bdi></b></span></div>
      </div>
      <table class="doc-table"><tbody>
        <tr><td>${partyLabel}</td><td>${esc(r.party)}</td></tr>
        <tr><td>${L("f_desc")}</td><td>${esc(r.desc)}</td></tr>
        <tr><td>${L("f_method")}</td><td>${L("pm_" + r.method)}</td></tr>
        ${r.ref ? `<tr><td>${L("f_ref")}</td><td><bdi>${esc(r.ref)}</bdi></td></tr>` : ""}
      </tbody></table>
      <div class="rcpt-amount-box"><span class="r-amount">${fmtMoney(r.amount, r.currency)}</span></div>
      <div class="en-signs">
        <div class="en-sign"><div class="en-slabel">${L("rc_recipient")}</div><div class="en-sline"></div></div>
        <div class="en-sign"><div class="en-slabel">${L("rc_payer")}</div><div class="en-sline"></div></div>
      </div>
      ${contractFooter()}
    </div>`;
  printHTML(html);
}

function printHTML(html) {
  let area = $("#print-area");
  if (!area) { area = el(`<div id="print-area"></div>`); document.body.appendChild(area); }
  area.innerHTML = html;
  window.print();
}

/* ============================================================
   Settings / backup / language / boot
   ============================================================ */
function applyLangUI() {
  document.documentElement.lang = CURRENT_LANG;
  document.documentElement.dir = "rtl";
  $("#brand-title").textContent = t("app_title");
  $$(".lang-switch button").forEach((b) => b.classList.toggle("active", b.dataset.lang === CURRENT_LANG));
  renderSidebar();
}

function openSettings() {
  const s = store.settings();
  // Fields are pre-filled with the current effective values (BRAND.* falls back
  // to the GRAND VIEW defaults), so editing any of them updates the printouts.
  openForm({
    title: "⚙️ " + t("app_title"),
    fields: [
      { name: "office_name", label: "Company name — English (used in contract clauses) / ناوی کۆمپانیا بە ئینگلیزی", full: true, default: BRAND.en() },
      { name: "brand_ar", label: "ناوی کۆمپانیا لە سەردێڕ / اسم الشركة في الترويسة", full: true, default: BRAND.ar() },
      { name: "tagline_ar", label: "دروشمی سەردێڕ (عربي) / شعار الترويسة", full: true, default: BRAND.tagAr() },
      { name: "tagline_ku", label: "دروشمی سەردێڕ (کوردی)", full: true, default: BRAND.tagKu() },
      { name: "logo_image", label: "Logo image / وێنەی لۆگۆ (PNG/JPG/SVG)", type: "image", full: true, default: s.logo_image || "" },
      { name: "logo_top", label: "Logo text — line 1 (if no image)", default: BRAND.logoTop() },
      { name: "logo_bottom", label: "Logo text — line 2 (if no image)", default: BRAND.logoBottom() },
      { name: "office_phone", label: t("f_phone"), default: BRAND.phone() },
      { name: "office_address", label: t("f_address") + " / شوێن", default: BRAND.location() },
      { name: "court_city", label: "Court city — sale contract / شاری دادگا", default: BRAND.court() },
      { name: "default_currency", label: t("f_currency"), type: "select", options: OPT.currency, default: s.default_currency || "IQD" },
    ],
    onSave: async (out) => { await store.saveSettings(out); },
  }, {});
}

function openBackup() {
  const ov = el(`
    <div class="modal-overlay">
      <div class="modal">
        <div class="modal-head"><h3>💾 ${CURRENT_LANG === "ar" ? "النسخ الاحتياطي" : "پاشەکەوت و گەڕاندنەوە"}</h3><button class="close-x">✕</button></div>
        <div class="modal-body">
          <div class="backup-grid">
            <button class="backup-opt" id="bk-export">⬇️<span>${CURRENT_LANG === "ar" ? "تصدير نسخة احتياطية" : "دەرهێنانی پاشەکەوت"}</span></button>
            <button class="backup-opt" id="bk-import">⬆️<span>${CURRENT_LANG === "ar" ? "استيراد نسخة" : "هێنانی پاشەکەوت"}</span></button>
            <button class="backup-opt danger" id="bk-reset">🧹<span>${CURRENT_LANG === "ar" ? "مسح كل البيانات" : "سڕینەوەی هەموو داتا"}</span></button>
          </div>
        </div>
      </div>
    </div>`);
  document.body.appendChild(ov);
  ov.querySelector(".close-x").onclick = () => ov.remove();
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  $("#bk-export", ov).onclick = async () => {
    const data = await store.backup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `real-estate-backup-${today()}.json`; a.click();
    toast("✓"); ov.remove();
  };
  $("#bk-import", ov).onclick = () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json";
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = async () => { try { await store.restore(JSON.parse(rd.result)); ov.remove(); toast("✓"); navigate(CURRENT_ROUTE); } catch (e) { toast(e.message, "error"); } };
      rd.readAsText(f);
    };
    inp.click();
  };
  $("#bk-reset", ov).onclick = async () => {
    if (await confirmDialog(t("confirm_delete"))) { await store.reset(); ov.remove(); toast("✓"); navigate("dashboard"); }
  };
}

// Start the app after a successful login (loads DB, wires the UI).
async function startApp() {
  await initDB();
  $$(".lang-switch button").forEach((b) => {
    b.onclick = () => { setLang(b.dataset.lang); applyLangUI(); navigate(CURRENT_ROUTE); };
  });
  $("#btn-settings").onclick = openSettings;
  $("#btn-backup").onclick = openBackup;
  $("#btn-account").onclick = openAccount;
  $("#btn-logout").onclick = doLogout;
  applyLangUI();
  navigate("dashboard");
  const bo = $("#boot-overlay"); if (bo) bo.remove();
  const lg = $("#login-screen"); if (lg) lg.remove();
  const app = $(".app"); if (app) app.style.display = "";
}

// Full-screen login gate.
function showLogin() {
  const app = $(".app"); if (app) app.style.display = "none";
  const bo = $("#boot-overlay"); if (bo) bo.remove();
  if ($("#login-screen")) return;
  const scr = el(`
    <div id="login-screen">
      <form class="login-card" id="login-form" autocomplete="on">
        <div class="login-logo">🏘️</div>
        <h2>${esc(t("app_title"))}</h2>
        <div class="login-field"><label>${t("login_user")}</label><input id="lg-user" class="input" autocomplete="username" value="${esc(auth.username() || "admin")}"></div>
        <div class="login-field"><label>${t("login_pass")}</label><input id="lg-pass" type="password" class="input" autocomplete="current-password"></div>
        <div class="login-err" id="lg-err"></div>
        <button class="btn btn-primary" type="submit" id="lg-btn">${t("login_btn")}</button>
      </form>
    </div>`);
  document.body.appendChild(scr);
  const inp = $("#lg-pass", scr); if (inp) inp.focus();
  $("#login-form", scr).onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("#lg-btn", scr); btn.disabled = true; $("#lg-err", scr).textContent = "";
    try {
      await auth.login($("#lg-user", scr).value.trim(), $("#lg-pass", scr).value);
      scr.remove();
      await startApp();
    } catch (err) {
      btn.disabled = false;
      $("#lg-err", scr).textContent = t("login_fail");
      const p = $("#lg-pass", scr); p.value = ""; p.focus();
    }
  };
}

// Called by db.js when any API call returns 401 (token expired).
function onAuthFail() { showLogin(); }

function doLogout() { auth.logout().then(() => location.reload()); }

// Change username / password.
function openAccount() {
  openForm({
    title: "🔒 " + t("login_account"),
    fields: [
      { name: "username", label: t("login_user"), default: auth.username() },
      { name: "password", label: t("login_new_pass"), type: "password" },
    ],
    onSave: async (out) => { await auth.change(out.username, out.password); },
  }, {});
}

async function boot() {
  if (auth.isLoggedIn()) {
    try { await startApp(); return; } catch (e) { /* invalid token → show login */ }
  }
  showLogin();
}

document.addEventListener("DOMContentLoaded", boot);
