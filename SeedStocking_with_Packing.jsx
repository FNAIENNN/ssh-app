        <PackingPage
          initialTanks={selectedTanks}
          tankQtys={orderForm?.tankQtys}
          activeOrder={orderBill}
          vehicles={vehicles}
          onBack={() => setSeedMode('vehicle-payments')}
          onGoToHistory={() => setSeedMode('history')}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* GLOBAL BACK BUTTON (Always at the very top) */}
      <div>
        <button
          type="button"
          onClick={() => {
            if (step === 3) setStep(2);
            else if (step === 2) setStep(1);
            else setSeedMode('vehicle-payments');
          }}
          className="flex items-center gap-1.5 text-sm font-bold"
          style={{ color: '#000', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <span style={{ color: '#000', fontSize: '1.1rem' }}>←</span>
          <span style={{ color: '#000' }}>Back</span>
        </button>
      </div>

      {/* Step navigation header */}
      <div className="card p-4 shadow-sm border" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold flex items-center gap-2">
              <span>🌱</span> Seed Stocking Module
            </h2>
            <p className="text-xs text-text-secondary">
              {orderBill
                ? `Order: ${orderBill.bill_number} · ${orderBill.hatchery || 'Hatchery N/A'}`
                : 'Select a pending order to start'}
            </p>
          </div>
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
                  onClick={() => { if (s.id < step) setStep(s.id); }}
                  className="px-3 py-1 rounded-full text-xs font-bold transition border"
                  style={{
                    background: active ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: active ? '#fff' : 'var(--color-text-secondary)',
                    borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.
