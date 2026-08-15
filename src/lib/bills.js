/**
 * Bill number helpers (PRD §7.2 — Seed Payments → Proceed to Pay).
 *
 * Format: first 4 letters of the site name, lowercased, + a zero-padded
 * 4-digit sequence that increments per site. Examples:
 *   Akividu    → akiv0001
 *   Bhimavaram → bhim0001
 *   Palakollu  → pala0001
 */

/**
 * Build the next bill number for a site, given the list of existing bills for
 * that site (any shape — only `.bill_number` is read).
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
    // Generate 2 or 3 letter uppercase prefix
    const clean = s.replace(/[^A-Za-z]/g, '').toUpperCase();
    siteCode = clean.length >= 3 ? clean.slice(0, 3) : (clean || 'TN');
  }

  const prefix = `${siteCode}TN`;
  
  // Find highest numeric sequence among bills with matching prefix
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
 * Autosave bill step data into TABLES.bills and record a timeline action entry.
 */
export async function autosaveBillStep(supabase, TABLES, billId, updateFields = {}, actionName = null, userName = 'Supervisor') {
  if (!billId) return null;
  try {
    const { data: current } = await supabase.from(TABLES.bills).select('*').eq('id', billId).maybeSingle();
    const now = new Date();
    let updatedTimeline = current?.timeline || [];

    if (actionName) {
      const entry = {
        id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
        userName: userName || 'Supervisor',
        action: actionName,
      };
      updatedTimeline = [...updatedTimeline, entry];
    }

    const payload = {
      ...updateFields,
      timeline: updatedTimeline,
      updated_at: now.toISOString(),
    };

    const { data, error } = await supabase
      .from(TABLES.bills)
      .update(payload)
      .eq('id', billId)
      .select();

    if (error) {
      console.error('Autosave bill step error:', error);
    }

    const updatedRow = (Array.isArray(data) ? data[0] : data) || { ...(current || {}), ...payload };
    return updatedRow;
  } catch (err) {
    console.error('Error in autosaveBillStep:', err);
    return null;
  }
}

