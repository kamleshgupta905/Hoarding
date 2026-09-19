import React from 'react';
import { Package, CheckCircle, Clock3, Percent } from 'lucide-react';

export default function QuickKpiCards({ totalSites = 0, availableSites = 0, occupiedSites = 0, expiringSites = 0 }) {
  const occupancyRate = totalSites > 0 ? Math.round((occupiedSites / totalSites) * 100) : 0;

  const kpis = [
    {
      title: 'Total Sites',
      value: totalSites,
      icon: Package,
      color: 'bg-blue-600',
      badge: 'Master Inventory'
    },
    {
      title: 'Available Sites',
      value: availableSites,
      icon: CheckCircle,
      color: 'bg-emerald-600',
      badge: 'Ready to Book'
    },
    {
      title: 'Occupancy Rate',
      value: `${occupancyRate}%`,
      icon: Percent,
      color: 'bg-indigo-600',
      badge: `${occupiedSites} Booked`
    },
    {
      title: '15-Day Renewals',
      value: expiringSites,
      icon: Clock3,
      color: 'bg-amber-600',
      badge: 'Action Needed'
    }
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
      {kpis.map((kpi, idx) => {
        const Icon = kpi.icon;
        return (
          <div
            key={idx}
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '0.75rem',
              padding: '1.25rem',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div>
              <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: 0, fontWeight: 500 }}>{kpi.title}</p>
              <h3 style={{ fontSize: '1.75rem', color: '#f8fafc', margin: '0.25rem 0', fontWeight: 700 }}>{kpi.value}</h3>
              <span style={{ fontSize: '0.75rem', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '0.125rem 0.5rem', borderRadius: '9999px' }}>
                {kpi.badge}
              </span>
            </div>
            <div style={{ width: '44px', height: '44px', borderRadius: '0.5rem', backgroundColor: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={22} color="#38bdf8" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
