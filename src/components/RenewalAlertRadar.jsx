import React, { useState, useMemo } from 'react';
import { Bell, Clock, Calendar, CheckCircle, RefreshCw, Search, ChevronRight } from 'lucide-react';
import { getExpiringSites, getImageUrl, getHoardingThumbnailUrl, getHoardingImageCandidates } from '../services/dataService';
import './RenewalAlertRadar.css';

export default function RenewalAlertRadar({ 
  hoardings = [], 
  onSelectSite = null,
  onOpenBookingModal = null,
  onReleaseSite = null 
}) {
  const [thresholdDays, setThresholdDays] = useState(15);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'critical', 'overdue', 'standard'
  const [searchTerm, setSearchTerm] = useState('');
  const [dismissedKeys, setDismissedKeys] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('adh_dismissed_renewal_alerts') || '[]'));
    } catch {
      return new Set();
    }
  });

  // Calculate live expiring list (<= thresholdDays or overdue)
  const expiringItems = useMemo(() => {
    return getExpiringSites(hoardings, thresholdDays);
  }, [hoardings, thresholdDays]);

  // Aggregate stats
  const stats = useMemo(() => {
    let criticalCount = 0;
    let overdueCount = 0;
    let standardCount = 0;
    let totalRevenueRisk = 0;

    expiringItems.forEach(({ site, occupancy }) => {
      const siteId = site._SiteID || site.UniqueID || site.SL || site.Location || '';
      const dismissalKey = `${siteId}_${occupancy.formattedEndDate || 'current'}`;
      if (dismissedKeys.has(dismissalKey) || dismissedKeys.has(siteId)) return;

      if (occupancy.isOverdue) overdueCount++;
      else if (occupancy.statusTier === 'critical') criticalCount++;
      else standardCount++;

      const price = Number(site["Avg Monthly Cost (INR)"] ?? site["Rental Per Month"] ?? 0) || 0;
      totalRevenueRisk += price;
    });

    return {
      total: criticalCount + overdueCount + standardCount,
      criticalCount,
      overdueCount,
      standardCount,
      critical: criticalCount,
      overdue: overdueCount,
      standard: standardCount,
      totalRevenueRisk
    };
  }, [expiringItems, dismissedKeys]);

  // Filtered list
  const filteredItems = useMemo(() => {
    return expiringItems.filter(({ site, occupancy }) => {
      const siteId = site._SiteID || site.UniqueID || site.SL || site.Location || '';
      const dismissalKey = `${siteId}_${occupancy.formattedEndDate || 'current'}`;
      if (dismissedKeys.has(dismissalKey) || dismissedKeys.has(siteId)) return false;

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
  }, [expiringItems, activeFilter, searchTerm, dismissedKeys]);

  const handleDismiss = (siteId, formattedEndDate, e) => {
    e.stopPropagation();
    const dismissalKey = `${siteId}_${formattedEndDate || 'current'}`;
    setDismissedKeys(prev => {
      const next = new Set(prev);
      next.add(dismissalKey);
      try {
        localStorage.setItem('adh_dismissed_renewal_alerts', JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const handleResetDismissed = () => {
    setDismissedKeys(new Set());
    try {
      localStorage.removeItem('adh_dismissed_renewal_alerts');
    } catch {}
  };

  if (stats.total === 0) {
    return (
      <div className="renewal-radar-panel renewal-radar-empty" style={{ flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1 1 320px' }}>
          <div className="radar-empty-badge">
            <CheckCircle size={24} className="text-emerald-400" />
          </div>
          <div className="radar-empty-content">
            <h4>All Hoardings Secure</h4>
            <p>No hoardings are expiring in the next <strong>{thresholdDays} days</strong>. All active campaign bookings are retained.</p>
          </div>
        </div>

        {/* Quick Horizon Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#047857', marginRight: '2px' }}>Check Window:</span>
          {[7, 15, 30, 45, 60].map(days => (
            <button
              key={days}
              type="button"
              onClick={() => setThresholdDays(days)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: thresholdDays === days ? 700 : 500,
                border: thresholdDays === days ? '1px solid #059669' : '1px solid #a7f3d0',
                background: thresholdDays === days ? '#059669' : '#ffffff',
                color: thresholdDays === days ? '#ffffff' : '#065f46',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {days}d
            </button>
          ))}
          {dismissedKeys.size > 0 && (
            <button
              type="button"
              onClick={handleResetDismissed}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '0.7rem',
                border: '1px solid #d1d5db',
                background: '#ffffff',
                color: '#6b7280',
                cursor: 'pointer',
                marginLeft: '4px'
              }}
              title="Unhide previously dismissed alerts"
            >
              Reset Dismissed
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="renewal-radar-panel animate-fade-in">
      <div className="radar-header">
        <div className="radar-header-left">
          <div className="radar-live-beacon">
            <Bell size={18} />
          </div>
          <div>
            <div className="radar-title-row">
              <h3>Expiring Bookings</h3>
              <span className="radar-pulse-badge">
                {stats.total} in next {thresholdDays} days
              </span>
            </div>
            <p className="radar-subtitle">
              Renew or release these sites before they go vacant.
            </p>
          </div>
        </div>

        {/* Horizon selector on top right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginRight: '2px' }}>Horizon:</span>
          {[7, 15, 30, 45, 60].map(days => (
            <button
              key={days}
              type="button"
              onClick={() => setThresholdDays(days)}
              style={{
                padding: '4px 9px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: thresholdDays === days ? 700 : 500,
                border: thresholdDays === days ? '1px solid #d97706' : '1px solid #e2e8f0',
                background: thresholdDays === days ? '#fef3c7' : '#ffffff',
                color: thresholdDays === days ? '#92400e' : '#64748b',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {days}d
            </button>
          ))}
          {dismissedKeys.size > 0 && (
            <button
              type="button"
              onClick={handleResetDismissed}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '0.7rem',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                color: '#64748b',
                cursor: 'pointer',
                marginLeft: '4px'
              }}
              title="Unhide previously dismissed alerts"
            >
              Reset Dismissed
            </button>
          )}
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
          <span className="metric-name">5 - {thresholdDays} Days</span>
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
          const imgUrl = getHoardingThumbnailUrl(site);
          const daysLeft = occupancy.daysLeft;

          return (
            <div 
              key={siteId || siteLoc} 
              className={`radar-card ${occupancy.statusTier}`}
              onClick={() => onSelectSite && onSelectSite(site)}
            >
              <button 
                type="button" 
                className="radar-card-dismiss-btn"
                title="Dismiss alert"
                aria-label="Dismiss alert"
                onClick={(e) => handleDismiss(siteId || siteLoc, occupancy.formattedEndDate, e)}
              >
                ×
              </button>

              <div className="radar-card-media">
                <img 
                  src={imgUrl} 
                  alt={siteLoc} 
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const el = e.target;
                    const currentSrc = el.src || '';

                    // 1. Try Google Drive thumbnail format (sz=w400)
                    if (!el.dataset.triedThumb) {
                      el.dataset.triedThumb = 'true';
                      const fileIdMatch = currentSrc.match(/lh3\.googleusercontent\.com\/d\/([^/?#\s]+)/) ||
                                          currentSrc.match(/\/file\/d\/([^/?#\s]+)/) ||
                                          currentSrc.match(/[?&]id=([^&#/\s]+)/);
                      if (fileIdMatch && fileIdMatch[1]) {
                        el.src = `https://drive.google.com/thumbnail?id=${fileIdMatch[1]}&sz=w400`;
                        return;
                      }
                    }

                    // 2. Try Google Drive export=view format
                    if (!el.dataset.triedView) {
                      el.dataset.triedView = 'true';
                      const fileIdMatch = currentSrc.match(/[?&]id=([^&#/\s]+)/) ||
                                          currentSrc.match(/lh3\.googleusercontent\.com\/d\/([^/?#\s]+)/) ||
                                          currentSrc.match(/\/file\/d\/([^/?#\s]+)/);
                      if (fileIdMatch && fileIdMatch[1]) {
                        el.src = `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`;
                        return;
                      }
                    }

                    // 3. Try lh3 direct Google CDN
                    if (!el.dataset.triedLh3) {
                      el.dataset.triedLh3 = 'true';
                      const fileIdMatch = currentSrc.match(/[?&]id=([^&#/\s]+)/) ||
                                          currentSrc.match(/\/file\/d\/([^/?#\s]+)/);
                      if (fileIdMatch && fileIdMatch[1]) {
                        el.src = `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
                        return;
                      }
                    }

                    // 4. Try site history photo or alternative candidate images
                    if (!el.dataset.triedCandidates) {
                      el.dataset.triedCandidates = 'true';
                      const candidates = getHoardingImageCandidates(site);
                      const altImg = candidates.find(c => c && c !== currentSrc && !c.includes(currentSrc));
                      if (altImg) {
                        el.src = altImg;
                        return;
                      }
                    }

                    // 5. Retry once after 1s for transient network lag
                    if (!el.dataset.retriedOnce) {
                      el.dataset.retriedOnce = 'true';
                      setTimeout(() => {
                        if (el && el.parentElement) {
                          el.src = `${currentSrc.split('?')[0]}?retry=${Date.now()}`;
                        }
                      }, 1000);
                      return;
                    }

                    // 6. Graceful premium billboard fallback
                    el.src = 'https://images.unsplash.com/photo-1541535650810-10d26f592a7d?auto=format&fit=crop&q=80&w=400';
                  }}
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
