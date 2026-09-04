import { useState, useEffect, useMemo } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useAuth } from '../../../../hooks/useAuth';
import { useToast } from '../../../../hooks/useToast';

export default function HatcheryDetails({
  siteId,
  selectedHatchery,
  onSelectHatchery,
  selectedBankAccount,
  onSelectBankAccount,
  onHatcheryBankAccountAddedRef = null,
  autoHatcheryName = '',
}) {
  const { user } = useAuth();
  const toast = useToast();

  const [hatcheries, setHatcheries] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const [newHatchery, setNewHatchery] = useState({
    hatcheryName: '',
    location: '',
    holderName: '',
    accountNumber: '',
    ifscCode: '',
    bankName: '',
  });

  // Load hatcheries and hatchery bank accounts
  useEffect(() => {
    if (!siteId) return;
    loadHatcheries();
  }, [siteId]);

  useEffect(() => {
    if (onHatcheryBankAccountAddedRef) {
      onHatcheryBankAccountAddedRef.current = (newAccount) => {
        setBankAccounts((prev) => [newAccount, ...prev]);
      };
    }
  }, [onHatcheryBankAccountAddedRef]);

  // Auto-select hatchery if autoHatcheryName matches an existing hatchery
  useEffect(() => {
    if (autoHatcheryName && hatcheries.length > 0 && !selectedHatchery) {
      const q = autoHatcheryName.trim().toLowerCase();
      const matched = hatcheries.find(
        (h) => h.hatchery_name?.trim().toLowerCase() === q
      );
      if (matched) {
        onSelectHatchery(matched);
      }
    }
  }, [autoHatcheryName, hatcheries, selectedHatchery]);

  async function loadHatcheries() {
    const { data: hData } = await supabase
      .from(TABLES.hatcheries)
      .select('*')
      .order('hatchery_name');
    const loadedHatcheries = hData ?? [];
    
    // We will not deduplicate here, but rather keep all IDs so we can map them to bank accounts
    setHatcheries(loadedHatcheries);

    const { data: bData } = await supabase
      .from(TABLES.hatcheryBankAccounts)
      .select('*');
    setBankAccounts(bData ?? []);
  }

  const filteredHatcheries = useMemo(() => {
    let result = hatcheries;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = hatcheries.filter(
        (h) =>
          h.hatchery_name?.toLowerCase().includes(q) ||
          h.holder_name?.toLowerCase().includes(q) ||
          h.location?.toLowerCase().includes(q) ||
          h.account_number?.includes(q)
      );
    }
    
    // Deduplicate by Hatchery Name so the dropdown only shows one entry per unique hatchery name
    const uniqueByName = [];
    const seenNames = new Set();
    for (const h of result) {
      const nameKey = (h.hatchery_name || '').trim().toLowerCase();
      if (!nameKey || !seenNames.has(nameKey)) {
        if (nameKey) seenNames.add(nameKey);
        uniqueByName.push(h);
      }
    }
    return uniqueByName;
  }, [hatcheries, search]);

  const activeHatcheryAccounts = useMemo(() => {
    if (!selectedHatchery) return [];
    
    // Find all hatchery IDs that share the exact same name (case-insensitive) as the selected hatchery
    const targetName = (selectedHatchery.hatchery_name || '').trim().toLowerCase();
    const matchingHatcheryIds = new Set(
      hatcheries
        .filter(h => (h.hatchery_name || '').trim().toLowerCase() === targetName)
        .map(h => h.id)
    );
    
    // Fallback: always include the exact selected ID just in case
    matchingHatcheryIds.add(selectedHatchery.id);

    // Get all bank accounts linked to ANY of these matching hatchery IDs
    const accounts = bankAccounts.filter((b) => matchingHatcheryIds.has(b.hatchery_id));
    
    const seen = new Set();
    const filteredAccounts = accounts.filter((a) => {
      const key = `${(a.account_number || '').trim()}_${(a.ifsc_code || a.ifsc || '').trim()}`;
      if (!key || key === '_') return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    return filteredAccounts;
  }, [selectedHatchery, bankAccounts, hatcheries]);

  async function handleAddHatchery() {
    if (!newHatchery.hatcheryName.trim()) return toast.error('Enter Hatchery Name');
    if (!newHatchery.holderName.trim()) return toast.error('Enter Holder Name');

    const hPayload = {
      site_id: siteId,
      hatchery_name: newHatchery.hatcheryName.trim(),
      holder_name: newHatchery.holderName.trim(),
      location: newHatchery.location.trim(),
      account_number: newHatchery.accountNumber.trim(),
      ifsc_code: newHatchery.ifscCode.trim(),
      created_by: user?.id,
    };

    const { data: hRes, error: hErr } = await supabase
      .from(TABLES.hatcheries)
      .insert(hPayload)
      .select();

    if (hErr) return toast.error(hErr.message);
    const addedHatchery = (Array.isArray(hRes) ? hRes[0] : hRes) || {
      id: `hatch-${Date.now()}`,
      ...hPayload,
    };

    // Also add initial bank account if entered
    let addedBank = null;
    if (newHatchery.accountNumber.trim() || newHatchery.ifscCode.trim()) {
      const bPayload = {
        hatchery_id: addedHatchery.id,
        bank_name: newHatchery.bankName.trim() || 'Bank Account',
        holder_name: newHatchery.holderName.trim(),
        account_number: newHatchery.accountNumber.trim(),
        ifsc_code: newHatchery.ifscCode.trim(),
      };
      const { data: bRes } = await supabase
        .from(TABLES.hatcheryBankAccounts)
        .insert(bPayload)
        .select();

      addedBank = (Array.isArray(bRes) ? bRes[0] : bRes) || {
        id: `hba-${Date.now()}`,
        ...bPayload,
      };
      setBankAccounts((prev) => [addedBank, ...prev]);
    }

    setHatcheries((prev) => [addedHatchery, ...prev]);
    onSelectHatchery(addedHatchery);
    onSelectBankAccount(null);

    setShowAddForm(false);
    setNewHatchery({
      hatcheryName: '',
      location: '',
      holderName: '',
      accountNumber: '',
      ifscCode: '',
      bankName: '',
    });
    toast.success('Hatchery saved and added to search list');
  }

  return (
    <div className="card p-5 border my-4 space-y-4" style={{ borderColor: 'var(--color-primary)' }}>
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-base flex items-center gap-2">
          <span>🏭</span> Hatchery Details
        </h3>
        <button
          type="button"
          onClick={() => setShowAddForm((s) => !s)}
          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 font-bold"
        >
          <span>+</span> Add Hatchery
        </button>
      </div>

      {showAddForm && (
        <div className="p-4 rounded-[12px] space-y-3" style={{ background: 'var(--color-surface)' }}>
          <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Add New Hatchery</p>
          {/* Rearranged form fields per requirement 4 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="field-label">1. Hatchery Name *</label>
              <input
                className="field text-sm"
                placeholder="Hatchery Name *"
                value={newHatchery.hatcheryName}
                onChange={(e) => setNewHatchery({ ...newHatchery, hatcheryName: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">2. Hatchery Location</label>
              <input
                className="field text-sm"
                placeholder="Hatchery Location"
                value={newHatchery.location}
                onChange={(e) => setNewHatchery({ ...newHatchery, location: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">3. Holder Name *</label>
              <input
                className="field text-sm"
                placeholder="Holder Name *"
                value={newHatchery.holderName}
                onChange={(e) => setNewHatchery({ ...newHatchery, holderName: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">4. Account Number</label>
              <input
                className="field text-sm"
                placeholder="Account Number"
                value={newHatchery.accountNumber}
                onChange={(e) => setNewHatchery({ ...newHatchery, accountNumber: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">5. IFSC Code</label>
              <input
                className="field text-sm"
                placeholder="IFSC Code"
                value={newHatchery.ifscCode}
                onChange={(e) => setNewHatchery({ ...newHatchery, ifscCode: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">6. Bank Name</label>
              <input
                className="field text-sm"
                placeholder="Bank Name (e.g. SBI, HDFC)"
                value={newHatchery.bankName}
                onChange={(e) => setNewHatchery({ ...newHatchery, bankName: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAddForm(false)} className="btn-ghost text-xs">
              Cancel
            </button>
            <button type="button" onClick={handleAddHatchery} className="btn-success text-xs font-bold">
              Save Hatchery
            </button>
          </div>
        </div>
      )}

      {/* Search & Searchable Dropdown */}
      <div className="space-y-3">
        <input
          className="field py-2 text-sm"
          placeholder="🔍 Search hatchery by name, holder, location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="field text-sm font-semibold"
          value={selectedHatchery?.id || ''}
          onChange={(e) => {
            const found = hatcheries.find((h) => h.id === e.target.value);
            onSelectHatchery(found || null);
            onSelectBankAccount(null);
          }}
        >
          <option value="">Select a Hatchery...</option>
          {filteredHatcheries.map((h) => (
            <option key={h.id} value={h.id}>
              {h.hatchery_name} ({h.holder_name || 'Holder N/A'}) {h.location ? `· ${h.location}` : ''}
            </option>
          ))}
        </select>

        {selectedHatchery && (
          <div className="p-4 rounded-[12px] border space-y-3" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            <div className="space-y-1 text-xs">
              <p className="font-extrabold text-sm text-primary">{selectedHatchery.hatchery_name}</p>
              <div className="grid grid-cols-2 gap-2 text-text-secondary pt-1">
                <p>👤 <strong>Holder Name:</strong> {selectedHatchery.holder_name || 'N/A'}</p>
                <p>📍 <strong>Location:</strong> {selectedHatchery.location || 'N/A'}</p>
                {selectedHatchery.account_number && (
                  <p>💳 <strong>Account No:</strong> {selectedHatchery.account_number}</p>
                )}
                {selectedHatchery.ifsc_code && (
                  <p>🏛️ <strong>IFSC Code:</strong> {selectedHatchery.ifsc_code}</p>
                )}
              </div>
            </div>

            {/* Multiple Bank Accounts Display */}
            <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-xs font-bold text-text-secondary mb-2">
                Saved Bank Accounts for {selectedHatchery.hatchery_name}:
              </p>
              {activeHatcheryAccounts.length === 0 ? (
                <p className="text-xs text-text-muted italic">
                  No bank accounts saved for this hatchery yet. Enter details in Advance Payments below to save one.
                </p>
              ) : (
                <div className="space-y-2">
                  {activeHatcheryAccounts.map((acct) => {
                    const isSelected = selectedBankAccount?.id === acct.id;
                    return (
                      <button
                        key={acct.id}
                        type="button"
                        onClick={() => onSelectBankAccount(isSelected ? null : acct)}
                        className="w-full text-left rounded-[10px] p-3 border transition flex items-center justify-between"
                        style={{
                          borderColor: isSelected ? 'var(--color-success)' : 'var(--color-border)',
                          background: isSelected ? 'var(--color-success-bg)' : 'var(--color-surface-dark)',
                        }}
                      >
                        <div className="text-xs space-y-0.5">
                          <p className="font-bold" style={{ color: isSelected ? 'var(--color-success)' : 'var(--color-text-primary)' }}>
                            🏦 {acct.bank_name || 'Bank Account'}
                          </p>
                          <p className="text-text-muted">
                            Holder: {acct.holder_name || selectedHatchery.holder_name} | A/C: {acct.account_number} | IFSC: {acct.ifsc_code}
                          </p>
                        </div>
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full border" style={{
                          borderColor: isSelected ? 'var(--color-success)' : 'var(--color-border)',
                          color: isSelected ? 'var(--color-success)' : 'var(--color-text-muted)'
                        }}>
                          {isSelected ? '✓ Selected' : 'Select'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
