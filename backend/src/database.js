const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'equipment.db');
let db = null;
let isReady = false;

const toParamsArray = (args) => {
  if (args.length === 0) return [];
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
    const obj = args[0];
    const keys = Object.keys(obj);
    return keys.map(k => {
      const v = obj[k];
      if (v === null || v === undefined) return null;
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
  }
  return Array.from(args).map(v => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
};

function colNamesToKeys(colNames) {
  return colNames.map(name => {
    if (name.includes('(') && name.includes(')')) {
      const m = name.match(/\(([^)]+)\)\s*$/);
      return m ? m[1] : name;
    }
    if (name.includes(' ')) return name.split(' ').pop();
    if (name.includes('.')) return name.split('.').pop();
    return name;
  });
}

let saveTimer = null;
const scheduleSave = () => {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    try {
      const data = db.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
    } catch (e) { console.error('DB save error:', e.message); }
    saveTimer = null;
  }, 300);
};

const prepare = (sql) => {
  if (!isReady) throw new Error('Database not ready yet');
  const stmt = {
    sql,
    run(...args) {
      const params = toParamsArray(args);
      db.run(sql, params);
      const info = {
        changes: db.getRowsModified(),
        lastInsertRowid: null
      };
      try {
        const r = db.exec('SELECT last_insert_rowid() AS id');
        if (r && r[0] && r[0].values && r[0].values[0]) info.lastInsertRowid = r[0].values[0][0];
      } catch (e) {}
      scheduleSave();
      return info;
    },
    get(...args) {
      const params = toParamsArray(args);
      const results = db.exec(sql, params);
      if (!results.length || !results[0].values.length) return undefined;
      const keys = colNamesToKeys(results[0].columns);
      const row = results[0].values[0];
      const obj = {};
      keys.forEach((k, i) => { obj[k] = row[i] ?? null; });
      return obj;
    },
    all(...args) {
      const params = toParamsArray(args);
      const results = db.exec(sql, params);
      if (!results.length) return [];
      const keys = colNamesToKeys(results[0].columns);
      return results[0].values.map(row => {
        const obj = {};
        keys.forEach((k, i) => { obj[k] = row[i] ?? null; });
        return obj;
      });
    }
  };
  return stmt;
};

const exec = (sqlStr) => {
  if (!isReady) throw new Error('Database not ready yet');
  db.exec(sqlStr);
  scheduleSave();
};

const pragma = () => {};

const transaction = (fn) => {
  if (!isReady) throw new Error('Database not ready yet');
  db.run('BEGIN TRANSACTION');
  try {
    const result = fn();
    db.run('COMMIT');
    scheduleSave();
    return result;
  } catch (e) {
    try { db.run('ROLLBACK'); } catch (r) {}
    throw e;
  }
};

const saveNow = () => {
  try {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    return true;
  } catch (e) { console.error('DB save error:', e.message); return false; }
};

const ready = (async () => {
  const SQL = await initSqlJs();
  let buf = null;
  try { if (fs.existsSync(dbPath)) buf = fs.readFileSync(dbPath); } catch (e) {}
  db = new SQL.Database(buf);
  isReady = true;

  const initSql = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS equipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      purchase_date TEXT,
      original_price REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'NORMAL',
      location TEXT NOT NULL,
      total_quantity INTEGER NOT NULL DEFAULT 1,
      available_quantity INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS borrow_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,
      borrower_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      borrow_date TEXT NOT NULL,
      expected_return_date TEXT,
      actual_return_date TEXT,
      purpose TEXT,
      status TEXT NOT NULL DEFAULT 'BORROWED',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS damage_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idempotent_key TEXT UNIQUE NOT NULL,
      code TEXT UNIQUE NOT NULL,
      equipment_id INTEGER NOT NULL,
      reporter_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      damage_level TEXT NOT NULL,
      description TEXT NOT NULL,
      discovery_date TEXT NOT NULL,
      location TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING_QUOTE',
      needs_general_approval INTEGER DEFAULT 0,
      quote_amount REAL,
      decision TEXT,
      approver_id INTEGER,
      approval_time TEXT,
      approval_remark TEXT,
      completed_time TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      filepath TEXT NOT NULL,
      mimetype TEXT,
      size INTEGER,
      uploaded_by INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS repair_quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      quoter_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      vendor TEXT,
      quote_detail TEXT,
      estimate_days INTEGER,
      remark TEXT,
      is_exceed_threshold INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS inventory_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,
      change_type TEXT NOT NULL,
      quantity_change INTEGER NOT NULL,
      available_before INTEGER NOT NULL,
      available_after INTEGER NOT NULL,
      related_type TEXT,
      related_id INTEGER,
      operator_id INTEGER NOT NULL,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      role TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      old_value TEXT,
      new_value TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS idempotent_records (
      idempotent_key TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL,
      resource_id INTEGER,
      response_json TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `;

  const statements = initSql.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    try { db.run(stmt); } catch (e) { console.warn('[SQL warn]', e.message, stmt.slice(0, 50)); }
  }

  setInterval(() => { try { saveNow(); } catch (e) {} }, 3000);

  return { prepare, exec, pragma, transaction, saveNow };
})();

module.exports = {
  prepare,
  exec,
  pragma,
  transaction,
  saveNow,
  ready,
  get isReady() { return isReady; }
};
