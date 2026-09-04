import { useRef, useState } from 'react';
import { downloadPDF } from '../../../lib/pdfGenerator';

/**
 * HarvestBillModal — Professional printable invoice bill layout for harvest entries.
 * Updated with specific layouts for Middle Harvest vs Full Harvest.
 */
export default function HarvestBillModal({ bill, harvestEntry, tank, savedTanks = [], onClose, enableWeighmentTable: initialEnableWeighment = false }) {
  const printRef = useRef(null);
  const [showWeighment, setShowWeighment] = useState(initialEnableWeighment);
  const [downloading, setDownloading] = useState(false);

  if (!bill) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    await downloadPDF(printRef.current, {
      filename: `${isMiddleHarvest ? 'Middle_Harvest_Bill' : 'Harvest_Bill'}_${bill.bill_number || 'bill'}.pdf`,
      orientation: 'portrait',
    });
    setDownloading(false);
  };

  const isMiddleHarvest = (bill.harvest_type || harvestEntry?.harvest_type) === 'middle';

  const siteName = harvestEntry?.site_name || harvestEntry?.farm_name || bill.site_name || 'SHRIMP HARVEST MANAGEMENT';
  const totalKgs = Number(harvestEntry?.total_kgs || bill.total_kgs || 0);
  const pricePerKg = Number(harvestEntry?.price_per_kg || 0);
  const totalAmount = Number(bill.total_amount || harvestEntry?.total_amount || 0);
  const paidAmount = Number(bill.paid_amount || 0);
  const balanceAmount = Number(bill.balance_amount || totalAmount - paidAmount);

  const graderExpense =
    (Number(harvestEntry?.grader_details?.driver_bata) || 0) +
    (Number(harvestEntry?.grader_details?.packing_bata) || 0) +
    (Number(harvestEntry?.grader_details?.extra_payment) || 0);

  const labourExpense = Number(harvestEntry?.labour_details?.grand_total || 0);
  const netProfit = totalAmount - (graderExpense + labourExpense);

  const buyerName = harvestEntry?.buyer_name || harvestEntry?.billingData?.buying_company || bill.buyer_name || 'Choice Trading Co.';
  const factoryName = harvestEntry?.factory_name || harvestEntry?.billingData?.factory_name || bill.factory_name || '';
  const graderName = harvestEntry?.grader_name || harvestEntry?.graderData?.name || harvestEntry?.billingData?.grader_name || '';
  const supervisorName = harvestEntry?.supervisor_name || harvestEntry?.billingData?.harvest_supervisor || '';

  const supervisorSig = harvestEntry?.supervisor_signature || harvestEntry?.billingData?.supervisor_signature || bill?.supervisor_signature || bill?.document_data?.supervisor_signature || null;
  const graderSig = harvestEntry?.grader_signature || harvestEntry?.graderData?.grader_signature || bill?.grader_signature || bill?.document_data?.grader_signature || null;

  const generateFallbackSignature = (name, title) => {
    const displayName = String(name || title || 'Authorized Sign').trim();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" viewBox="0 0 200 50">
      <path d="M 15 32 Q 35 12, 60 30 T 110 22 T 160 32" fill="none" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round"/>
      <text x="15" y="42" font-family="sans-serif" font-size="14" font-weight="bold" font-style="italic" fill="#0f172a">${displayName}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const finalSupervisorSig = supervisorSig || generateFallbackSignature(supervisorName || 'Harvest Incharge', 'Harvest Incharge Sign');
  const finalGraderSig = graderSig || generateFallbackSignature(graderName || 'Grader / Contractor', 'Grader / Contractor Sign');
  const finalManagerSig = generateFallbackSignature('Authorized Manager', 'Authorized Manager Sign');

  // Tanks list for Middle Harvest
  const tanksList = savedTanks.length > 0 ? savedTanks : [
    {
      tank_name: tank?.name || harvestEntry?.tanks?.name || 'A1',
      finalCount: harvestEntry?.final_count || 60,
      grandTotalKgs: totalKgs,
      pricePerKg: pricePerKg || (totalKgs > 0 ? (totalAmount / totalKgs).toFixed(2) : 0),
      weightRows: harvestEntry?.weight_rows || []
    }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden my-8">
        {/* Modal Action Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧾</span>
            <span className="font-extrabold text-sm tracking-wide">
              {isMiddleHarvest ? 'Middle Harvest Bill' : 'Official Harvest Bill'} Preview — #{bill.bill_number}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-300 font-bold mr-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showWeighment}
                onChange={(e) => setShowWeighment(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              Include Weighment Table
            </label>
            <button
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>{downloading ? '⏳ Exporting...' : '📥 Download PDF'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-md transition flex items-center gap-1.5"
            >
              🖨️ Print Bill
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Printable Bill Area */}
        <div ref={printRef} className="p-8 space-y-6 text-slate-800 font-sans">
          {/* Bill Header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-xl">
                  🦐
                </div>
                <div>
                  <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                    {siteName}
                  </h1>
                  <p className="text-xs text-slate-500 font-bold">
                    Type: <span className="text-blue-700 font-extrabold uppercase">{isMiddleHarvest ? 'Middle Harvest' : 'Full Harvest'}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-blue-50 text-blue-800 font-mono font-black text-xs rounded-lg border border-blue-200 mb-1">
                BILL #{bill.bill_number}
              </span>
              <p className="text-xs text-slate-500 font-medium">
                Date: {new Date(bill.created_at || Date.now()).toLocaleDateString('en-IN')}
              </p>
            </div>
          </div>

          {/* Details Section */}
          {isMiddleHarvest ? (
            /* Middle Harvest: Buyer Details Only (larger font), Tank Info removed */
            <div className="bg-blue-50/70 p-5 rounded-2xl border border-blue-200 space-y-2 text-xs">
              <h4 className="font-black text-blue-900 uppercase tracking-wider text-xs">
                BUYER & DESTINATION DETAILS
              </h4>
              <p className="font-black text-slate-900 text-base">
                Buyer Company: <span className="text-blue-700">{buyerName}</span>
              </p>
              {factoryName && (
                <p className="text-slate-700 text-xs font-bold">
                  Factory Name: <span className="text-slate-900">{factoryName}</span>
                </p>
              )}
              {graderName && (
                <p className="text-slate-700 text-xs font-bold">
                  Grader Name: <span className="text-slate-900">{graderName}</span>
                </p>
              )}
            </div>
          ) : (
            /* Full Harvest: Standard Tank & Buyer Details */
            <div className="grid grid-cols-2 gap-6 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
              <div>
                <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[10px] text-blue-700 mb-2">
                  TANK INFORMATION
                </h4>
                <p className="font-bold text-slate-900 text-sm">
                  Tank: {tank?.name || harvestEntry?.tanks?.name || 'A1'}
                </p>
                <p className="text-slate-600">Hatchery: {tank?.hatchery || 'Sri Venkateswara'}</p>
                <p className="text-slate-600">Seed Stocked: {tank?.quantity ? tank.quantity.toLocaleString('en-IN') : '—'} PL</p>
                <p className="text-slate-600">DOC (Days of Culture): {harvestEntry?.doc || 50} days</p>
              </div>

              <div>
                <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[10px] text-blue-700 mb-2">
                  DESTINATION & BUYER
                </h4>
                <p className="font-bold text-slate-900 text-sm">
                  Buyer: {buyerName}
                </p>
                <p className="text-slate-600">
                  Factory: {factoryName || 'Apex Frozen Foods'}
                </p>
                <p className="text-slate-600">
                  Grader Vehicle: {harvestEntry?.grader_details?.vehicle_no || 'AP 37 AB 5678'}
                </p>
                <p className="text-slate-600">
                  Labour Team: {harvestEntry?.labour_details?.supplier_name || 'Raju Labour Crew'}
                </p>
              </div>
            </div>
          )}

          {/* Harvest Summary Table */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-extrabold">
                  {isMiddleHarvest ? (
                    <th className="p-3">Tank No.</th>
                  ) : (
                    <th className="p-3">Item Description</th>
                  )}
                  <th className="p-3 text-center">Harvest Count</th>
                  <th className="p-3 text-right">Net KGs</th>
                  <th className="p-3 text-right">Rate / KG</th>
                  <th className="p-3 text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {isMiddleHarvest ? (
                  tanksList.map((tRow, idx) => {
                    const rowAmt = Number(tRow.grandTotalKgs || 0) * Number(tRow.pricePerKg || 0);
                    return (
                      <tr key={idx}>
                        <td className="p-3 font-bold text-slate-900">
                          Tank {tRow.tank_name}
                        </td>
                        <td className="p-3 text-center font-extrabold text-blue-700 font-mono">
                          {tRow.finalCount} count
                        </td>
                        <td className="p-3 text-right font-bold font-mono">
                          {Number(tRow.grandTotalKgs).toFixed(2)} KG
                        </td>
                        <td className="p-3 text-right font-bold font-mono">
                          ₹{tRow.pricePerKg}
                        </td>
                        <td className="p-3 text-right font-black font-mono text-slate-900 text-sm">
                          ₹{Math.round(rowAmt).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="p-3">
                      <span className="font-bold block text-slate-900">
                        Fresh Shrimp (Full Harvest)
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Pond harvest weighment net output
                      </span>
                    </td>
                    <td className="p-3 text-center font-extrabold text-blue-700 font-mono">
                      {harvestEntry?.final_count || 60} count
                    </td>
                    <td className="p-3 text-right font-bold font-mono">
                      {totalKgs.toFixed(2)} KG
                    </td>
                    <td className="p-3 text-right font-bold font-mono">
                      ₹{pricePerKg.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-right font-black font-mono text-slate-900 text-sm">
                      ₹{totalAmount.toLocaleString('en-IN')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Separate Weighment Tables per Tank */}
          {showWeighment && (
            <div className="space-y-4">
              {tanksList.map((st) => {
                const rows = st.weightRows || [];
                const tankNetTotal = Number(st.grandTotalKgs) || 0;
                return (
                  <div
                    key={st.tank_name}
                    className="weighment-table-block rounded-xl border border-slate-200 overflow-hidden"
                    style={{ pageBreakInside: 'avoid', breakInside: 'avoid', display: 'block' }}
                  >
                    <h4 className="text-xs font-black text-slate-900 p-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                      <span>📦 Tank {st.tank_name} Weighment Output</span>
                      <span className="font-mono text-blue-700">{rows.length} Boxes</span>
                    </h4>
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-800 text-white font-extrabold text-[10px] uppercase">
                        <tr>
                          <th className="p-2.5">Box #</th>
                          <th className="p-2.5">Gross Weight (KG)</th>
                          <th className="p-2.5">Nets</th>
                          <th className="p-2.5 text-right">Net Weight (KG)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono text-slate-800 bg-white">
                        {rows.length > 0 ? (
                          rows.map((r, idx) => {
                            const gross = Number(r.kgs) || 0;
                            const nets = Number(r.nets) || 2;
                            const netTare = nets * (Number(st.netWeightPerNet) || 0);
                            const netWt = Math.max(0, gross - netTare);
                            return (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="p-2.5 font-bold text-slate-900"># {idx + 1}</td>
                                <td className="p-2.5">{gross.toFixed(2)} KG</td>
                                <td className="p-2.5">{nets} nets</td>
                                <td className="p-2.5 text-right font-extrabold text-blue-700">{netWt.toFixed(3)} KG</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={4} className="p-3 text-center text-slate-400 font-sans">
                              No weighment rows recorded for Tank {st.tank_name}.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot className="bg-slate-100 font-black text-xs text-slate-900 border-t border-slate-300">
                        <tr>
                          <td colSpan={3} className="p-2.5 uppercase">Tank {st.tank_name} Total Net:</td>
                          <td className="p-2.5 text-right font-mono text-blue-700">{tankNetTotal.toFixed(3)} KG</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          {/* Total Bill / Financial Status */}
          {isMiddleHarvest ? (
            /* Middle Harvest: Prominent Total Bill Amount */
            <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-3">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <span className="text-slate-300 font-black uppercase text-xs">Total Bill Amount:</span>
                <span className="font-mono font-black text-2xl text-emerald-400">
                  ₹{totalAmount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase">Paid Amount:</span>
                <span className="font-mono font-extrabold text-emerald-300">
                  ₹{paidAmount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs pt-1">
                <span className="text-amber-400 font-bold uppercase">Balance Due:</span>
                <span className="font-mono font-black text-lg text-amber-400">
                  ₹{balanceAmount.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          ) : (
            /* Full Harvest: Expenses & Financial Status */
            <div className="grid grid-cols-2 gap-6 items-start">
              <div className="space-y-2 text-xs">
                <h4 className="font-extrabold text-slate-700 uppercase tracking-wider text-[10px]">
                  Expense Deductions
                </h4>
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <span className="text-slate-600">Grader & Transport Batas:</span>
                  <span className="font-mono font-bold text-slate-900">₹{graderExpense.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <span className="text-slate-600">Labour Wages Total:</span>
                  <span className="font-mono font-bold text-slate-900">₹{labourExpense.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between font-extrabold text-slate-900 pt-1">
                  <span>Estimated Net Profit:</span>
                  <span className="font-mono text-emerald-700">₹{netProfit.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-bold uppercase text-[10px]">Bill Total:</span>
                  <span className="font-mono font-black text-base text-white">
                    ₹{totalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-bold uppercase text-[10px]">Paid Amount:</span>
                  <span className="font-mono font-extrabold text-emerald-400">
                    ₹{paidAmount.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-800 pt-2">
                  <span className="text-amber-400 font-bold uppercase text-[10px]">Balance Due:</span>
                  <span className="font-mono font-black text-lg text-amber-400">
                    ₹{balanceAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Signatures (3 Signatures) */}
          <div className="pt-8 border-t border-slate-200 grid grid-cols-3 gap-4 text-center text-xs text-slate-600">
            <div>
              <div className="h-14 flex items-end justify-center border-b border-slate-300 mb-1 pb-1">
                <img src={finalSupervisorSig} alt="Harvest Incharge Sign" className="max-h-12 object-contain" />
              </div>
              <span className="font-bold text-slate-900 block">
                {isMiddleHarvest ? 'Middle Harvest Incharge Sign' : 'Harvest Incharge Sign'}
              </span>
              <p className="text-[10px] text-slate-500">{supervisorName || 'Harvest Incharge'}</p>
            </div>

            <div>
              <div className="h-14 flex items-end justify-center border-b border-slate-300 mb-1 pb-1">
                <img src={finalGraderSig} alt="Grader / Contractor Sign" className="max-h-12 object-contain" />
              </div>
              <span className="font-bold text-slate-900 block">Grader / Contractor Sign</span>
              <p className="text-[10px] text-slate-500">{graderName || 'Grader / Contractor'}</p>
            </div>

            <div>
              <div className="h-14 flex items-end justify-center border-b border-slate-300 mb-1 pb-1">
                <img src={finalManagerSig} alt="Authorized Manager Sign" className="max-h-12 object-contain opacity-90" />
              </div>
              <span className="font-bold text-slate-900 block">Authorized Manager Sign</span>
              <p className="text-[10px] text-slate-500">Official Seal &amp; Stamp</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

