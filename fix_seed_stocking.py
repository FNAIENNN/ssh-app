import re

with open('src/features/seed/payments/seedStocking/SeedStocking.jsx', 'r') as f:
    content = f.read()

# 1. Update handleStep1Next and handleStep2Next to take vehicleId
old_handleStep1 = """  async function handleStep1Next(data) {
    if (!selectedVehicleId) return toast.error('Please select a vehicle first.');
    const vehicleData = { ...data };
    const newData = { ...(step1Data || {}), [selectedVehicleId]: vehicleData };
    setStep1Data(newData);"""

new_handleStep1 = """  async function handleStep1Next(vehicleId, data) {
    const vehicleData = { ...data };
    const newData = { ...(step1Data || {}), [vehicleId]: vehicleData };
    setStep1Data(newData);"""

content = content.replace(old_handleStep1, new_handleStep1)

old_handleStep2 = """  async function handleStep2Next(data) {
    if (!selectedVehicleId) return toast.error('Please select a vehicle first.');
    const vehicleData = { ...data };
    const newData = { ...(step2Data || {}), [selectedVehicleId]: vehicleData };
    setStep2Data(newData);"""

new_handleStep2 = """  async function handleStep2Next(vehicleId, data) {
    const vehicleData = { ...data };
    const newData = { ...(step2Data || {}), [vehicleId]: vehicleData };
    setStep2Data(newData);"""

content = content.replace(old_handleStep2, new_handleStep2)

# 2. Add common supervisor state
state_search = "const [step2Data, setStep2Data] = useState(() => initialData?.stocking_status_data || null);"
state_replace = """const [step2Data, setStep2Data] = useState(() => initialData?.stocking_status_data || null);
  const [commonSupervisorName, setCommonSupervisorName] = useState(() => initialData?.stocking_status_data?.supervisorName || '');
  const [commonSupervisorPhone, setCommonSupervisorPhone] = useState(() => initialData?.stocking_status_data?.supervisorPhone || '');
  const [commonSupervisorSignature, setCommonSupervisorSignature] = useState(() => initialData?.stocking_status_data?.supervisorSignature || null);
  const [isSupervisorSaved, setIsSupervisorSaved] = useState(() => !!initialData?.stocking_status_data?.supervisorSignature);"""
content = content.replace(state_search, state_replace)

# We also need to import SignaturePad if it's not imported. Let's check imports.
# If SignaturePad is already imported in OutsideWorkersStep3, we can just use it.
if "import SignaturePad" not in content:
    content = content.replace(
        "import OutsideWorkersStep3 from './OutsideWorkersStep3';",
        "import OutsideWorkersStep3 from './OutsideWorkersStep3';\nimport SignaturePad from './SignaturePad';"
    )

# 3. Add handleSupervisorSave
handle_sup_logic = """  async function handleSupervisorSave() {
    if (!commonSupervisorName.trim() || !commonSupervisorSignature) {
      return toast.error("Please provide Supervisor Name and Signature.");
    }
    setIsSupervisorSaved(true);
    if (activeOrder?.id) {
      await autosaveBillStep(
        activeOrder.id,
        'stocking_status_data',
        { ...(step2Data || {}), supervisorName: commonSupervisorName, supervisorPhone: commonSupervisorPhone, supervisorSignature: commonSupervisorSignature }
      );
      toast.success('Supervisor details saved.');
    }
  }"""
# Inject it right after handleStep2Next
idx = content.find("async function handleStep2Next")
idx2 = content.find("async function handleStep3Next", idx)
content = content[:idx2] + handle_sup_logic + "\n\n" + content[idx2:]

