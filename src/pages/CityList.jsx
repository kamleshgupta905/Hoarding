import React, { useState, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Filter, ChevronDown, ListFilter, Map as MapIcon, Grid, Zap, Info } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Helmet } from 'react-helmet-async';
import HoardingCard from '../components/HoardingCard';
import { getImageUrl } from '../services/dataService';
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
                            // Reset time components for accurate date comparisons
                            const cleanQueryStart = new Date(queryStart.getFullYear(), queryStart.getMonth(), queryStart.getDate());
                            const cleanQueryEnd = new Date(queryEnd.getFullYear(), queryEnd.getMonth(), queryEnd.getDate());
                            const cleanBStart = new Date(bStart.getFullYear(), bStart.getMonth(), bStart.getDate());
                            const cleanBEnd = new Date(bEnd.getFullYear(), bEnd.getMonth(), bEnd.getDate());
                            
                            const overlaps = (cleanQueryStart <= cleanBEnd) && (cleanQueryEnd >= cleanBStart);
                            if (overlaps) {
                                matchDates = false;
                            }
                        } else {
                            // If marked Occupied but booking dates are not set or malformed, we treat it as fully booked
                            matchDates = false;
                        }
                    }
                }
            }

            return matchCity && matchLocality && matchPrice && matchSearch && matchDates;
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
    }, [cityHoardings, filterCity, filterLocality, priceRange, searchQuery, sortBy, campaignStart, campaignEnd]);

    const mapCenter = cityHoardings.length > 0
        ? [Number(cityHoardings[0].Latitude), Number(cityHoardings[0].Longitude)]
        : [28.6139, 77.2090]; // Delhi as default for 'all'

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
                            min={campaignStart} // End date cannot be before start date
                        />
                    </div>

                    <button className="reset-btn" onClick={() => {
                        setFilterCity('All');
                        setFilterLocality('All');
                        setPriceRange('All');
                        setSortBy('price-low');
                        setCampaignStart('');
                        setCampaignEnd('');
                    }}>Reset Filters</button>
                </aside>

                <section className="results-grid">
                    {viewType === 'map' ? (
                        <div className="map-view-container">
                            <MapContainer center={mapCenter} zoom={13} style={{ height: '600px', width: '100%', borderRadius: '12px' }}>
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                {filteredHoardings.map((h, i) => (
                                    <Marker key={i} position={[Number(h.Latitude), Number(h.Longitude)]}>
                                        <Popup>
                                            <div className="map-popup">
                                                <img src={getImageUrl(h)} alt={h["Location "]}
                                                    onError={(e) => e.target.src = 'https://placehold.co/200x120?text=Hoarding'} />
                                                <h4>{h["Location "]}</h4>
                                                <p>₹{Number(h["Rental Per Month"]).toLocaleString()} / month</p>
                                                <Link to={`/${h.City}/${encodeURIComponent(h["Location "])}`} className="popup-link">
                                                    View Details
                                                </Link>
                                            </div>
                                        </Popup>
                                    </Marker>
                                ))}
                            </MapContainer>
                        </div>
                    ) : filteredHoardings.length > 0 ? (
                        <div className="cards-wrapper">
                            {filteredHoardings.map((h, i) => (
                                <HoardingCard key={i} hoarding={h} />
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
