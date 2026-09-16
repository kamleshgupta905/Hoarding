import { create } from 'zustand';

export const useBookingStore = create((set, get) => ({
  bookingSlots: {},
  expiringSites: [],
  renewalThresholdDays: 15,
  activeProposal: {
    clientName: '',
    startDate: '',
    endDate: '',
    selectedSites: [],
    customDiscountPercent: 0
  },

  setBookingSlots: (slots) => set({ bookingSlots: slots }),
  setExpiringSites: (sites) => set({ expiringSites: sites }),

  updateProposalInfo: (info) => set((state) => ({
    activeProposal: { ...state.activeProposal, ...info }
  })),

  addProposalSite: (site) => set((state) => {
    const exists = state.activeProposal.selectedSites.some(s => (s.id || s._SiteID) === (site.id || site._SiteID));
    if (exists) return state;
    return {
      activeProposal: {
        ...state.activeProposal,
        selectedSites: [...state.activeProposal.selectedSites, site]
      }
    };
  }),

  removeProposalSite: (siteId) => set((state) => ({
    activeProposal: {
      ...state.activeProposal,
      selectedSites: state.activeProposal.selectedSites.filter(s => (s.id || s._SiteID) !== siteId)
    }
  })),

  clearProposal: () => set({
    activeProposal: {
      clientName: '',
      startDate: '',
      endDate: '',
      selectedSites: [],
      customDiscountPercent: 0
    }
  })
}));