# 4. Replace JSX for step 1
# Remove the Vehicle Selector and replace the component render
old_step1_jsx = """          {/* Step 1 Vehicle Selector */}
          {seedMode !== 'packing' && step === 1 && activeOrder && (
            <div className="card p-4 shadow-sm border" style={{ borderColor: 'var(--color-border)' }}>
              <h3 className="font-extrabold text-sm text-primary mb-2">1. Select Vehicle for Van Plan</h3>
              {loadingVehicles ? (
                <p className="text-xs text-text-muted mt-2">Loading vehicles…</p>
              ) : vehicles.length === 0 ? (
                <div className="mt-2 p-3 rounded bg-red-50 text-red-700 text-xs font-bold border border-red-200">
                  No booked vehicles available. Please complete Vehicle Booking first.
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <select
                    className="field text-sm font-extrabold"
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                  >
                    <option value="" disabled>[ Select Booked Vehicle ▼ ]</option>
                    {vehicles.map((v, i) => (
                      <option key={v.id} value={v.id}>
                        Vehicle {i + 1} — {v.vehicle_no || 'No Reg'} — {v.driver_name || 'No Driver'}
                      </option>
                    ))}
                  </select>
                  {!selectedVehicleId && (
                    <p className="text-amber-600 text-[11px] font-bold">⚠️ Please select a vehicle before continuing.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Render Step 1: Seed Van Plan */}
          {seedMode !== 'packing' && step === 1 && activeOrder && (
            selectedVehicleId ? (
              <SeedVanPlanStep1
                key={selectedVehicleId}
                selectedVehicle={vehicles.find(v => v.id === selectedVehicleId)}
                isSaved={!!step1Data?.[selectedVehicleId]}
                initialVanData={getVehicleData(step1Data, selectedVehicleId)}
                activeOrder={activeOrder}
                siteId={siteId}
                onNext={handleStep1Next}
                onContinue={() => setStep(2)}
                onBack={() => setSeedMode('vehicle-payments')}
                onNewTankAdded={addNewlyAddedTank}
              />
            ) : (
              <div className="card p-8 text-center text-text-muted text-sm border-dashed border-2 opacity-60">
                Select a vehicle above to enter Seed Van Plan.
              </div>
            )
          )}"""

new_step1_jsx = """          {/* Render Step 1: Seed Van Plan */}
          {seedMode !== 'packing' && step === 1 && activeOrder && (
            <div className="space-y-6">
              <button onClick={() => setSeedMode('vehicle-payments')} className="text-sm font-bold text-text-muted hover:text-black flex items-center gap-1">← Back</button>
              {loadingVehicles ? (
                <p className="text-xs text-text-muted mt-2">Loading vehicles…</p>
              ) : vehicles.length === 0 ? (
                <div className="mt-2 p-3 rounded bg-red-50 text-red-700 text-xs font-bold border border-red-200">
                  No booked vehicles available. Please complete Vehicle Booking first.
                </div>
              ) : (
                vehicles.map((v) => (
                  <SeedVanPlanStep1
                    key={v.id}
                    selectedVehicle={v}
                    isSaved={!!step1Data?.[v.id]}
                    initialVanData={getVehicleData(step1Data, v.id)}
                    activeOrder={activeOrder}
                    siteId={siteId}
                    onNext={(data) => handleStep1Next(v.id, data)}
                    onNewTankAdded={addNewlyAddedTank}
                  />
                ))
              )}
              {vehicles.length > 0 && vehicles.every(v => !!step1Data?.[v.id]) && (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="btn-primary w-full text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2 mt-6"
                >
                  <span>Continue to Stocking Status</span>
                  <span>➔</span>
                </button>
              )}
            </div>
          )}"""

content = content.replace(old_step1_jsx, new_step1_jsx)

# 5. Replace JSX for step 2
old_step2_jsx = """          {/* Step 2 Vehicle Selector */}
          {seedMode !== 'packing' && step === 2 && activeOrder && (
            <div className="card p-4 shadow-sm border" style={{ borderColor: 'var(--color-border)' }}>
              <h3 className="font-extrabold text-sm text-primary mb-2">2. Select Vehicle for Stocking Status</h3>
              {loadingVehicles ? (
                <p className="text-xs text-text-muted mt-2">Loading vehicles…</p>
              ) : vehicles.filter((v) => !!step1Data?.[v.id]).length === 0 ? (
                <div className="mt-2 p-3 rounded bg-amber-50 text-amber-800 text-xs font-bold border border-amber-200">
                  No vehicles with a saved Seed Van Plan available. Please complete Seed Van Plan first.
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <select
                    className="field text-sm font-extrabold"
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                  >
                    <option value="" disabled>[ Select Vehicle ▼ ]</option>
                    {vehicles.map((v, i) => ({ v, i })).filter(({ v }) => !!step1Data?.[v.id]).map(({ v, i }) => (
                      <option key={v.id} value={v.id}>
                        Vehicle {i + 1} — {v.vehicle_no || 'No Reg'} — {v.driver_name || 'No Driver'}
                      </option>
                    ))}
                  </select>
                  {!selectedVehicleId && (
                    <p className="text-amber-600 text-[11px] font-bold">⚠️ Please select a vehicle before continuing.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Render Step 2: Stocking Status */}
          {seedMode !== 'packing' && step === 2 && (
            <div className="space-y-6">
              {selectedVehicleId ? (
                <StockingStatusStep2
                  key={selectedVehicleId}
                  selectedVehicle={vehicles.find(v => v.id === selectedVehicleId)}
                  isSaved={!!step2Data?.[selectedVehicleId]}
                  onContinue={() => setStep(3)}
                  step1Data={getVehicleData(step1Data, selectedVehicleId)}
                  activeOrder={activeOrder}
                  siteId={siteId}
                  initialStep2Data={getVehicleData(step2Data, selectedVehicleId)}
                  onNext={handleStep2Next}
                  onBack={() => setStep(1)}
                  onNewTankAdded={addNewlyAddedTank}
                />
              ) : (
                <div className="card p-8 text-center text-text-muted text-sm border-dashed border-2 opacity-60">
                  Select a vehicle above to enter Stocking Status.
                </div>
              )}
            </div>
          )}"""

