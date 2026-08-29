import React from 'react';

const shimmerKeyframes = `
@keyframes shimmerPulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.9; }
}
.skeleton-shimmer {
  background: #e2e8f0;
  animation: shimmerPulse 1.5s ease-in-out infinite;
  border-radius: 8px;
}
`;

export function SkeletonCard() {
  return (
    <div style={{
      background: '#fff', borderRadius: '16px', overflow: 'hidden',
      border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
    }}>
      <div className="skeleton-shimmer" style={{ height: '180px', borderRadius: 0 }} />
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div className="skeleton-shimmer" style={{ height: '16px', width: '70%' }} />
        <div className="skeleton-shimmer" style={{ height: '12px', width: '50%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <div className="skeleton-shimmer" style={{ height: '14px', width: '80px' }} />
          <div className="skeleton-shimmer" style={{ height: '24px', width: '60px', borderRadius: '999px' }} />
        </div>
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: '#e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '1px', background: '#f9fafb', padding: '14px 16px' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="skeleton-shimmer" style={{ height: '12px', width: '60%', borderRadius: '4px' }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} style={{
          display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '1px',
          background: '#fff', padding: '14px 16px'
        }}>
          {Array.from({ length: cols }).map((_, colIdx) => (
            <div key={colIdx} className="skeleton-shimmer" style={{
              height: '14px', width: `${40 + Math.random() * 40}%`, borderRadius: '4px'
            }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <style>{shimmerKeyframes}</style>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{
            background: '#fff', borderRadius: '16px', padding: '22px 24px',
            border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div className="skeleton-shimmer" style={{ height: '12px', width: '100px' }} />
              <div className="skeleton-shimmer" style={{ height: '36px', width: '36px', borderRadius: '10px' }} />
            </div>
            <div className="skeleton-shimmer" style={{ height: '32px', width: '80px' }} />
            <div className="skeleton-shimmer" style={{ height: '6px', width: '100%', borderRadius: '999px' }} />
          </div>
        ))}
      </div>
      {/* Chart area */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0' }}>
          <div className="skeleton-shimmer" style={{ height: '18px', width: '200px', marginBottom: '20px' }} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div className="skeleton-shimmer" style={{ height: '14px', width: '120px' }} />
              <div className="skeleton-shimmer" style={{ height: '9px', flex: 1, borderRadius: '999px' }} />
              <div className="skeleton-shimmer" style={{ height: '14px', width: '40px' }} />
            </div>
          ))}
        </div>
        <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0' }}>
          <div className="skeleton-shimmer" style={{ height: '18px', width: '160px', marginBottom: '20px' }} />
          <div className="skeleton-shimmer" style={{ height: '160px', width: '160px', borderRadius: '50%', margin: '0 auto' }} />
        </div>
      </div>
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div style={{ minHeight: '80vh', padding: '60px 24px', maxWidth: '1200px', margin: '0 auto' }}>
      <style>{shimmerKeyframes}</style>
      <div className="skeleton-shimmer" style={{ height: '36px', width: '300px', marginBottom: '12px' }} />
      <div className="skeleton-shimmer" style={{ height: '16px', width: '500px', marginBottom: '32px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  );
}

export default SkeletonCard;
