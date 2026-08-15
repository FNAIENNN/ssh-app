import re

with open('src/features/seed/payments/seedStocking/SeedStocking.jsx', 'r') as f:
    content = f.read()

# 1. Remove early return for packing
early_return_pattern = re.compile(
    r"  if \(seedMode === 'packing'\) \{.*?\n  \}\n\n",
    re.DOTALL
)
content = early_return_pattern.sub('', content)

# 2. Hide GLOBAL BACK BUTTON for packing
content = content.replace(
    "{/* GLOBAL BACK BUTTON (Always at the very top) */}\n      <div>",
    "{/* GLOBAL BACK BUTTON (Always at the very top) */}\n      {seedMode !== 'packing' && (\n        <div>"
)
# Close the div
content = content.replace(
    "          <span style={{ color: '#000' }}>Back</span>\n        </button>\n      </div>",
    "          <span style={{ color: '#000' }}>Back</span>\n        </button>\n      </div>\n      )}"
)

# 3. Replace Step Navigation Header
old_tabs = """          {step !== 'completed_summary' && (
            <div className="flex items-center gap-2">
              {[
                { id: 1, label: '1. Van Plan' },
                { id: 2, label: '2. Stocking Status' },
                { id: 3, label: '3. Outside Workers' },
              ].map((s) => {
                const active = step === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (s.id < step) setStep(s.id);
                    }}
                    className="px-3 py-1 rounded-full text-xs font-bold transition border"
                    style={{
                      background: active ? 'var(--color-primary)' : 'var(--color-surface)',
                      color: active ? '#fff' : 'var(--color-text-secondary)',
                      borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}"""

new_tabs = """          {step !== 'completed_summary' && (
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'packing', label: 'Packing' },
                { id: 'van-plan', label: 'Seed Van Plan' },
                { id: 'outside-workers', label: 'Outside Workers' },
              ].map((tab) => {
                let active = false;
                if (tab.id === 'packing' && seedMode === 'packing') active = true;
                else if (tab.id === 'van-plan' && seedMode !== 'packing' && step !== 3) active = true;
                else if (tab.id === 'outside-workers' && (seedMode === 'outside-workers' || step === 3) && seedMode !== 'packing') active = true;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      if (tab.id === 'packing') {
                        setSeedMode('packing');
                      } else if (tab.id === 'van-plan') {
                        setSeedMode('van-plan');
                        setStep(1);
                      } else if (tab.id === 'outside-workers') {
                        setSeedMode('outside-workers');
                        setStep(3);
                      }
                    }}
                    className="px-4 py-2 rounded-[8px] text-sm font-bold transition border"
                    style={{
                      background: active ? 'var(--color-primary)' : 'var(--color-surface)',
                      color: active ? '#fff' : 'var(--color-text-secondary)',
                      borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}"""

content = content.replace(old_tabs, new_tabs)

# 4. Modify Order Selection Picker condition
content = content.replace(
    "{pendingOrders.length > 1 && step === 1 && (",
    "{pendingOrders.length > 1 && (step === 1 || seedMode === 'packing') && ("
)

# 5. Inject PackingPage below Order Selection Picker
injection = """          {/* Render Packing */}
          {seedMode === 'packing' && activeOrder && (
            <PackingPage
              initialTanks={[...(emptyTanks || []), ...(newlyAddedTanks || [])].filter((t) => orderForm?.selectedTankIds?.includes(t.id))}
              tankQtys={orderForm?.tankQtys}
              activeOrder={activeOrder || activeBill}
              vehicles={vehicles}
              onBack={() => setSeedMode('vehicle-payments')}
              onGoToHistory={() => setSeedMode('history')}
            />
          )}"""

content = content.replace(
    "{/* Step 1 Vehicle Selector */}",
    injection + "\n\n          {/* Step 1 Vehicle Selector */}"
)

# 6. Add seedMode !== 'packing' to other step renders
content = content.replace(
    "{/* Step 1 Vehicle Selector */}\n          {step === 1 && activeOrder && (",
    "{/* Step 1 Vehicle Selector */}\n          {seedMode !== 'packing' && step === 1 && activeOrder && ("
)
content = content.replace(
    "{/* Render Step 1: Seed Van Plan */}\n          {step === 1 && activeOrder && (",
    "{/* Render Step 1: Seed Van Plan */}\n          {seedMode !== 'packing' && step === 1 && activeOrder && ("
)
content = content.replace(
    "{/* Step 2 Vehicle Selector */}\n          {step === 2 && activeOrder && (",
    "{/* Step 2 Vehicle Selector */}\n          {seedMode !== 'packing' && step === 2 && activeOrder && ("
)
content = content.replace(
    "{/* Render Step 2: Stocking Status */}\n          {step === 2 && (",
    "{/* Render Step 2: Stocking Status */}\n          {seedMode !== 'packing' && step === 2 && ("
)
content = content.replace(
    "{/* Render Step 3: Outside Workers */}\n          {step === 3 && (",
    "{/* Render Step 3: Outside Workers */}\n          {seedMode !== 'packing' && step === 3 && ("
)

with open('src/features/seed/payments/seedStocking/SeedStocking.jsx', 'w') as f:
    f.write(content)
