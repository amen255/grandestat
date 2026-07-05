# سیستەمی خانووبەرە | نظام إدارة العقارات — Real Estate System

A bilingual (Kurdish / Arabic, RTL) real-estate office management system.
Backend: **Python + SQLite** (a real database, no installation needed — Python already ships with SQLite).
Frontend: plain HTML/CSS/JS talking to a small REST API.

## ▶️ How to run (Windows)
1. Make sure **Python 3** is installed.
2. Double-click **`start.bat`** — it starts the server and opens the browser at `http://localhost:5599`.
3. To stop: close the black window (or press `Ctrl+C`).

Manual alternative:
```
python server.py
```
then open http://localhost:5599

## 💾 Where is my data?
Everything is stored in a real SQLite database file:
```
real-estate-system/data/real-estate.db
```
Use the **💾 backup button** (top bar) to export a JSON copy, import it back, or reset.
Backing up = copy the `data/real-estate.db` file, or use the Export button.

## 🧩 Features
- **Dashboard** — KPIs, 6-month income/expense chart, recent contracts/requests, rent-due alerts
- **Properties** — for sale / for rent
- **Requests** — buying / renting
- **Contracts** — sale / rent, with **printable legal document** (parties, price, property, legal clauses, signatures)
- **Receipts** — incoming (قبض) / outgoing (صرف), printable
- **Tenants** — rent due-day + automatic reminder countdown
- **Expenses**, **Reports** (monthly / annual, printable), **Accounting** (salaries + commissions)
- **Kurdish + Arabic** toggle, IQD / USD

## 📁 Structure
```
real-estate-system/
├── start.bat          ← double-click to run
├── server.py          ← Python backend + SQLite + REST API
├── index.html
├── css/styles.css
├── js/
│   ├── i18n.js        ← Kurdish + Arabic translations
│   ├── db.js          ← API client + contract legal clauses
│   └── app.js         ← UI, views, printing
└── data/real-estate.db  ← the database (created on first run)
```

## ✏️ To customize
- **Legal clauses:** edit `CONTRACT_CLAUSES` in `js/db.js` (sale & rent, ar & ku).
- **Office name / phone on printouts:** ⚙️ Settings button in the app.
- **Translations / labels:** `js/i18n.js`.
