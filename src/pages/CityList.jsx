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

const CityList = ({ hoardings }) => {
    const { cityName } = useParams();
    const [searchParams] = useSearchParams();
    const searchQuery = searchParams.get('search') || '';

    // View state
    const [viewType, setViewType] = useState('grid'); // 'grid' or 'map'

    // Filter states
    const [filterLocality, setFilterLocality] = useState('All');
    const [filterSize, setFilterSize] = useState('All');
    const [filterDigital, setFilterDigital] = useState('All');
    const [filterMedia, setFilterMedia] = useState('All');
    const [priceRange, setPriceRange] = useState('All');
    const [sortBy, setSortBy] = useState('price-low');

    const isAllCities = cityName?.toLowerCase() === 'all';

    const cityHoardings = useMemo(() => {
        if (isAllCities) {
            return hoardings.filter(h => h.Status !== 'Disabled');
        }
        return hoardings.filter(h =>
            h.City?.toLowerCase() === cityName?.toLowerCase() &&
            h.Status !== 'Disabled'
        );
    }, [hoardings, cityName, isAllCities]);



    const localities = ['All', ...new Set(cityHoardings.map(h => h.Locality))];
    const sizes = ['All', ...new Set(cityHoardings.map(h => h["Size (Large/Medium/Small)"]))];
    const mediaFormats = ['All', ...new Set(cityHoardings.map(h => h["Media Format (Front Lit / Back Lit / Non Lit)"]))];

    const filteredHoardings = useMemo(() => {
        let filtered = cityHoardings.filter(h => {
            const hPrice = Number(h["Avg Monthly Cost (INR)"]);
            const matchLocality = filterLocality === 'All' || h.Locality === filterLocality;
            const matchSize = filterSize === 'All' || h["Size (Large/Medium/Small)"] === filterSize;
            const matchDigital = filterDigital === 'All' || h["Digital / Non Digital"] === filterDigital;
            const matchMedia = filterMedia === 'All' || h["Media Format (Front Lit / Back Lit / Non Lit)"] === filterMedia;

            let matchPrice = true;
            if (priceRange === '0-25k') matchPrice = hPrice <= 25000;
            else if (priceRange === '25k-50k') matchPrice = hPrice > 25000 && hPrice <= 50000;
            else if (priceRange === '50k+') matchPrice = hPrice > 50000;

            const matchSearch = searchQuery === '' ||
                h.Locality?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                h["Locality Site Location"]?.toLowerCase().includes(searchQuery.toLowerCase());

            return matchLocality && matchSize && matchDigital && matchMedia && matchPrice && matchSearch;
        });

        if (sortBy === 'price-low') {
            filtered.sort((a, b) => Number(a["Avg Monthly Cost (INR)"]) - Number(b["Avg Monthly Cost (INR)"]));
        } else if (sortBy === 'price-high') {
            filtered.sort((a, b) => Number(b["Avg Monthly Cost (INR)"]) - Number(a["Avg Monthly Cost (INR)"]));
        } else if (sortBy === 'size') {
            const sizeOrder = { 'Large': 3, 'Medium': 2, 'Small': 1 };
            filtered.sort((a, b) => sizeOrder[(b["Size (Large/Medium/Small)"] || 'Small')] - sizeOrder[(a["Size (Large/Medium/Small)"] || 'Small')]);
        }

        return filtered;
    }, [cityHoardings, filterLocality, filterSize, filterDigital, filterMedia, priceRange, sortBy, searchQuery]);

    const mapCenter = cityHoardings.length > 0
        ? [Number(cityHoardings[0].Latitude), Number(cityHoardings[0].Longitude)]
        : [28.6139, 77.2090]; // Delhi as default for 'all'

    return (
        <div className="city-list-page container">
            <Helmet>
                <title>{isAllCities ? 'All India Premium Billboards' : `Hoardings in ${cityName} | Premium Billboard Ads`}</title>
                <meta name="description" content={`Exclusive outdoor advertising opportunities in ${isAllCities ? 'India' : cityName}. Browse ${filteredHoardings.length} verified hoarding sites, check rates and view map locations.`} />
                <meta name="keywords" content={`hoardings ${cityName}, billboards ${cityName}, outdoor media ${cityName}, advertising sites ${cityName}`} />
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

                    <div className="filter-group">
                        <label>Locality</label>
                        <select value={filterLocality} onChange={(e) => setFilterLocality(e.target.value)}>
                            {localities.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>

                    <div className="filter-group">
                        <label>Size</label>
                        <select value={filterSize} onChange={(e) => setFilterSize(e.target.value)}>
                            {sizes.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    <div className="filter-group">
                        <label>Media Format</label>
                        <select value={filterMedia} onChange={(e) => setFilterMedia(e.target.value)}>
                            {mediaFormats.map(m => <option key={m} value={m}>{m}</option>)}
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

                    <div className="filter-group">
                        <label>Digital / Non Digital</label>
                        <select value={filterDigital} onChange={(e) => setFilterDigital(e.target.value)}>
                            <option value="All">All Types</option>
                            <option value="Digital">Digital</option>
                            <option value="Non Digital">Non Digital</option>
                        </select>
                    </div>

                    <button className="reset-btn" onClick={() => {
                        setFilterLocality('All');
                        setFilterSize('All');
                        setFilterDigital('All');
                        setFilterMedia('All');
                        setPriceRange('All');
                        setSortBy('price-low');
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
                                                <img src={getImageUrl(h)} alt={h["Locality Site Location"]}
                                                    onError={(e) => e.target.src = 'https://placehold.co/200x120?text=Hoarding'} />
                                                <h4>{h["Locality Site Location"]}</h4>
                                                <p>₹{Number(h["Avg Monthly Cost (INR)"]).toLocaleString()} / month</p>
                                                <Link to={`/${h.City}/${encodeURIComponent(h["Locality Site Location"])}`} className="popup-link">
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
