import { useEffect, useState, useMemo } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { useSite } from '../../../hooks/useSite';

export default function ChekkaApplication({ stockingDate, numberOfDays, kgPerDay }) {
  const { siteId } = useSite();
  const [tanks, setTanks] = useState([]);
  const [editableAcres, setEditableAcres] = useState({}); // { [tankId]: acres }

  useEffect(() => {
    if (!siteId) return;
    supabase
      .from(TABLES.tanks)
      .select('*')
      .eq('site_id', siteId)
      .order('name')
      .then(({ data }) => setTanks(data ?? []));
  }, [siteId]);

  // Format date helper: DD/MM/YYYY
  function formatDateDDMMYYYY(dateObj) {
    const d = String(dateObj.getDate()).padStart(2, '0');
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const y = dateObj.getFullYear();
    return `${d}/${m}/${y}`;
  }

  // Sample acreage map if area_acres is missing or 0
  const tankAcresMap = useMemo(() => {
    const map = {};
    const sampleAcres = [1.20, 0.90, 1.35, 1.10, 1.50, 0.85];
    tanks.forEach((t, i) => {
      const savedVal = editableAcres[t.id];
      map[t.id] = savedVal !== undefined ? Number(savedVal) : (Number(t.area_acres) > 0 ? Number(t.area_acres) : sampleAcres[i % sampleAcres.length]);
    });
    return map;
  }, [tanks, editableAcres]);

  // Generate Chekka Chart Rows
  const chekkaRows = useMemo(() => {
    const daysN = Number(numberOfDays) || 1;
    const startDate = stockingDate ? new Date(stockingDate) : new Date();
    const rows = [];
    const kg = Number(kgPerDay) || 0;

    for (let i = 0; i < daysN; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = formatDateDDMMYYYY(d);

      const tankCalculations = {};
      tanks.forEach((t) => {
        const acres = tankAcresMap[t.id] || 1.0;
        tankCalculations[t.id] = (acres * kg).toFixed(2);
      });

      rows.push({
        day: i + 1,
        date: dateStr,
        calculations: tankCalculations,
      });
    }
    return rows;
  }, [numberOfDays, stockingDate, kgPerDay, tanks, tankAcresMap]);

  return (
    <div className="card p-6 space-y-4 border shadow-sm" style={{ borderColor: '#059669', background: '#F0FDF4' }}>
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-xl flex items-center gap-2 text-[#065F46]">
          <span>🌿</span> Chekka Application
        </h3>
        <span className="text-xs px-3 py-1 rounded-full font-bold bg-[#D1FAE5] text-[#065F46]">
          Emerald Theme (Contrasting)
        </span>
      </div>

      <p className="text-xs text-[#065F46]">
        Formula: <code>Acres × KG Per Day ({kgPerDay || 0} Kg)</code>. Dates formatted as <code>DD/MM/YYYY</code>.
      </p>

      {/* Chekka Chart Table */}
      <div className="overflow-x-auto scroll-thin border rounded-[12px] shadow-sm bg-white" style={{ borderColor: '#6EE7B7' }}>
        <table className="w-full text-xs text-left">
          <thead>
            <tr style={{ background: '#065F46', color: '#FFFFFF' }}>
              <th className="p-3 font-bold" colSpan={2}>
                Row 1: Tanks →<br />
                <span className="font-normal text-[#A7F3D0]">Row 2: Acres (Sample/Editable) →</span>
              </th>
              {tanks.map((t) => (
                <th key={t.id} className="p-3 font-bold text-center border-l min-w-[110px]" style={{ borderColor: 'rgba(255,255,255,0.2)' }}>
                  <div>{t.name}</div>
                  <div className="mt-1">
                    <input
                      type="number"
                      step="0.01"
                      className="w-16 py-0.5 px-1 text-[11px] text-center font-bold text-[#065F46] rounded bg-white"
                      value={tankAcresMap[t.id] ?? ''}
                      onChange={(e) => setEditableAcres({ ...editableAcres, [t.id]: e.target.value })}
                    /> <span className="text-[10px] text-[#A7F3D0]">Ac</span>
                  </div>
                </th>
              ))}
            </tr>
            <tr className="bg-[#047857] text-white border-b text-[11px]" style={{ borderColor: '#059669' }}>
              <th className="p-2.5 font-bold w-16">Day</th>
              <th className="p-2.5 font-bold w-32">Date (DD/MM/YYYY)</th>
              {tanks.map((t) => (
                <th key={t.id} className="p-2.5 font-semibold text-center border-l" style={{ borderColor: 'rgba(255,255,255,0.2)' }}>
                  Calculated Kg
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chekkaRows.map((r) => (
              <tr key={r.day} className="border-b last:border-0 hover:bg-[#ECFDF5] transition" style={{ borderColor: '#E5E7EB' }}>
                <td className="p-2.5 font-bold text-text-muted">{r.day}</td>
                <td className="p-2.5 font-bold">{r.date}</td>
                {tanks.map((t) => (
                  <td key={t.id} className="p-2.5 font-extrabold text-center border-l text-[#047857]" style={{ borderColor: '#E5E7EB' }}>
                    {r.calculations[t.id]} Kg
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
