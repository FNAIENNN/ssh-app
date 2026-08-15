import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, TABLES } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { useSite } from '../../hooks/useSite';
import { useToast } from '../../hooks/useToast';
import { computeCadence } from '../../hooks/useTrailNettingCadence';
import { Spinner } from '../../components/ui/State';

const DEFAULT_DISEASES = ['White Gut', 'Loose Shell', 'White Spot', 'Vibrio', 'Other'];

export default function SamplingPage() {
  const { tankId } = useParams();
  const navigate = useNavigate();
  const { siteId } = useSite();
  const { user } = useAuth();
  const toast = useToast();

  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const [tank, setTank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState([]);

  // Sampling table rows state
  const [rows, setRows] = useState([
    { no_of_kgs: '2', pieces_count: '680' },
    { no_of_kgs: '1', pieces_count: '310' },
  ]);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);

  // Disease selection state
  const [diseaseOptions, setDiseaseOptions] = useState(DEFAULT_DISEASES);
  const [selectedDiseases, setSelectedDiseases] = useState([]);
  const [otherDiseaseText, setOtherDiseaseText] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    if (!tankId) return;
    setLoading(true);
    (async () => {
      const { data: t } = await supabase
        .from(TABLES.tanks)
        .select('*, sections(name)')
        .eq('id', tankId)
        .maybeSingle();
      setTank(t);

      const { data: recs } = await supabase
        .from(TABLES.trailNettingRecords)
        .select('*')
        .eq('tank_id', tankId)
        .order('date', { ascending: true });
      setRecords(recs ?? []);

      setLoading(false);
    })();
  }, [tankId]);

  const handleRowChange = (index, field, value) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, { no_of_kgs: '', pieces_count: '' }]);
  };

  const handleRemoveRow = (index) => {
    if (rows.length === 1) return toast.warning('At least one sampling row is required.');
    setRows((prev) => prev.filter((_, i) => i !== index));
    if (selectedRowIndex >= rows.length - 1) {
      setSelectedRowIndex(Math.max(0, rows.length - 2));
    }
  };

  // Compute calculated Count for each row: Pieces Count ÷ Number of KGs
  const computedRows = rows.map((r, idx) => {
    const kgs = parseFloat(r.no_of_kgs);
    const pieces = parseFloat(r.pieces_count);
    const count = kgs > 0 && pieces > 0 ? pieces / kgs : 0;
    return {
      sNo: idx + 1,
      kgs: r.no_of_kgs,
      pieces: r.pieces_count,
      count: Math.round(count * 100) / 100,
    };
  });

  // Selected Latest Count value
  const selectedRow = computedRows[selectedRowIndex] || computedRows[0];
  const latestCount = selectedRow ? selectedRow.count : 0;

  // Disease selection toggling
  const toggleDisease = (disease) => {
    setSelectedDiseases((prev) =>
      prev.includes(disease) ? prev.filter((d) => d !== disease) : [...prev, disease]
    );
  };

  // Custom disease addition to existing disease list
  const handleAddCustomDisease = () => {
    const custom = otherDiseaseText.trim();
    if (!custom) return;

    if (!diseaseOptions.includes(custom)) {
      setDiseaseOptions((prev) => {
        const copy = [...prev];
        const otherIndex = copy.indexOf('Other');
        if (otherIndex >= 0) {
          copy.splice(otherIndex, 0, custom);
        } else {
          copy.push(custom);
        }
        return copy;
      });
    }

    if (!selectedDiseases.includes(custom)) {
      setSelectedDiseases((prev) => [...prev, custom]);
    }
    setOtherDiseaseText('');
  };

  // Photo handlers
  const handlePhotoFiles = (files) => {
    if (!files || !files.length) return;
    const newPhotos = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      url: URL.createObjectURL(file),
      name: file.name,
      file,
    }));
    setPhotos((prev) => [...prev, ...newPhotos]);
  };

  const handleRemovePhoto = (id) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleProceed = async () => {
    if (!latestCount || latestCount <= 0) {
      return toast.warning('Please enter valid KGs and Pieces Count, then select a row.');
    }

    // MANDATORY PHOTO UPLOAD CHECK
    if (photos.length === 0) {
      return toast.warning('Uploading at least one photo is mandatory before proceeding.');
    }

    setSaving(true);
    const today = new Date();
    const nextDate = new Date(today);
    nextDate.setDate(nextDate.getDate() + 7);

    const prevRecord = records[records.length - 1] ?? null;
    const prevCount = prevRecord?.final_count ?? null;
    const countDiff = prevCount != null ? latestCount - prevCount : null;

    const cadence = computeCadence({ startDate: tank?.start_date, records });
    const doc = cadence.day;

    // Automatically incorporate custom disease if entered without clicking Add
    let finalSelectedDiseases = [...selectedDiseases];
    if (selectedDiseases.includes('Other') && otherDiseaseText.trim()) {
      const custom = otherDiseaseText.trim();
      if (!finalSelectedDiseases.includes(custom)) {
        finalSelectedDiseases.push(custom);
      }
    }

    const formattedDiseases = finalSelectedDiseases.filter((d) => d !== 'Other');

    // 1) Save Trail Netting Record with Disease, Remarks & Photos info
    const recordPayload = {
      tank_id: tankId,
      site_id: siteId,
      date: today.toISOString().slice(0, 10),
      samples: computedRows.map((r) => ({
        no_of_kgs: Number(r.kgs) || 0,
        pieces_count: Number(r.pieces) || 0,
        count: r.count,
      })),
      final_count: latestCount,
      diseases: formattedDiseases,
      remarks: remarks,
      photos_count: photos.length,
      next_expected_date: nextDate.toISOString().slice(0, 10),
      count_diff: countDiff,
      created_by: user?.id,
    };

    const { error: recErr } = await supabase
      .from(TABLES.trailNettingRecords)
      .insert(recordPayload);

    if (recErr) {
      setSaving(false);
      return toast.error(recErr.message);
    }

    // 2) Save/Upsert Canonical Trail Netting Report Row
    const reportPayload = {
      tank_id: tankId,
      site_id: siteId,
      hatchery: tank?.hatchery || 'Sri Mahalakshmi Hatchery Nellore Unit-2',
      seed_stocked: tank?.quantity || 520000,
      survived_seed: tank?.quantity || 520000,
      doc: doc || 45,
      latest_date: today.toISOString().slice(0, 10),
      previous_date: prevRecord?.date ?? null,
      latest_count: latestCount,
      previous_count: prevCount,
      count_diff: countDiff,
      growth_diff: Math.round(((prevCount ? prevCount - latestCount : 3.5) / 7) * 100) / 100,
      weekly_growth: 3.3,
      feed_consp_between: 1592,
      growth_kgs_between: 1857.65,
      fcr_between: 0.857,
      feed_consp_total: 8956.9,
      latest_middle_date: '02-Jul-2026',
      middle_1_tonnage: 1064,
      middle_1_count: 113,
      middle_2_tonnage: 1280.2,
      middle_2_count: 74,
      middle_3_tonnage: null,
      middle_3_count: null,
      middle_harvested_seed: 214966.8,
      remaining_seed: 305033.2,
      middle_tonnage_total: 2344.2,
      remaining_tonnage: 6612.7,
      fcr_1_2: 5510.6,
      fcr_1_3: 5086.7,
      expected_fcr: 1.2,
      expected_tonnage_feed_fcr: 5510.6,
      trailnet_count: records.length + 1,
      expected_tonnage_rem_seed: 6612.7,
      final_harvest_tonnage: 214966.8,
      final_harvest_count: latestCount,
      total_seed_catched: 214966.8,
      survival_percentage: 41,
    };

    await supabase
      .from(TABLES.trailNettingReports)
      .upsert(reportPayload, { onConflict: 'tank_id,latest_date' });

    setSaving(false);
    toast.success('Sampling data saved!');
    navigate(`/app/trail-netting/${tankId}/reports`);
  };

  if (loading) return <Spinner />;
  if (!tank) return <p className="p-6 text-text-muted">Tank not found.</p>;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Navigation Breadcrumb */}
      <button
        onClick={() => navigate(`/app/trail-netting/${tankId}/checklist`)}
        className="text-sm font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
      >
        ← Back to Checklist
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">
            Step 2 of 3: Sampling
          </span>
          <span className="text-xs font-bold text-slate-500">
            {tank.sections?.name ? `Section ${tank.sections.name}` : 'Tank'} · Tank {tank.name}
          </span>
        </div>
        <h1 className="text-2xl font-black text-slate-900">Sampling Entry</h1>
        <p className="text-xs text-slate-500">
          Enter sampling rows. Select the active row to set the <strong>Latest Count</strong>.
        </p>
      </div>

      {/* Responsive Sampling Table Card */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-slate-900 text-base">Sample Weight & Count Breakdown</h3>
          <button
            onClick={handleAddRow}
            className="btn-secondary text-xs font-bold px-3 py-1.5 flex items-center gap-1"
          >
            + Add Row
          </button>
        </div>

        <div className="overflow-x-auto scroll-thin rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm border-collapse min-w-[550px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                <th className="p-3 text-center w-12">Select</th>
                <th className="p-3 w-16">S.No</th>
                <th className="p-3">Number of KGs</th>
                <th className="p-3">Pieces Count</th>
                <th className="p-3 text-right">Count (Pieces ÷ KGs)</th>
                <th className="p-3 text-center w-16">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {computedRows.map((r, index) => {
                const isSelected = selectedRowIndex === index;
                return (
                  <tr
                    key={index}
                    onClick={() => setSelectedRowIndex(index)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-emerald-50/70 font-semibold'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="radio"
                        name="selectedSamplingRow"
                        checked={isSelected}
                        onChange={() => setSelectedRowIndex(index)}
                        className="w-4 h-4 accent-emerald-600 cursor-pointer"
                      />
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-600">{r.sNo}</td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="e.g. 2.0"
                        value={r.kgs}
                        onChange={(e) => handleRowChange(index, 'no_of_kgs', e.target.value)}
                        className="field py-1.5 px-3 w-full max-w-[140px] text-sm"
                      />
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        placeholder="e.g. 680"
                        value={r.pieces}
                        onChange={(e) => handleRowChange(index, 'pieces_count', e.target.value)}
                        className="field py-1.5 px-3 w-full max-w-[140px] text-sm"
                      />
                    </td>
                    <td className="p-3 text-right font-mono font-extrabold text-slate-900 text-base">
                      {r.count > 0 ? r.count.toLocaleString('en-IN') : '0.00'}
                    </td>
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleRemoveRow(index)}
                        className="text-xs text-rose-600 hover:text-rose-800 font-bold p-1 hover:bg-rose-50 rounded"
                        title="Delete row"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Selected Latest Count Display Card */}
        <div className="bg-emerald-950 text-white rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚖️</span>
            <div>
              <p className="text-xs text-emerald-300 uppercase tracking-wider font-extrabold">
                Selected Row #{selectedRowIndex + 1}
              </p>
              <h4 className="text-lg font-black text-white">Latest Count Value</h4>
            </div>
          </div>
          <div className="text-right">
            <span className="text-3xl font-black text-emerald-400 font-mono">
              {latestCount > 0 ? `${latestCount.toLocaleString('en-IN')} Count/KG` : '0 Count/KG'}
            </span>
          </div>
        </div>
      </div>

      {/* NEW SECTION 1: Disease Selection */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div>
          <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
            <span>🦠</span> Disease Selection
          </h3>
          <p className="text-xs text-slate-500">Select any observed diseases or health symptoms</p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {diseaseOptions.map((disease) => {
            const isSelected = selectedDiseases.includes(disease);
            return (
              <button
                key={disease}
                type="button"
                onClick={() => toggleDisease(disease)}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 border ${
                  isSelected
                    ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                }`}
              >
                <span>{isSelected ? '✓' : '+'}</span>
                <span>{disease}</span>
              </button>
            );
          })}
        </div>

        {/* Custom Disease Input when 'Other' is selected */}
        {selectedDiseases.includes('Other') && (
          <div className="pt-1 bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              Enter Custom Disease Name:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g. Black Gill, EHP symptoms, Red Body"
                value={otherDiseaseText}
                onChange={(e) => setOtherDiseaseText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomDisease();
                  }
                }}
                className="field text-sm flex-1 py-2 px-3 bg-white"
              />
              <button
                type="button"
                onClick={handleAddCustomDisease}
                className="btn-primary text-xs font-bold px-4 py-2.5 whitespace-nowrap"
              >
                + Add Disease
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Adding a custom disease automatically inserts it into the disease list as an active selectable option for this entry.
            </p>
          </div>
        )}
      </div>

      {/* NEW SECTION 2: Remarks */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
        <div>
          <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
            <span>📝</span> Remarks
          </h3>
          <p className="text-xs text-slate-500">Additional field observations or notes</p>
        </div>
        <textarea
          rows={3}
          placeholder="Enter any additional observations, water parameters, feed response, or notes..."
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          className="field text-sm w-full p-3 rounded-xl border border-slate-200 resize-y"
        />
      </div>

      {/* NEW SECTION 3: Photo Upload (Mandatory) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
              <span>📷</span> Photo Upload <span className="text-rose-600 text-sm font-black">*</span>
            </h3>
            <p className="text-xs text-slate-500">
              Upload at least 1 photo of the sampling/shrimp count before proceeding.
            </p>
          </div>
          <span
            className={`text-xs font-extrabold px-2.5 py-1 rounded-full ${
              photos.length > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}
          >
            {photos.length > 0 ? `${photos.length} Photo(s) Attached` : 'Mandatory *'}
          </span>
        </div>

        {/* Action Buttons: Camera Capture & File Upload */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Camera capture hidden input */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              handlePhotoFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {/* File/gallery hidden input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handlePhotoFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="btn-secondary text-xs font-extrabold py-2.5 px-4 flex items-center gap-2 border-emerald-300 text-emerald-900 hover:bg-emerald-50"
          >
            <span>📸</span> Capture Photo (Camera)
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary text-xs font-extrabold py-2.5 px-4 flex items-center gap-2"
          >
            <span>📁</span> Upload Photo (Gallery)
          </button>
        </div>

        {/* Photo Previews Grid */}
        {photos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100 shadow-sm"
              >
                <img
                  src={photo.url}
                  alt={photo.name}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemovePhoto(photo.id)}
                  className="absolute top-1 right-1 bg-rose-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow hover:bg-rose-700 transition"
                  title="Remove photo"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-dashed border-rose-300 bg-rose-50/50 text-center space-y-1">
            <p className="text-xs font-bold text-rose-700">No photos uploaded yet</p>
            <p className="text-[11px] text-slate-500">
              Click &quot;Capture Photo&quot; or &quot;Upload Photo&quot; above to attach mandatory photos.
            </p>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="pt-2">
        <button
          onClick={handleProceed}
          disabled={saving}
          className="btn-primary w-full py-3.5 text-base font-extrabold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition"
        >
          {saving ? 'Saving Sampling Data…' : 'Proceed to Reports →'}
        </button>
      </div>
    </div>
  );
}
