import re

with open('src/features/seed/payments/seedStocking/SeedStocking.jsx', 'r') as f:
    content = f.read()

# Update the packing onComplete
old_packing = """          {/* Render Packing */}
          {seedMode === 'packing' && activeOrder && (
            <PackingPage
              initialTanks={[...(emptyTanks || []), ...(newlyAddedTanks || [])].filter((t) => orderForm?.selectedTankIds?.includes(t.id))}
              tankQtys={orderForm?.tankQtys}
              activeOrder={activeOrder || activeBill}
              vehicles={vehicles}
              siteId={siteId}
              onBack={() => setSeedMode('vehicle-payments')}
              onComplete={() => setSeedMode('history')}
            />
          )}"""

new_packing = """          {/* Render Packing */}
          {seedMode === 'packing' && activeOrder && (
            <PackingPage
              initialTanks={[...(emptyTanks || []), ...(newlyAddedTanks || [])].filter((t) => orderForm?.selectedTankIds?.includes(t.id))}
              tankQtys={orderForm?.tankQtys}
              activeOrder={activeOrder || activeBill}
              vehicles={vehicles}
              siteId={siteId}
              onBack={() => setSeedMode('vehicle-payments')}
              onComplete={() => setSeedMode('outside-workers-packing')}
            />
          )}"""
content = content.replace(old_packing, new_packing)

# Update the standalone render for outside-workers-packing OR direct tab outside-workers
# We need to render OutsideWorkersStep3 when seedMode === 'outside-workers' OR 'outside-workers-packing'
# If seedMode is 'outside-workers', it's from the tab (we can default to 'Seed Stocking' or 'All' if we want, but let's use 'Seed Stocking')
# If seedMode is 'outside-workers-packing', source is 'Packing'

old_standalone_render = """          {/* Render Step 3: Outside Workers */}
          {seedMode !== 'packing' && step === 3 && ("""

new_standalone_render = """          {/* Render Standalone Outside Workers (from Packing or direct tab) */}
          {(seedMode === 'outside-workers-packing' || seedMode === 'outside-workers') && (
            <div className="mt-6">
              <OutsideWorkersStep3
                initialSupervisorName={commonSupervisorName}
                onComplete={() => setSeedMode('history')}
                onBack={() => setSeedMode(seedMode === 'outside-workers-packing' ? 'packing' : 'list')}
                vehicles={vehicles}
                activeOrder={activeOrder}
                siteId={siteId}
                workSource={seedMode === 'outside-workers-packing' ? 'Packing' : 'Seed Stocking'}
              />
            </div>
          )}

          {/* Render Step 3: Outside Workers (from Seed Stocking flow) */}
          {seedMode !== 'packing' && seedMode !== 'outside-workers-packing' && seedMode !== 'outside-workers' && step === 3 && ("""

content = content.replace(old_standalone_render, new_standalone_render)

with open('src/features/seed/payments/seedStocking/SeedStocking.jsx', 'w') as f:
    f.write(content)
