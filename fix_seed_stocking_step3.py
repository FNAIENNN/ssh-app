import re

with open('src/features/seed/payments/seedStocking/SeedStocking.jsx', 'r') as f:
    content = f.read()

old_step3 = """          {/* Render Step 3: Outside Workers */}
          {seedMode !== 'packing' && step === 3 && (
            <OutsideWorkersStep3
              initialSupervisorName={commonSupervisorName}
              onComplete={handleFinalComplete}
              onBack={() => setStep(2)}
            />
          )}"""

new_step3 = """          {/* Render Step 3: Outside Workers */}
          {seedMode !== 'packing' && step === 3 && (
            <OutsideWorkersStep3
              initialSupervisorName={commonSupervisorName}
              onComplete={handleFinalComplete}
              onBack={() => setStep(2)}
              vehicles={vehicles}
              activeOrder={activeOrder}
              siteId={siteId}
              workSource="Seed Stocking"
            />
          )}"""

content = content.replace(old_step3, new_step3)

with open('src/features/seed/payments/seedStocking/SeedStocking.jsx', 'w') as f:
    f.write(content)
