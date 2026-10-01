import React, { useState, useMemo } from 'react';
import { X, ArrowRight, Search, MapPin, Check, AlertCircle } from 'lucide-react';
import { shiftBookingSlotToSite, calculateProRataRental, checkBookingConflict, getSiteBookingSlots } from '../services/dataService.js';

export default function ShiftSlotModal({
  isOpen = false,
  onClose = null,
  fromSite = null,
  slot = null,
  allHoardings = [],
  onSuccess = null
}) {
  const [selectedTargetSite, setSelectedTargetSite] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState(slot?.start || slot?.originalStart || '');
  const [endDate, setEndDate] = useState(slot?.end || slot?.originalEnd || '');

  // Reset target site if slot changes
  React.useEffect(() => {
    if (slot) {
      setStartDate(slot.start || slot.originalStart || '');
      setEndDate(slot.end || slot.originalEnd || '');
      setSelectedTargetSite(null);
    }
  }, [slot]);

  // Filter available candidate hoardings (exclude source site)
  const candidateSites = useMemo(() => {
    if (!allHoardings || allHoardings.length === 0) return [];
    const fromId = fromSite?._SiteID || fromSite?.UniqueID || fromSite?.ID;

    return allHoardings.filter(h => {
      const hId = h._SiteID || h.UniqueID || h.ID;
      if (fromId && hId === fromId) return false;

      // Status check (check if available or slots free)
      const slots = getSiteBookingSlots(h);
      if (startDate && endDate) {
        const conflict = checkBookingConflict(slots, startDate, endDate);
        if (conflict.conflict) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const loc = String(h['Location '] || h.Location || h['Locality Site Location'] || '').toLowerCase();
        const city = String(h.City || '').toLowerCase();
        const facing = String(h.Facing || h['Traffic View'] || '').toLowerCase();
        return loc.includes(q) || city.includes(q) || facing.includes(q);
      }
      return true;
    }).slice(0, 15);
  }, [allHoardings, fromSite, startDate, endDate, searchQuery]);

  if (!isOpen || !slot) return null;

  const targetRent = selectedTargetSite 
    ? Number(selectedTargetSite['Rental Per Month'] || selectedTargetSite['Avg Monthly Cost (INR)'] || 0) 
    : 0;

  const proRata = calculateProRataRental(targetRent, startDate, endDate);

  const handleConfirmShift = () => {
    if (!selectedTargetSite) return;
    const res = shiftBookingSlotToSite(fromSite, selectedTargetSite, slot, startDate, endDate);
    if (res.success) {
      if (onSuccess) onSuccess(fromSite, selectedTargetSite, res.shiftedSlot);
      if (onClose) onClose();
    }
  };

  const fromLoc = fromSite ? (fromSite['Location '] || fromSite.Location || fromSite['Locality Site Location'] || 'Original Site') : (slot.siteLocation || 'Original Site');

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #e2e8f0'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
              🔁 Shift Booking to Alternate Hoarding
            </h3>
            <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>
              Client: <strong style={{ color: '#0f172a' }}>{slot.client}</strong> • From: {fromLoc}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#e2e8f0',
              border: 'none',
              borderRadius: '8px',
              padding: '6px',
              cursor: 'pointer',
              color: '#475569'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Date Selector */}
        <div style={{ padding: '14px 20px', background: '#fffbeb', borderBottom: '1px solid #fef3c7', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#92400e', whiteSpace: 'nowrap' }}>
            Shifted Dates:
          </div>
          <input 
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', background: '#ffffff' }}
          />
          <span style={{ color: '#92400e' }}>→</span>
          <input 
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', background: '#ffffff' }}
          />
          <span style={{ fontSize: '0.78rem', color: '#b45309', fontWeight: 600 }}>({proRata.days}d)</span>
        </div>

        {/* Search Input */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <Search size={15} color="#94a3b8" />
            <input 
              type="text"
              placeholder="Search alternate sites by location or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.84rem' }}
            />
          </div>
        </div>

        {/* Candidate Sites List */}
        <div style={{ padding: '10px 20px', overflowY: 'auto', flex: 1, maxHeight: '280px' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase' }}>
            Available Alternate Sites ({candidateSites.length})
          </div>

          {candidateSites.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: '0.84rem' }}>
              No available sites found for selected dates. Try changing dates or search term.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {candidateSites.map(h => {
                const isSelected = selectedTargetSite === h;
                const loc = h['Location '] || h.Location || h['Locality Site Location'] || 'Hoarding';
                const facing = h.Facing || h['Traffic View'] || '';
                const rent = Number(h['Rental Per Month'] || h['Avg Monthly Cost (INR)'] || 0);

                return (
                  <div
                    key={h._SiteID || h.UniqueID || h.ID || loc}
                    onClick={() => setSelectedTargetSite(h)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      background: isSelected ? '#eff6ff' : '#ffffff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a' }}>
                        {loc}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', display: 'flex', gap: '8px', marginTop: '2px' }}>
                        <span>📍 {h.City || 'Meerut'}</span>
                        {facing && <span>👁️ {facing}</span>}
                        <span>📐 {h.Width && h.Height ? `${h.Width}×${h.Height}` : h.Media || 'Unipole'}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#16a34a' }}>
                        ₹{rent.toLocaleString('en-IN')}/mo
                      </div>
                      {isSelected && (
                        <span style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Check size={12} /> Selected
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid #e2e8f0',
          background: '#f8fafc',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            {selectedTargetSite ? (
              <div style={{ fontSize: '0.82rem', color: '#16a34a', fontWeight: 700 }}>
                Total Cost: ₹{proRata.total.toLocaleString('en-IN')} ({proRata.days} Days)
              </div>
            ) : (
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Select an alternate site above to proceed
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 16px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontSize: '0.84rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedTargetSite}
              onClick={handleConfirmShift}
              style={{
                padding: '9px 20px',
                borderRadius: '8px',
                border: 'none',
                background: selectedTargetSite ? '#2563eb' : '#94a3b8',
                color: '#ffffff',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: selectedTargetSite ? 'pointer' : 'not-allowed',
                boxShadow: selectedTargetSite ? '0 4px 12px rgba(37, 99, 235, 0.3)' : 'none'
              }}
            >
              Confirm Site Shift
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
