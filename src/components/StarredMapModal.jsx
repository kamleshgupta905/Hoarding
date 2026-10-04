import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
    X, MapPin, ExternalLink, Download, FileSpreadsheet, 
    Share2, Navigation, Layers, Check, AlertCircle, Info, Star
} from 'lucide-react';
import { extractSiteCoordinates } from '../services/aiService';
import DriveImage from './DriveImage';
import { getImageUrl } from '../services/dataService';
import { appToast } from './ToastContext';

// 🗺️ Auto-fit bounds & invalidate size on modal mount
function MapBoundsUpdater({ bounds }) {
    const map = useMap();
    useEffect(() => {
        if (!map) return;
        const timer = setTimeout(() => {
            map.invalidateSize();
            if (bounds && bounds.length > 0) {
                map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
            }
        }, 250);
        return () => clearTimeout(timer);
    }, [bounds, map]);
    return null;
}

// 📍 Custom High-Contrast Leaflet DivIcon for Starred Hoardings
const createStarredPinIcon = (index, facing = '') => {
    const cleanFacing = String(facing || '').trim();
    return L.divIcon({
        className: 'starred-leaflet-pin-wrapper',
        html: `
            <div style="
                background: linear-gradient(135deg, #ea4335, #c5221f);
                color: #ffffff;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-weight: 800;
                font-size: 11px;
                padding: 4px 8px;
                border-radius: 14px;
                border: 2px solid #ffffff;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
                display: inline-flex;
                align-items: center;
                gap: 4px;
                white-space: nowrap;
                transform: translate(-50%, -100%);
                cursor: pointer;
            ">
                <span style="font-size: 10px;">⭐</span>
                <span>#${index + 1}</span>
                ${cleanFacing ? `<span style="font-size: 9.5px; opacity: 0.95; font-weight: 600; background: rgba(0,0,0,0.28); padding: 1px 5px; border-radius: 6px;">${cleanFacing}</span>` : ''}
            </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
        popupAnchor: [0, -22]
    });
};

export default function StarredMapModal({ isOpen, onClose, starredSites = [] }) {
    const [copiedLink, setCopiedLink] = useState(false);

    // 📍 Parse real GPS coordinates and fan out identical/shared-pole coordinates
    const { validSites, invalidSites, bounds, center } = useMemo(() => {
        const valid = [];
        const invalid = [];

        starredSites.forEach((site, index) => {
            const coords = extractSiteCoordinates(site);
            if (coords && coords.lat && coords.lng) {
                valid.push({
                    site,
                    originalIndex: index,
                    lat: coords.lat,
                    lng: coords.lng
                });
            } else {
                invalid.push({ site, originalIndex: index });
            }
        });

        // 🎯 Group identical or near-identical coordinates (e.g. multi-faced unipoles at same pole)
        const coordGroups = new Map();
        valid.forEach(item => {
            const key = `${item.lat.toFixed(5)},${item.lng.toFixed(5)}`;
            if (!coordGroups.has(key)) coordGroups.set(key, []);
            coordGroups.get(key).push(item);
        });

        const offsetSites = [];
        valid.forEach(item => {
            const key = `${item.lat.toFixed(5)},${item.lng.toFixed(5)}`;
            const group = coordGroups.get(key) || [];
            const groupCount = group.length;
            const groupIndex = group.indexOf(item);

            let displayLat = item.lat;
            let displayLng = item.lng;

            if (groupCount > 1) {
                // Fan out in a small circle (~18 meters) so every face/structure pin is individually visible and clickable
                const angle = (2 * Math.PI / groupCount) * groupIndex;
                const radiusDegrees = 0.00018; // ~20 meters
                displayLat = item.lat + Math.sin(angle) * radiusDegrees;
                displayLng = item.lng + (Math.cos(angle) * radiusDegrees) / Math.cos(item.lat * Math.PI / 180);
            }

            offsetSites.push({
                ...item,
                displayLat,
                displayLng,
                isSharedLocation: groupCount > 1,
                faceNumber: groupIndex + 1,
                totalFacesAtLoc: groupCount
            });
        });

        let calculatedBounds = [];
        let calculatedCenter = [28.9845, 77.7064]; // Meerut fallback master center

        if (offsetSites.length > 0) {
            calculatedBounds = offsetSites.map(item => [item.displayLat, item.displayLng]);
            const avgLat = offsetSites.reduce((sum, item) => sum + item.lat, 0) / offsetSites.length;
            const avgLng = offsetSites.reduce((sum, item) => sum + item.lng, 0) / offsetSites.length;
            calculatedCenter = [avgLat, avgLng];
        }

        return {
            validSites: offsetSites,
            invalidSites: invalid,
            bounds: calculatedBounds,
            center: calculatedCenter
        };
    }, [starredSites]);

    if (!isOpen) return null;

    // 🚀 1-Click Open all in Google Maps directions (multi-stop)
    const handleOpenInGoogleMaps = () => {
        if (validSites.length === 0) {
            appToast('No valid GPS coordinates found to open in Google Maps.', { type: 'warning' });
            return;
        }

        if (validSites.length === 1) {
            const { lat, lng } = validSites[0];
            window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
            return;
        }

        // Google Maps supports up to 10 waypoints in directions URL
        const stops = validSites.slice(0, 10).map(s => `${s.lat},${s.lng}`).join('/');
        window.open(`https://www.google.com/maps/dir/${stops}`, '_blank');
    };

    // 💾 Download standard KML file (Opens natively in Google Earth & Google My Maps)
    const handleDownloadKml = () => {
        if (validSites.length === 0) {
            appToast('No sites with valid coordinates to export.', { type: 'warning' });
            return;
        }

        const dateStr = new Date().toISOString().split('T')[0];
        const placemarks = validSites.map(({ site, originalIndex, lat, lng }) => {
            const siteName = (site['Location '] || site.Location || `Hoarding #${originalIndex + 1}`).replace(/[<>&'"]/g, ' ');
            const city = (site.City || 'N/A').replace(/[<>&'"]/g, ' ');
            const locality = (site.Locality || site['Locality Site Location'] || '').replace(/[<>&'"]/g, ' ');
            const size = (site['Size (WxH)'] || site.Size || '').replace(/[<>&'"]/g, ' ');
            const facing = (site.Facing || '').replace(/[<>&'"]/g, ' ');
            const rent = site['Rental Per Month'] ?? site['Avg Monthly Cost (INR)'] ?? 'N/A';

            return `    <Placemark>
      <name><![CDATA[#${originalIndex + 1} - ${siteName}]]></name>
      <description><![CDATA[
        <b>City:</b> ${city}<br/>
        <b>Locality:</b> ${locality}<br/>
        <b>Size:</b> ${size}<br/>
        <b>Facing:</b> ${facing}<br/>
        <b>Monthly Rent:</b> ₹${rent}<br/>
        <b>Coordinates:</b> ${lat.toFixed(6)}, ${lng.toFixed(6)}<br/>
        <br/>
        <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}">Open in Google Maps</a>
      ]]></description>
      <Point>
        <coordinates>${lng},${lat},0</coordinates>
      </Point>
    </Placemark>`;
        }).join('\n');

        const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Heera Advertising - Shortlisted Sites Map (${dateStr})</name>
    <description>Verified Hoarding Locations with real GPS coordinates for Google Earth &amp; My Maps.</description>
${placemarks}
  </Document>
</kml>`;

        const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Heera_Shortlisted_Sites_${dateStr}.kml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        appToast('KML map file downloaded! Double click to open in Google Earth or Google My Maps.', { type: 'success' });
    };

    // 📊 Download CSV with exact coordinates & Google Maps URLs
    const handleDownloadCsv = () => {
        if (validSites.length === 0) {
            appToast('No coordinates available to download.', { type: 'warning' });
            return;
        }

        const headers = ['SL', 'Site Name', 'City', 'Locality', 'Size', 'Facing', 'Monthly Rate', 'Latitude', 'Longitude', 'Google Maps Link'];
        const rows = validSites.map(({ site, originalIndex, lat, lng }) => {
            const siteName = `"${(site['Location '] || site.Location || `Site ${originalIndex + 1}`).replace(/"/g, '""')}"`;
            const city = `"${(site.City || '').replace(/"/g, '""')}"`;
            const locality = `"${(site.Locality || site['Locality Site Location'] || '').replace(/"/g, '""')}"`;
            const size = `"${(site['Size (WxH)'] || site.Size || '').replace(/"/g, '""')}"`;
            const facing = `"${(site.Facing || '').replace(/"/g, '""')}"`;
            const rent = `"${site['Rental Per Month'] ?? site['Avg Monthly Cost (INR)'] ?? ''}"`;
            const gMapLink = `"https://www.google.com/maps/search/?api=1&query=${lat},${lng}"`;

            return [originalIndex + 1, siteName, city, locality, size, facing, rent, lat.toFixed(6), lng.toFixed(6), gMapLink].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Heera_Starred_GPS_Coordinates_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        appToast('GPS coordinates CSV downloaded successfully!', { type: 'success' });
    };

    // 📋 Copy route summary to clipboard
    const handleCopyCoordinates = () => {
        if (validSites.length === 0) return;
        const text = validSites.map(({ site, originalIndex, lat, lng }) => {
            const name = site['Location '] || site.Location || `Site #${originalIndex + 1}`;
            return `#${originalIndex + 1} ${name} (${site.City || ''}): https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
        }).join('\n');

        if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
            setCopiedLink(true);
            setTimeout(() => setCopiedLink(false), 2500);
            appToast('Copied Google Maps coordinate links to clipboard!', { type: 'success' });
        }
    };

    return (
        <div 
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(6px)',
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                animation: 'fadeIn 0.2s ease-out'
            }}
            onClick={e => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div 
                style={{
                    background: '#ffffff',
                    borderRadius: '20px',
                    width: '100%',
                    maxWidth: '1040px',
                    maxHeight: '94vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    border: '1px solid #e2e8f0',
                    overflow: 'hidden'
                }}
            >
                {/* 🌟 Modal Header */}
                <div style={{
                    padding: '16px 22px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#ffffff'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            background: '#eff6ff',
                            border: '1.5px solid #bfdbfe',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#2563eb'
                        }}>
                            <MapPin size={20} color="#ea4335" />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                                    Starred Sites Real GPS Map
                                </h3>
                                <span style={{
                                    background: '#fef3c7',
                                    color: '#b45309',
                                    border: '1px solid #fde68a',
                                    borderRadius: '12px',
                                    padding: '2px 8px',
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                }}>
                                    <Star size={11} fill="#b45309" />
                                    {validSites.length} of {starredSites.length} Plotted
                                </span>
                            </div>
                            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                                Real ground coordinates from inventory • Direct Google Maps navigation &amp; offline export
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                width: '34px',
                                height: '34px',
                                borderRadius: '10px',
                                border: '1px solid #e2e8f0',
                                background: '#f8fafc',
                                color: '#64748b',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer'
                            }}
                            title="Close"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* ⚠️ Warning Banner if any sites are missing coordinates */}
                {invalidSites.length > 0 && (
                    <div style={{
                        background: '#fffbeb',
                        borderBottom: '1px solid #fef3c7',
                        padding: '8px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.78rem',
                        color: '#92400e'
                    }}>
                        <Info size={14} color="#d97706" />
                        <span>
                            <strong>Note:</strong> {invalidSites.length} shortlisted site{invalidSites.length > 1 ? 's do' : ' does'} not have valid GPS coordinates in inventory and cannot be plotted on the map.
                        </span>
                    </div>
                )}

                {/* 🗺️ Interactive Leaflet Map Container */}
                <div style={{ height: '480px', width: '100%', position: 'relative', background: '#e2e8f0' }}>
                    {validSites.length > 0 ? (
                        <MapContainer 
                            center={center} 
                            zoom={13} 
                            style={{ height: '100%', width: '100%' }}
                            scrollWheelZoom={true}
                        >
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            <MapBoundsUpdater bounds={bounds} />

                            {validSites.map((item) => {
                                const { site, originalIndex, lat, lng, displayLat, displayLng, isSharedLocation, faceNumber, totalFacesAtLoc } = item;
                                const locName = site['Location '] || site.Location || site['Locality Site Location'] || `Hoarding #${originalIndex + 1}`;
                                const city = site.City || '';
                                const size = site['Size (WxH)'] || site.Size || '';
                                const facing = site.Facing || '';
                                const rent = site['Rental Per Month'] ?? site['Avg Monthly Cost (INR)'] ?? site.Price ?? null;
                                const imgUrl = getImageUrl(site);

                                return (
                                    <Marker
                                        key={`starred-pin-${originalIndex}-${lat}-${lng}-${faceNumber || 1}`}
                                        position={[displayLat || lat, displayLng || lng]}
                                        icon={createStarredPinIcon(originalIndex, facing)}
                                    >
                                        <Popup>
                                            <div style={{ minWidth: '220px', maxWidth: '280px', fontFamily: 'sans-serif' }}>
                                                {imgUrl && (
                                                    <div style={{ height: '110px', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px', background: '#0f172a' }}>
                                                        <DriveImage
                                                            src={imgUrl}
                                                            alt={locName}
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        />
                                                    </div>
                                                )}
                                                {isSharedLocation && (
                                                    <div style={{
                                                        background: '#eff6ff',
                                                        border: '1px solid #bfdbfe',
                                                        color: '#1d4ed8',
                                                        fontSize: '0.7rem',
                                                        padding: '3px 8px',
                                                        borderRadius: '6px',
                                                        marginBottom: '6px',
                                                        fontWeight: 700,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        <span>🏢</span>
                                                        <span>Double-Sided Pole (Face {faceNumber} of {totalFacesAtLoc})</span>
                                                    </div>
                                                )}
                                                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', marginBottom: '4px' }}>
                                                    #{originalIndex + 1} - {locName}
                                                </div>
                                                <div style={{ fontSize: '0.76rem', color: '#475569', marginBottom: '6px', lineHeight: '1.4' }}>
                                                    📍 {city} {size ? `• ${size}` : ''} {facing ? `• Facing: ${facing}` : ''}
                                                    {rent ? <div style={{ color: '#059669', fontWeight: 700, marginTop: '2px' }}>₹{Number(rent).toLocaleString('en-IN')}/mo</div> : null}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '10px' }}>
                                                    GPS: {lat.toFixed(6)}, {lng.toFixed(6)}
                                                </div>
                                                <a
                                                    href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '4px',
                                                        width: '100%',
                                                        padding: '7px 10px',
                                                        borderRadius: '8px',
                                                        background: '#2563eb',
                                                        color: '#ffffff',
                                                        textDecoration: 'none',
                                                        fontSize: '0.76rem',
                                                        fontWeight: 700
                                                    }}
                                                >
                                                    <ExternalLink size={12} /> Open in Google Maps ↗
                                                </a>
                                            </div>
                                        </Popup>
                                    </Marker>
                                );
                            })}
                        </MapContainer>
                    ) : (
                        <div style={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#f8fafc',
                            color: '#64748b',
                            padding: '24px',
                            textAlign: 'center'
                        }}>
                            <MapPin size={48} color="#cbd5e1" style={{ marginBottom: '12px' }} />
                            <h4 style={{ margin: '0 0 6px 0', color: '#334155', fontWeight: 800 }}>No GPS Coordinates Available</h4>
                            <p style={{ margin: 0, fontSize: '0.84rem', maxWidth: '420px' }}>
                                The hoardings you shortlisted do not have latitude and longitude entered in the sheet. Please enter coordinates to view them on the map.
                            </p>
                        </div>
                    )}
                </div>

                {/* 🛠️ Action Toolbar / Export Options */}
                <div style={{
                    padding: '14px 22px',
                    borderTop: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* 🚀 Google Maps Multi-Stop Directions Button */}
                        <button
                            type="button"
                            onClick={handleOpenInGoogleMaps}
                            disabled={validSites.length === 0}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#2563eb',
                                color: '#ffffff',
                                border: 'none',
                                padding: '8px 14px',
                                borderRadius: '10px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: validSites.length === 0 ? 'not-allowed' : 'pointer',
                                opacity: validSites.length === 0 ? 0.5 : 1,
                                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
                            }}
                            title="Open Google Maps with selected hoarding route"
                        >
                            <ExternalLink size={14} /> Open in Google Maps
                        </button>

                        {/* 💾 Download KML for Google Earth & Google My Maps */}
                        <button
                            type="button"
                            onClick={handleDownloadKml}
                            disabled={validSites.length === 0}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#ffffff',
                                color: '#0f172a',
                                border: '1px solid #cbd5e1',
                                padding: '8px 14px',
                                borderRadius: '10px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: validSites.length === 0 ? 'not-allowed' : 'pointer',
                                opacity: validSites.length === 0 ? 0.5 : 1
                            }}
                            title="Download KML file to open in Google Earth or Google My Maps"
                        >
                            <Download size={14} color="#059669" /> Download KML (Google Earth)
                        </button>

                        {/* 📊 Download CSV Coordinates */}
                        <button
                            type="button"
                            onClick={handleDownloadCsv}
                            disabled={validSites.length === 0}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#ffffff',
                                color: '#0f172a',
                                border: '1px solid #cbd5e1',
                                padding: '8px 14px',
                                borderRadius: '10px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: validSites.length === 0 ? 'not-allowed' : 'pointer',
                                opacity: validSites.length === 0 ? 0.5 : 1
                            }}
                            title="Download spreadsheet of all GPS coordinates with direct Google Maps links"
                        >
                            <FileSpreadsheet size={14} color="#2563eb" /> GPS CSV
                        </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* 📋 Copy Links to Clipboard */}
                        <button
                            type="button"
                            onClick={handleCopyCoordinates}
                            disabled={validSites.length === 0}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: copiedLink ? '#ecfdf5' : '#ffffff',
                                color: copiedLink ? '#059669' : '#475569',
                                border: `1px solid ${copiedLink ? '#a7f3d0' : '#cbd5e1'}`,
                                padding: '8px 14px',
                                borderRadius: '10px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: validSites.length === 0 ? 'not-allowed' : 'pointer',
                                opacity: validSites.length === 0 ? 0.5 : 1,
                                transition: 'all 0.15s ease'
                            }}
                            title="Copy Google Maps coordinate links to clipboard"
                        >
                            {copiedLink ? <Check size={14} /> : <Share2 size={14} />}
                            <span>{copiedLink ? 'Copied Links!' : 'Copy Links'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
