import { create } from 'zustand';
import { filterSitesWithinRadius } from '../services/geoService.js';

export const useInventoryStore = create((set, get) => ({
  hoardings: [],
  isLoading: false,
  error: null,

  // Filters
  activeCity: 'All',
  activeFormat: 'All',
  activeStatus: 'All',
  searchQuery: '',
  selectedSiteIds: [],

  // Geospatial Radius Filter
  geoRadius: {
    isEnabled: false,
    centerLat: null,
    centerLng: null,
    radiusKm: 5,
    centerName: ''
  },

  // Actions
  setHoardings: (hoardings) => set({ hoardings, isLoading: false, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),

  setActiveCity: (activeCity) => set({ activeCity }),
  setActiveFormat: (activeFormat) => set({ activeFormat }),
  setActiveStatus: (activeStatus) => set({ activeStatus }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  toggleSiteSelection: (siteId) => set((state) => {
    const exists = state.selectedSiteIds.includes(siteId);
    return {
      selectedSiteIds: exists
        ? state.selectedSiteIds.filter((id) => id !== siteId)
        : [...state.selectedSiteIds, siteId]
    };
  }),

  selectAllSites: (siteIds) => set({ selectedSiteIds: siteIds }),
  clearSiteSelection: () => set({ selectedSiteIds: [] }),

  setGeoRadius: (config) => set((state) => ({
    geoRadius: { ...state.geoRadius, ...config, isEnabled: true }
  })),

  clearGeoRadius: () => set((state) => ({
    geoRadius: { ...state.geoRadius, isEnabled: false }
  })),

  // Derived / Computed helper
  getFilteredSites: () => {
    const { hoardings, activeCity, activeFormat, activeStatus, searchQuery, geoRadius } = get();
    let result = [...hoardings];

    // 1. City Filter
    if (activeCity && activeCity !== 'All') {
      result = result.filter((h) => (h.City || '').toLowerCase() === activeCity.toLowerCase());
    }

    // 2. Format Filter
    if (activeFormat && activeFormat !== 'All') {
      result = result.filter((h) => (h.Media || h.Format || '').toLowerCase().includes(activeFormat.toLowerCase()));
    }

    // 3. Status Filter
    if (activeStatus && activeStatus !== 'All') {
      result = result.filter((h) => (h.Status || 'Available').toLowerCase() === activeStatus.toLowerCase());
    }

    // 4. Search Filter
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((h) =>
        (h.Location || '').toLowerCase().includes(q) ||
        (h.Area || '').toLowerCase().includes(q) ||
        (h.Site_Name || h['Locality Site Location'] || '').toLowerCase().includes(q) ||
        (h.City || '').toLowerCase().includes(q)
      );
    }

    // 5. Geo Radius Filter
    if (geoRadius.isEnabled && geoRadius.centerLat && geoRadius.centerLng) {
      result = filterSitesWithinRadius(result, geoRadius.centerLat, geoRadius.centerLng, geoRadius.radiusKm);
    }

    return result;
  }
}));
