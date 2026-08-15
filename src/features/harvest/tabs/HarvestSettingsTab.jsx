import { useState, useEffect } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { useToast } from '../../../hooks/useToast';

/**
 * HarvestSettingsTab — Master data management for Graders, Labour Suppliers & Tanks.
 */
export default function HarvestSettingsTab({ siteId }) {
  const toast = useToast();

  const [activeSection, setActiveSection] = useState('graders'); // 'graders' | 'labour' | 'tanks'
  const [graders, setGraders] = useState([]);
  const [labourSuppliers, setLabourSuppliers] = useState([]);
  const [tanks, setTanks] = useState([]);

  // Form states
  const [graderForm, setGraderForm] = useState({ name: '', phone: '', vehicle_no: '', upi_id: '', driver_bata: 500, packing_bata: 1200 });
  const [labourForm, setLabourForm] = useState({ name: '', phone: '', address: '' });
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchMasterData = async () => {
    if (!siteId) return;
    const [{ data: gData }, { data: lData }, { data: tData }] = await Promise.all([
      supabase.from(TABLES.graders).select('*').eq('site_id', siteId),
      supabase.from(TABLES.labourSuppliers).select('*').eq('site_id', siteId),
      supabase.from(TABLES.tanks).select('*').eq('site_id', siteId),
    ]);

    setGraders(gData || []);
    setLabourSuppliers(lData || []);
    setTanks(tData || []);
  };

  useEffect(() => {
    fetchMasterData();
  }, [siteId]);

  const handleAddGrader = async (e) => {
    e.preventDefault();
    if (!graderForm.name || !graderForm.vehicle_no) {
      toast.error('Grader name and vehicle number are required');
      return;
    }

    const payload = {
      site_id: siteId,
      name: graderForm.name,
      phone: graderForm.phone,
      vehicle_no: graderForm.vehicle_no,
      upi_id: graderForm.upi_id,
      default_driver_bata: Number(graderForm.driver_bata) || 500,
      default_packing_bata: Number(graderForm.packing_bata) || 1200,
    };

    const { error } = await supabase.from(TABLES.graders).insert(payload);
    if (error) return toast.error(error.message);

    toast.success('Grader registered successfully');
    setGraderForm({ name: '', phone: '', vehicle_no: '', upi_id: '', driver_bata: 500, packing_bata: 1200 });
    setShowAddModal(false);
    fetchMasterData();
  };

  const handleAddLabourSupplier = async (e) => {
    e.preventDefault();
    if (!labourForm.name || !labourForm.phone) {
      toast.error('Supplier name and phone are required');
      return;
    }

    const payload = {
      site_id: siteId,
      name: labourForm.name,
      phone: labourForm.phone,
      address: labourForm.address,
    };

    const { error } = await supabase.from(TABLES.labourSuppliers).insert(payload);
    if (error) return toast.error(error.message);

    toast.success('Labour Supplier registered successfully');
    setLabourForm({ name: '', phone: '', address: '' });
    setShowAddModal(false);
    fetchMasterData();
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation bar */}
      <div className="rounded-2xl p-4 bg-white border border-slate-200 shadow-card flex items-center justify-between">
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          {[
            { id: 'graders', label: '🚚 Graders & Vehicles' },
            { id: 'labour', label: '👷 Labour Suppliers' },
            { id: 'tanks', label: '🌊 Tanks Master' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeSection === tab.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeSection !== 'tanks' && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="btn-primary text-xs font-bold flex items-center gap-1.5"
          >
            ➕ Add {activeSection === 'graders' ? 'Grader' : 'Labour Supplier'}
          </button>
        )}
      </div>

      {/* SECTION 1: Graders */}
      {activeSection === 'graders' && (
        <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
          <h3 className="text-base font-extrabold text-slate-900">Registered Graders & Transport Contractors</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {graders.map((g) => (
              <div key={g.id} className="rounded-2xl p-4 border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-slate-900 text-sm">{g.name}</h4>
                  <span className="font-mono font-bold text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md">
                    {g.vehicle_no}
                  </span>
                </div>
                <p className="text-xs text-slate-600">Phone: {g.phone || 'N/A'}</p>
                <p className="text-xs text-slate-600">UPI: {g.upi_id || 'N/A'}</p>
                <div className="pt-2 border-t border-slate-200 flex justify-between text-[11px] font-bold text-slate-700">
                  <span>Driver Bata: ₹{g.default_driver_bata || 500}</span>
                  <span>Packing Bata: ₹{g.default_packing_bata || 1200}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 2: Labour Suppliers */}
      {activeSection === 'labour' && (
        <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
          <h3 className="text-base font-extrabold text-slate-900">Registered Labour Suppliers</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {labourSuppliers.map((l) => (
              <div key={l.id} className="rounded-2xl p-4 border border-slate-200 bg-slate-50 space-y-2">
                <h4 className="font-extrabold text-slate-900 text-sm">{l.name}</h4>
                <p className="text-xs text-slate-600">Phone: {l.phone || 'N/A'}</p>
                <p className="text-xs text-slate-500">Address: {l.address || 'N/A'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 3: Tanks Master */}
      {activeSection === 'tanks' && (
        <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
          <h3 className="text-base font-extrabold text-slate-900">Site Tanks Master Status</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {tanks.map((t) => (
              <div key={t.id} className="rounded-2xl p-4 border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-slate-900 text-base">Tank {t.name}</h4>
                  <span
                    className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase ${
                      Number(t.quantity) > 0 || t.seed_type
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {Number(t.quantity) > 0 || t.seed_type ? 'Running' : 'Empty'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">Area: {t.area_acres} Acres</p>
                <p className="text-xs text-slate-600">Stocked: {t.quantity ? t.quantity.toLocaleString('en-IN') : '0'} PL</p>
                <p className="text-xs text-slate-600">Hatchery: {t.hatchery || 'N/A'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900">
              Add New {activeSection === 'graders' ? 'Grader' : 'Labour Supplier'}
            </h3>

            {activeSection === 'graders' ? (
              <form onSubmit={handleAddGrader} className="space-y-3">
                <input
                  type="text"
                  placeholder="Grader Name *"
                  value={graderForm.name}
                  onChange={(e) => setGraderForm({ ...graderForm, name: e.target.value })}
                  className="field"
                />
                <input
                  type="text"
                  placeholder="Phone Number"
                  value={graderForm.phone}
                  onChange={(e) => setGraderForm({ ...graderForm, phone: e.target.value })}
                  className="field"
                />
                <input
                  type="text"
                  placeholder="Vehicle Number *"
                  value={graderForm.vehicle_no}
                  onChange={(e) => setGraderForm({ ...graderForm, vehicle_no: e.target.value })}
                  className="field font-mono font-bold"
                />
                <input
                  type="text"
                  placeholder="UPI / PhonePe ID"
                  value={graderForm.upi_id}
                  onChange={(e) => setGraderForm({ ...graderForm, upi_id: e.target.value })}
                  className="field"
                />
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary flex-1">
                    Save Grader
                  </button>
                  <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleAddLabourSupplier} className="space-y-3">
                <input
                  type="text"
                  placeholder="Supplier / Crew Name *"
                  value={labourForm.name}
                  onChange={(e) => setLabourForm({ ...labourForm, name: e.target.value })}
                  className="field"
                />
                <input
                  type="text"
                  placeholder="Contact Phone *"
                  value={labourForm.phone}
                  onChange={(e) => setLabourForm({ ...labourForm, phone: e.target.value })}
                  className="field"
                />
                <input
                  type="text"
                  placeholder="Address / Location"
                  value={labourForm.address}
                  onChange={(e) => setLabourForm({ ...labourForm, address: e.target.value })}
                  className="field"
                />
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary flex-1">
                    Save Supplier
                  </button>
                  <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
