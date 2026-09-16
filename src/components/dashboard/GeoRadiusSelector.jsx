import React, { useState } from 'react';
import { Compass, X, Check, MapPin } from 'lucide-react';
import { useInventoryStore } from '../../stores/inventoryStore';

const LANDMARKS = [
  { name: 'Meerut Clock Tower (Ghanta Ghar)', lat: 28.9845, lng: 77.7064 },
  { name: 'Delhi Road (Metro Plaza)', lat: 28.9650, lng: 77.6850 },
  { name: 'Modipuram Flyover', lat: 29.0700, lng: 77.7100 },
  { name: 'Begum Bridge', lat: 28.9920, lng: 77.7030 },
  { name: 'Garh Road (Medical College)', lat: 28.9750, lng: 77.7400 }
];

export default function GeoRadiusSelector() {
  const { geoRadius, setGeoRadius, clearGeoRadius } = useInventoryStore();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRadius, setSelectedRadius] = useState(geoRadius.radiusKm || 5);
  const [selectedLandmark, setSelectedLandmark] = useState(LANDMARKS[0]);

  const handleApply = () => {
    setGeoRadius({
      centerLat: selectedLandmark.lat,
      centerLng: selectedLandmark.lng,
      radiusKm: Number(selectedRadius),
      centerName: selectedLandmark.name
    });
    setIsOpen(false);
  };

  const handleClear = () => {
    clearGeoRadius();
    setIsOpen(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.45rem 0.85rem',
          backgroundColor: geoRadius.isEnabled ? '#0284c7' : '#334155',
          color: '#ffffff',
          borderRadius: '0.5rem',
          border: '1px solid rgba(255,255,255,0.1)',
          cursor: 'pointer',
          fontSize: '0.85rem',
          fontWeight: 500,
          transition: 'all 0.2s'
        }}
      >
        <Compass size={16} />
        {geoRadius.isEnabled
          ? (geoRadius.radiusKm + ' km from ' + (geoRadius.centerName ? geoRadius.centerName.split(' ')[0] : 'Center'))
          : 'Radius Catchment Filter'}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '110%',
            left: 0,
            zIndex: 50,
            width: '320px',
            backgroundColor: '#0f172a',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '0.75rem',
            padding: '1rem',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <MapPin size={16} color="#38bdf8" /> Select Catchment Center
            </span>
            <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>

          {/* Landmark list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.85rem' }}>
            {LANDMARKS.map((lm, idx) => (
              <label
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.8rem',
                  color: selectedLandmark.name === lm.name ? '#38bdf8' : '#cbd5e1',
                  cursor: 'pointer',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '0.35rem',
                  backgroundColor: selectedLandmark.name === lm.name ? 'rgba(56, 189, 248, 0.1)' : 'transparent'
                }}
              >
                <input
                  type="radio"
                  name="landmark"
                  checked={selectedLandmark.name === lm.name}
                  onChange={() => setSelectedLandmark(lm)}
                />
                {lm.name}
              </label>
            ))}
          </div>

          {/* Radius Slider */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
              <span>Search Radius</span>
              <span style={{ fontWeight: 600, color: '#38bdf8' }}>{selectedRadius} KM</span>
            </div>
            <input
              type="range"
              min="1"
              max="25"
              step="1"
              value={selectedRadius}
              onChange={(e) => setSelectedRadius(e.target.value)}
              style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleApply}
              style={{
                flex: 1,
                padding: '0.45rem',
                backgroundColor: '#0284c7',
                color: '#fff',
                border: 'none',
                borderRadius: '0.35rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem'
              }}
            >
              <Check size={14} /> Apply Filter
            </button>
            {geoRadius.isEnabled && (
              <button
                onClick={handleClear}
                style={{
                  padding: '0.45rem 0.75rem',
                  backgroundColor: '#334155',
                  color: '#f87171',
                  border: 'none',
                  borderRadius: '0.35rem',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
