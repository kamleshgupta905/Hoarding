import React, { useState, useEffect } from 'react';
import { X, Calendar, User, DollarSign, AlertTriangle, CheckCircle } from 'lucide-react';
import { calculateProRataRental, checkBookingConflict, updateSiteBookingSlot } from '../services/dataService.js';

export default function SlotEditModal({
  isOpen = false,
  onClose = null,
  site = null,
  slot = null,
  onSuccess = null
}) {
  const [clientName, setClientName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('Booked');
  const [monthlyRent, setMonthlyRent] = useState(0);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (slot) {
      setClientName(slot.client || slot.clientName || '');
      setStartDate(slot.start || slot.originalStart || '');
      setEndDate(slot.end || slot.originalEnd || '');
      setStatus(slot.status || 'Booked');
      setNotes(slot.overrideReason || slot.notes || '');
    }
    if (site) {
      setMonthlyRent(Number(site['Rental Per Month'] || site['Avg Monthly Cost (INR)'] || 0));
    }
  }, [slot, site]);

  if (!isOpen || !slot || !site) return null;

  const proRata = calculateProRataRental(monthlyRent, startDate, endDate);

  // Check collision with other slots on the same site (excluding this slot)
  const existingSlots = Array.isArray(site.BookingSchedule) 
    ? site.BookingSchedule 
    : (typeof site.BookingSchedule === 'string' && site.BookingSchedule.startsWith('[')) 
      ? JSON.parse(site.BookingSchedule) 
      : [];

  const conflict = checkBookingConflict(existingSlots, startDate, endDate, slot.id);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!clientName.trim() || !startDate || !endDate) return;

    const updatedSlot = {
      ...slot,
      client: clientName.trim(),
      start: startDate,
      end: endDate,
      status: status,
      amount: proRata.total,
      days: proRata.days,
      notes: notes.trim(),
      updatedAt: new Date().toISOString()
    };

    const res = updateSiteBookingSlot(site, updatedSlot);
    if (res.success) {
      if (onSuccess) onSuccess(updatedSlot, site);
      if (onClose) onClose();
    }
  };

  const loc = site['Location '] || site.Location || site['Locality Site Location'] || 'Hoarding Site';
  const facing = site.Facing || site['Traffic View'] || '';

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
        maxWidth: '480px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
              ✏️ Edit Booking Slot
            </h3>
            <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>
              {loc} {facing && `(${facing})`}
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

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
              Client / Advertiser Name
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 34px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.86rem',
                  outline: 'none'
                }}
              />
              <User size={15} style={{ position: 'absolute', left: '10px', top: '12px', color: '#94a3b8' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                Start Date
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem',
                  outline: 'none'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                End Date
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Conflict Warning */}
          {conflict.conflict && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.78rem',
              color: '#dc2626'
            }}>
              <AlertTriangle size={15} />
              <span>{conflict.reason}</span>
            </div>
          )}

          {/* Pro-Rata Card */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '10px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Duration: {proRata.days} Days</div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>₹{proRata.dayRate.toLocaleString('en-IN')}/day</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#16a34a' }}>
                ₹{proRata.total.toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#15803d', fontWeight: 600 }}>Pro-Rata Total</div>
            </div>
          </div>

          {/* Status Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
              Slot Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.84rem',
                outline: 'none',
                background: '#ffffff'
              }}
            >
              <option value="Booked">🟢 Active Booked</option>
              <option value="Overridden">⚡ Overridden / Displaced</option>
              <option value="Trimmed">✂️ Trimmed</option>
              <option value="Hold">🟡 On Hold / Tentative</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
              Adjustment Reason / Notes
            </label>
            <input
              type="text"
              placeholder="e.g. Rescheduled on client request..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
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
              type="submit"
              disabled={conflict.conflict || !clientName.trim()}
              style={{
                padding: '9px 20px',
                borderRadius: '8px',
                border: 'none',
                background: conflict.conflict ? '#94a3b8' : '#2563eb',
                color: '#ffffff',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: conflict.conflict ? 'not-allowed' : 'pointer',
                boxShadow: conflict.conflict ? 'none' : '0 4px 12px rgba(37, 99, 235, 0.3)'
              }}
            >
              Save Slot Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
