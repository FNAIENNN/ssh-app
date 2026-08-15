import { useRef } from 'react';

/**
 * HarvestBillModal — Professional printable invoice bill layout for harvest entries.
 */
export default function HarvestBillModal({ bill, harvestEntry, tank, onClose }) {
  const printRef = useRef(null);

  if (!bill) return null;

  const handlePrint = () => {
    window.print();
  };

  const totalKgs = Number(harvestEntry?.total_kgs || 0);
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

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden my-8">
        {/* Modal Action Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧾</span>
            <span className="font-extrabold text-sm tracking-wide">
              Harvest Bill Preview — #{bill.bill_number}
            </span>
          </div>

          <div className="flex items-center gap-2">
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
                  <h1 className="text-xl font-black text-slate-900 tracking-tight">
                    SHRIMP HARVEST MANAGEMENT
                  </h1>
                  <p className="text-xs text-slate-500 font-semibold">Aquaculture ERP Platform</p>
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
              <p className="text-xs text-slate-500 font-medium">
                Type:{' '}
                <span className="font-extrabold uppercase text-slate-800">
                  {bill.harvest_type || harvestEntry?.harvest_type || 'HARVEST'}
                </span>
              </p>
            </div>
          </div>

          {/* Tank & Buyer Details */}
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
                Buyer: {harvestEntry?.buyer_name || bill.buyer_name || 'Choice Trading Co.'}
              </p>
              <p className="text-slate-600">
                Factory: {harvestEntry?.factory_name || bill.factory_name || 'Apex Frozen Foods'}
              </p>
              <p className="text-slate-600">
                Grader Vehicle: {harvestEntry?.grader_details?.vehicle_no || 'AP 37 AB 5678'}
              </p>
              <p className="text-slate-600">
                Labour Team: {harvestEntry?.labour_details?.supplier_name || 'Raju Labour Crew'}
              </p>
            </div>
          </div>

          {/* Harvest Summary Table */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-extrabold">
                  <th className="p-3">Item Description</th>
                  <th className="p-3 text-center">Harvest Count</th>
                  <th className="p-3 text-right">Net KGs</th>
                  <th className="p-3 text-right">Rate / KG</th>
                  <th className="p-3 text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                <tr>
                  <td className="p-3">
                    <span className="font-bold block text-slate-900">
                      Fresh Shrimp ({harvestEntry?.harvest_type === 'middle' ? 'Middle Harvest' : 'Full Harvest'})
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
              </tbody>
            </table>
          </div>

          {/* Expenses Breakdown */}
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

            {/* Financial Status */}
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

          {/* Signatures */}
          <div className="pt-8 border-t border-slate-200 grid grid-cols-3 gap-4 text-center text-xs text-slate-500">
            <div>
              <div className="h-10 border-b border-slate-300 mb-1"></div>
              <span className="font-bold">Harvest Incharge</span>
            </div>

            <div>
              <div className="h-10 border-b border-slate-300 mb-1"></div>
              <span className="font-bold">Grader / Contractor</span>
            </div>

            <div>
              <div className="h-10 border-b border-slate-300 mb-1"></div>
              <span className="font-bold">Authorized Manager</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
