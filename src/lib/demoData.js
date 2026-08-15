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
 *
 * NOTE: This demo data is restored to its original state. Any "reset for fresh
 * testing" changes have been undone. Transactional demo data persists normally.
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
    { id: 's-akividu', name: 'Akividu', source: 'Aqua', region: 'Akividu, Andhra Pradesh' },
    { id: 's-bhimavaram', name: 'Bhimavaram', source: 'Aqua', region: 'Bhimavaram, Andhra Pradesh' },
    { id: 's-palakollu', name: 'Palakollu', source: 'Aqua', region: 'Palakollu, Andhra Pradesh' },
  ];

  const sections = [
    { id: 'sec-a', site_id: 's-akividu', name: 'A' },
    { id: 'sec-b', site_id: 's-akividu', name: 'B' },
    { id: 'sec-c', site_id: 's-akividu', name: 'C' },
    { id: 'sec-bv-a', site_id: 's-bhimavaram', name: 'A' },
  ];

  const tanks = [
    // Akividu — Section A (A1 & A2 stocked ~50/47 days ago → "due" for netting)
    tank('tk-a1', 's-akividu', 'sec-a', 'A1', 1.25, 450000, 'Vannamei', 'Sandhya Hatchery', d(50)),
    tank('tk-a2', 's-akividu', 'sec-a', 'A2', 1.00, 380000, 'Vannamei', 'Sandhya Hatchery', d(47)),
    // A3 stocked ~10 days ago → "waiting" (locked, not yet at Day 45)
    tank('tk-a3', 's-akividu', 'sec-a', 'A3', 0.75, 280000, 'Vannamei', 'Devi Hatchery', d(10)),
    tank('tk-a4', 's-akividu', 'sec-a', 'A4', 1.20, 0, null, null, null),
    tank('tk-a5', 's-akividu', 'sec-a', 'A5', 0.95, 0, null, null, null),
    // Akividu — Section B (B1 stocked ~30 days → "approaching"; B2/B3 empty)
    tank('tk-b1', 's-akividu', 'sec-b', 'B1', 1.50, 520000, 'Moana', 'Sandhya Hatchery', d(30)),
    tank('tk-b2', 's-akividu', 'sec-b', 'B2', 1.10, 0, null, null, null),
    tank('tk-b3', 's-akividu', 'sec-b', 'B3', 1.30, 0, null, null, null),
    // Akividu — Section C (C1 stocked ~52 days → "due"; C2/C3 empty)
    tank('tk-c1', 's-akividu', 'sec-c', 'C1', 2.00, 750000, 'Vannamei', 'Devi Hatchery', d(52)),
    tank('tk-c2', 's-akividu', 'sec-c', 'C2', 1.50, 0, null, null, null),
    tank('tk-c3', 's-akividu', 'sec-c', 'C3', 1.80, 0, null, null, null),
    // Bhimavaram — Section A
    tank('tk-bv-a1', 's-bhimavaram', 'sec-bv-a', 'A1', 1.20, 0, null, null, null),
    tank('tk-bv-a2', 's-bhimavaram', 'sec-bv-a', 'A2', 0.90, 0, null, null, null),
    tank('tk-bv-a3', 's-bhimavaram', 'sec-bv-a', 'A3', 1.05, 0, null, null, null),
  ];

  // ── Hatcheries ──────────────────────────────────────────────────────────────
  const hatcheries = [
    {
      id: 'h-1',
      site_id: 's-akividu',
      name: 'Sandhya Hatchery',
      location: 'Narsapur, Andhra Pradesh',
      contact_name: 'Sandhya Rao',
      contact_phone: '+91 94400 11223',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'h-2',
      site_id: 's-akividu',
      name: 'Devi Hatchery',
      location: 'Bhimavaram, Andhra Pradesh',
      contact_name: 'Devi Prasad',
      contact_phone: '+91 98765 43210',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const hatchery_bank_accounts = [
    {
      id: 'hba-1', hatchery_id: 'h-1',
      holder_name: 'Sandhya Rao', bank_name: 'Andhra Bank',
      account_number: '9876543210', ifsc: 'ANDB0001234',
      is_primary: true,
      created_at: new Date().toISOString(),
    },
    {
      id: 'hba-3', hatchery_id: 'h-1',
      holder_name: 'Sandhya Rao', bank_name: 'HDFC',
      account_number: '111122223333', ifsc: 'HDFC0004444',
      is_primary: false,
      created_at: new Date().toISOString(),
    },
    {
      id: 'hba-2', hatchery_id: 'h-2',
      holder_name: 'Devi Prasad', bank_name: 'SBI',
      account_number: '1234509876', ifsc: 'SBIN0005678',
      is_primary: true,
      created_at: new Date().toISOString(),
    },
  ];

  // ── Seed entries (for stocked tanks) ────────────────────────────────────────
  const seed_entries = [
    entry('se-1', 'tk-a1', 's-akividu', d(50), 'Vannamei', 450000, 'Sandhya Hatchery', 'stocked', 'PL-12'),
    entry('se-2', 'tk-a2', 's-akividu', d(47), 'Vannamei', 380000, 'Sandhya Hatchery', 'stocked', 'PL-12'),
    entry('se-3', 'tk-a3', 's-akividu', d(10), 'Vannamei', 280000, 'Devi Hatchery', 'stocked', 'PL-10'),
    entry('se-4', 'tk-b1', 's-akividu', d(30), 'Moana', 520000, 'Sandhya Hatchery', 'stocked', 'PL-15'),
    entry('se-5', 'tk-c1', 's-akividu', d(52), 'Vannamei', 750000, 'Devi Hatchery', 'stocked', 'PL-12'),
    // Completed bill seed entry (se-hist)
    entry('se-hist', 'tk-a4', 's-akividu', d(65), 'Vannamei', 500000, 'Sandhya Hatchery', 'stocked', 'PL-12'),
  ];

  // ── Payments for completed bill & modules ────────────────────────────────────
  const payments = [
    // Seed Stock - Hatchery Details
    { ...pay('pay-cash-1', 's-akividu', 'seed', 'cash', 'cash', 20000, 'completed', 'tk-a4', 'sec-a', 'Hatchery Advance Cash Payment', 'bill-hist-1'), holder_name: 'Sandhya Hatchery' },
    { ...pay('pay-adv-1', 's-akividu', 'seed', 'advance', 'bank', 30000, 'pending', 'tk-a4', 'sec-a', 'Hatchery Advance Bank Payment', 'bill-hist-1'), holder_name: 'Devi Hatchery' },

    // Seed Stock - Vehicle Payments
    { ...pay('pay-veh-1', 's-akividu', 'vehicle', 'cash', 'cash', 10000, 'completed', 'tk-a4', 'sec-a', 'Vehicle Advance Cash Payment', 'bill-hist-1'), driver_name: 'Raju Kumar', vehicle_no: 'AP 37 AB 1234' },
    { ...pay('pay-veh-2', 's-akividu', 'vehicle', 'advance', 'bank_transfer', 15000, 'cancelled', 'tk-a4', 'sec-a', 'Vehicle Advance Bank Payment', 'bill-hist-1'), driver_name: 'Suresh Varma', vehicle_no: 'AP 37 CD 5678' },

    // Seed Stock - Outside Worker Payments
    { ...pay('pay-ow-1', 's-akividu', 'outside_worker', 'upi', 'upi', 5000, 'completed', 'tk-a4', 'sec-a', 'Outside Worker Payment', 'bill-hist-1'), supervisor_name: 'Suresh Babu', holder_name: 'Sri Krishna Labour Supplier', upi_id: 'sklabour@upi' },
    { ...pay('pay-ow-2', 's-akividu', 'outside_worker', 'bank', 'bank', 8000, 'pending', 'tk-a4', 'sec-a', 'Outside Worker Payment', 'bill-hist-1'), supervisor_name: 'Ramesh Netting', holder_name: 'Venkateswara Labour' },

    // Seed Exchange Payments
    { ...pay('pay-ex-1', 's-akividu', 'seed_exchange', 'upi', 'upi', 12000, 'completed', null, null, 'Seed Exchange Worker Payment', null), holder_name: 'Ramu Mestri', upi_id: 'ramu@upi' },
    { ...pay('pay-ex-2', 's-akividu', 'seed_exchange', 'bank', 'bank', 15000, 'pending', null, null, 'Seed Exchange Worker Payment', null), holder_name: 'Koteswara Rao' },
    { ...pay('pay-ex-3', 's-akividu', 'seed_exchange', 'cash', 'cash', 7000, 'cancelled', null, null, 'Seed Exchange Payment', null), holder_name: 'Exchange Team B' },

    // Food Payments
    { ...pay('pay-fd-1', 's-akividu', 'food', 'cash', 'cash', 4500, 'completed', null, null, 'Canteen Lunch Supply', null), holder_name: 'Sri Laxmi Canteen' },
    { ...pay('pay-fd-2', 's-akividu', 'food', 'upi', 'upi', 6200, 'pending', null, null, 'Food Order Catering', null), holder_name: 'Annapurna Catering', upi_id: 'annapurna@upi' },
    { ...pay('pay-fd-3', 's-akividu', 'food', 'bank', 'bank', 3000, 'cancelled', null, null, 'Breakfast Supply', null), holder_name: 'City Food Services' },
  ];

  const vehicle_bookings = [
    {
      id: 'vb-1',
      site_id: 's-akividu',
      payment_id: 'pay-veh-1',
      bill_id: 'bill-hist-1',
      tank_ids: ['tk-a4'],
      spread: false,
      per_tank_amount: 5000,
      driver_name: 'Raju Kumar',
      driver_phone: '+91 99887 76655',
      vehicle_no: 'AP 37 AB 1234',
      created_at: new Date(Date.now() - 65 * 86400000).toISOString(),
    },
  ];

  // ── Completed bill (appears in History tab) ──────────────────────────────────
  const bills = [
    {
      id: 'bill-hist-1',
      site_id: 's-akividu',
      bill_number: 'AKV-SEED-001',
      status: 'Completed',
      stocking_status: 'completed',
      order_date: d(65),
      hatchery_id: 'h-1',
      hatchery_name: 'Sandhya Hatchery',
      seed_type: 'Vannamei',
      pl_size: 'PL-12',
      quantity: 500000,
      per_piece_price: 0.12,
      total_price: 60000,
      section_id: 'sec-a',
      tank_ids: ['tk-a4'],
      cash_payment_id: 'pay-cash-1',
      advance_payment_id: 'pay-adv-1',
      vehicle_booking_id: 'vb-1',
      outside_workers_data: {
        workers: [
          { batch: 'Workers', no_of_people: 5, amount: 500, total: 2500 },
          { batch: 'Bike', no_of_people: 2, amount: 200, total: 400 },
          { batch: 'Beta', no_of_people: 1, amount: 300, total: 300 },
        ],
        grand_total: 3200,
        remarks: 'Stocking completed successfully. All tanks filled.',
        supervisor_name: 'Suresh Babu',
        supervisor_phone: '+91 94400 55678',
        signature_data: null,
      },
      stocking_status_data: {
        tankStates: {
          'tk-a4': { status: 'completed', transferredTo: null, count: 500000 },
        },
      },
      van_plan: {
        rows: [
          { id: 'vp-r1', vehicleNo: 'AP 37 AB 1234', cabin: 500000, left: [], right: [], tanks: ['tk-a4'] },
        ],
      },
      timeline: [
        { step: 'Seed Order Created', timestamp: new Date(Date.now() - 65 * 86400000).toISOString() },
        { step: 'Cash Payment Completed', timestamp: new Date(Date.now() - 64 * 86400000).toISOString() },
        { step: 'Advance Payment Completed', timestamp: new Date(Date.now() - 64 * 86400000).toISOString() },
        { step: 'Vehicle Booking Confirmed', timestamp: new Date(Date.now() - 63 * 86400000).toISOString() },
        { step: 'Outside Workers Submitted', timestamp: new Date(Date.now() - 63 * 86400000).toISOString() },
        { step: 'Bill Completed', timestamp: new Date(Date.now() - 63 * 86400000).toISOString() },
      ],
      created_by: DEMO_USER_ID,
      created_at: new Date(Date.now() - 65 * 86400000).toISOString(),
      updated_at: new Date(Date.now() - 63 * 86400000).toISOString(),
    },
  ];

  const notifications = [
    note('notif-1', 's-akividu', 'trail_netting_due',
      'Trail Netting Due — Tank A1',
      'Tank A1 has reached Day 50. Trail netting is now due.'),
    note('notif-2', 's-akividu', 'trail_netting_due',
      'Trail Netting Due — Tank C1',
      'Tank C1 has reached Day 52. Trail netting is now due.'),
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
  const trail_netting_records = [];
  const trail_netting_reports = [];
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

  const harvest_entries = [];

  const trail_netting_settings = [
    { id: 'tns-1', label: 'Net', required: true },
    { id: 'tns-2', label: 'Dettol', required: true },
    { id: 'tns-3', label: 'Box', required: true },
    { id: 'tns-4', label: 'Weighing Machine', required: true },
    { id: 'tns-5', label: 'Bucket', required: true },
    { id: 'tns-6', label: 'Rope', required: true },
  ];

  return {
    sites, sections, tanks, seed_entries, seed_exchanges, payments, bills,
    payment_accounts, bank_accounts, vehicle_bookings,
    trail_netting_checklists, trail_netting_records, trail_netting_reports,
    trail_netting_settings, hatcheries, hatchery_bank_accounts,
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
