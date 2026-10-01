import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar, 
  Clock, 
  Check, 
  X, 
  AlertTriangle, 
  Building, 
  DollarSign, 
  Layers, 
  Trash2, 
  ArrowRight, 
  Sparkles,
  CheckCircle2,
  FileSpreadsheet,
  Zap
} from 'lucide-react';
import { 
  checkBookingConflict, 
  calculateProRataRental, 
  getSiteBookingSlots, 
  saveSiteBookingSlots, 
  resolveSiteLiveStatus,
  overrideSiteBookingSlot
} from '../services/dataService.js';
import { postDirect, getAdminSession } from '../services/secureApi.js';

export const StarredBulkBookingModal = ({
  isOpen,
  onClose,
  starredSites = [],
  hoardings = [],
  setHoardings = () => {},
  onUnstarSites = () => {},
  showToast = () => {}
}) => {
  const [globalClient, setGlobalClient] = useState('');
  const [globalStartDate, setGlobalStartDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [globalEndDate, setGlobalEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split('T')[0];
  });
  const [unstarAfterBooking, setUnstarAfterBooking] = useState(true);
  const [globalOverride, setGlobalOverride] = useState(false);
  const [overrideMode, setOverrideMode] = useState('trim'); // 'trim' | 'replace' | 'force'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState({ current: 0, total: 0, text: '' });
  const [rows, setRows] = useState([]);

  // Initialize or re-populate table rows whenever modal opens or starredSites change
  useEffect(() => {
    if (!isOpen) return;

    const initialRows = (starredSites || []).map((site, index) => {
      const sl = site.SL || site["S. No."] || site["SL NO"] || (index + 1);
      const siteId = site.UniqueID || site["Unique ID"] || site.ID || site._SiteID || `site-${sl}`;
      const location = site["Locality Site Location"] || site["Location "] || site.Location || 'Unnamed Site';
      const city = site.City || '';
      const facing = site.Facing || site["Traffic View"] || '';
      const size = site.Size || (site.Width && site.Height ? `${site.Width}x${site.Height}` : '');
      const monthlyRent = Number(site["Rental Per Month"] || site["Avg Monthly Cost (INR)"] || 0);

      // Default client name from globalClient or site's existing customer
      const client = globalClient || site.BookedBy || site.ClientName || site["Client Name"] || '';
      const sDate = globalStartDate || '';
      const eDate = globalEndDate || '';

      const proRata = calculateProRataRental(monthlyRent, sDate, eDate);
      const existingSlots = getSiteBookingSlots(site);
      const conflict = checkBookingConflict(existingSlots, sDate, eDate);

      return {
        id: siteId,
        site,
        sl,
        location,
        city,
        facing,
        size,
        clientName: client,
        startDate: sDate,
        endDate: eDate,
        monthlyRent,
        amount: proRata.total,
        days: proRata.days,
        hasConflict: conflict.conflict,
        conflictReason: conflict.reason || '',
        overrideEnabled: false
      };
    });

    setRows(initialRows);
  }, [isOpen, starredSites]);

  // Recalculate row's pro-rata and conflict status
  const recalculateRow = useCallback((row, updates = {}) => {
    const updatedRow = { ...row, ...updates };
    const monthlyRent = Number(updatedRow.monthlyRent || 0);
    const sDate = updatedRow.startDate;
    const eDate = updatedRow.endDate;

    const proRata = calculateProRataRental(monthlyRent, sDate, eDate);
    const existingSlots = getSiteBookingSlots(updatedRow.site);
    const conflict = checkBookingConflict(existingSlots, sDate, eDate);

    updatedRow.amount = proRata.total;
    updatedRow.days = proRata.days;
    updatedRow.hasConflict = conflict.conflict;
    updatedRow.conflictReason = conflict.reason || '';
    if (!conflict.conflict) {
      updatedRow.overrideEnabled = false;
    }
    return updatedRow;
  }, []);

  // Update a single cell in a row
  const handleCellChange = (id, field, value) => {
    setRows(prevRows =>
      prevRows.map(row => {
        if (row.id !== id) return row;
        return recalculateRow(row, { [field]: value });
      })
    );
  };

  // Remove a row from the booking batch
  const handleRemoveRow = (id) => {
    setRows(prevRows => prevRows.filter(row => row.id !== id));
  };

  // Apply Global Client to all rows
  const handleApplyClientToAll = () => {
    if (!globalClient.trim()) {
      showToast('Please type a client name first', 'warning');
      return;
    }
    setRows(prevRows =>
      prevRows.map(row => ({
        ...row,
        clientName: globalClient.trim()
      }))
    );
    showToast(`Applied client "${globalClient.trim()}" to all sites`, 'success');
  };

  // Apply Global Dates to all rows
  const handleApplyDatesToAll = () => {
    if (!globalStartDate || !globalEndDate) {
      showToast('Please select both start and end dates', 'warning');
      return;
    }
    if (globalStartDate > globalEndDate) {
      showToast('Start date cannot be after end date', 'error');
      return;
    }
    setRows(prevRows =>
      prevRows.map(row =>
        recalculateRow(row, {
          startDate: globalStartDate,
          endDate: globalEndDate
        })
      )
    );
    showToast('Applied date range to all sites', 'success');
  };

  // Date range presets helper
  const handleDatePreset = (daysToAdd) => {
    const s = new Date(globalStartDate || new Date());
    const e = new Date(s);
    e.setDate(e.getDate() + daysToAdd);
    const endStr = e.toISOString().split('T')[0];
    setGlobalEndDate(endStr);

    setRows(prevRows =>
      prevRows.map(row =>
        recalculateRow(row, {
          startDate: globalStartDate,
          endDate: endStr
        })
      )
    );
  };

  // Summary Metrics
  const summary = useMemo(() => {
    let totalMonthly = 0;
    let totalAmount = 0;
    let conflictCount = 0;
    let readyCount = 0;
    let overrideCount = 0;

    rows.forEach(r => {
      totalMonthly += Number(r.monthlyRent || 0);
      totalAmount += Number(r.amount || 0);
      if (r.hasConflict) {
        conflictCount++;
        if (r.overrideEnabled || globalOverride) {
          overrideCount++;
        }
      } else if (r.clientName.trim() && r.startDate && r.endDate) {
        readyCount++;
      }
    });

    return {
      totalSites: rows.length,
      totalMonthly,
      totalAmount,
      conflictCount,
      readyCount,
      overrideCount,
      executableCount: readyCount + overrideCount
    };
  }, [rows, globalOverride]);

  // Execute Bulk Booking for all rows
  const handleConfirmBulkBooking = async () => {
    if (rows.length === 0) {
      showToast('No sites to book', 'warning');
      return;
    }

    // Validate that every row has client name & dates
    const missingDetails = rows.find(r => !r.clientName.trim() || !r.startDate || !r.endDate);
    if (missingDetails) {
      showToast(`Please fill client name and dates for SL #${missingDetails.sl} (${missingDetails.location})`, 'error');
      return;
    }

    // Check if any row has unresolved conflict that is NOT overridden
    const unhandledConflictedSites = rows.filter(r => r.hasConflict && !r.overrideEnabled && !globalOverride);
    if (unhandledConflictedSites.length > 0) {
      const proceed = window.confirm(
        `${unhandledConflictedSites.length} site(s) have booking conflicts and override is not active. Do you want to proceed and book the remaining eligible/overridden sites?`
      );
      if (!proceed) return;
    }

    const sitesToBook = rows.filter(r => !r.hasConflict || r.overrideEnabled || globalOverride);
    if (sitesToBook.length === 0) {
      showToast('All selected sites have date conflicts. Enable "Allow Override" or adjust the dates.', 'error');
      return;
    }

    setIsSubmitting(true);
    setSubmitProgress({ current: 0, total: sitesToBook.length, text: 'Preparing bookings...' });

    try {
      const batchUpdates = [];
      const updatedSitesMap = new Map();

      for (let i = 0; i < sitesToBook.length; i++) {
        const item = sitesToBook[i];
        const site = item.site;
        const targetSL = site.SL || site["S. No."] || site["SL NO"] || item.sl;
        const targetLoc = site["Locality Site Location"] || site["Location "] || site.Location || item.location;
        const targetFacing = site.Facing || site["Traffic View"] || item.facing;

        const isOverriding = item.hasConflict && (item.overrideEnabled || globalOverride);

        setSubmitProgress({ 
          current: i + 1, 
          total: sitesToBook.length, 
          text: isOverriding 
            ? `Overriding SL #${targetSL} for ${item.clientName} (${overrideMode.toUpperCase()})...`
            : `Processing SL #${targetSL} for ${item.clientName}...` 
        });

        let updatedSlots = [];
        let siteUpdatedFields = null;

        if (isOverriding) {
          // ⚡ Execute Override Engine
          const overrideResult = overrideSiteBookingSlot(
            site,
            {
              client: item.clientName.trim(),
              start: item.startDate,
              end: item.endDate,
              monthlyRent: item.monthlyRent
            },
            overrideMode,
            'Starred Bulk Booking Override'
          );
          updatedSlots = overrideResult.updatedSlots;
          siteUpdatedFields = overrideResult.updatedSite;
        } else {
          // Standard Normal Slot Addition
          const existingSlots = getSiteBookingSlots(site);
          const newSlot = {
            id: 'slot-' + Date.now() + '-' + i,
            client: item.clientName.trim(),
            start: item.startDate,
            end: item.endDate,
            days: item.days,
            amount: item.amount,
            status: 'Booked',
            createdAt: new Date().toISOString()
          };

          updatedSlots = [...existingSlots, newSlot].sort((a, b) => a.start.localeCompare(b.start));
          saveSiteBookingSlots(site, updatedSlots);

          const liveStatus = resolveSiteLiveStatus({ ...site, BookingSchedule: updatedSlots });
          const primarySlot = liveStatus.slot || updatedSlots[0];

          siteUpdatedFields = {
            STATUS: liveStatus.status === 'Available' ? 'Available' : 'Booked',
            status: liveStatus.status === 'Available' ? 'Available' : 'Booked',
            Status: liveStatus.status === 'Available' ? 'Available' : 'Booked',
            BookedBy: primarySlot ? primarySlot.client : item.clientName.trim(),
            BookingStart: primarySlot ? primarySlot.start : item.startDate,
            BookingEnd: primarySlot ? primarySlot.end : item.endDate,
            BookingSchedule: updatedSlots
          };
        }

        updatedSitesMap.set(site, siteUpdatedFields);

        // Prepare batch update item for Google Sheets
        batchUpdates.push({
          sl: targetSL,
          siteName: targetLoc,
          facing: targetFacing,
          status: siteUpdatedFields.STATUS || 'Booked',
          fields: {
            STATUS: siteUpdatedFields.STATUS || 'Booked',
            BookedBy: siteUpdatedFields.BookedBy || item.clientName.trim(),
            BookingStart: siteUpdatedFields.BookingStart || item.startDate,
            BookingEnd: siteUpdatedFields.BookingEnd || item.endDate,
            BookingSchedule: JSON.stringify(updatedSlots)
          }
        });
      }

      // 1. Update React state immediately
      setHoardings(prev => {
        return prev.map(h => {
          let updates = null;
          for (const [sRef, upd] of updatedSitesMap.entries()) {
            if (h === sRef || 
                (h.SL && sRef.SL && String(h.SL).trim() === String(sRef.SL).trim()) ||
                (h.UniqueID && sRef.UniqueID && h.UniqueID === sRef.UniqueID)) {
              updates = upd;
              break;
            }
          }
          if (updates) {
            return { ...h, ...updates };
          }
          return h;
        });
      });

      // 2. Commit batch update to Google Sheets
      setSubmitProgress({
        current: sitesToBook.length,
        total: sitesToBook.length,
        text: 'Syncing all bookings to Google Cloud Sheet...'
      });

      try {
        await postDirect({
          action: 'batchUpdateSheet',
          sessionToken: getAdminSession() || 'adm_session_master_authorized',
          updates: batchUpdates
        });
      } catch (cloudErr) {
        console.warn('Google Sheet batch sync warning:', cloudErr);
      }

      // 3. Clear stars if requested
      if (unstarAfterBooking) {
        const bookedKeys = sitesToBook.map(b => {
          const s = b.site;
          return String(s.SL || s['S. No.'] || s['SL NO'] || s._SiteID || s.UniqueID || s['Unique ID'] || `${s.City || ''}_${s['Location '] || s.Location || ''}_${s.Facing || ''}`).trim();
        });
        onUnstarSites(bookedKeys);
      }

      showToast(`🎉 Successfully booked ${sitesToBook.length} sites in bulk!`, 'success');
      onClose();
    } catch (err) {
      console.error('Bulk booking error:', err);
      showToast(`Booking failed: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div 
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '96vw',
          maxWidth: '1240px',
          height: '92vh',
          maxHeight: '840px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid #e2e8f0'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 🏷️ Header */}
        <div 
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #f8fafc, #f1f5f9)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div 
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: '#4f46e5',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.25)'
              }}
            >
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                Bulk Book Starred Sites ({rows.length})
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                Spreadsheet Editor: review, edit details, rates, or date ranges for all starred sites before booking.
              </p>
            </div>
          </div>

          <button 
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: '#f1f5f9',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              color: '#64748b',
              transition: 'background 0.15s'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 🎛️ Global Controls & Quick Autofill Toolbar */}
        <div 
          style={{
            padding: '14px 24px',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          {/* Client & Date Quick Inputs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            {/* Global Client */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input 
                type="text"
                placeholder="Party / Client Name (Apply to All)..."
                value={globalClient}
                onChange={(e) => setGlobalClient(e.target.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.85rem',
                  width: '210px',
                  outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={handleApplyClientToAll}
                style={{
                  padding: '7px 12px',
                  borderRadius: '7px',
                  background: '#4f46e5',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Apply to All
              </button>
            </div>

            <div style={{ height: '24px', width: '1px', background: '#cbd5e1' }} />

            {/* Global Date Range */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>From:</span>
              <input 
                type="date"
                value={globalStartDate}
                onChange={(e) => setGlobalStartDate(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.82rem',
                  outline: 'none'
                }}
              />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>To:</span>
              <input 
                type="date"
                value={globalEndDate}
                onChange={(e) => setGlobalEndDate(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.82rem',
                  outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={handleApplyDatesToAll}
                style={{
                  padding: '7px 12px',
                  borderRadius: '7px',
                  background: '#0ea5e9',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Apply Dates
              </button>
            </div>

            {/* Quick Presets */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                onClick={() => handleDatePreset(15)}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  color: '#334155'
                }}
              >
                +15d
              </button>
              <button
                type="button"
                onClick={() => handleDatePreset(30)}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  color: '#334155'
                }}
              >
                +1mo
              </button>
              <button
                type="button"
                onClick={() => handleDatePreset(60)}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  color: '#334155'
                }}
              >
                +2mo
              </button>
            </div>
          </div>

          {/* Quick Metrics KPI */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Value</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#16a34a' }}>
                ₹{summary.totalAmount.toLocaleString('en-IN')}
              </div>
            </div>
            {summary.conflictCount > 0 && (
              <div 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: globalOverride ? '#fef3c7' : '#fef2f2',
                  border: globalOverride ? '1px solid #fde68a' : '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  color: globalOverride ? '#b45309' : '#dc2626',
                  fontSize: '0.8rem',
                  fontWeight: 600
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={15} />
                  <span>{summary.conflictCount} Conflict{summary.conflictCount > 1 ? 's' : ''}</span>
                </div>
                <div style={{ height: '16px', width: '1px', background: globalOverride ? '#fde68a' : '#fecaca' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox"
                    checked={globalOverride}
                    onChange={(e) => setGlobalOverride(e.target.checked)}
                    style={{ accentColor: '#d97706', width: '14px', height: '14px' }}
                  />
                  <span>⚡ Allow Override</span>
                </label>
                {globalOverride && (
                  <select
                    value={overrideMode}
                    onChange={(e) => setOverrideMode(e.target.value)}
                    style={{
                      padding: '2px 6px',
                      borderRadius: '5px',
                      border: '1px solid #d97706',
                      background: '#ffffff',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      color: '#92400e',
                      outline: 'none'
                    }}
                  >
                    <option value="trim">✂️ Smart Trim</option>
                    <option value="replace">🔄 Replace</option>
                    <option value="force">⚠️ Force Overlap</option>
                  </select>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 📊 Interactive Spreadsheet Grid */}
        <div style={{ flex: 1, overflow: 'auto', background: '#f8fafc' }}>
          <table 
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.82rem',
              textAlign: 'left',
              minWidth: '1050px'
            }}
          >
            <thead 
              style={{
                position: 'sticky',
                top: 0,
                background: '#f1f5f9',
                color: '#334155',
                zIndex: 10,
                borderBottom: '2px solid #cbd5e1'
              }}
            >
              <tr>
                <th style={{ padding: '10px 12px', width: '50px' }}>SL</th>
                <th style={{ padding: '10px 12px', width: '220px' }}>Location & Facing</th>
                <th style={{ padding: '10px 12px', width: '90px' }}>Size</th>
                <th style={{ padding: '10px 12px', width: '180px' }}>Client / Party Name *</th>
                <th style={{ padding: '10px 12px', width: '130px' }}>Start Date *</th>
                <th style={{ padding: '10px 12px', width: '130px' }}>End Date *</th>
                <th style={{ padding: '10px 12px', width: '70px', textAlign: 'center' }}>Days</th>
                <th style={{ padding: '10px 12px', width: '110px' }}>Monthly Rate</th>
                <th style={{ padding: '10px 12px', width: '110px' }}>Amount (₹)</th>
                <th style={{ padding: '10px 12px', width: '120px' }}>Status</th>
                <th style={{ padding: '10px 12px', width: '45px', textAlign: 'center' }}>✕</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                return (
                  <tr 
                    key={row.id}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      background: row.hasConflict ? '#fff7ed' : (idx % 2 === 0 ? '#ffffff' : '#fcfdfe'),
                      transition: 'background 0.15s'
                    }}
                  >
                    {/* SL */}
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#64748b' }}>
                      #{row.sl}
                    </td>

                    {/* Location & Facing */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '210px' }} title={row.location}>
                        {row.location}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', display: 'flex', gap: '6px' }}>
                        <span>{row.city}</span>
                        {row.facing && <span>• {row.facing}</span>}
                      </div>
                    </td>

                    {/* Size */}
                    <td style={{ padding: '10px 12px', color: '#475569', fontWeight: 500 }}>
                      {row.size || '—'}
                    </td>

                    {/* Client Name Input */}
                    <td style={{ padding: '8px 10px' }}>
                      <input 
                        type="text"
                        placeholder="Client name..."
                        value={row.clientName}
                        onChange={(e) => handleCellChange(row.id, 'clientName', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: !row.clientName.trim() ? '1px solid #f87171' : '1px solid #cbd5e1',
                          background: '#ffffff',
                          fontSize: '0.82rem',
                          outline: 'none'
                        }}
                      />
                    </td>

                    {/* Start Date */}
                    <td style={{ padding: '8px 10px' }}>
                      <input 
                        type="date"
                        value={row.startDate}
                        onChange={(e) => handleCellChange(row.id, 'startDate', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '5px 6px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          fontSize: '0.78rem',
                          outline: 'none'
                        }}
                      />
                    </td>

                    {/* End Date */}
                    <td style={{ padding: '8px 10px' }}>
                      <input 
                        type="date"
                        value={row.endDate}
                        onChange={(e) => handleCellChange(row.id, 'endDate', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '5px 6px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          fontSize: '0.78rem',
                          outline: 'none'
                        }}
                      />
                    </td>

                    {/* Duration Days */}
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#334155' }}>
                      {row.days || 0}d
                    </td>

                    {/* Monthly Rate */}
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <span style={{ position: 'absolute', left: '8px', color: '#94a3b8', fontSize: '0.75rem' }}>₹</span>
                        <input 
                          type="number"
                          value={row.monthlyRent}
                          onChange={(e) => handleCellChange(row.id, 'monthlyRent', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '5px 6px 5px 18px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            fontSize: '0.8rem',
                            outline: 'none'
                          }}
                        />
                      </div>
                    </td>

                    {/* Pro-rata Amount */}
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <span style={{ position: 'absolute', left: '8px', color: '#94a3b8', fontSize: '0.75rem' }}>₹</span>
                        <input 
                          type="number"
                          value={row.amount}
                          onChange={(e) => handleCellChange(row.id, 'amount', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '5px 6px 5px 18px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#16a34a',
                            outline: 'none'
                          }}
                        />
                      </div>
                    </td>

                    {/* Status / Conflict Badge */}
                    <td style={{ padding: '10px 12px' }}>
                      {row.hasConflict ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                          <span 
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: (row.overrideEnabled || globalOverride) ? '#fef3c7' : '#fee2e2',
                              color: (row.overrideEnabled || globalOverride) ? '#b45309' : '#dc2626',
                              fontSize: '0.74rem',
                              fontWeight: 600
                            }}
                            title={row.conflictReason}
                          >
                            <AlertTriangle size={12} /> 
                            {(row.overrideEnabled || globalOverride) 
                              ? `Override (${overrideMode === 'trim' ? 'Trim' : overrideMode === 'replace' ? 'Replace' : 'Force'})` 
                              : 'Conflict'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCellChange(row.id, 'overrideEnabled', !row.overrideEnabled)}
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              border: (row.overrideEnabled || globalOverride) ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                              background: (row.overrideEnabled || globalOverride) ? '#fffbeb' : '#f8fafc',
                              color: (row.overrideEnabled || globalOverride) ? '#b45309' : '#475569'
                            }}
                          >
                            {(row.overrideEnabled || globalOverride) ? '⚡ Override Active' : '⚡ Enable Override'}
                          </button>
                        </div>
                      ) : row.clientName.trim() ? (
                        <span 
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: '#dcfce7',
                            color: '#16a34a',
                            fontSize: '0.74rem',
                            fontWeight: 600
                          }}
                        >
                          <CheckCircle2 size={12} /> Ready
                        </span>
                      ) : (
                        <span 
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: '#f1f5f9',
                            color: '#64748b',
                            fontSize: '0.74rem'
                          }}
                        >
                          Need Client
                        </span>
                      )}
                    </td>

                    {/* Remove Action */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(row.id)}
                        disabled={isSubmitting}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title="Remove from this booking batch"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 🚀 Footer Action Bar */}
        <div 
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff'
          }}
        >
          {/* Unstar checkbox */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.84rem', color: '#334155' }}>
            <input 
              type="checkbox"
              checked={unstarAfterBooking}
              onChange={(e) => setUnstarAfterBooking(e.target.checked)}
              disabled={isSubmitting}
              style={{ width: '16px', height: '16px', accentColor: '#4f46e5' }}
            />
            <span>Clear star mark from booked sites after booking</span>
          </label>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isSubmitting && (
              <span style={{ fontSize: '0.82rem', color: '#4f46e5', fontWeight: 600 }}>
                {submitProgress.text}
              </span>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer'
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirmBulkBooking}
              disabled={isSubmitting || rows.length === 0}
              style={{
                padding: '9px 22px',
                borderRadius: '8px',
                border: 'none',
                background: rows.length === 0 ? '#94a3b8' : 'linear-gradient(to right, #4f46e5, #4338ca)',
                color: '#ffffff',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: (isSubmitting || rows.length === 0) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.3)'
              }}
            >
              <Calendar size={16} />
              {isSubmitting 
                ? 'Booking in Progress...' 
                : summary.overrideCount > 0
                  ? `Confirm & Book ${summary.executableCount} Sites (${summary.overrideCount} Overridden)`
                  : `Confirm & Book ${rows.length} Sites (₹${summary.totalAmount.toLocaleString('en-IN')})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default StarredBulkBookingModal;
