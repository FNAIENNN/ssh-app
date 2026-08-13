import { buildDemoData, DEMO_USER } from './demoData';

/**
 * Local demo backend — a drop-in subset of the @supabase/supabase-js API
 * backed by localStorage, so every screen of SSH works end-to-end with no
 * Supabase project.
 *
 * KEY DESIGN: the query builder is LAZY and THENABLE, exactly like the real
 * client. Every chainable method (select/insert/update/upsert/delete/eq/order/
 * limit/single/...) returns the SAME builder object, so:
 *
 *     supabase.from('sites').select().order('name')   // works
 *     supabase.from('profiles').select().eq('id', x)  // works
 *     await supabase.from('sites').select()           // executes on await
 *
 * Execution happens only when the builder is awaited (via its .then) or when
 * a terminal like .single()/.maybeSingle() is NOT the only way — any await
 * triggers it. This mirrors supabase-js semantics.
 */

const STORAGE_KEY = 'ssh.demoDb.v1';
const SESSION_KEY = 'ssh.demoSession';

// JS table keys (TABLES map) → localStorage collection names.
const TABLE_NAMES = {
  users: 'profiles',
  profiles: 'profiles',
  sites: 'sites',
  sections: 'sections',
  tanks: 'tanks',
  seed_entries: 'seed_entries',
  seed_exchanges: 'seed_exchanges',
  payments: 'payments',
  bills: 'bills',
  payment_accounts: 'payment_accounts',
  bank_accounts: 'bank_accounts',
  vehicle_bookings: 'vehicle_bookings',
  trail_netting_checklists: 'trail_netting_checklists',
  trail_netting_records: 'trail_netting_records',
  trail_netting_reports: 'trail_netting_reports',
  food_orders: 'food_orders',
  notifications: 'notifications',
  v_seed_entries: 'seed_entries',
  harvest_entries: 'harvest_entries',
  harvest_checklists: 'harvest_checklists',
  graders: 'graders',
  labour_suppliers: 'labour_suppliers',
  harvest_weighments: 'harvest_weighments',
};

// ── Persistence ──────────────────────────────────────────────────────────
function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall through to seed */
  }
  const seed = buildDemoData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

