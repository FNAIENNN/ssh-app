/**
 * Demo dataset for SSH.
 *
 * Used by the local demo backend (localClient.js) to make the entire app
 * explorable without a populated Supabase project. Dates are computed
 * relative to "now" so the trail-netting cadence (Day 45 etc.) is visible.
 *
 * Tank states intentionally varied to showcase every cadence status:
 *   A1 — Day ~50, stocked, no netting yet  → "due" (button enabled)
 *   A2 — Day ~47, stocked, no netting yet  → "due"
 *   A3 — Day ~10, recently stocked         → "waiting" (locked)
 *   B1 — Day ~30, stocked                   → "approaching"
 *   B2 — empty (no seed)
 *   C1 — Day ~52, one netting done          → "due" (next expected today)
 */

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

/** Date string for `daysAgo` days before today (YYYY-MM-DD). */
function d(daysAgo) {
  const dt = new Date();
  dt.setDate(dt.getDate() - daysAgo);
  return dt.toISOString().slice(0, 10);
}

/** Build a fresh demo dataset (called once when seeding localStorage). */
export function buildDemoData() {
  const sites = [
    { id: 's-akividu',    name: 'Akividu',    source: 'Aqua', region: 'Akividu, Andhra Pradesh' },
    { id: 's-bhimavaram', name: 'Bhimavaram', source: 'Aqua', region: 'Bhimavaram, Andhra Pradesh' },
    { id: 's-palakollu',  name: 'Palakollu',  source: 'Aqua', region: 'Palakollu, Andhra Pradesh' },
  ];

  const sections = [
    { id: 'sec-a', site_id: 's-akividu', name: 'A' },
    { id: 'sec-b', site_id: 's-akividu', name: 'B' },
    { id: 'sec-c', site_id: 's-akividu', name: 'C' },
    { id: 'sec-bv-a', site_id: 's-bhimavaram', name: 'A' },
  ];

  const tanks = [
    // Akividu — Section A
    tank('tk-a1', 's-akividu', 'sec-a', 'A1', 1.25, 80000, 'Vannamei PL',     'Sri Venkateswara Hatcheries', d(50)),
    tank('tk-a2', 's-akividu', 'sec-a', 'A2', 1.00, 60000, 'Vannamei PL',     'Aqua Blue Hatcheries',         d(47)),
    tank('tk-a3', 's-akividu', 'sec-a', 'A3', 0.75, 40000, 'Tiger Prawn PL',  'Coastal Seed Co.',             d(10)),
    // Akividu — Section B
    tank('tk-b1', 's-akividu', 'sec-b', 'B1', 1.50, 55000, 'Vannamei PL',     'Sri Venkateswara Hatcheries',  d(30)),
    tank('tk-b2', 's-akividu', 'sec-b', 'B2', 1.10, 0,     null,              null,                           null),
    // Akividu — Section C
    tank('tk-c1', 's-akividu', 'sec-c', 'C1', 2.00, 70000, 'Vannamei PL',     'Bhimavaram Hatchery',          d(52)),
    // Bhimavaram — Section A
    tank('tk-bv-a1', 's-bhimavaram', 'sec-bv-a', 'A1', 1.20, 45000, 'Vannamei PL', 'Aqua Blue Hatcheries', d(20)),
    tank('tk-bv-a2', 's-bhimavaram', 'sec-bv-a', 'A2', 0.90, 0,     null,        null,                     null),
  ];

  const seed_entries = [
    entry('se-1', 'tk-a1', 's-akividu', d(50), 'Vannamei PL',    80000, 'Sri Venkateswara Hatcheries', 'stocked', 90000),
    entry('se-2', 'tk-a2', 's-akividu', d(47), 'Vannamei PL',    60000, 'Aqua Blue Hatcheries',        'stocked', 68000),
    entry('se-3', 'tk-a3', 's-akividu', d(10), 'Tiger Prawn PL', 40000, 'Coastal Seed Co.',            'stocked', 45000),
    entry('se-4', 'tk-b1', 's-akividu', d(30), 'Vannamei PL',    55000, 'Sri Venkateswara Hatcheries', 'stocked', 62000),
    entry('se-5', 'tk-c1', 's-akividu', d(52), 'Vannamei PL',    70000, 'Bhimavaram Hatchery',         'stocked', 78000),
    entry('se-6', 'tk-bv-a1', 's-bhimavaram', d(20), 'Vannamei PL', 45000, 'Aqua Blue Hatcheries',     'stocked', 52000),
  ];

  // C1 had its first trail netting at Day 45 (= d(7)); next expected d(0) ≈ today.
  // A1 was netted recently too (d(3)) so the Section-A Overall Count card has data.
  const trail_netting_records = [
    {
      id: 'tnr-c1-1', tank_id: 'tk-c1', site_id: 's-akividu', date: d(7),
      samples: [{ no_of_kgs: 2, count: 340 }, { no_of_kgs: 1, count: 300 }],
      final_count: 640, next_expected_date: d(0), count_diff: null,
      created_by: DEMO_USER_ID, created_at: new Date(d(7)).toISOString(),
    },
    {
      id: 'tnr-a1-1', tank_id: 'tk-a1', site_id: 's-akividu', date: d(3),
      samples: [{ no_of_kgs: 2, count: 360 }, { no_of_kgs: 1, count: 190 }],
      final_count: 550, next_expected_date: d(-4), count_diff: null,
      created_by: DEMO_USER_ID, created_at: new Date(d(3)).toISOString(),
    },
  ];

  const trail_netting_reports = [
    {
      id: 'tnr-c1-r', tank_id: 'tk-c1', site_id: 's-akividu',
      hatchery: 'Bhimavaram Hatchery (Unit 2)',
      seed_stocked: 70000, survived_seed: 65000,
      doc: 45,
      latest_date: d(7), previous_date: null,
      latest_count: 640, previous_count: null,
      count_diff: null,
      growth_diff: 2.4, weekly_growth: 2.4,
      feed_consp_between: 120, growth_kgs_between: 18, fcr_between: 1.12,
      feed_consp_total: 320,
      created_at: new Date(d(7)).toISOString(), updated_at: new Date(d(7)).toISOString(),
    },
    {
      id: 'tnr-a1-r', tank_id: 'tk-a1', site_id: 's-akividu',
      hatchery: 'Sri Venkateswara Hatcheries',
      seed_stocked: 80000, survived_seed: 78000,
      doc: 50,
      latest_date: d(3), previous_date: null,
      latest_count: 550, previous_count: null,
      count_diff: null,
      growth_diff: 2.1, weekly_growth: 2.1,
      feed_consp_between: 90, growth_kgs_between: 14, fcr_between: 1.08,
      feed_consp_total: 410,
      created_at: new Date(d(3)).toISOString(), updated_at: new Date(d(3)).toISOString(),
    },
  ];

  const payments = [
    pay('pay-1', 's-akividu', 'seed',          'cash',     null,     22000, 'completed', 'tk-a1', null, 'Seed stock — A1 (Sri Venkateswara)', 'bill-1'),
    pay('pay-2', 's-akividu', 'seed',          'advance',  'upi',    18000, 'requested', 'tk-a2', null, 'Seed stock — A2 (advance)',          null),
    pay('pay-3', 's-akividu', 'vehicle',       'advance',  'bank',   2000,  'completed', null,   null, 'Driver advance — delivery to A1/A2', 'bill-1'),
    pay('pay-4', 's-akividu', 'outside_worker','cash',     null,     4000,  'completed', null,   null, 'Net mending crew — 2 days',          'bill-1'),
  ];

  // One seed bill for Akividu so History shows all 3 category rows on first run.
  const bills = [
    {
      id: 'bill-1', site_id: 's-akividu', bill_number: 'akiv0001',
      type: 'seed',
      seed_total: 22000, vehicle_total: 2000, workers_total: 4000,
      per_piece_price: 1.1, overall_quantity: 20000, pl_size: 90000,
      seed_type: 'Vannamei PL', hatchery: 'Sri Venkateswara Hatcheries',
      status: 'open',
      created_by: DEMO_USER_ID,
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const vehicle_bookings = [
    {
      id: 'vb-1', site_id: 's-akividu', payment_id: 'pay-3',
      tank_ids: ['tk-a1', 'tk-a2'], spread: true, per_tank_amount: 1000,
      driver_name: 'Ramesh', driver_phone: '+91 90000 12345', vehicle_no: 'AP 39 AB 1234',
      created_at: new Date().toISOString(),
    },
  ];

  const notifications = [
    note('n-1', 's-akividu', 'trail_netting_due',     'Tank A1 — Trail netting due',     'Day 45 reached. First netting window open until Day 60.'),
    note('n-2', 's-akividu', 'trail_netting_overdue', 'Tank C1 — Netting due today',     'Next expected netting date is today.'),
    note('n-3', 's-akividu', 'payment_proof_pending', 'Payment proof pending',           'Advance request for A2 seed is awaiting finance proof.'),
  ];

  const profiles = [
    {
      id: DEMO_USER_ID, email: 'demo@oryxen.io', full_name: 'Demo Field Officer',
      phone: '+91 90000 00000', role: 'manager',
      site_ids: ['s-akividu', 's-bhimavaram', 's-palakollu'],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
  ];

  const trail_netting_checklists = [];
  const seed_exchanges = [];
  const food_orders = [];
  const payment_accounts = [
    { id: 'pa-1', user_id: DEMO_USER_ID, upi_id: 'hatchery@upi', bank_name: 'HDFC Bank', holder_name: 'Demo Officer', is_primary: true, verified: true },
  ];
  const bank_accounts = [
    { id: 'ba-1', user_id: DEMO_USER_ID, ifsc: 'HDFC0001234', account_number: '50100****1234', bank_name: 'HDFC Bank', holder_name: 'Demo Officer', is_primary: true },
  ];

  const graders = [
    {
      id: 'gr-1',
      site_id: 's-akividu',
      name: 'Sri Venkateswara Logistics',
      phone: '+91 98480 12345',
      vehicle_no: 'AP 37 AB 5678',
      upi_id: 'venkat@upi',
      bank_account: 'HDFC - 9988776655',
      default_driver_bata: 500,
      default_packing_bata: 1200,
      created_at: new Date().toISOString(),
    },
    {
      id: 'gr-2',
      site_id: 's-akividu',
      name: 'Bhimavaram Transport & Grader',
      phone: '+91 94401 98765',
      vehicle_no: 'AP 39 CD 4321',
      upi_id: 'bhimatrans@upi',
      bank_account: 'SBI - 1122334455',
      default_driver_bata: 600,
      default_packing_bata: 1500,
      created_at: new Date().toISOString(),
    },
  ];

  const labour_suppliers = [
    {
      id: 'ls-1',
      site_id: 's-akividu',
      name: 'Raju Labour Crew',
      phone: '+91 91234 56789',
      address: 'Akividu Main Market, AP',
      created_at: new Date().toISOString(),
    },
    {
      id: 'ls-2',
      site_id: 's-akividu',
      name: 'Durga Prasad Harvest Workers',
      phone: '+91 99887 76655',
      address: 'Bhimavaram Center, AP',
      created_at: new Date().toISOString(),
    },
  ];

  const harvest_entries = [
    {
      id: 'he-1',
      site_id: 's-akividu',
      tank_id: 'tk-a1',
      harvest_type: 'middle',
      date: d(2),
      doc: 48,
      total_kgs: 1250,
      total_loose: 15,
      total_save: 1235,
      final_count: 60,
      price_per_kg: 420,
      total_amount: 525000,
      buyer_name: 'Choice Trading Co.',
      factory_name: 'Apex Frozen Foods',
      grader_id: 'gr-1',
      grader_details: {
        name: 'Sri Venkateswara Logistics',
        phone: '+91 98480 12345',
        vehicle_no: 'AP 37 AB 5678',
        driver_bata: 500,
        packing_bata: 1200,
        extra_payment: 300,
        remarks: 'Prompt delivery to Apex factory',
      },
      labour_supplier_id: 'ls-1',
      labour_details: {
        supplier_name: 'Raju Labour Crew',
        main_workers: 10,
        main_rate: 600,
        guntu_workers: 4,
        guntu_rate: 700,
        chethi_workers: 2,
        chethi_rate: 500,
        grand_total: 9800,
      },
      bill_id: 'bill-hrv-1',
      bill_number: 'HRV202607260001',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(2)).toISOString(),
    },
    {
      id: 'he-2',
      site_id: 's-akividu',
      tank_id: 'tk-c1',
      harvest_type: 'full',
      date: d(1),
      doc: 51,
      total_kgs: 2800,
      total_loose: 30,
      total_save: 2770,
      final_count: 45,
      price_per_kg: 510,
      total_amount: 1428000,
      buyer_name: 'Nekkanti Sea Foods',
      factory_name: 'Devi Sea Foods Ltd',
      grader_id: 'gr-2',
      grader_details: {
        name: 'Bhimavaram Transport & Grader',
        phone: '+91 94401 98765',
        vehicle_no: 'AP 39 CD 4321',
        driver_bata: 600,
        packing_bata: 1500,
        extra_payment: 500,
        remarks: 'Night shift harvest completed smoothly',
      },
      labour_supplier_id: 'ls-2',
      labour_details: {
        supplier_name: 'Durga Prasad Harvest Workers',
        main_workers: 15,
        main_rate: 650,
        guntu_workers: 6,
        guntu_rate: 750,
        chethi_workers: 4,
        chethi_rate: 550,
        grand_total: 16450,
      },
      bill_id: 'bill-hrv-2',
      bill_number: 'HRV202607270002',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(1)).toISOString(),
    },
  ];

  // Add harvest bills to initial demo bills
  bills.push(
    {
      id: 'bill-hrv-1',
      site_id: 's-akividu',
      bill_number: 'HRV202607260001',
      type: 'harvest',
      harvest_type: 'middle',
      request_type: 'all',
      tank_id: 'tk-a1',
      total_amount: 525000,
      paid_amount: 525000,
      balance_amount: 0,
      status: 'completed',
      buyer_name: 'Choice Trading Co.',
      factory_name: 'Apex Frozen Foods',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(2)).toISOString(),
      updated_at: new Date(d(2)).toISOString(),
    },
    {
      id: 'bill-hrv-2',
      site_id: 's-akividu',
      bill_number: 'HRV202607270002',
      type: 'harvest',
      harvest_type: 'full',
      request_type: 'all',
      tank_id: 'tk-c1',
      total_amount: 1428000,
      paid_amount: 1000000,
      balance_amount: 428000,
      status: 'pending',
      buyer_name: 'Nekkanti Sea Foods',
      factory_name: 'Devi Sea Foods Ltd',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(1)).toISOString(),
      updated_at: new Date(d(1)).toISOString(),
    },
    {
      id: 'bill-hrv-3',
      site_id: 's-akividu',
      bill_number: 'HRV202607280003',
      type: 'harvest',
      harvest_type: 'middle',
      request_type: 'all',
      tank_id: 'tk-a3',
      total_amount: 250000,
      paid_amount: 0,
      balance_amount: 250000,
      status: 'cancelled',
      buyer_name: 'Apex Frozen Foods',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(6)).toISOString(),
      updated_at: new Date(d(6)).toISOString(),
    },
    // Valamanushulu Demo Bills
    {
      id: 'bill-val-1',
      site_id: 's-akividu',
      bill_number: 'VAL2026081001',
      type: 'harvest',
      request_type: 'valamanushulu',
      category: 'valamanushulu',
      tank_id: 'tk-a1',
      supplier_name: 'Raju Labour Crew',
      buyer_name: 'Raju Labour Crew',
      total_amount: 9800,
      paid_amount: 3000,
      balance_amount: 6800,
      status: 'pending',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(3)).toISOString(),
      updated_at: new Date(d(3)).toISOString(),
    },
    {
      id: 'bill-val-2',
      site_id: 's-akividu',
      bill_number: 'VAL2026081002',
      type: 'harvest',
      request_type: 'valamanushulu',
      category: 'valamanushulu',
      tank_id: 'tk-c1',
      supplier_name: 'Durga Prasad Harvest Workers',
      buyer_name: 'Durga Prasad Harvest Workers',
      total_amount: 16450,
      paid_amount: 16450,
      balance_amount: 0,
      status: 'completed',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(5)).toISOString(),
      updated_at: new Date(d(5)).toISOString(),
    },
    {
      id: 'bill-val-3',
      site_id: 's-akividu',
      bill_number: 'VAL2026081003',
      type: 'harvest',
      request_type: 'valamanushulu',
      category: 'valamanushulu',
      tank_id: 'tk-a2',
      supplier_name: 'Raju Labour Crew',
      buyer_name: 'Raju Labour Crew',
      total_amount: 4500,
      paid_amount: 0,
      balance_amount: 4500,
      status: 'cancelled',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(8)).toISOString(),
      updated_at: new Date(d(8)).toISOString(),
    },
    {
      id: 'bill-val-4',
      site_id: 's-akividu',
      bill_number: 'VAL2026081004',
      type: 'harvest',
      request_type: 'valamanushulu',
      category: 'valamanushulu',
      tank_id: 'tk-a3',
      supplier_name: 'Sri Ram Labour Team',
      buyer_name: 'Sri Ram Labour Team',
      total_amount: 11200,
      paid_amount: 5000,
      balance_amount: 6200,
      status: 'pending',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(2)).toISOString(),
      updated_at: new Date(d(2)).toISOString(),
    },
    {
      id: 'bill-val-5',
      site_id: 's-akividu',
      bill_number: 'VAL2026081005',
      type: 'harvest',
      request_type: 'valamanushulu',
      category: 'valamanushulu',
      tank_id: 'tk-b1',
      supplier_name: 'Venkatesh Labour Gang',
      buyer_name: 'Venkatesh Labour Gang',
      total_amount: 14800,
      paid_amount: 14800,
      balance_amount: 0,
      status: 'completed',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(4)).toISOString(),
      updated_at: new Date(d(4)).toISOString(),
    },
    {
      id: 'bill-val-6',
      site_id: 's-akividu',
      bill_number: 'VAL2026081006',
      type: 'harvest',
      request_type: 'valamanushulu',
      category: 'valamanushulu',
      tank_id: 'tk-c1',
      supplier_name: 'Lakshmi Labour Services',
      buyer_name: 'Lakshmi Labour Services',
      total_amount: 8900,
      paid_amount: 2000,
      balance_amount: 6900,
      status: 'pending',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(1)).toISOString(),
      updated_at: new Date(d(1)).toISOString(),
    },
    // Grader Demo Bills
    {
      id: 'bill-grd-1',
      site_id: 's-akividu',
      bill_number: 'GRD2026081001',
      type: 'harvest',
      request_type: 'grader',
      category: 'grader',
      tank_id: 'tk-a1',
      grader_name: 'Sri Venkateswara Logistics',
      buyer_name: 'Sri Venkateswara Logistics',
      total_amount: 12500,
      paid_amount: 5000,
      balance_amount: 7500,
      status: 'pending',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(2)).toISOString(),
      updated_at: new Date(d(2)).toISOString(),
    },
    {
      id: 'bill-grd-2',
      site_id: 's-akividu',
      bill_number: 'GRD2026081002',
      type: 'harvest',
      request_type: 'grader',
      category: 'grader',
      tank_id: 'tk-c1',
      grader_name: 'Bhimavaram Transport & Grader',
      buyer_name: 'Bhimavaram Transport & Grader',
      total_amount: 18200,
      paid_amount: 18200,
      balance_amount: 0,
      status: 'completed',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(4)).toISOString(),
      updated_at: new Date(d(4)).toISOString(),
    },
    {
      id: 'bill-grd-3',
      site_id: 's-akividu',
      bill_number: 'GRD2026081003',
      type: 'harvest',
      request_type: 'grader',
      category: 'grader',
      tank_id: 'tk-b1',
      grader_name: 'Sri Venkateswara Logistics',
      buyer_name: 'Sri Venkateswara Logistics',
      total_amount: 6000,
      paid_amount: 0,
      balance_amount: 6000,
      status: 'cancelled',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(7)).toISOString(),
      updated_at: new Date(d(7)).toISOString(),
    },
    {
      id: 'bill-grd-4',
      site_id: 's-akividu',
      bill_number: 'GRD2026081004',
      type: 'harvest',
      request_type: 'grader',
      category: 'grader',
      tank_id: 'tk-a2',
      grader_name: 'Coastal Aqua Graders',
      buyer_name: 'Coastal Aqua Graders',
      total_amount: 15400,
      paid_amount: 8000,
      balance_amount: 7400,
      status: 'pending',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(3)).toISOString(),
      updated_at: new Date(d(3)).toISOString(),
    },
    {
      id: 'bill-grd-5',
      site_id: 's-akividu',
      bill_number: 'GRD2026081005',
      type: 'harvest',
      request_type: 'grader',
      category: 'grader',
      tank_id: 'tk-a3',
      grader_name: 'Godavari Transport & Grader',
      buyer_name: 'Godavari Transport & Grader',
      total_amount: 21000,
      paid_amount: 21000,
      balance_amount: 0,
      status: 'completed',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(5)).toISOString(),
      updated_at: new Date(d(5)).toISOString(),
    },
    {
      id: 'bill-grd-6',
      site_id: 's-akividu',
      bill_number: 'GRD2026081006',
      type: 'harvest',
      request_type: 'grader',
      category: 'grader',
      tank_id: 'tk-c1',
      grader_name: 'Royal Aqua Logistics',
      buyer_name: 'Royal Aqua Logistics',
      total_amount: 13600,
      paid_amount: 5000,
      balance_amount: 8600,
      status: 'pending',
      created_by: DEMO_USER_ID,
      created_at: new Date(d(1)).toISOString(),
      updated_at: new Date(d(1)).toISOString(),
    }
  );

  return {
    sites, sections, tanks, seed_entries, seed_exchanges, payments, bills,
    payment_accounts, bank_accounts, vehicle_bookings,
    trail_netting_checklists, trail_netting_records, trail_netting_reports,
    food_orders, notifications, profiles, graders, labour_suppliers, harvest_entries,
  };
}

