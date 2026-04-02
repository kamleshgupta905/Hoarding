import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, ArrowRight, TrendingUp, Globe, CheckCircle } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import './Home.css';

const Home = ({ hoardings }) => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');

    // Derive unique cities ONLY from the actual inventory (already filtered for active status)
    const rawCities = hoardings.map(h => h.City?.trim()).filter(Boolean);
    // Normalize to Title Case to avoid duplicates like "Meerut" and "meerut"
    const normalizedCities = [...new Set(rawCities.map(c => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()))];
    const totalSites = hoardings.length;

    // Filter out any garbage or summary rows that might be in the sheet
    const garbageKeywords = ['all', 'total', 'active', 'sites'];
    const allCities = normalizedCities.filter(city => {
        const lowerCity = city.toLowerCase();
        const isGarbage = (garbageKeywords.filter(kw => lowerCity.includes(kw)).length >= 2) ||
            lowerCity === 'grand total' ||
            city.length < 3;
        return !isGarbage;
    });

    // Optional: Sort cities alphabetically
    allCities.sort((a, b) => a.localeCompare(b));

    const handleCitySelect = (city) => {
        navigate(`/${city}`);
    };

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchTerm) {
            const match = hoardings.find(h =>
                h.Locality?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                h["Locality Site Location"]?.toLowerCase().includes(searchTerm.toLowerCase())
            );
            if (match) {
                navigate(`/${match.City}?search=${searchTerm}`);
            }
        }
    };

    return (
        <div className="home-page">
            <Helmet>
                <title>AdHoardings Discovery | Premium Outdoor Advertising in India</title>
                <meta name="description" content="India's leading platform for premium outdoor advertising discovery. Browse verified hoarding sites, billboards, and unipoles across Delhi, Mumbai, Bangalore and more." />
                <meta name="keywords" content="billboard advertising, hoarding listings, outdoor media india, unipole ads, OOH advertising" />
            </Helmet>

            <main role="main">
                <section className="hero" aria-labelledby="hero-title">
                    <div className="container hero-content">
                        <h1 id="hero-title" className="animate-in">Discover & Book Premium <br /><span>Outdoor Hoardings</span></h1>
                        <p className="animate-in" style={{ animationDelay: '0.1s' }}>
                            The most comprehensive platform for outdoor advertising site discovery, visual proof, and booking.
                        </p>

                        <div className="search-container animate-in" style={{ animationDelay: '0.2s' }}>
                            <form className="search-box" onSubmit={handleSearch} role="search">
                                <div className="input-group">
                                    <MapPin className="icon" size={20} aria-hidden="true" />
                                    <select
                                        onChange={(e) => handleCitySelect(e.target.value)}
                                        defaultValue=""
                                        aria-label="Select Target City"
                                    >
                                        <option value="" disabled>Select City</option>
                                        {allCities.map(city => (
                                            <option key={city} value={city}>{city}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="divider" aria-hidden="true"></div>
                                <div className="input-group">
                                    <Search className="icon" size={20} aria-hidden="true" />
                                    <input
                                        type="text"
                                        placeholder="Search by Locality or Site Name"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        aria-label="Search Locality"
                                    />
                                </div>
                                <button type="submit" className="search-btn">Search Assets</button>
                            </form>
                        </div>

                        <div className="hero-metrics animate-in" style={{ animationDelay: '0.3s' }}>
                            <div className="metric">
                                <CheckCircle size={18} aria-hidden="true" />
                                <span><strong>{totalSites}+</strong> Premium Sites</span>
                            </div>
                            <div className="metric">
                                <Globe size={18} aria-hidden="true" />
                                <span><strong>{allCities.length}+</strong> Cities</span>
                            </div>
                            <div className="metric">
                                <TrendingUp size={18} aria-hidden="true" />
                                <span><strong>5M+</strong> Impressions</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="featured-section container section-padding">
                    <div className="featured-header animate-in">
                        <h2>Prime Advertising Regions</h2>
                        <button
                            className="gold-link"
                            onClick={() => navigate('/all')}
                            aria-label="Browse all hoarding inventory"
                        >
                            Browse all sites
                        </button>
                    </div>
                    <div className="city-cards">
                        {allCities.map(city => (
                            <article
                                key={city}
                                className="city-card animate-in"
                                onClick={() => handleCitySelect(city)}
                                role="button"
                                tabIndex="0"
                                aria-label={`View hoardings in ${city}`}
                                onKeyPress={(e) => e.key === 'Enter' && handleCitySelect(city)}
                            >
                                <CityImage city={city} />
                                <div className="city-overlay">
                                    <h3 style={{ textTransform: 'capitalize' }}>{city}</h3>
                                    <p>{hoardings.filter(h => h.City?.trim().toLowerCase() === city.toLowerCase() && h.STATUS !== 'Disabled').length} Sites available</p>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
};


// 🌟 Smart Image Selection for Cities
const getCityImage = (city) => {
    const cityImages = {
        'delhi': 'https://images.unsplash.com/photo-1587474260584-1f35a7a8b577?auto=format&fit=crop&q=80&w=800', // India Gate
        'mumbai': 'https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7?auto=format&fit=crop&q=80&w=800', // Gateway of India
        'bangalore': 'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&q=80&w=800', // Vidhana Soudha
        'noida': 'https://images.unsplash.com/photo-1595111000632-4d2bc33dc9e5?auto=format&fit=crop&q=80&w=800', // Modern Skyline
        'gurgaon': 'https://images.unsplash.com/photo-1625244724123-1ee707a27567?auto=format&fit=crop&q=80&w=800', // Cyber Hub
        'meerut': 'https://images.unsplash.com/photo-1650352523276-88069502b66d?auto=format&fit=crop&q=80&w=800', // Clock Tower
        'ghaziabad': 'https://images.unsplash.com/photo-1588665715875-10111100e008?auto=format&fit=crop&q=80&w=800', // Hindon
        'lucknow': 'https://images.unsplash.com/photo-1592247656333-6a388f8d9518?auto=format&fit=crop&q=80&w=800', // Imambara
        'kanpur': 'https://images.unsplash.com/photo-1593453833075-802cffa25492?auto=format&fit=crop&q=80&w=800', // JK Temple
        'varanasi': 'https://images.unsplash.com/photo-1561361513-2d000a50f0dc?auto=format&fit=crop&q=80&w=800', // Ganga Ghat
        'agra': 'https://images.unsplash.com/photo-1564507592333-c60657eea023?auto=format&fit=crop&q=80&w=800', // Taj Mahal
        'jaipur': 'https://images.unsplash.com/photo-1548013146-72479768bbaa?auto=format&fit=crop&q=80&w=800', // Hawa Mahal
        'pune': 'https://images.unsplash.com/photo-1565506737357-af89222625ad?auto=format&fit=crop&q=80&w=800', // Shaniwar Wada
        'hyderabad': 'https://images.unsplash.com/photo-1572445271230-a78b5944a659?auto=format&fit=crop&q=80&w=800', // Charminar
        'chennai': 'https://images.unsplash.com/photo-1582510003544-2d09566f03a3?auto=format&fit=crop&q=80&w=800', // Marina Beach
        'kolkata': 'https://images.unsplash.com/photo-1558431382-27e39cb14bc8?auto=format&fit=crop&q=80&w=800', // Howrah Bridge
        'indore': 'https://images.unsplash.com/photo-1595658658481-d53d3f999875?auto=format&fit=crop&q=80&w=800', // Rajwada
        'ahmedabad': 'https://images.unsplash.com/photo-1603261236594-18280bc71c5d?auto=format&fit=crop&q=80&w=800', // Sabarmati
        'bhopal': 'https://images.unsplash.com/photo-1636184562419-74e792ac1936?auto=format&fit=crop&q=80&w=800', // Upper Lake
        'chandigarh': 'https://images.unsplash.com/photo-1596423376649-ade95be3620f?auto=format&fit=crop&q=80&w=800', // Open Hand
        'patna': 'https://images.unsplash.com/photo-1627845348850-25916568c005?auto=format&fit=crop&q=80&w=800', // Golghar
        'ludhiana': 'https://images.unsplash.com/photo-1591115765373-520b7a427be4?auto=format&fit=crop&q=80&w=800', // Gurudwara
        'amritsar': 'https://images.unsplash.com/photo-1514222134-b57cbb8bc073?auto=format&fit=crop&q=80&w=800', // Golden Temple
        'surat': 'https://images.unsplash.com/photo-1592658932799-408930e19d8e?auto=format&fit=crop&q=80&w=800',
        'kochi': 'https://images.unsplash.com/photo-1589182373726-e4f658ab50f0?auto=format&fit=crop&q=80&w=800',
        'goa': 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&q=80&w=800',
    };

    const premiumFallbacks = [
        'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1444723121867-2680d6380c1d?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1486334803289-1623f249dd1e?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1506526657667-dadafc60e3c0?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1464938050520-ef2270bb8ce8?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1477346611705-65d1883cee1e?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1493238792000-8113da705763?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1519010470956-6d877008eea4?auto=format&fit=crop&q=80&w=800',
    ];

    const normalizedCity = String(city || '').toLowerCase().trim();
    if (cityImages[normalizedCity]) return cityImages[normalizedCity];

    const index = normalizedCity.length % premiumFallbacks.length;
    return premiumFallbacks[index];
};

const CityImage = ({ city }) => {
    const [imgSrc, setImgSrc] = useState(getCityImage(city));
    const fallback = 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&q=80&w=600';

    return (
        <img
            src={imgSrc}
            alt={`${city} Hoardings`}
            className="city-image"
            loading="lazy"
            onError={() => setImgSrc(fallback)}
        />
    );
};

export default Home;
