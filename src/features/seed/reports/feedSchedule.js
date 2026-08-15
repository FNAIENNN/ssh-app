/**
 * Canonical Aquaculture Hatchery Feed Schedule in strict sequence (1C -> 4)
 */
export const PREDEFINED_FEED_SCHEDULE = [
  '1C',
  '1C + 2C',
  '2C',
  '2C + 2P',
  '2P',
  '2P + 3SP',
  '3SP',
  '3SP + 3MP',
  '3MP',
  '3MP + 3P',
  '3P',
  '3P + 4S',
  '4S',
  '4S + 4',
  '4',
];

/**
 * Returns a unique color theme object based on Hatchery Name.
 * Sandhya Hatchery -> Blue Theme
 * Devi Hatchery -> Green Theme
 * Others -> Unique deterministic palette based on name hash
 */
export function getHatcheryTheme(hatcheryName) {
  if (!hatcheryName) {
    return {
      name: 'Default',
      headerBg: 'var(--color-primary)',
      headerText: '#FFFFFF',
      badgeBg: 'var(--color-primary-light)',
      accentColor: 'var(--color-primary)',
      borderColor: 'var(--color-border)',
    };
  }

  const nameLower = hatcheryName.toLowerCase();

  if (nameLower.includes('sandhya')) {
    return {
      name: 'Blue',
      headerBg: '#1E3A8A',
      headerText: '#FFFFFF',
      badgeBg: '#DBEAFE',
      accentColor: '#2563EB',
      borderColor: '#93C5FD',
      tableBg: '#F0F9FF',
    };
  }

  if (nameLower.includes('devi')) {
    return {
      name: 'Green',
      headerBg: '#065F46',
      headerText: '#FFFFFF',
      badgeBg: '#D1FAE5',
      accentColor: '#059669',
      borderColor: '#6EE7B7',
      tableBg: '#ECFDF5',
    };
  }

  // Deterministic color generation for other hatcheries
  const themes = [
    { name: 'Purple', headerBg: '#581C87', headerText: '#FFF', badgeBg: '#F3E8FF', accentColor: '#7C3AED', borderColor: '#C084FC', tableBg: '#FAF5FF' },
    { name: 'Amber', headerBg: '#78350F', headerText: '#FFF', badgeBg: '#FEF3C7', accentColor: '#D97706', borderColor: '#FCD34D', tableBg: '#FFFBEB' },
    { name: 'Teal', headerBg: '#134E4A', headerText: '#FFF', badgeBg: '#CCFBF1', accentColor: '#0D9488', borderColor: '#5EEAD4', tableBg: '#F0FDFA' },
    { name: 'Rose', headerBg: '#881337', headerText: '#FFF', badgeBg: '#FFE4E6', accentColor: '#E11D48', borderColor: '#FDA4AF', tableBg: '#FFF1F2' },
  ];

  let hash = 0;
  for (let i = 0; i < hatcheryName.length; i++) {
    hash = hatcheryName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % themes.length;
  return themes[index];
}
