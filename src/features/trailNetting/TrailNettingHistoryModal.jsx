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

    if (!isOpen || (!tank && !report)) return null;

    const latestRec = recordsList.length > 0 ? recordsList[recordsList.length - 1] : null;

    // Extract process details stored in report or record
    const pDetails = report?.process_details || latestRec?.process_details || {};

    const tankName = tank?.name || pDetails?.tank_name || report?.tank_name || `Tank ${report?.tank_id || ''}`;
    const sectionName = tank?.sections?.name || pDetails?.section_name || '—';
    const hatchery = tank?.hatchery || pDetails?.hatchery || report?.hatchery || '—';
    const seedType = tank?.seed_type || pDetails?.seed_type || '—';
    const seedStocked = tank?.quantity || pDetails?.quantity || report?.seed_stocked || 0;
    const startDate = tank?.start_date || pDetails?.start_date || '—';
    const doc = report?.doc || pDetails?.doc || '—';
    const nettingDate = report?.latest_date ? formatDate(report.latest_date) : (latestRec?.date ? formatDate(latestRec.date) : '—');
    const latestCount = report?.latest_count || latestRec?.final_count || pDetails?.latest_count || '—';

    // Checklist — use only real saved data, no demo defaults
    const checklist = pDetails?.checklist || null;

    // Samples — use only real saved data
    const samples = pDetails?.samples || latestRec?.samples || [];

    // Diseases & Remarks
    const diseases = pDetails?.diseases || latestRec?.diseases || [];
    const remarks = pDetails?.remarks || latestRec?.remarks || '';

    // Photos
    const photos = pDetails?.photos || latestRec?.photos || [];

    const handleDownloadPDF = async () => {
        if (!modalContentRef.current) return;
        try {
            setDownloading(true);
            await downloadPDF(modalContentRef.current, {
                filename: `Trail_Netting_Report_${tankName}_${new Date().toISOString().slice(0, 10)}.pdf`,
                orientation: 'portrait',
                format: 'a4',
            });
            toast.success('Report PDF downloaded successfully!');
        } catch (err) {
            console.error('Download PDF error:', err);
            toast.error('Failed to download PDF');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <div ref={modalContentRef} className="bg-white rounded-3xl max-w-4xl w-full p-6 md:p-8 space-y-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto scroll-thin">

                {/* Header */}
                <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase text-slate-400">Section {sectionName}</span>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                                ✅ Trail Netting Completed
                            </span>
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 mt-1">
                            Complete Details — Tank {tankName}
                        </h2>
                        <p className="text-xs text-slate-500">
                            Netting Date: {nettingDate} · Generated Report ID: #{report?.id || `rep-${tank?.id}`}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-base flex items-center justify-center transition-all"
                    >
                        ✕
                    </button>
                </div>

                {/* 1. Seed Order & Tank Information */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <span>🌱</span> Seed Order & Stocking Details
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Seed Added Date</span>
                            <span className="font-extrabold text-slate-900">{startDate !== '—' ? formatDate(startDate) : '—'}</span>
                        </div>
                        <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Days (DOC)</span>
                            <span className="font-extrabold text-slate-900 font-mono">Day {doc}</span>
                        </div>
                        <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Seed Stocked</span>
                            <span className="font-extrabold text-slate-900 font-mono">{Number(seedStocked).toLocaleString('en-IN')} PL</span>
                        </div>
                        <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Hatchery</span>
                            <span className="font-extrabold text-slate-900 truncate block">{hatchery}</span>
                        </div>
                    </div>
                </div>

                {/* 2. Verified Checklist Details */}
                <div className="space-y-2">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <span>📋</span> Checklist Verification Details
                    </h3>
                    {checklist ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {Object.entries(checklist).map(([item, checked]) => (
                                <div
                                    key={item}
                                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between ${checked ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-500'
                                        }`}
                                >
                                    <span>{item}</span>
                                    <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-white border ${checked ? 'border-emerald-300 text-emerald-700' : 'border-slate-300 text-slate-500'}`}>
                                        {checked ? '✓ Verified' : '✗ Not Done'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-slate-400 italic">No checklist data recorded.</p>
                    )}
                </div>


                {/* 3. Sampling & Weight Details */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                            <span>⚖️</span> Weight & Sampling Breakdown
                        </h3>
                        <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 font-mono">
                            Final Count: {latestCount} Count/KG
                        </span>
                    </div>

                    {samples.length > 0 ? (
                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200">
                                    <tr>
                                        <th className="p-3">Sample #</th>
                                        <th className="p-3 text-right">No. of KGs</th>
                                        <th className="p-3 text-right">Pieces Count</th>
                                        <th className="p-3 text-right">Count/KG</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {samples.map((s, idx) => {
                                        const kgs = s.no_of_kgs || s.kgs || 0;
                                        const pcs = s.pieces_count || s.pieces || 0;
                                        const c = s.count || (kgs > 0 ? Math.round(pcs / kgs) : 0);
                                        return (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-3 font-bold text-slate-900">Sample {idx + 1}</td>
                                                <td className="p-3 text-right font-mono text-slate-800">{kgs} KG</td>
                                                <td className="p-3 text-right font-mono text-slate-800">{pcs}</td>
                                                <td className="p-3 text-right font-mono font-bold text-emerald-800">{c} Count/KG</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-xs text-slate-400 italic">No sampling data recorded.</p>
                    )}
                </div>


                {/* 4. Disease Observations & Findings */}
                <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <span>🔬</span> Disease Observations & Remarks
                    </h3>
                    <div className="space-y-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-500">Diseases Selection:</span>
                            {diseases.length > 0 ? (
                                diseases.map((d, i) => (
                                    <span key={i} className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-[11px] font-extrabold">
                                        ⚠️ {d}
                                    </span>
                                ))
                            ) : (
                                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-extrabold">
                                    ✅ No Diseases Observed (Healthy)
                                </span>
                            )}
                        </div>
                        {remarks && (
                            <div>
                                <span className="font-bold text-slate-500 block">Supervisor Remarks:</span>
                                <p className="text-slate-800 bg-white p-2.5 rounded-xl border border-slate-200 mt-1 italic">
                                    &quot;{remarks}&quot;
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 5. Photos Captured / Uploaded */}
                {photos && photos.length > 0 && (
                    <div className="space-y-2">
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                            <span>📷</span> Captured Trail Netting Photos ({photos.length})
                        </h3>
                        <div className="flex flex-wrap gap-3">
                            {photos.map((p, idx) => (
                                <div key={idx} className="w-24 h-24 rounded-2xl border border-slate-200 overflow-hidden bg-slate-100 shadow-sm flex items-center justify-center">
                                    {typeof p === 'string' && p.startsWith('data:') ? (
                                        <img src={p} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="text-center p-2">
                                            <span className="text-2xl">📷</span>
                                            <span className="block text-[9px] text-slate-500 font-bold truncate">Photo {idx + 1}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 6. Generated Trail Netting Report — Full Data */}
                <div className="space-y-4 bg-slate-900 text-white p-5 rounded-2xl shadow-lg">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <h3 className="text-sm font-black text-white flex items-center gap-2">
                            <span>📊</span> Generated Trail Netting Report
                        </h3>
                        <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 bg-emerald-900 text-emerald-200 border border-emerald-700 rounded-full">
                            {report?.process_details?.status === 'completed' ? '✅ Completed Report' : 'Report Generated'}
                        </span>
                    </div>

                    {/* Row 1: Core Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <ReportCell label="Tank No" value={tankName} />
                        <ReportCell label="Hatchery" value={report?.hatchery || hatchery} />
                        <ReportCell label="Seed Stocked" value={fmt(report?.seed_stocked || seedStocked)} />
                        <ReportCell label="Survived Seed" value={fmt(report?.survived_seed || seedStocked)} highlight />
                    </div>

                    {/* Row 2: Count & Growth */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                        <ReportCell label="DOC (Days)" value={report?.doc || doc} />
                        <ReportCell label="Latest Date" value={report?.latest_date || '—'} />
                        <ReportCell label="Previous Date" value={report?.previous_date || '—'} />
                        <ReportCell label="Latest Count" value={report?.latest_count ?? latestCount} highlight />
                        <ReportCell label="Previous Count" value={report?.previous_count ?? '—'} />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                        <ReportCell label="Count Diff" value={report?.count_diff ?? '—'} />
                        <ReportCell label="Growth Diff" value={report?.growth_diff ?? '—'} />
                        <ReportCell label="Weekly Growth" value={report?.weekly_growth != null ? `${report.weekly_growth} g` : '—'} />
                        <ReportCell label="Feed Consp (Between)" value={fmt(report?.feed_consp_between)} />
                        <ReportCell label="Growth Kgs (Between)" value={fmt(report?.growth_kgs_between)} />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                        <ReportCell label="FCR (Between Period)" value={report?.fcr_between ?? '—'} />
                        <ReportCell label="Feed Consp (Total)" value={fmt(report?.feed_consp_total)} />
                        <ReportCell label="Trail Net Count" value={report?.trailnet_count ?? '—'} />
                    </div>

                    {/* Row 3: Middle Harvest */}
                    {(report?.middle_1_tonnage != null || report?.middle_2_tonnage != null || report?.middle_3_tonnage != null || report?.latest_middle_date || report?.middle_1_date) && (
                        <>
                            <div className="border-t border-slate-700 pt-3">
                                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Middle Harvest Data</p>
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-xs">
                                <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700 space-y-1.5">
                                    <p className="text-[10px] font-extrabold uppercase text-amber-400">Middle 1</p>
                                    <ReportCell label="Date" value={report?.middle_1_date || report?.latest_middle_date || '—'} dark />
                                    <ReportCell label="Tonnage" value={fmt(report?.middle_1_tonnage)} dark />
                                    <ReportCell label="Count" value={report?.middle_1_count ?? '—'} dark />
                                </div>
                                <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700 space-y-1.5">
                                    <p className="text-[10px] font-extrabold uppercase text-amber-400">Middle 2</p>
                                    <ReportCell label="Date" value={report?.middle_2_date || '—'} dark />
                                    <ReportCell label="Tonnage" value={fmt(report?.middle_2_tonnage)} dark />
                                    <ReportCell label="Count" value={report?.middle_2_count ?? '—'} dark />
                                </div>
                                <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700 space-y-1.5">
                                    <p className="text-[10px] font-extrabold uppercase text-amber-400">Middle 3</p>
                                    <ReportCell label="Date" value={report?.middle_3_date || '—'} dark />
                                    <ReportCell label="Tonnage" value={fmt(report?.middle_3_tonnage)} dark />
                                    <ReportCell label="Count" value={report?.middle_3_count ?? '—'} dark />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                <ReportCell label="Middle Harvested Seed" value={fmt(report?.middle_harvested_seed)} />
                                <ReportCell label="Remaining Seed" value={fmt(report?.remaining_seed)} />
                                <ReportCell label="Middle Tonnage Total" value={fmt(report?.middle_tonnage_total)} highlight />
                                <ReportCell label="Remaining Tonnage" value={fmt(report?.remaining_tonnage)} />
                            </div>
                        </>
                    )}

                    {/* Row 4: FCR & Expected */}
                    <div className="border-t border-slate-700 pt-3">
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">FCR & Expected Tonnage</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <ReportCell label="FCR (1.2)" value={report?.fcr_1_2 != null ? fmt(report.fcr_1_2) : '—'} />
                        <ReportCell label="FCR (1.3)" value={report?.fcr_1_3 != null ? fmt(report.fcr_1_3) : '—'} />
                        <ReportCell label="Expected FCR" value={report?.expected_fcr ?? '—'} />
                        <ReportCell label="Expected Tonnage (Feed & FCR)" value={fmt(report?.expected_tonnage_feed_fcr)} />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                        <ReportCell label="Expected Tonnage (Rem Seed)" value={fmt(report?.expected_tonnage_rem_seed)} />
                        <ReportCell label="Final Harvest Tonnage" value={fmt(report?.final_harvest_tonnage)} highlight />
                        <ReportCell label="Final Harvest Count" value={report?.final_harvest_count ?? '—'} />
                    </div>

                    {/* Row 5: Survival */}
                    <div className="border-t border-slate-700 pt-3">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                            <ReportCell label="Total Seed Catched" value={fmt(report?.total_seed_catched)} highlight />
                            <ReportCell label="Survival %" value={report?.survival_percentage != null ? `${report.survival_percentage}%` : '—'} highlight />
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <button
                        onClick={handleDownloadPDF}
                        disabled={downloading}
                        className="btn-primary bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold px-4 py-2.5 flex items-center gap-1.5 border-none rounded-xl"
                    >
                        {downloading ? '⏳ Exporting...' : '📄 Download Complete Report PDF'}
                    </button>
                    <button
                        onClick={onClose}
                        className="btn-secondary text-xs font-extrabold px-5 py-2.5 rounded-xl"
                    >
                        Close Details
                    </button>
                </div>

            </div>
        </div>
    );
}
