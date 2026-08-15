/**
 * Bill number helpers (PRD §7.2 — Seed Payments → Proceed to Pay).
 *
 * Format: first 4 letters of the site name, lowercased, + a zero-padded
 * 4-digit sequence that increments per site.
 *
 * Examples:
 *   Akividu    → akiv0001
 *   Bhimavaram → bhim0001
 *   Palakollu  → pala0001
 */

/**
 * Build the next bill number for a site, given the list of existing bills
 * for that site. Only .bill_number is read.
 */
export function nextBillNumber(siteName = '', existingBills = []) {
  const prefix =
    (siteName || 'site')
      .toLowerCase()
      .replace(/[^a-z]/g, '')
      .slice(0, 4) || 'site';

  const seq =
    existingBills.reduce((max, b) => {
      const num = parseInt(
        String(b?.bill_number ?? '').replace(/^\D+/, ''),
        10
      );

      return Number.isFinite(num) ? Math.max(max, num) : max;
    }, 0) + 1;

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/**
 * Persist one step of a bill workflow and optionally append a timeline entry.
 *
 * This is used by SeedBillContext so the entire Seed workflow shares one
 * persisted bill record.
 */
export async function autosaveBillStep(
  supabase,
  TABLES,
  billId,
  updateFields = {},
  actionName = null,
  userName = 'Supervisor'
) {
  if (!billId) return null;

  try {
    const { data: current, error: fetchError } = await supabase
      .from(TABLES.bills)
      .select('*')
      .eq('id', billId)
      .maybeSingle();

    if (fetchError) {
      console.error('Autosave bill fetch error:', fetchError);
      return null;
    }

    const now = new Date();

    let updatedTimeline = Array.isArray(current?.timeline)
      ? current.timeline
      : [];

    if (actionName) {
      updatedTimeline = [
        ...updatedTimeline,
        {
          id: `tl-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 6)}`,
          date: now.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
          time: now.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          }),
          userName: userName || 'Supervisor',
          action: actionName,
        },
      ];
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
      console.error('Autosave bill update error:', error);
      return null;
    }

    return Array.isArray(data) ? data[0] ?? null : data ?? null;
  } catch (err) {
    console.error('Error in autosaveBillStep:', err);
    return null;
  }
}
