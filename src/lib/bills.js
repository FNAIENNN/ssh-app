/**
 * Bill number helpers (PRD §7.2 — Seed Payments → Proceed to Pay).
 *
 * Format: first 4 letters of the site name, lowercased, + a zero-padded
 * 4-digit sequence that increments per site. Examples:
 *   Akividu    → akiv0001
 *   Bhimavaram → bhim0001
 *   Palakollu  → pala0001
 */

export function nextBillNumber(siteName = '', existingBills = []) {
  const prefix = (siteName || 'site').toLowerCase().replace(/[^a-z]/g, '').slice(0, 4) || 'site';
  const seq = existingBills.reduce((max, b) => {
    const num = parseInt(String(b?.bill_number ?? '').replace(/^\D+/, ''), 10);
    return Number.isFinite(num) ? Math.max(max, num) : max;
  }, 0) + 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/**
 * Build the next Trail Netting bill number for a site based on Site Code + TN + 3-digit sequence.
 * Examples: VZTN001, BGMTN001, AKVTN001
 */
export function nextTrailNettingBillNumber(siteName = '', existingBills = []) {
  const s = (siteName || 'SITE').trim();
  let siteCode = 'SITE';
  const lower = s.toLowerCase();

  if (lower.includes('vizag') || lower.includes('visakhapatnam')) {
    siteCode = 'VZ';
  } else if (lower.includes('bhimavaram')) {
    siteCode = 'BGM';
  } else if (lower.includes('akividu')) {
    siteCode = 'AKV';
  } else if (lower.includes('palakollu')) {
    siteCode = 'PAL';
  } else {
    const clean = s.replace(/[^A-Za-z]/g, '').toUpperCase();
    siteCode = clean.length >= 3 ? clean.slice(0, 3) : (clean || 'TN');
  }

  const prefix = `${siteCode}TN`;

  const seq = existingBills.reduce((max, b) => {
    const billNo = String(b?.bill_number || '');
    if (billNo.toUpperCase().startsWith(prefix)) {
      const numPart = billNo.toUpperCase().replace(prefix, '');
      const num = parseInt(numPart, 10);
      if (Number.isFinite(num)) return Math.max(max, num);
    }
    return max;
  }, 0) + 1;

  return `${prefix}${String(seq).padStart(3, '0')}`;
}

/**
 * Persist a bill step: merge fields, optionally append a timeline entry, return the updated row.
 */
export async function autosaveBillStep(supabase, TABLES, billId, fields = {}, timelineAction = null, userName = null) {
  if (!billId) return null;

  const { data: existing, error: readErr } = await supabase
    .from(TABLES.bills)
    .select('*')
    .eq('id', billId)
    .maybeSingle();

  if (readErr) {
    console.error('autosaveBillStep read failed', readErr);
    return null;
  }

  const now = new Date().toISOString();
  const next = { ...(existing || {}), ...fields, updated_at: now };

  if (timelineAction) {
    const timeline = Array.isArray(existing?.timeline) ? [...existing.timeline] : [];
    timeline.push({
      id: `tl-${Date.now()}`,
      step: timelineAction,
      action: timelineAction,
      process: fields.process || 'Seed',
      timestamp: now,
      date: now.slice(0, 10),
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      user: userName || null,
    });
    next.timeline = timeline;
  }

  const { data, error } = await supabase
    .from(TABLES.bills)
    .update(next)
    .eq('id', billId)
    .select();

  if (error) {
    console.error('autosaveBillStep update failed', error);
    return next;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row || next;
}
