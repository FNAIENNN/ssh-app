import { useRef, useState } from 'react';
import { formatDate } from '../../hooks/useTrailNettingCadence';
import { downloadPDF } from '../../lib/pdfGenerator';
import { useToast } from '../../hooks/useToast';

function fmt(val) {
    if (val == null || val === '') return '—';
    const num = Number(val);
    if (isNaN(num)) return val;
    return num.toLocaleString('en-IN');
}

function ReportCell({ label, value, highlight, dark }) {
    return (
        <div className={`rounded-xl p-3 border ${dark ? 'bg-slate-900 border-slate-800' : 'bg-slate-800 border-slate-700'}`}>
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">{label}</span>
            <span className={`font-mono text-sm ${highlight ? 'font-black text-emerald-400' : 'font-semibold text-slate-200'}`}>
                {value}
            </span>
        </div>
    );
}

export default function TrailNettingHistoryModal({ isOpen, onClose, tank, report, recordsList = [] }) {
    const modalContentRef = useRef(null);
    const toast = useToast();
    const [downloading, setDownloading] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState(null);

    if (!isOpen || (!tank && !report)) return null;

    const tankName = tank?.name || report?.tank_name || `Tank ${report?.tank_id || ''}`;
    const sectionName = tank?.sections?.name || '—';
    const hatchery = tank?.hatchery || report?.hatchery || '—';
    const seedStocked = tank?.quantity || report?.seed_stocked || 0;
    const startDate = tank?.start_date || tank?.doc_reference_date || '—';

    const handleDownloadPDF = async () => {
        if (!modalContentRef.current) return;
        try {
            setDownloading(true);
            await downloadPDF(modalContentRef.current, {
                filename: `Trail_Netting_Activity_${tankName}_${new Date().toISOString().slice(0, 10)}.pdf`,
                orientation: 'portrait',
                format: 'a4',
            });
            toast.success('Activity PDF downloaded successfully!');
        } catch (err) {
            console.error('Download PDF error:', err);
            toast.error('Failed to download PDF');
        } finally {
            setDownloading(false);
        }
    };

    const handleClose = () => {
        if (selectedRecord) {
            setSelectedRecord(null);
        } else {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <div ref={modalContentRef} className="bg-slate-50 rounded-3xl max-w-5xl w-full p-6 md:p-8 space-y-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto scroll-thin">

                {/* Header */}
                <div className="flex items-start justify-between border-b border-slate-200 pb-4 bg-white p-5 rounded-2xl shadow-sm">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase text-slate-400">Section {sectionName}</span>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                                📜 Trail Netting History
                            </span>
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 mt-1">
                            Tank {tankName}
                        </h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-base flex items-center justify-center transition-all"
                    >
                        {selectedRecord ? '←' : '✕'}
                    </button>
                </div>

                {!selectedRecord ? (
                    <>
                        {/* Seed Order Context */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                <span>🌱</span> Reference Seed & Stocking Details
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-bold">DOC Ref / Seed Added</span>
                                    <span className="font-extrabold text-slate-900">{startDate !== '—' ? formatDate(startDate) : '—'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Seed Quantity</span>
                                    <span className="font-extrabold text-slate-900 font-mono">{Number(seedStocked).toLocaleString('en-IN')} PL</span>
                                </div>
                                <div className="md:col-span-2">
                                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Hatchery</span>
                                    <span className="font-extrabold text-slate-900 block truncate">{hatchery}</span>
                                </div>
                            </div>
                        </div>

                        {/* List of Activities */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2 px-2">
                                <span>⏱️</span> Recorded Activities ({recordsList.length})
                            </h3>

                            {recordsList.length === 0 ? (
                                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center">
                                    <p className="text-sm font-bold text-slate-500">No actual Trail Netting activities saved.</p>
                                </div>
                            ) : (
                                <div className="grid gap-3">
                                    {recordsList.map((rec, idx) => {
                                        const pDetails = rec.process_details || {};
                                        const doc = pDetails.doc || '—';
                                        const finalCount = rec.final_count || pDetails.latest_count || '—';

                                        return (
                                            <div
                                                key={rec.id || idx}
                                                onClick={() => setSelectedRecord(rec)}
                                                className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all flex items-center justify-between group"
                                            >
                                                <div>
                                                    <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Activity {idx + 1}</span>
                                                    <h4 className="text-sm font-black text-slate-900">{formatDate(rec.date || rec.created_at)}</h4>
                                                </div>
                                                <div className="flex items-center gap-5">
                                                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold border border-slate-200">
                                                        Day {doc}
                                                    </span>
                                                    <div className="text-right">
                                                        <span className="text-[10px] font-black uppercase text-slate-400 block">Final Count</span>
                                                        <span className="text-sm font-black text-emerald-600 font-mono">{finalCount}</span>
                                                    </div>
                                                    <span className="text-slate-300 group-hover:text-emerald-500 transition-colors font-bold">→</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Main Modal Footer */}
                        <div className="flex justify-end pt-4 border-t border-slate-200">
                            <button
                                onClick={onClose}
                                className="btn-secondary text-xs font-extrabold px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100"
                            >
                                Close History
                            </button>
                        </div>
                    </>
                ) : (
                    <ActivityDetailView
                        rec={selectedRecord}
                        tank={tank}
                        tankName={tankName}
                        hatchery={hatchery}
                        seedStocked={seedStocked}
                        startDate={startDate}
                        onBack={() => setSelectedRecord(null)}
                        onDownload={handleDownloadPDF}
                        downloading={downloading}
                    />
                )}
            </div>
        </div>
    );
}

function ActivityDetailView({ rec, tankName, hatchery, seedStocked, startDate, onBack, onDownload, downloading }) {
    const pDetails = rec.process_details || {};
    const doc = pDetails.doc || '—';
    const checklist = pDetails.checklist || null;
    const samples = pDetails.samples || rec.samples || [];
    const diseases = pDetails.diseases || rec.diseases || [];
    const remarks = pDetails.remarks || rec.remarks || '';
    const photos = pDetails.photos || rec.photos || [];
    const finalCount = rec.final_count || pDetails.latest_count || '—';

    // Extract report specifics from process details for this specific activity
    // Fallback to top-level if missing, but prioritized from this specific record's snapshot.
    const rep = pDetails.report_data || pDetails || {};

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Record Header */}
            <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-lg">
                <div>
                    <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                        Activity Details
                    </span>
                    <div className="flex items-center gap-3">
                        <h4 className="text-xl font-black">{formatDate(rec.date || rec.created_at)}</h4>
                        <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-200 text-xs font-bold border border-slate-700">
                            Day {doc}
                        </span>
                    </div>
                </div>
                <div className="bg-slate-800 px-5 py-2.5 rounded-xl border border-slate-700 text-right">
                    <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-0.5">
                        Final Count
                    </span>
                    <span className="text-xl font-black text-emerald-400 font-mono">
                        {finalCount}
                    </span>
                </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">

                {/* Sampling Table */}
                {samples.length > 0 && (
                    <div>
                        <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                            <span>⚖️</span> Sampling Breakdown
                        </h5>
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                    <tr>
                                        <th className="p-3">Sample #</th>
                                        <th className="p-3 text-right">KGs</th>
                                        <th className="p-3 text-right">Pieces</th>
                                        <th className="p-3 text-right">Count/KG</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {samples.map((s, sIdx) => {
                                        const kgs = s.no_of_kgs || s.kgs || 0;
                                        const pcs = s.pieces_count || s.pieces || 0;
                                        const c = s.count || (kgs > 0 ? Math.round(pcs / kgs) : 0);
                                        return (
                                            <tr key={sIdx} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-3 font-bold text-slate-900">Sample {sIdx + 1}</td>
                                                <td className="p-3 text-right font-mono">{kgs}</td>
                                                <td className="p-3 text-right font-mono">{pcs}</td>
                                                <td className="p-3 text-right font-mono font-bold text-emerald-700">{c}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Checklist */}
                {checklist && (
                    <div>
                        <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                            <span>📋</span> Checklist Verification
                        </h5>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {Object.entries(checklist).map(([item, checked]) => (
                                <div
                                    key={item}
                                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between ${checked ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                                >
                                    <span>{item}</span>
                                    <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-white border ${checked ? 'border-emerald-300 text-emerald-700' : 'border-slate-300 text-slate-500'}`}>
                                        {checked ? '✓ Verified' : '✗ Not Done'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Diseases & Remarks */}
                {(diseases.length > 0 || remarks) && (
                    <div>
                        <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                            <span>🔬</span> Observations & Remarks
                        </h5>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-slate-500 text-xs">Diseases:</span>
                                {diseases.length > 0 ? (
                                    diseases.map((d, i) => (
                                        <span key={i} className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-[11px] font-extrabold">
                                            ⚠️ {d}
                                        </span>
                                    ))
                                ) : (
                                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-extrabold">
                                        ✅ No Diseases Observed
                                    </span>
                                )}
                            </div>
                            {remarks && (
                                <div>
                                    <span className="font-bold text-slate-500 text-xs block mb-1">Supervisor Remarks:</span>
                                    <p className="text-xs text-slate-800 bg-white p-3 rounded-xl border border-slate-200 italic shadow-sm">
                                        "{remarks}"
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Photos */}
                {photos.length > 0 && (
                    <div>
                        <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                            <span>📷</span> Evidence Photos
                        </h5>
                        <div className="flex flex-wrap gap-3">
                            {photos.map((p, pIdx) => (
                                <div key={pIdx} className="w-24 h-24 rounded-2xl border border-slate-200 overflow-hidden bg-slate-100 shadow-sm flex items-center justify-center">
                                    {typeof p === 'string' && (p.startsWith('data:') || p.startsWith('http')) ? (
                                        <img src={p} alt={`Photo ${pIdx + 1}`} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="text-center p-2">
                                            <span className="text-2xl">📷</span>
                                            <span className="block text-[9px] text-slate-500 font-bold truncate">Photo {pIdx + 1}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Generated Trail Netting Report — Specific to this record */}
            <div className="space-y-4 bg-slate-900 text-white p-5 rounded-2xl shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                        <span>📊</span> Trail Netting Report Values
                    </h3>
                    <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700 rounded-full">
                        Saved Workflow Data
                    </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <ReportCell label="Tank No" value={tankName} />
                    <ReportCell label="Hatchery" value={rep?.hatchery || hatchery} />
                    <ReportCell label="Seed Stocked" value={fmt(rep?.seed_stocked || seedStocked)} />
                    <ReportCell label="Survived Seed" value={fmt(rep?.survived_seed || seedStocked)} highlight />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                    <ReportCell label="DOC (Days)" value={rep?.doc || doc} />
                    <ReportCell label="Latest Date" value={rep?.latest_date || formatDate(rec.date || rec.created_at) || '—'} />
                    <ReportCell label="Previous Date" value={rep?.previous_date || '—'} />
                    <ReportCell label="Latest Count" value={rep?.latest_count ?? finalCount} highlight />
                    <ReportCell label="Previous Count" value={rep?.previous_count ?? '—'} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                    <ReportCell label="Count Diff" value={rep?.count_diff ?? '—'} />
                    <ReportCell label="Growth Diff" value={rep?.growth_diff ?? '—'} />
                    <ReportCell label="Weekly Growth" value={rep?.weekly_growth != null ? `${rep.weekly_growth} g` : '—'} />
                    <ReportCell label="Feed Consp (Between)" value={fmt(rep?.feed_consp_between)} />
                    <ReportCell label="Growth Kgs (Between)" value={fmt(rep?.growth_kgs_between)} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    <ReportCell label="FCR (Between Period)" value={rep?.fcr_between ?? '—'} />
                    <ReportCell label="Feed Consp (Total)" value={fmt(rep?.feed_consp_total)} />
                    <ReportCell label="Trail Net Count" value={rep?.trailnet_count ?? '—'} />
                </div>

                <div className="border-t border-slate-800 pt-3">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">FCR & Expected Tonnage</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <ReportCell label="FCR (1.2)" value={rep?.fcr_1_2 != null ? fmt(rep.fcr_1_2) : '—'} />
                    <ReportCell label="FCR (1.3)" value={rep?.fcr_1_3 != null ? fmt(rep.fcr_1_3) : '—'} />
                    <ReportCell label="Expected FCR" value={rep?.expected_fcr ?? '—'} />
                    <ReportCell label="Expected Tonnage (Feed & FCR)" value={fmt(rep?.expected_tonnage_feed_fcr)} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    <ReportCell label="Expected Tonnage (Rem Seed)" value={fmt(rep?.expected_tonnage_rem_seed)} />
                    <ReportCell label="Final Harvest Tonnage" value={fmt(rep?.final_harvest_tonnage)} highlight />
                    <ReportCell label="Final Harvest Count" value={rep?.final_harvest_count ?? '—'} />
                </div>

                <div className="border-t border-slate-800 pt-3">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                        <ReportCell label="Total Seed Catched" value={fmt(rep?.total_seed_catched)} highlight />
                        <ReportCell label="Survival %" value={rep?.survival_percentage != null ? `${rep.survival_percentage}%` : '—'} highlight />
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
                <button
                    onClick={onDownload}
                    disabled={downloading}
                    className="btn-primary bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold px-5 py-3 flex items-center justify-center gap-2 border-none rounded-xl transition-colors shadow-lg w-full md:w-auto"
                >
                    {downloading ? '⏳ Exporting...' : '📄 Download Activity PDF'}
                </button>
                <button
                    onClick={onBack}
                    className="btn-secondary text-xs font-extrabold px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100"
                >
                    Back to Activities
                </button>
            </div>
        </div>
    );
}
