import { feedConsumptionFromReport, latestNettingRecord } from '../../lib/seedMetrics.js';

const normalize = (value) => String(value ?? '').trim().toLowerCase();

function isOnOrAfter(value, startDate) {
    if (!startDate) return true;
    const valueTime = new Date(value).getTime();
    const startTime = new Date(startDate).getTime();
    return Number.isFinite(valueTime) && Number.isFinite(startTime) && valueTime >= startTime;
}

/** Stock-in events belonging to the tank's current (unharvested) cycle. */
export function currentCycleStockingEvents(tank, seedEntries = []) {
    const tankId = String(tank?.id ?? '');
    const tankName = normalize(tank?.name);

    return seedEntries
        .filter((entry) => {
            const sameTank = String(entry?.tank_id ?? '') === tankId || normalize(entry?.tank_name) === tankName;
            const isPhysicalStocking = normalize(entry?.source || 'stocked') === 'stocked';
            return sameTank && isPhysicalStocking && Number(entry?.quantity) > 0 && isOnOrAfter(entry?.date, tank?.start_date);
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/** Trail-netting records are cycle-scoped by the preserved original start date. */
export function currentCycleNettingRecords(tank, records = []) {
    return records
        .filter((record) => isOnOrAfter(record?.date, tank?.start_date))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function uniqueHatcheryDisplay(events = [], fallback = '') {
    const names = [];
    for (const event of events) {
        const name = String(event?.hatchery ?? '').trim();
        if (name && !names.some((existing) => normalize(existing) === normalize(name))) names.push(name);
    }
    return names.length ? names.join(' + ') : (fallback || '—');
}

export function buildTankCardData({ tank, seedEntries = [], records = [], report = null }) {
    const stockingEvents = currentCycleStockingEvents(tank, seedEntries);
    const cycleRecords = currentCycleNettingRecords(tank, records);
    const latestRecord = latestNettingRecord(cycleRecords);
    const eventQuantity = stockingEvents.reduce((sum, event) => sum + (Number(event.quantity) || 0), 0);
    const snapshotQuantity = Number(tank?.quantity);
    const reportDate = report?.latest_date || report?.process_details?.date || report?.updated_at || report?.created_at;
    const currentCycleReport = report && isOnOrAfter(reportDate, tank?.start_date) ? report : null;

    return {
        stockingEvents,
        cycleRecords,
        quantity: Number.isFinite(snapshotQuantity) && snapshotQuantity > 0 ? snapshotQuantity : eventQuantity,
        hatchery: uniqueHatcheryDisplay(stockingEvents, tank?.hatchery),
        latestCount: latestRecord?.final_count ?? currentCycleReport?.latest_count ?? null,
        latestCountDate: latestRecord?.date ?? currentCycleReport?.latest_date ?? null,
        nettingCount: cycleRecords.length,
        feed: feedConsumptionFromReport(currentCycleReport) ?? tank?.feed ?? null,
    };
}
