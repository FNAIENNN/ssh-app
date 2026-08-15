import { useState, useEffect } from 'react';
import { supabase, TABLES } from '../../lib/supabaseClient';
import { useToast } from '../../hooks/useToast';

export default function TrailNettingSettingsModal({ isOpen, onClose, onSettingsUpdated }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase.from(TABLES.trailNettingSettings).select('*');
    if (data && data.length > 0) {
      setItems(data);
    } else {
      // Default fallback items if none in DB
      const defaults = [
        { id: 'tns-1', label: 'Net' },
        { id: 'tns-2', label: 'Dettol' },
        { id: 'tns-3', label: 'Box' },
        { id: 'tns-4', label: 'Weighing Machine' },
        { id: 'tns-5', label: 'Bucket' },
        { id: 'tns-6', label: 'Rope' },
      ];
      setItems(defaults);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) fetchItems();
  }, [isOpen]);

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    const label = newItem.trim();

    const payload = { label, required: true };
    const { data: rows, error } = await supabase.from(TABLES.trailNettingSettings).insert(payload).select();
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Added "${label}" to Trail Netting Settings`);
    setNewItem('');
    fetchItems();
    onSettingsUpdated?.();
  };

  const handleDeleteItem = async (id) => {
    const { error } = await supabase.from(TABLES.trailNettingSettings).delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Item deleted');
    fetchItems();
    onSettingsUpdated?.();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-slate-200 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Trail Netting Settings</h3>
            <p className="text-xs text-slate-500">Configure required checklist items for trail netting sessions</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold">
            ✕
          </button>
        </div>

        <form onSubmit={handleAddItem} className="flex gap-2">
          <input
            type="text"
            placeholder="Add new checklist item (e.g. Oxygen Cylinder)"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            className="field flex-1 text-sm"
          />
          <button type="submit" className="btn-primary text-xs font-bold px-4">
            + Add Item
          </button>
        </form>

        <div className="space-y-2 max-h-60 overflow-y-auto scroll-thin pt-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200"
            >
              <div className="flex items-center gap-2">
                <span className="text-emerald-600 font-bold">✓</span>
                <span className="text-sm font-semibold text-slate-800">{item.label}</span>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteItem(item.id)}
                className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1 hover:bg-rose-50 rounded"
              >
                Delete
              </button>
            </div>
          ))}
        </div>

        <div className="pt-2 flex justify-end">
          <button onClick={onClose} className="btn-secondary text-xs">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