function saveDb(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function resetDemoData() {
  localStorage.removeItem(STORAGE_KEY);
  return loadDb();
}

export function getDemoDb() {
  return loadDb();
}

// ── Helpers ──────────────────────────────────────────────────────────────
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function daysCompleted(row) {
  if (!row.date) return 0;
  const d = new Date(row.date);
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

function resolveCollection(db, tableKey) {
  const name = TABLE_NAMES[tableKey] ?? tableKey;
  if (name === 'seed_entries' || name === 'v_seed_entries') return db.seed_entries;
  if (!db[name]) db[name] = [];
  return db[name];
}

function sortRows(rows, col, ascending) {
  return [...rows].sort((a, b) => {
    const av = a[col];
    const bv = b[col];
    if (av == null && bv == null) return 0;
    if (av == null) return ascending ? -1 : 1;
    if (bv == null) return ascending ? 1 : -1;
    if (typeof av === 'number' && typeof bv === 'number') return ascending ? av - bv : bv - av;
    return ascending ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
}

function makeError(code, message) {
  return { name: 'PostgrestError', code, message };
}

// ── Query builder (lazy + thenable) ──────────────────────────────────────
function Query(table) {
  this._table = table;
  this._filters = [];
  this._order = null;
  this._limitN = null;
  this._single = false;
  this._maybeSingle = false;
  this._count = null;
  this._head = false;
  this._action = null;     // 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  this._payload = null;
  this._returnRows = false; // set by .select() chained after a mutation
}

// All chainable methods return `this`.
const methods = {
  // Filters
  eq(col, value) { this._filters.push({ col, op: 'eq', value }); return this; },
  neq(col, value) { this._filters.push({ col, op: 'neq', value }); return this; },
  in(col, values) { this._filters.push({ col, op: 'in', value: values }); return this; },
  gt(col, value) { this._filters.push({ col, op: 'gt', value }); return this; },
  gte(col, value) { this._filters.push({ col, op: 'gte', value }); return this; },
  lt(col, value) { this._filters.push({ col, op: 'lt', value }); return this; },
  lte(col, value) { this._filters.push({ col, op: 'lte', value }); return this; },
  is(col, value) { this._filters.push({ col, op: 'is', value }); return this; },
  like(col, value) { this._filters.push({ col, op: 'like', value }); return this; },

  // Shaping
  order(col, opts = {}) { this._order = { col, ascending: opts.ascending !== false }; return this; },
  limit(n) { this._limitN = n; return this; },
  single() { this._single = true; return this; },
  maybeSingle() { this._maybeSingle = true; return this; },
  range(_from, _to) { return this; },

  // Read/Write entry points — set action and return this (lazy).
  // NOTE: `.select()` mirrors supabase-js returning() semantics — when chained
  // AFTER a mutation (insert/update/upsert/delete) it means "return the affected
  // rows", NOT a fresh read. So we only set _action='select' when no mutation
  // has been declared yet; otherwise we flag _returnRows and leave the mutation
  // action intact. Without this guard, `.insert(x).select().single()` would
  // drop the insert and run a bare SELECT (returning the wrong rows, or
  // PGRLE11601 on an empty table).
  select(_cols, opts = {}) {
    if (this._action && this._action !== 'select') {
      this._returnRows = true; // mutation already set → return its affected rows
    } else {
      this._action = 'select';
    }
    if (opts.count) this._count = opts.count;
    if (opts.head) this._head = true;
    return this;
  },
  insert(payload, _opts = {}) { this._action = 'insert'; this._payload = payload; return this; },
  update(payload, _opts = {}) { this._action = 'update'; this._payload = payload; return this; },
  upsert(payload, _opts = {}) { this._action = 'upsert'; this._payload = payload; return this; },
  delete(_opts = {}) { this._action = 'delete'; return this; },
};
Object.assign(Query.prototype, methods);

// Thenable: awaiting (or .then) triggers execution.
Query.prototype.then = function (onFulfilled, onRejected) {
  try {
    const result = execute(this);
    return Promise.resolve(result).then(onFulfilled, onRejected);
  } catch (err) {
    return Promise.reject(err).then(null, onRejected);
  }
};
Query.prototype.catch = function (onRejected) {
  return this.then(null, onRejected);
};
Query.prototype.finally = function (cb) {
  return this.then(cb, cb);
};

// ── Execution ────────────────────────────────────────────────────────────
function applyFilters(rows, filters) {
  return rows.filter((r) =>
    filters.every((f) => {
      const v = r[f.col];
      switch (f.op) {
        case 'eq': return v === f.value;
        case 'neq': return v !== f.value;
        case 'in': return Array.isArray(f.value) && f.value.includes(v);
        case 'gt': return Number(v) > Number(f.value);
        case 'gte': return Number(v) >= Number(f.value);
        case 'lt': return Number(v) < Number(f.value);
        case 'lte': return Number(v) <= Number(f.value);
        case 'is': return (f.value === null && v == null) || v === f.value;
        case 'like': return typeof v === 'string' && v.toLowerCase().includes(String(f.value).replace(/%/g, '').toLowerCase());
        default: return true;
      }
    })
  );
}

function execute(q) {
  const db = loadDb();
  const col = resolveCollection(db, q._table);

  switch (q._action) {
    case 'select':
      return runSelect(db, q, col);
    case 'insert':
      return runInsert(db, q, col);
    case 'update':
      return runUpdate(db, q, col);
    case 'upsert':
      return runUpsert(db, q, col);
    case 'delete':
      return runDelete(db, q, col);
    default:
      // No action set (e.g. only filters used without select) → default to select.
      q._action = 'select';
      return runSelect(db, q, col);
  }
}

function runSelect(db, q, col) {
  let rows = clone(col).map((r) => enrich(db, q._table, r));
  rows = applyFilters(rows, q._filters);
  if (q._order) rows = sortRows(rows, q._order.col, q._order.ascending);
  if (q._limitN != null) rows = rows.slice(0, q._limitN);

  if (q._single) {
    if (rows.length === 0) {
      return { data: null, error: makeError('PGRLE11601', 'JSON object requested, multiple (or no) rows returned') };
    }
    return { data: rows[0], error: null };
  }
  if (q._maybeSingle) {
    return { data: rows[0] ?? null, error: null };
  }
  const payload = { data: q._head ? null : rows, error: null };
  if (q._count) payload.count = rows.length;
  return payload;
}

/**
 * Shape the rows affected by a mutation exactly like a SELECT would, when the
 * caller chained `.select()` after the mutation (supabase-js returning()
 * semantics). Applies enrich() for joins, order/limit, and single/maybeSingle.
 *
 * When `.select()` was NOT chained, supabase-js returns the affected rows as an
 * array (the legacy "count" shape); `.single()`/`.maybeSingle()` collapse it.
 */
function shapeReturn(q, db, rows) {
  if (!q._returnRows) {
    // No .select() after the mutation → supabase-js returns an array of rows.
    if (q._single || q._maybeSingle) return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }
  let shaped = rows.map((r) => enrich(db, q._table, clone(r)));
  if (q._order) shaped = sortRows(shaped, q._order.col, q._order.ascending);
  if (q._limitN != null) shaped = shaped.slice(0, q._limitN);
  if (q._single) {
    if (shaped.length === 0) {
      return { data: null, error: makeError('PGRLE11601', 'JSON object requested, multiple (or no) rows returned') };
    }
    return { data: shaped[0], error: null };
  }
  if (q._maybeSingle) return { data: shaped[0] ?? null, error: null };
  return { data: shaped, error: null };
}

function runInsert(db, q, col) {
  const arr = Array.isArray(q._payload) ? q._payload : [q._payload];
  const created = arr.map((p) => ({
    id: p.id ?? uuid(),
    created_at: p.created_at ?? new Date().toISOString(),
    updated_at: p.updated_at ?? new Date().toISOString(),
    ...p,
  }));
  col.push(...created);
  saveDb(db);
  return shapeReturn(q, db, created);
}

function runUpdate(db, q, col) {
  const matches = applyFilters(clone(col), q._filters);
  const ids = new Set(matches.map((m) => m.id));
  const updated = [];
  col.forEach((row) => {
    if (ids.has(row.id)) {
      Object.assign(row, q._payload, { updated_at: new Date().toISOString() });
      updated.push(clone(row));
    }
  });
  saveDb(db);
  return shapeReturn(q, db, updated);
}

function runUpsert(db, q, col) {
  const incoming = Array.isArray(q._payload) ? q._payload : [q._payload];
  const result = [];
  incoming.forEach((p) => {
    const idx = col.findIndex((r) => r.id === p.id);
    if (idx >= 0) {
      Object.assign(col[idx], p, { updated_at: new Date().toISOString() });
      result.push(clone(col[idx]));
    } else {
      const newRow = { id: p.id ?? uuid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...p };
      col.push(newRow);
      result.push(clone(newRow));
    }
  });
  saveDb(db);
  return shapeReturn(q, db, result);
}

function runDelete(db, q, col) {
  const matches = applyFilters(clone(col), q._filters);
  const ids = new Set(matches.map((m) => m.id));
  const removed = col.filter((r) => ids.has(r.id));
  const next = col.filter((r) => !ids.has(r.id));
  col.length = 0;
  col.push(...next);
  saveDb(db);
  if (q._returnRows) return shapeReturn(q, db, removed);
  return { data: Array(removed.length).fill(null), error: null, count: removed.length };
}

/** Enrich rows with computed/joined columns the app expects. */
function enrich(db, tableKey, r) {
  if (!r) return r;
  // tank name join for tables referencing tanks
  if (r.tank_id && tableKey !== 'tanks') {
    const t = db.tanks.find((x) => x.id === r.tank_id);
    if (t) r.tanks = { name: t.name };
  }
  // v_seed_entries computed columns
  if (tableKey === 'v_seed_entries' || tableKey === 'seed_entries') {
    r.days_completed = daysCompleted(r);
    const t = db.tanks.find((x) => x.id === r.tank_id);
    if (t) {
      r.tank_name = t.name;
      r.section_id = t.section_id;
      r.site_id = r.site_id ?? t.site_id;
    }
  }
  return r;
}

// ── Auth ─────────────────────────────────────────────────────────────────
function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return { data: { session: null } };
    return { data: { session: JSON.parse(raw) } };
  } catch {
    return { data: { session: null } };
  }
}

function setSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

const authListeners = new Set();
function emitAuth(event, session) {
  authListeners.forEach((cb) => {
    try { cb(event, session); } catch { /* noop */ }
  });
}

// ── Public client ────────────────────────────────────────────────────────
export function createLocalClient() {
  loadDb(); // seed on first construction

  return {
    __demo: true,

    from(table) {
      return new Query(table);
    },

    auth: {
      getSession: () => Promise.resolve(getSession()),

      onAuthStateChange(cb) {
        authListeners.add(cb);
        return {
          data: {
            subscription: {
              unsubscribe: () => authListeners.delete(cb),
            },
          },
        };
      },

      signInWithPassword({ email }) {
        const session = {
          access_token: 'demo-access-token',
          refresh_token: 'demo-refresh-token',
          token_type: 'bearer',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { ...DEMO_USER, email: email || DEMO_USER.email },
        };
        setSession(session);
        emitAuth('SIGNED_IN', session);
        return Promise.resolve({ data: { session, user: session.user }, error: null });
      },

      signUp({ email }) {
        const session = {
          access_token: 'demo-access-token',
          refresh_token: 'demo-refresh-token',
          token_type: 'bearer',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { ...DEMO_USER, email },
        };
        setSession(session);
        emitAuth('SIGNED_IN', session);
        return Promise.resolve({ data: { session, user: session.user }, error: null });
      },

      signOut() {
        setSession(null);
        emitAuth('SIGNED_OUT', null);
        return Promise.resolve({ error: null });
      },

      resetPasswordForEmail() {
        return Promise.resolve({ data: {}, error: null });
      },
    },

    // Realtime: no-op in demo (data is local). Subscriptions succeed silently.
    channel(_name) {
      const chain = {
        on() { return chain; },
        subscribe(cb) { if (cb) setTimeout(() => cb('SUBSCRIBED'), 0); return chain; },
        unsubscribe() {},
      };
      return chain;
    },
    removeChannel() {},

    storage: {
      from() {
        return {
          upload: () => Promise.resolve({ data: { path: 'demo/file.png' }, error: null }),
          list: () => Promise.resolve({ data: [], error: null }),
          getPublicUrl: () => ({ data: { publicUrl: '#' } }),
        };
      },
    },
  };
}
