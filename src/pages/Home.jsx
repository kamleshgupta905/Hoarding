import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, ArrowRight, TrendingUp, Globe, CheckCircle } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import './Home.css';

const Home = ({ hoardings }) => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');

    // Clean up city names and filter out empty/undefined
    const cities = [...new Set(hoardings.map(h => h.City?.trim()).filter(Boolean))];
    const totalSites = hoardings.length;

    // List of cities we want to feature prominently
    const featuredList = [
        'Delhi', 'Mumbai', 'Bangalore', 'Noida', 'Gurgaon', 'Meerut',
        'Pune', 'Hyderabad', 'Jaipur', 'Lucknow', 'Ahmedabad', 'Chandigarh'
    ];

    // Combine spreadsheet cities with our featured list for a complete view
    const allCities = [...new Set([...featuredList, ...cities])];

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
                <title>AdHoardingsDiscovery | Discover & Book Premium Outdoor Hoardings</title>
                <meta name="description" content="Discover and book premium outdoor hoarding sites across India. City-wise listings with real-time availability and technical specifications." />
            </Helmet>

            <section className="hero">
                <div className="container hero-content">
                    <h1 className="animate-fade-in">Discover & Book Premium <br /><span>Outdoor Hoardings Across India</span></h1>
                    <p className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
                        The most comprehensive platform for outdoor advertising site discovery, visual proof, and booking.
                    </p>

                    <form className="search-box animate-fade-in" style={{ animationDelay: '0.2s' }} onSubmit={handleSearch}>
                        <div className="input-group">
                            <MapPin className="icon" />
                            <select onChange={(e) => handleCitySelect(e.target.value)} defaultValue="">
                                <option value="" disabled>Select City</option>
                                {allCities.map(city => (
                                    <option key={city} value={city}>{city}</option>
                                ))}
                            </select>
                        </div>
                        <div className="divider"></div>
                        <div className="input-group">
                            <Search className="icon" />
                            <input
                                type="text"
                                placeholder="Search by Locality or Site Name"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button type="submit" className="search-btn">Search</button>
                    </form>

                    <div className="hero-metrics animate-fade-in" style={{ animationDelay: '0.3s' }}>
                        <div className="metric">
                            <CheckCircle className="metric-icon" size={20} />
                            <span><strong>{totalSites}+</strong> Premium Sites</span>
                        </div>
                        <div className="metric">
                            <Globe className="metric-icon" size={20} />
                            <span><strong>{allCities.length}+</strong> Cities Covered</span>
                        </div>
                        <div className="metric">
                            <TrendingUp className="metric-icon" size={20} />
                            <span><strong>5M+</strong> Daily Impressions</span>
                        </div>
                    </div>

                    <div className="hero-ctas animate-fade-in" style={{ animationDelay: '0.4s' }}>
                        <button className="primary-cta" onClick={() => handleCitySelect(allCities[0])}>Browse Hoardings</button>
                        <button className="secondary-cta">Request Media Plan</button>
                    </div>
                </div>
            </section>

            <section className="cities-grid container section-padding">
                <div className="section-header">
                    <h2>Featured Cities</h2>
                    <p>Explore premium sites in major business & traffic hubs</p>
                </div>
                <div className="city-cards">
                    {allCities.map(city => (
                        <div key={city} className="city-card" onClick={() => handleCitySelect(city)}>
                            <div className="city-image-container">
                                <CityImage city={city} />
                                <div className="city-overlay"></div>
                            </div>
                            <div className="city-info">
                                <h3 style={{ textTransform: 'capitalize' }}>{city}</h3>
                                <p>{hoardings.filter(h => h.City?.trim().toLowerCase() === city.toLowerCase() && h.STATUS !== 'Disabled').length} Active Sites</p>
                                <ArrowRight className="arrow" />
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
};


// 🌟 Smart Image Selection for Cities
const getCityImage = (city) => {
    // 1. Specific Premium Images for known cities (STRICTLY UNIQUE)
    const cityImages = {
        'delhi': 'https://images.unsplash.com/photo-1587474260584-1f35a7a8b577?auto=format&fit=crop&q=80&w=600',
        'mumbai': 'https://images.unsplash.com/photo-1566552881560-0be862a7c445?auto=format&fit=crop&q=80&w=600',
        'bangalore': 'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&q=80&w=600',
        'noida': 'https://images.unsplash.com/photo-1628155930542-3c7a64e2c833?auto=format&fit=crop&q=80&w=600',
        'gurgaon': 'https://images.unsplash.com/photo-1625244724123-1ee707a27567?auto=format&fit=crop&q=80&w=600',
        'meerut': 'https://images.unsplash.com/photo-1626027357322-836e2f69e63e?auto=format&fit=crop&q=80&w=600',
        'ghaziabad': 'https://images.unsplash.com/photo-1588665715875-10111100e008?auto=format&fit=crop&q=80&w=600',
        'lucknow': 'https://images.unsplash.com/photo-1592247656333-6a388f8d9518?auto=format&fit=crop&q=80&w=600',
        'kanpur': 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&q=80&w=600',
        'varanasi': 'https://images.unsplash.com/photo-1561361513-2d000a50f0dc?auto=format&fit=crop&q=80&w=600',
        'agra': 'https://images.unsplash.com/photo-1548013146-243292419f85?auto=format&fit=crop&q=80&w=600',
        'jaipur': 'https://images.unsplash.com/photo-1477587458883-47145ed94245?auto=format&fit=crop&q=80&w=600',
        'pune': 'https://images.unsplash.com/photo-1565506737357-af89222625ad?auto=format&fit=crop&q=80&w=600',
        'hyderabad': 'https://images.unsplash.com/photo-1572445271230-a78b5944a659?auto=format&fit=crop&q=80&w=600',
        'chennai': 'https://images.unsplash.com/photo-1516012023023-df772ec0b6f9?auto=format&fit=crop&q=80&w=600',
        'kolkata': 'https://images.unsplash.com/photo-1558431382-27e39cb14bc8?auto=format&fit=crop&q=80&w=600',
        'indore': 'https://images.unsplash.com/photo-1595658658481-d53d3f999875?auto=format&fit=crop&q=80&w=600',
        'ahmedabad': 'https://images.unsplash.com/photo-1603261236594-18280bc71c5d?auto=format&fit=crop&q=80&w=600',
        'bhopal': 'https://images.unsplash.com/photo-1636184562419-74e792ac1936?auto=format&fit=crop&q=80&w=600',
        'chandigarh': 'https://images.unsplash.com/photo-1596423376649-ade95be3620f?auto=format&fit=crop&q=80&w=600',
        'patna': 'https://images.unsplash.com/photo-1627845348850-25916568c005?auto=format&fit=crop&q=80&w=600',
        'ludhiana': 'https://images.unsplash.com/photo-1591115765373-520b7a427be4?auto=format&fit=crop&q=80&w=600',
        'amritsar': 'https://images.unsplash.com/photo-1514222134-b57cbb8bc073?auto=format&fit=crop&q=80&w=600',
    };


    // 2. Fallback: Premium "Generic" City Images
    const premiumFallbacks = [
        'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1444723121867-2680d6380c1d?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1486334803289-1623f249dd1e?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1506526657667-dadafc60e3c0?auto=format&fit=crop&q=80&w=600',
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