new_step2_jsx = """          {/* Render Step 2: Stocking Status */}
          {seedMode !== 'packing' && step === 2 && (
            <div className="space-y-6">
              <button onClick={() => setStep(1)} className="text-sm font-bold text-text-muted hover:text-black flex items-center gap-1">← Back</button>
              {loadingVehicles ? (
                <p className="text-xs text-text-muted mt-2">Loading vehicles…</p>
              ) : vehicles.filter((v) => !!step1Data?.[v.id]).length === 0 ? (
                <div className="mt-2 p-3 rounded bg-amber-50 text-amber-800 text-xs font-bold border border-amber-200">
                  No vehicles with a saved Seed Van Plan available. Please complete Seed Van Plan first.
                </div>
              ) : (
                vehicles.map(v => (
                  <StockingStatusStep2
                    key={v.id}
                    selectedVehicle={v}
                    isSaved={!!step2Data?.[v.id]}
                    step1Data={getVehicleData(step1Data, v.id)}
                    activeOrder={activeOrder}
                    siteId={siteId}
                    initialStep2Data={getVehicleData(step2Data, v.id)}
                    onNext={(data) => handleStep2Next(v.id, data)}
                    onNewTankAdded={addNewlyAddedTank}
                  />
                ))
              )}

              {/* Common Supervisor Details (Appears only after all vehicles are saved) */}
              {vehicles.length > 0 && vehicles.every(v => !!step2Data?.[v.id]) && (
                <div className="card p-6 border shadow-sm mt-6">
                  <h4 className="font-extrabold text-lg text-primary border-b pb-2 mb-4">✍️ Common Supervisor Sign-off</h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="field-label">Supervisor Name *</label>
                        <input
                          type="text"
                          className="field text-sm"
                          value={commonSupervisorName}
                          onChange={(e) => setCommonSupervisorName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="field-label">Supervisor Phone (Optional)</label>
                        <input
                          type="text"
                          className="field text-sm"
                          value={commonSupervisorPhone}
                          onChange={(e) => setCommonSupervisorPhone(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="field-label">Supervisor Signature *</label>
                      <SignaturePad onSave={(sig) => setCommonSupervisorSignature(sig)} value={commonSupervisorSignature} />
                    </div>
                    <button
                      type="button"
                      onClick={handleSupervisorSave}
                      className="btn-success w-full py-3 font-extrabold mt-4"
                    >
                      Save Supervisor Details
                    </button>
                  </div>
                </div>
              )}

              {/* Continue to Outside Workers */}
              {isSupervisorSaved && (
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="btn-primary w-full text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2 mt-6"
                >
                  <span>Continue to Outside Workers</span>
                  <span>➔</span>
                </button>
              )}
            </div>
          )}"""

content = content.replace(old_step2_jsx, new_step2_jsx)

# Clean up initialSupervisorName logic in OutsideWorkersStep3 render to pull from common state
content = content.replace(
    "initialSupervisorName={step2Data?.[selectedVehicleId]?.supervisorName || Object.values(step2Data || {})[0]?.supervisorName || ''}",
    "initialSupervisorName={commonSupervisorName}"
)

with open('src/features/seed/payments/seedStocking/SeedStocking.jsx', 'w') as f:
    f.write(content)
