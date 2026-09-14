import React, { useState, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Filter, ListFilter, Map as MapIcon, Grid, Radio } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Helmet } from 'react-helmet-async';
import HoardingCard from '../components/HoardingCard';
import { getImageUrl, getSiteOccupancyStatus, generateWhatsAppRenewalMessage } from '../services/dataService';
import './CityList.css';

// Fix for default marker icon in Leaflet
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Helper to safely parse different date formats
const parseDate = (dateStr) => {
    if (!dateStr) return null;
    const cleanStr = dateStr.toString().trim();
    if (!cleanStr) return null;

    // Check if it matches YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
        return new Date(cleanStr);
    }

    // Check if it matches DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = cleanStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10) - 1; // 0-indexed
        const year = parseInt(dmyMatch[3], 10);
        return new Date(year, month, day);
    }

    // Fallback: use JavaScript Date constructor
    const parsed = new Date(cleanStr);
    return isNaN(parsed.getTime()) ? null : parsed;
};

// 🎨 Generate high-contrast dynamic Leaflet marker for each occupancy state
const createOccupancyIcon = (occupancy) => {
    const status = occupancy.status;
    const daysLeft = occupancy.daysLeft;

    let pinClass = 'marker-available';
    let symbol = '🟢';
    let badgeText = '';

    if (status === 'EXPIRING_SOON') {
        pinClass = 'marker-expiring-pulse';
        symbol = '🟡';
        badgeText = daysLeft !== null ? `${daysLeft}d` : '!';
    } else if (status === 'OVERDUE') {
        pinClass = 'marker-overdue';
        symbol = '🟣';
        badgeText = 'OD';
    } else if (status === 'BOOKED') {
        pinClass = 'marker-booked';
        symbol = '🔴';
    }

    return L.divIcon({
        className: 'occupancy-leaflet-marker-wrapper',
        html: `
            <div class="occupancy-pin-marker ${pinClass}" title="${occupancy.badgeLabel}">
                <div class="pin-core">${symbol}</div>
                ${badgeText ? `<div class="pin-days-tag">${badgeText}</div>` : ''}
                ${status === 'EXPIRING_SOON' ? '<div class="pin-radar-ring"></div>' : ''}
            </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36]
    });
};

const CityList = ({ hoardings }) => {
    const { cityName } = useParams();
    const [searchParams] = useSearchParams();
    const searchQuery = searchParams.get('search') || '';

    // View state
    const [viewType, setViewType] = useState('grid'); // 'grid' or 'map'

    // Filter states
    const [filterCity, setFilterCity] = useState('All');
    const [filterLocality, setFilterLocality] = useState('All');
    const [priceRange, setPriceRange] = useState('All');
    const [occupancyFilter, setOccupancyFilter] = useState('All'); // 'All', 'Available', 'Expiring', 'Booked'
    const [sortBy, setSortBy] = useState('price-low');
    const [campaignStart, setCampaignStart] = useState('');
    const [campaignEnd, setCampaignEnd] = useState('');

    const isAllCities = cityName?.toLowerCase() === 'all';

    const cityHoardings = useMemo(() => {
        if (isAllCities) {
            return hoardings.filter(h => h.STATUS && h.STATUS.toLowerCase() !== 'disabled');
        }
        return hoardings.filter(h =>
            h.City?.toLowerCase() === cityName?.toLowerCase() &&
            h.STATUS && h.STATUS.toLowerCase() !== 'disabled'
        );
    }, [hoardings, cityName, isAllCities]);

    const citiesOption = useMemo(() => {
        const rawCities = hoardings.map(h => h.City?.trim()).filter(Boolean);
        // Normalize to Title Case (e.g. "meerut" -> "Meerut") to avoid duplicates
        const normalized = rawCities.map(c => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase());
        return ['All', ...new Set(normalized)];
    }, [hoardings]);

    const activeCityHoardings = useMemo(() => {
        if (isAllCities) {
            if (filterCity === 'All') return cityHoardings;
            return cityHoardings.filter(h => (h.City || '').trim().toLowerCase() === filterCity.trim().toLowerCase());
        }
        return cityHoardings;
    }, [isAllCities, filterCity, cityHoardings]);

    const localities = useMemo(() => {
        const raw = activeCityHoardings
            .map(h => (h["Locality"] || h["Area"] || '').trim())
            .filter(Boolean);
        const unique = [...new Set(raw)].sort((a, b) => a.localeCompare(b));
        return ['All', ...unique];
    }, [activeCityHoardings]);

    // Compute live radar counts for active city selection
    const occupancyStats = useMemo(() => {
        let available = 0;
        let expiring = 0;
        let booked = 0;
        let overdue = 0;

        activeCityHoardings.forEach(h => {
            const occ = getSiteOccupancyStatus(h);
            if (occ.status === 'AVAILABLE') available++;
            else if (occ.status === 'EXPIRING_SOON') expiring++;
            else if (occ.status === 'OVERDUE') overdue++;
            else if (occ.status === 'BOOKED') booked++;
        });

        return {
            total: activeCityHoardings.length,
            available,
            expiring,
            booked,
            overdue
        };
    }, [activeCityHoardings]);

    const filteredHoardings = useMemo(() => {
        let filtered = cityHoardings.filter(h => {
            const rawPrice = h["Avg Monthly Cost (INR)"] ?? h["Rental Per Month"] ?? 0;
            const hPrice = typeof rawPrice === 'string' ? parseFloat(rawPrice.replace(/[^0-9.]/g, '')) || 0 : (Number(rawPrice) || 0);
            const hCity = (h.City || '').trim().toLowerCase();
            const selectedCity = filterCity.toLowerCase();
            const siteLocality = (h["Locality"] || h["Area"] || '').trim();
            
            const matchCity = filterCity === 'All' || hCity === selectedCity;
            const matchLocality = filterLocality === 'All' || siteLocality.toLowerCase() === filterLocality.toLowerCase();

            let matchPrice = true;
            if (priceRange === '0-25k') matchPrice = hPrice <= 25000;
            else if (priceRange === '25k-50k') matchPrice = hPrice > 25000 && hPrice <= 50000;
            else if (priceRange === '50k+') matchPrice = hPrice > 50000;

            const matchSearch = searchQuery === '' ||
                siteLocality.toLowerCase().includes(searchQuery.toLowerCase()) ||
                String(h["Locality Site Location"] || h["Location "] || h["Location"] || '').toLowerCase().includes(searchQuery.toLowerCase());

            // 🎯 Occupancy Status Filter
            let matchOccupancy = true;
            if (occupancyFilter !== 'All') {
                const occ = getSiteOccupancyStatus(h);
                if (occupancyFilter === 'Available') {
                    matchOccupancy = occ.status === 'AVAILABLE';
                } else if (occupancyFilter === 'Expiring') {
                    matchOccupancy = occ.isExpiringSoon;
                } else if (occupancyFilter === 'Booked') {
                    matchOccupancy = occ.status === 'BOOKED' || occ.status === 'OVERDUE';
                }
            }

            // Date Range Filter Logic
            let matchDates = true;
            if (campaignStart && campaignEnd) {
                const queryStart = new Date(campaignStart);
                const queryEnd = new Date(campaignEnd);
                
                if (!isNaN(queryStart.getTime()) && !isNaN(queryEnd.getTime()) && queryStart <= queryEnd) {
                    const isBooked = h.STATUS?.toLowerCase() === 'occupied' || h.STATUS?.toLowerCase() === 'booked';
                    if (isBooked) {
                        const bStart = parseDate(h.BookingStart);
                        const bEnd = parseDate(h.BookingEnd);
                        
                        if (bStart && bEnd) {
                            const cleanQueryStart = new Date(queryStart.getFullYear(), queryStart.getMonth(), queryStart.getDate());
                            const cleanQueryEnd = new Date(queryEnd.getFullYear(), queryEnd.getMonth(), queryEnd.getDate());
                            const cleanBStart = new Date(bStart.getFullYear(), bStart.getMonth(), bStart.getDate());
                            const cleanBEnd = new Date(bEnd.getFullYear(), bEnd.getMonth(), bEnd.getDate());
                            
                            const overlaps = (cleanQueryStart <= cleanBEnd) && (cleanQueryEnd >= cleanBStart);
                            if (overlaps) {
                                matchDates = false;
                            }
                        } else {
                            matchDates = false;
                        }
                    }
                }
            }

            return matchCity && matchLocality && matchPrice && matchSearch && matchDates && matchOccupancy;
        });

        if (sortBy === 'price-low') {
            filtered.sort((a, b) => {
                const pA = Number(a["Avg Monthly Cost (INR)"] || a["Rental Per Month"] || 0);
                const pB = Number(b["Avg Monthly Cost (INR)"] || b["Rental Per Month"] || 0);
                return pA - pB;
            });
        } else if (sortBy === 'price-high') {
            filtered.sort((a, b) => {
                const pA = Number(a["Avg Monthly Cost (INR)"] || a["Rental Per Month"] || 0);
                const pB = Number(b["Avg Monthly Cost (INR)"] || b["Rental Per Month"] || 0);
                return pB - pA;
            });
        } else if (sortBy === 'size') {
            const sizeOrder = { 'Large': 3, 'Medium': 2, 'Small': 1 };
            filtered.sort((a, b) => (sizeOrder[b["Size (Large/Medium/Small)"]] || 0) - (sizeOrder[a["Size (Large/Medium/Small)"]] || 0));
        }

        return filtered;
    }, [cityHoardings, filterCity, filterLocality, priceRange, searchQuery, sortBy, campaignStart, campaignEnd, occupancyFilter]);

    // Filter valid coordinates for map markers to prevent Leaflet NaN crashes
    const validMapHoardings = useMemo(() => {
        return filteredHoardings.filter(h => {
            const lat = parseFloat(h.Latitude || h.Lat || h['Lat.']);
            const lng = parseFloat(h.Longitude || h.Long || h['Long.']);
            return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
        });
    }, [filteredHoardings]);

    const firstValidSiteWithCoords = validMapHoardings[0] || cityHoardings.find(h => {
        const lat = parseFloat(h.Latitude || h.Lat || h['Lat.']);
        const lng = parseFloat(h.Longitude || h.Long || h['Long.']);
        return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
    });

    const mapCenter = firstValidSiteWithCoords
        ? [parseFloat(firstValidSiteWithCoords.Latitude || firstValidSiteWithCoords.Lat || firstValidSiteWithCoords['Lat.']), parseFloat(firstValidSiteWithCoords.Longitude || firstValidSiteWithCoords.Long || firstValidSiteWithCoords['Long.'])]
        : [28.6139, 77.2090]; // Delhi fallback

    return (
        <div className="city-list-page container">
            <Helmet>
                <title>{isAllCities ? 'All Available Hoardings' : `Hoardings in ${cityName}`} | Heera Advertising</title>
                <meta name="description" content={`Discover and book premium billboard locations in ${isAllCities ? 'all cities' : cityName}. Verified sites with pricing and availability.`} />
                <meta name="keywords" content={`heera advertising, hoardings ${cityName}, billboards ${cityName}, outdoor media ${cityName}, advertising sites ${cityName}`} />
            </Helmet>

            <header className="list-header" role="banner">
                <div className="title-area animate-in">
                    {isAllCities ? (
                        <h1>Modern <span>Outdoor Assets</span></h1>
                    ) : (
                        <h1>Hoardings in <span>{cityName}</span></h1>
                    )}
                    <p>Discovering {filteredHoardings.length} premium billboard locations</p>
                </div>

                <div className="header-actions">
                    <div className="view-toggle">
                        <button
                            className={viewType === 'grid' ? 'active' : ''}
                            onClick={() => setViewType('grid')}
                        >
                            <Grid size={18} /> Grid
                        </button>
                        <button
                            className={viewType === 'map' ? 'active' : ''}
                            onClick={() => setViewType('map')}
                        >
                            <MapIcon size={18} /> Map
                        </button>
                    </div>
                    <div className="sort-controls">
                        <label><ListFilter size={18} /> Sort By:</label>
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                            <option value="price-low">Price (Low → High)</option>
                            <option value="price-high">Price (High → Low)</option>
                            <option value="size">Size (Large First)</option>
                        </select>
                    </div>
                </div>
            </header>

            <div className="list-layout">
                <aside className="filter-panel">
                    <div className="filter-section">
                        <h4><Filter size={16} /> Filters</h4>
                    </div>

                    {isAllCities && (
                        <div className="filter-group">
                            <label>Select City</label>
                            <select 
                                value={filterCity} 
                                onChange={(e) => {
                                    setFilterCity(e.target.value);
                                    setFilterLocality('All');
                                }}
                            >
                                {citiesOption.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    )}

                    <div className="filter-group">
                        <label>Occupancy Status</label>
                        <select value={occupancyFilter} onChange={(e) => setOccupancyFilter(e.target.value)}>
                            <option value="All">All Statuses ({occupancyStats.total})</option>
                            <option value="Available">🟢 Available ({occupancyStats.available})</option>
                            <option value="Expiring">🟡 Expiring Soon ≤15d ({occupancyStats.expiring})</option>
                            <option value="Booked">🔴 Booked ({occupancyStats.booked + occupancyStats.overdue})</option>
                        </select>
                    </div>

                    <div className="filter-group">
                        <label>Locality</label>
                        <select value={filterLocality} onChange={(e) => setFilterLocality(e.target.value)}>
                            {localities.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>

                    <div className="filter-group">
                        <label>Price Range</label>
                        <select value={priceRange} onChange={(e) => setPriceRange(e.target.value)}>
                            <option value="All">All Prices</option>
                            <option value="0-25k">Under ₹25k</option>
                            <option value="25k-50k">₹25k - ₹50k</option>
                            <option value="50k+">Above ₹50k</option>
                        </select>
                    </div>

                    <div className="filter-group date-filter-group">
                        <label>Available From</label>
                        <input
                            type="date"
                            value={campaignStart}
                            onChange={(e) => setCampaignStart(e.target.value)}
                            className="date-input"
                        />
                    </div>

                    <div className="filter-group date-filter-group">
                        <label>Available To</label>
                        <input
                            type="date"
                            value={campaignEnd}
                            onChange={(e) => setCampaignEnd(e.target.value)}
                            className="date-input"
                            min={campaignStart}
                        />
                    </div>

                    <button className="reset-btn" onClick={() => {
                        setFilterCity('All');
                        setFilterLocality('All');
                        setPriceRange('All');
                        setOccupancyFilter('All');
                        setSortBy('price-low');
                        setCampaignStart('');
                        setCampaignEnd('');
                    }}>Reset Filters</button>
                </aside>

                <section className="results-grid">
                    {viewType === 'map' ? (
                        <div className="map-view-container">
                            {/* 🧭 Occupancy Heatmap Bar & Radar Quick Filter */}
                            <div className="map-heatmap-bar">
                                <div className="heatmap-bar-title">
                                    <Radio size={16} className="radar-icon-pulse" />
                                    <span>Occupancy Radar:</span>
                                </div>
                                <div className="heatmap-bar-chips">
                                    <button 
                                        type="button" 
                                        className={`heatmap-chip chip-all ${occupancyFilter === 'All' ? 'active' : ''}`}
                                        onClick={() => setOccupancyFilter('All')}
                                    >
                                        All ({occupancyStats.total})
                                    </button>
                                    <button 
                                        type="button" 
                                        className={`heatmap-chip chip-available ${occupancyFilter === 'Available' ? 'active' : ''}`}
                                        onClick={() => setOccupancyFilter('Available')}
                                    >
                                        🟢 Available ({occupancyStats.available})
                                    </button>
                                    <button 
                                        type="button" 
                                        className={`heatmap-chip chip-expiring ${occupancyFilter === 'Expiring' ? 'active' : ''}`}
                                        onClick={() => setOccupancyFilter('Expiring')}
                                    >
                                        🟡 Expiring ≤15d ({occupancyStats.expiring})
                                    </button>
                                    <button 
                                        type="button" 
                                        className={`heatmap-chip chip-booked ${occupancyFilter === 'Booked' ? 'active' : ''}`}
                                        onClick={() => setOccupancyFilter('Booked')}
                                    >
                                        🔴 Booked ({occupancyStats.booked + occupancyStats.overdue})
                                    </button>
                                </div>
                            </div>

                            <MapContainer center={mapCenter} zoom={13} style={{ height: '620px', width: '100%', borderRadius: '14px' }}>
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                {validMapHoardings.map((h, i) => {
                                    const lat = parseFloat(h.Latitude || h.Lat || h['Lat.']);
                                    const lng = parseFloat(h.Longitude || h.Long || h['Long.']);
                                    const occupancy = getSiteOccupancyStatus(h);
                                    const locName = h["Location "] || h.Location || h["Locality Site Location"] || 'Hoarding Site';
                                    const rentalPrice = Number(h["Rental Per Month"] || h["Avg Monthly Cost (INR)"] || 0);

                                    return (
                                        <Marker 
                                            key={h._SiteID || h.UniqueID || h.SL || `${lat}-${lng}-${i}`} 
                                            position={[lat, lng]}
                                            icon={createOccupancyIcon(occupancy)}
                                        >
                                            <Popup>
                                                <div className="map-popup custom-occupancy-popup">
                                                    <div className="map-popup-thumb-wrap">
                                                        <img 
                                                            src={getImageUrl(h)} 
                                                            alt={locName}
                                                            onError={(e) => { e.target.src = 'https://placehold.co/220x130?text=Hoarding'; }} 
                                                        />
                                                        <span 
                                                            className="popup-status-badge"
                                                            style={{
                                                                color: occupancy.badgeColor,
                                                                background: occupancy.badgeBg,
                                                                borderColor: occupancy.badgeBorder
                                                            }}
                                                        >
                                                            {occupancy.badgeLabel}
                                                        </span>
                                                    </div>
                                                    
                                                    <div className="map-popup-body">
                                                        <h4>{locName}</h4>
                                                        <p className="popup-subtext">{h.City}{h.Locality ? ` • ${h.Locality}` : ''}</p>
                                                        
                                                        <div className="popup-price-row">
                                                            <strong>₹{rentalPrice.toLocaleString()}</strong>
                                                            <span>/ month</span>
                                                        </div>

                                                        {occupancy.client && occupancy.status !== 'AVAILABLE' && (
                                                            <div className="popup-client-badge">
                                                                <span>Client: <strong>{occupancy.client}</strong></span>
                                                                {occupancy.formattedEndDate && (
                                                                    <small> (Expires {occupancy.formattedEndDate})</small>
                                                                )}
                                                            </div>
                                                        )}

                                                        <div className="popup-cta-row">
                                                            {occupancy.isExpiringSoon || occupancy.status === 'BOOKED' ? (
                                                                <a
                                                                    href={`https://wa.me/?text=${encodeURIComponent(generateWhatsAppRenewalMessage(h, occupancy.daysLeft))}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="popup-action-btn popup-btn-wa"
                                                                    title="Send 1-click renewal pitch to client"
                                                                >
                                                                    💬 WhatsApp Pitch
                                                                </a>
                                                            ) : (
                                                                <a
                                                                    href={`https://wa.me/?text=${encodeURIComponent(`Hi Heera Advertising, I am interested in booking your hoarding at ${locName} (${h.City}). Please share details.`)}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="popup-action-btn popup-btn-wa"
                                                                    title="Inquire on WhatsApp"
                                                                >
                                                                    💬 WhatsApp Inquiry
                                                                </a>
                                                            )}
                                                            <Link 
                                                                to={`/${h.City}/${encodeURIComponent(locName)}`} 
                                                                className="popup-action-btn popup-btn-details"
                                                            >
                                                                View Details →
                                                            </Link>
                                                        </div>
                                                    </div>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    );
                                })}
                            </MapContainer>
                        </div>
                    ) : filteredHoardings.length > 0 ? (
                        <div className="cards-wrapper">
                            {filteredHoardings.map((h, i) => (
                                <HoardingCard key={h._SiteID || h.UniqueID || h.SL || i} hoarding={h} />
                            ))}
                        </div>
                    ) : (
                        <div className="no-results">
                            <h3>No hoardings match your filters.</h3>
                            <p>Try resetting the filters or searching for another locality.</p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default CityList;
