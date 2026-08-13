import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, TABLES } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { useSite } from '../../hooks/useSite';

/**
 * Header notification bell (PRD §6 / §12).
 * - Lists in-app notifications (45-day due, overdue, pending proof).
 * - Subscribes via Supabase Realtime so it stays live without refresh.
 * - Unread count badge; clicking marks the dropdown's items as read.
 */
export default function NotificationBell() {
  const { user } = useAuth();
  const { siteId } = useSite();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Load notifications for this user/site.
  useEffect(() => {
    async function load() {
      if (!user) return;
      let q = supabase
        .from(TABLES.notifications)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25);
      if (siteId) q = q.eq('site_id', siteId);
      const { data } = await q;
      setItems(data ?? []);
    }
    load();
  }, [user, siteId]);

  // Realtime: new notifications appear live.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: TABLES.notifications },
        (payload) => setItems((prev) => [payload.new, ...prev])
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user]);

  async function markAllRead() {
    const ids = items.filter((n) => !n.read).map((n) => n.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from(TABLES.notifications).update({ read: true }).in('id', ids);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-full hover:bg-white/10"
        aria-label="Notifications"
      >
        <BellIcon />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ background: 'var(--color-danger)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-12 z-50 w-80 p-2 animate-in"
          style={{
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.65)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-pop)',
          }}
        >
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>Notifications</p>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-semibold"
                style={{ color: 'var(--color-highlight)' }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-auto scroll-thin mt-1">
            {items.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                You're all caught up 🎉
              </p>
            ) : (
              items.map((n) => <NotificationRow key={n.id} n={n} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const KIND_STYLE = {
  trail_netting_due: { dot: 'var(--color-warning)' },
  trail_netting_overdue: { dot: 'var(--color-danger)' },
  payment_proof_pending: { dot: 'var(--color-info)' },
  info: { dot: 'var(--color-primary-light)' },
};

function NotificationRow({ n }) {
  const style = KIND_STYLE[n.kind] ?? KIND_STYLE.info;
  return (
    <div
      className="px-2 py-2 rounded-[8px] hover:bg-[var(--color-surface)]"
      style={{ opacity: n.read ? 0.6 : 1 }}
    >
      <div className="flex items-start gap-2">
        <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: style.dot }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{n.title}</p>
          {n.body && <p className="text-xs text-text-secondary line-clamp-2">{n.body}</p>}
          <p className="text-[10px] text-text-muted mt-0.5">
            {new Date(n.created_at).toLocaleString('en-IN')}
          </p>
        </div>
      </div>
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 21a2 2 0 0 0 4 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
