import React, { useState, useMemo } from 'react';
import { Bell, Clock, Calendar, CheckCircle, Send, RefreshCw, Search, ChevronRight } from 'lucide-react';
import { getExpiringSites, generateWhatsAppRenewalMessage, getImageUrl } from '../services/dataService';
import './RenewalAlertRadar.css';

export default function RenewalAlertRadar({ 
  hoardings = [], 
  onSelectSite = null,
  onOpenBookingModal = null,
  onReleaseSite = null 
}) {
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'critical', 'overdue', 'standard'
  const [searchTerm, setSearchTerm] = useState('');
  const [dismissedSiteIds, setDismissedSiteIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('adh_dismissed_renewal_alerts') || '[]'));
    } catch {
      return new Set();
    }
  });

  // Calculate live expiring list (<= 15 days or overdue)
  const expiringItems = useMemo(() => {
    return getExpiringSites(hoardings, 15);
  }, [hoardings]);

  // Aggregate stats
  const stats = useMemo(() => {
    let criticalCount = 0;
    let overdueCount = 0;
    let standardCount = 0;
    let totalRevenueRisk = 0;

    expiringItems.forEach(({ site, occupancy }) => {
      const price = parseFloat(String(site["Avg Monthly Cost (INR)"] ?? site["Rental Per Month"] ?? 0).replace(/[^0-9.]/g, '')) || 0;
      totalRevenueRisk += price;

      if (occupancy.isOverdue) {
        overdueCount++;
      } else if (occupancy.statusTier === 'critical') {
        criticalCount++;
      } else {
        standardCount++;
      }
    });

    return {
      total: expiringItems.length,
      criticalCount,
      overdueCount,
      standardCount,
      totalRevenueRisk
    };
  }, [expiringItems]);

  // Filtered list
  const filteredItems = useMemo(() => {
    return expiringItems.filter(({ site, occupancy }) => {
      const siteId = site._SiteID || site.UniqueID || site.SL || site.Location || '';
      if (dismissedSiteIds.has(siteId)) return false;

      if (activeFilter === 'critical' && occupancy.statusTier !== 'critical') return false;
      if (activeFilter === 'overdue' && !occupancy.isOverdue) return false;
      if (activeFilter === 'standard' && (occupancy.statusTier === 'critical' || occupancy.isOverdue)) return false;

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const loc = String(site["Location "] || site.Location || site["Locality Site Location"] || '').toLowerCase();
        const client = String(occupancy.client || '').toLowerCase();
        const city = String(site.City || site.city || '').toLowerCase();
        return loc.includes(query) || client.includes(query) || city.includes(query);
      }

      return true;
    });
  }, [expiringItems, activeFilter, searchTerm, dismissedSiteIds]);

  const handleWhatsAppClick = (site, daysLeft, e) => {
    e.stopPropagation();
    const text = generateWhatsAppRenewalMessage(site, daysLeft);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleDismiss = (siteId, e) => {
    e.stopPropagation();
    setDismissedSiteIds(prev => {
      const next = new Set(prev);
      next.add(siteId);
      try {
        localStorage.setItem('adh_dismissed_renewal_alerts', JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  if (stats.total === 0) {
    return (
      <div className="renewal-radar-panel renewal-radar-empty">
        <div className="radar-empty-badge">
          <CheckCircle size={24} className="text-emerald-400" />
        </div>
        <div className="radar-empty-content">
          <h4>Sabhi Hoardings Secure Hain!</h4>
          <p>Agle 15 dino me koi bhi hoarding expire nahi ho raha hai. Sabhi bookings active hain.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="renewal-radar-panel animate-fade-in">
      {/* Header with Glowing Live Beacon */}
      <div className="radar-header">
        <div className="radar-header-left">
          <div className="radar-live-beacon">
            <span className="beacon-ping"></span>
            <span className="beacon-core"></span>
            <Bell size={18} />
          </div>
          <div>
            <div className="radar-title-row">
              <h3>15-Days Renewal Predictor</h3>
              <span className="radar-pulse-badge">
                {stats.total} Sites Expiring Soon
              </span>
            </div>
            <p className="radar-subtitle">
              In hoardings ki booking agle 15 dino me complete ho rahi hai. Idle loss se bachne ke liye turant renewal pitch karein.
            </p>
          </div>
        </div>

        {/* Quick Revenue Summary */}
        <div className="radar-revenue-card">
          <span className="revenue-label">Monthly Revenue At Risk</span>
          <span className="revenue-value">₹{Math.round(stats.totalRevenueRisk).toLocaleString('en-IN')}</span>
          <span className="revenue-sub">across {stats.total} expiring sites</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="radar-metrics-grid">
        <button 
          type="button" 
          className={`radar-metric-pill ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          <span className="metric-dot all"></span>
          <span className="metric-name">All Expiring</span>
          <span className="metric-count">{stats.total}</span>
        </button>

        <button 
          type="button" 
          className={`radar-metric-pill ${activeFilter === 'critical' ? 'active critical' : ''}`}
          onClick={() => setActiveFilter('critical')}
        >
          <span className="metric-dot critical"></span>
          <span className="metric-name">Critical (&lt;5 Days)</span>
          <span className="metric-count critical-badge">{stats.criticalCount}</span>
        </button>

        <button 
          type="button" 
          className={`radar-metric-pill ${activeFilter === 'overdue' ? 'active overdue' : ''}`}
          onClick={() => setActiveFilter('overdue')}
        >
          <span className="metric-dot overdue"></span>
          <span className="metric-name">Overdue / Ended</span>
          <span className="metric-count overdue-badge">{stats.overdueCount}</span>
        </button>

        <button 
          type="button" 
          className={`radar-metric-pill ${activeFilter === 'standard' ? 'active standard' : ''}`}
          onClick={() => setActiveFilter('standard')}
        >
          <span className="metric-dot standard"></span>
          <span className="metric-name">5 - 15 Days</span>
          <span className="metric-count">{stats.standardCount}</span>
        </button>
      </div>

      {/* Search Bar inside Radar */}
      {stats.total > 3 && (
        <div className="radar-search-wrap">
          <Search size={15} className="radar-search-icon" />
          <input 
            type="text" 
            placeholder="Search by site location, client name, or city..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="radar-search-input"
          />
          {searchTerm && (
            <button type="button" className="radar-clear-search" onClick={() => setSearchTerm('')}>×</button>
          )}
        </div>
      )}

      {/* Expiring Cards List */}
      <div className="radar-cards-list">
        {filteredItems.map(({ site, occupancy }) => {
          const siteId = site._SiteID || site.UniqueID || site.SL || site.Location || '';
          const siteLoc = site["Location "] || site.Location || site["Locality Site Location"] || 'Hoarding Site';
          const locality = site.Area || site.Locality || '';
          const city = site.City || site.city || 'Meerut';
          const price = site["Avg Monthly Cost (INR)"] ?? site["Rental Per Month"] ?? 0;
          const imgUrl = getImageUrl(site);
          const daysLeft = occupancy.daysLeft;

          return (
            <div 
              key={siteId || siteLoc} 
              className={`radar-card ${occupancy.statusTier}`}
              onClick={() => onSelectSite && onSelectSite(site)}
            >
              <div className="radar-card-media">
                <img 
                  src={imgUrl} 
                  alt={siteLoc} 
                  onError={(e) => { e.target.src = 'https://placehold.co/120x80?text=Site'; }}
                />
                <span 
                  className="radar-status-badge"
                  style={{
                    backgroundColor: occupancy.badgeBg,
                    color: occupancy.badgeColor,
                    borderColor: occupancy.badgeBorder
                  }}
                >
                  <Clock size={11} /> {occupancy.badgeLabel}
                </span>
              </div>

              <div className="radar-card-info">
                <div className="radar-card-top">
                  <div>
                    <h5 className="radar-site-title">{siteLoc}</h5>
                    <span className="radar-site-city">{city}{locality ? ` • ${locality}` : ''}</span>
                  </div>
                  <button 
                    type="button" 
                    className="radar-card-dismiss-btn"
                    title="Dismiss alert"
                    onClick={(e) => handleDismiss(siteId || siteLoc, e)}
                  >
                    ×
                  </button>
                </div>

                <div className="radar-meta-row">
                  <div className="radar-client-pill">
                    <span className="pill-label">Client:</span>
                    <strong>{occupancy.client || 'Direct Advertiser'}</strong>
                  </div>

                  {occupancy.formattedEndDate && (
                    <div className="radar-date-pill">
                      <Calendar size={12} />
                      <span>Expires: <strong>{occupancy.formattedEndDate}</strong></span>
                    </div>
                  )}

                  {price ? (
                    <div className="radar-price-pill">
                      <span>Rate: <strong>₹{Number(price).toLocaleString('en-IN')}/mo</strong></span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="radar-card-actions">
                <button
                  type="button"
                  className="btn-radar-whatsapp"
                  onClick={(e) => handleWhatsAppClick(site, daysLeft, e)}
                  title="Send 1-Click Renewal WhatsApp Message"
                >
                  <Send size={14} />
                  <span>WhatsApp Pitch</span>
                </button>

                {onOpenBookingModal && (
                  <button
                    type="button"
                    className="btn-radar-extend"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenBookingModal(site);
                    }}
                    title="Extend or create new booking slot"
                  >
                    <RefreshCw size={14} />
                    <span>Renew / Rebook</span>
                  </button>
                )}

                {onReleaseSite && occupancy.isOverdue && (
                  <button
                    type="button"
                    className="btn-radar-release"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReleaseSite(site);
                    }}
                    title="Mark site as Available right now"
                  >
                    <CheckCircle size={14} />
                    <span>Mark Available</span>
                  </button>
                )}

                <button
                  type="button"
                  className="btn-radar-details"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectSite) onSelectSite(site);
                  }}
                  title="View Site Details"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