export const DEMO_USER = { id: DEMO_USER_ID, email: 'demo@oryxen.io' };

// ── row constructors ────────────────────────────────────────────────────
function tank(id, site_id, section_id, name, area_acres, quantity, seed_type, hatchery, start_date) {
  return { id, site_id, section_id, name, area_acres, quantity, seed_type, hatchery, start_date, ready_harvest: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}
function entry(id, tank_id, site_id, date, seed_type, quantity, hatchery, source, pl_size) {
  return { id, tank_id, site_id, date, seed_type, quantity, pl_size, hatchery, source, payment_id: null, created_by: DEMO_USER_ID, created_at: new Date(date).toISOString() };
}
function pay(id, site_id, type, method, advance_mode, amount, status, related_tank_id, related_section_id, note, bill_id) {
  return {
    id, site_id, type, method, advance_mode, amount, status,
    proof_url: status === 'completed' ? `proof_${id}.png` : null,
    registered_in_machine_ids_book: false,
    related_tank_id, related_section_id,
    payment_account_id: null, bank_account_id: null, note, bill_id: bill_id ?? null,
    created_by: DEMO_USER_ID,
    created_at: new Date(Date.now() - Math.random() * 1e9).toISOString(),
    updated_at: new Date().toISOString(),
  };
}
function note(id, site_id, kind, title, body) {
  return { id, user_id: DEMO_USER_ID, site_id, kind, title, body, read: false, created_at: new Date().toISOString() };
}