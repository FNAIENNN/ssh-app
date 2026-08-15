import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, TABLES } from '../lib/supabaseClient';

/**
 * Tracks the currently selected site (PRD §4/§5). Everything downstream —
 * Sections, Payments, Seed Exchange, Trail Netting, Reports — is scoped to
 * this site_id. Persists the choice in localStorage so a refresh keeps context.
 */
const SiteContext = createContext(null);

const STORAGE_KEY = 'ssh.selectedSiteId';
const SECTION_STORAGE_KEY = 'ssh.selectedSectionId';

export function SiteProvider({ children }) {
  const [siteId, setSiteId] = useState(() => localStorage.getItem(STORAGE_KEY) || null);
  const [selectedSectionId, setSelectedSectionId] = useState(() => localStorage.getItem(SECTION_STORAGE_KEY) || null);
  const [site, setSite] = useState(null);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

  const selectSite = useCallback((id) => {
    setSiteId(id);
    setSelectedSectionId(null);
    localStorage.removeItem(SECTION_STORAGE_KEY);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const selectSection = useCallback((secId) => {
    setSelectedSectionId(secId);
    if (secId) localStorage.setItem(SECTION_STORAGE_KEY, secId);
    else localStorage.removeItem(SECTION_STORAGE_KEY);
  }, []);

  // Load the catalogue of sites the user can access.
  const loadSites = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from(TABLES.sites).select('*').order('name');
    setSites(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  // Resolve the full site row when siteId changes.
  useEffect(() => {
    if (!siteId) {
      setSite(null);
      return;
    }
    let active = true;
    supabase
      .from(TABLES.sites)
      .select('*')
      .eq('id', siteId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setSite(data);
      });
    return () => {
      active = false;
    };
  }, [siteId]);

  const value = useMemo(
    () => ({
      siteId,
      site,
      sites,
      loading,
      selectedSectionId,
      selectSection,
      selectSite,
      clearSite: () => selectSite(null),
      refreshSites: loadSites,
    }),
    [siteId, site, sites, loading, selectedSectionId, selectSection, selectSite, loadSites]
  );

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite() {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSite must be used within <SiteProvider>');
  return ctx;
}
