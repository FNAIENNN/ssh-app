import React, { useMemo, useState, useEffect } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';

const quantity = (value) => `${Number(value || 0).toLocaleString('en-IN')} pcs`;
const sameTank = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

function dateInput(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function calculateDoc(startDate, selectedDate) {
    if (!startDate || !selectedDate) return null;
    const start = new Date(`${String(startDate).slice(0, 10)}T00:00:00`);
    const selected = new Date(`${selectedDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(selected.getTime())) return null;
    return Math.max(1, Math.floor((selected - start) / 86400000) + 1);
}

function cleanHatchery(value) {
    return String(value || '').replace(/\s*\(\s*order\s*:[^)]+\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
}

function resolveNewDetails(tankName, activeOrder, step2Data, vehicles) {
    const packingTank = activeOrder?.packing_data?.tanks?.find((tank) => sameTank(tank.name || tank.id, tankName));
    let originalAssigned = null;
    let returned = 0;
    let transferredOut = 0;

    if (packingTank) {
        returned = Number(packingTank.returnedQuantity) || 0;
        transferredOut = Number(packingTank.transferredQuantity) || 0;
        originalAssigned = Number(packingTank.originalQuantity ?? packingTank.quantity) || 0;
    } else {
        const groups = [];
        if (step2Data?.tankStates) groups.push(step2Data.tankStates);
        Object.entries(step2Data || {}).forEach(([key, value]) => {
            if (key !== 'tankStates' && value?.tankStates) groups.push(value.tankStates);
        });
        const drums = groups.flatMap((group) => Object.values(group || {}))
            .filter((drum) => sameTank(drum?.tankName || drum?.name, tankName));
        if (drums.length) {
            originalAssigned = drums.reduce((sum, drum) => sum + (Number(drum.originalCount ?? drum.currentCount ?? drum.count) || 0), 0);
            drums.forEach((drum) => {
                const original = Number(drum.originalCount ?? drum.currentCount ?? drum.count) || 0;
                const current = Number(drum.currentCount ?? drum.count) || 0;
                const removed = Math.max(0, original - current);
                if (String(drum.status).toLowerCase().includes('return')) returned += removed;
                if (String(drum.status).toLowerCase().includes('transfer')) transferredOut += removed;
            });
        }
    }

    return {
        originalAssigned,
        returned,
        transferredOut,
        vehicle: [...new Set((vehicles || []).map((v) => v.vehicle_no || v.vehicleNo).filter(Boolean))].join(', '),
        batch: activeOrder?.batch_number || activeOrder?.batch_no || activeOrder?.batch || '',
    };
}

function Detail({ label, value, tone = 'text-slate-900' }) {
    return <div><p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{label}</p><p className={`mt-1 break-words text-sm font-extrabold ${tone}`}>{value}</p></div>;
}

export default function AdditionalStockingReview({ tanks, activeOrder, step2Data, vehicles = [], onConfirm, onBack }) {
    const today = useMemo(() => dateInput(), []);
    const [docDates, setDocDates] = useState({});
    const [tankHistoryDates, setTankHistoryDates] = useState({});
    const [expandedTank, setExpandedTank] = useState(0);

    useEffect(() => {
        async function fetchHistory() {
            if (!activeOrder?.site_id || !tanks?.length) return;
            try {
                const { data: bills } = await supabase
                    .from(TABLES.bills)
                    .select('id, type, selected_tanks, stocking_date, created_at')
                    .eq('site_id', activeOrder.site_id)
                    .in('type', ['seed', 'seed_order']);

                if (!bills) return;

                const newHistory = {};
                tanks.forEach(({ matchedTank }) => {
                    if (!matchedTank) return;
                    const key = String(matchedTank.id || matchedTank.name);
                    const datesSet = new Set();

                    if (matchedTank.start_date) {
                        datesSet.add(String(matchedTank.start_date).slice(0, 10));
                    }

                    bills.forEach(bill => {
                        const hasTank = Array.isArray(bill.selected_tanks) && bill.selected_tanks.some(t => String(t.id) === String(matchedTank.id));
                        if (hasTank) {
                            const d = bill.stocking_date || bill.created_at;
                            if (d) datesSet.add(String(d).slice(0, 10));
                        }
                    });

                    const sorted = Array.from(datesSet).sort((a, b) => new Date(b) - new Date(a));
                    newHistory[key] = sorted;

                    setDocDates(prev => {
                        if (!prev[key]) {
                            return { ...prev, [key]: sorted[0] || today };
                        }
                        return prev;
                    });
                });
                setTankHistoryDates(newHistory);
            } catch (err) {
                console.error("Failed to fetch tank history dates", err);
            }
        }
        fetchHistory();
    }, [tanks, activeOrder, today]);

    return (
        <div className="mx-auto max-w-5xl rounded-[20px] border bg-white p-4 shadow-sm sm:p-6 lg:p-8" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-start gap-4 border-b pb-5" style={{ borderColor: 'var(--color-border)' }}>
                <button type="button" onClick={onBack} className="mt-1 text-sm font-bold text-text-muted hover:text-primary">← Back</button>
                <div className="min-w-0 flex-1 text-center">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Existing active cycle</p>
                    <h3 className="mt-1 text-xl font-black text-primary sm:text-2xl">Additional Seed Stocking Review</h3>
                    <p className="mx-auto mt-2 max-w-2xl text-sm text-text-muted">Review the completed physical stocking below. The original cycle date and Trail Netting history will be preserved.</p>
                </div>
                <div className="hidden w-12 sm:block" aria-hidden="true" />
            </div>

            <div className="mt-6 space-y-8">
                {tanks.map(({ matchedTank, newQuantity }, idx) => {
                    const isExpanded = expandedTank === idx;
                    const key = String(matchedTank.id || matchedTank.name || idx);
                    const startDate = matchedTank.start_date || '';
                    const selectedDate = docDates[key] || today;
                    const doc = calculateDoc(startDate, selectedDate);
                    const existingQty = Number(matchedTank.quantity) || 0;
                    const finalNewQty = Number(newQuantity) || 0;
                    const details = resolveNewDetails(matchedTank.name, activeOrder, step2Data, vehicles);
                    const existingHatcheries = String(matchedTank.hatchery || '').split(' + ').map(cleanHatchery).filter(Boolean);
                    const addingHatchery = cleanHatchery(activeOrder?.hatchery);
                    const combined = [...existingHatcheries];
                    if (addingHatchery && !combined.some((name) => name.toLowerCase() === addingHatchery.toLowerCase())) combined.push(addingHatchery);
                    const newDate = dateInput(activeOrder?.stocking_date || activeOrder?.updated_at || new Date()) || today;

                    return (
                        <article key={key} className="overflow-hidden rounded-[16px] border" style={{ borderColor: 'var(--color-border)' }}>
                            <button
                                type="button"
                                onClick={() => setExpandedTank(isExpanded ? null : idx)}
                                className="w-full text-left flex flex-wrap items-center justify-between gap-3 bg-slate-800 px-5 py-4 text-white hover:bg-slate-700 transition-colors"
                            >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">Tank</p>
                                        <h4 className="text-xl font-black leading-none mt-1">{matchedTank.name}</h4>
                                    </div>
                                    <div className="hidden sm:block h-8 w-px bg-slate-600"></div>
                                    <div className="flex gap-4 text-sm">
                                        <div>
                                            <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">Existing</span>
                                            <span className="font-bold">{quantity(existingQty)}</span>
                                        </div>
                                        <div>
                                            <span className="text-emerald-300 text-[10px] font-bold block uppercase tracking-wider">Additional</span>
                                            <span className="font-bold text-emerald-100">+{quantity(finalNewQty)}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 sm:px-3 py-1 text-[9px] sm:text-[11px] font-black uppercase tracking-wider text-emerald-800">Active</span>
                                    <svg className={`w-5 h-5 text-slate-400 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </div>
                            </button>

                            {isExpanded && (
                                <div className="space-y-5 p-4 sm:p-5">
                                    <section className="rounded-[14px] border bg-slate-50 p-4 sm:p-5" style={{ borderColor: 'var(--color-border)' }}>
                                        <h5 className="border-b pb-3 text-base font-black text-primary" style={{ borderColor: 'var(--color-border)' }}>Existing Tank Details</h5>
                                        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                                            <Detail label="Original Stocking Date" value={startDate || 'N/A'} />
                                            <div>
                                                <label htmlFor={`doc-${key}`} className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Stocking Date (For DOC)</label>
                                                <select
                                                    id={`doc-${key}`}
                                                    className="field mt-1 w-full bg-white"
                                                    value={selectedDate}
                                                    onChange={(e) => setDocDates((current) => ({ ...current, [key]: e.target.value }))}
                                                >
                                                    {(!tankHistoryDates[key] || tankHistoryDates[key].length === 0) && (
                                                        <option value={startDate ? String(startDate).slice(0, 10) : today}>
                                                            {startDate ? String(startDate).slice(0, 10) : today}
                                                        </option>
                                                    )}
                                                    {(tankHistoryDates[key] || []).map(d => (
                                                        <option key={d} value={d}>{d}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <Detail label="DOC on Selected Date" value={doc ? `Day ${doc}` : 'N/A'} tone="text-primary" />
                                            <Detail label="Existing Seed Quantity" value={quantity(existingQty)} />
                                            <Detail label="Existing Hatchery" value={cleanHatchery(matchedTank.hatchery) || 'N/A'} />
                                            <Detail label="Latest Trail Netting Count" value={matchedTank.latest_trail_count != null ? quantity(matchedTank.latest_trail_count) : 'No count recorded'} />
                                            <Detail label="Latest Count Date" value={matchedTank.latest_trail_date ? String(matchedTank.latest_trail_date).slice(0, 10) : 'No count recorded'} />
                                            <Detail label="Tank Status" value="Running" tone="text-emerald-700" />
                                        </div>
                                    </section>

                                    <section className="rounded-[14px] border border-emerald-200 bg-emerald-50/60 p-4 sm:p-5">
                                        <div className="flex items-center justify-between gap-3 border-b border-emerald-200 pb-3"><h5 className="text-base font-black text-emerald-800">New Stocking Details</h5><span className="rounded-full bg-emerald-700 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">Completed</span></div>
                                        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                                            <Detail label="New Stocking Date" value={newDate} />
                                            {details.originalAssigned != null && <Detail label="Original Assigned Quantity" value={quantity(details.originalAssigned)} />}
                                            <Detail label="Returned Quantity" value={quantity(details.returned)} tone={details.returned ? 'text-red-700' : 'text-slate-900'} />
                                            <Detail label="Transferred Out Quantity" value={quantity(details.transferredOut)} tone={details.transferredOut ? 'text-blue-700' : 'text-slate-900'} />
                                            <Detail label="Final Stocked Quantity to this Tank" value={quantity(finalNewQty)} tone="text-emerald-700" />
                                            <Detail label="Hatchery" value={addingHatchery || 'N/A'} />
                                            {details.vehicle && <Detail label="Vehicle" value={details.vehicle} />}
                                            {details.batch && <Detail label="Batch" value={details.batch} />}
                                            {activeOrder?.bill_number && <Detail label="Order / Reference" value={activeOrder.bill_number} />}
                                        </div>
                                    </section>
                                </div>
                            )}
                        </article>
                    );
                })}

                <section className="rounded-[16px] border border-sky-200 bg-sky-50 p-5 sm:p-6 shadow-sm mt-8">
                    <h5 className="border-b border-sky-200 pb-3 text-lg font-black text-sky-900">Overall Tanks Summary</h5>
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Detail label="Total Existing Seed" value={quantity(tanks.reduce((sum, { matchedTank }) => sum + (Number(matchedTank.quantity) || 0), 0))} />
                        <Detail label="Total Additional Seed" value={quantity(tanks.reduce((sum, { newQuantity }) => sum + (Number(newQuantity) || 0), 0))} tone="text-emerald-700" />
                        <Detail label="Total Updated Seed" value={quantity(tanks.reduce((sum, { matchedTank, newQuantity }) => sum + (Number(matchedTank.quantity) || 0) + (Number(newQuantity) || 0), 0))} tone="text-sky-900" />
                        <Detail label="Trail Netting" value="Preserved for all active tanks" tone="text-emerald-700" />
                    </div>
                </section>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-4 sm:pt-6 sm:flex-row sm:justify-end" style={{ borderColor: 'var(--color-border)' }}>
                <button type="button" onClick={onBack} className="btn-ghost px-4 py-2.5 sm:px-6 sm:py-3 text-xs sm:text-sm font-bold border sm:border-0 rounded-lg">Cancel / Go Back</button>
                <button type="button" onClick={onConfirm} className="bg-slate-900 hover:bg-slate-800 text-white rounded-lg px-4 py-2.5 sm:px-8 sm:py-3 text-xs sm:text-sm font-extrabold shadow-sm sm:shadow-md transition-colors">Confirm Additional Stocking &amp; Continue to Outside Workers</button>
            </div>
        </div>
    );
}
