import React, { useState, useRef } from 'react';
import readXlsxFile from 'read-excel-file/browser';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Link as LinkIcon, ExternalLink, RefreshCw, Presentation, Search, Image as ImageIcon } from 'lucide-react';
import { getImageUrl } from '../services/dataService';
import { parsePptx } from '../core/pptxEngine';

const normalizeStr = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const ProposalBuilder = ({ hoardings }) => {
    const [file, setFile] = useState(null);
    const [parsedRows, setParsedRows] = useState([]);
    const [clientName, setClientName] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [proposalUrl, setProposalUrl] = useState('');
    
        const handleFileUpload = async (e) => {
        const uploadedFile = e.target.files[0];
        if (!uploadedFile) return;
        setFile(uploadedFile);
        setIsProcessing(true);
        setProposalUrl('');
        
        try {
            const fileName = uploadedFile.name.toLowerCase();
            
            // Try to auto-detect client name from filename (e.g. Pears booking.xlsx)
            const matches = fileName.match(/([a-z0-9]+)\s*booking/i) || fileName.match(/([a-z0-9]+)\s*plan/i);
            if (matches && matches[1]) {
                setClientName(matches[1].charAt(0).toUpperCase() + matches[1].slice(1));
            }

            const matchedRows = [];

            if (fileName.endsWith('.pptx') || fileName.endsWith('.ppt')) {
                const arrayBuffer = await uploadedFile.arrayBuffer();
                const slides = await parsePptx(arrayBuffer, hoardings, (pct, msg) => {
                    // Optional: could add progress text to UI, but for now we'll just show the spinner
                    console.log(pct, msg);
                });
                
                slides.forEach(slide => {
                    if (slide.candidates && slide.candidates.length > 0) {
                        const match = slide.candidates[0].site;
                        matchedRows.push({
                            originalLocation: `Slide ${slide.number}`,
                            originalCity: 'PPT Extract',
                            w: '', h: '',
                            matchedSite: match,
                            siteId: match.UniqueID || match._SiteID || match.ID || match['Site Code'] || ''
                        });
                    }
                });
                
                if (matchedRows.length === 0) throw new Error("Could not match any locations from this PPT.");
            } else {
                const rows = await readXlsxFile(uploadedFile);
                if (rows.length < 2) throw new Error("Excel file is empty or missing data rows.");
                
                const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
                const locIdx = headers.findIndex(h => h.includes('location') || h.includes('site'));
                const cityIdx = headers.findIndex(h => h.includes('city'));
                const wIdx = headers.findIndex(h => h === 'w' || h.includes('width'));
                const hIdx = headers.findIndex(h => h === 'h' || h.includes('height'));
                
                if (locIdx === -1) throw new Error("Could not find a 'Location' column in the Excel file.");
                
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row[locIdx]) continue;
                    
                    const locName = String(row[locIdx]);
                    const normLoc = normalizeStr(locName);
                    
                    let match = hoardings.find(h => {
                        const hLoc = normalizeStr(h['Location '] || h['Locality Site Location'] || '');
                        return hLoc === normLoc || hLoc.includes(normLoc) || normLoc.includes(hLoc);
                    });
                    
                    matchedRows.push({
                        originalLocation: locName,
                        originalCity: cityIdx !== -1 ? row[cityIdx] : '',
                        w: wIdx !== -1 ? row[wIdx] : '',
                        h: hIdx !== -1 ? row[hIdx] : '',
                        matchedSite: match || null,
                        siteId: match ? (match.UniqueID || match._SiteID || match.ID || match['Site Code'] || '') : null
                    });
                }
            }
            
            setParsedRows(matchedRows);
            
        } catch (err) {
            alert("Error parsing file: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    };
    
    const generateProposalLink = () => {
        if (!clientName.trim()) {
            alert("Please enter a client name.");
            return;
        }
        
        const validSiteIds = parsedRows.map(r => r.siteId).filter(Boolean);
        if (validSiteIds.length === 0) {
            alert("No sites matched! Cannot create an empty proposal.");
            return;
        }
        
        // Use a clean URL structure that the frontend router can handle
        const idsParam = validSiteIds.map(encodeURIComponent).join(',');
        const url = `${window.location.origin}/proposal/${encodeURIComponent(clientName)}?sites=${idsParam}`;
        setProposalUrl(url);
    };
    
    const handleManualMatch = (rowIndex, siteId) => {
        const site = hoardings.find(h => (h.UniqueID || h._SiteID || h.ID || h['Site Code'] || '') === siteId);
        const newRows = [...parsedRows];
        newRows[rowIndex].matchedSite = site;
        newRows[rowIndex].siteId = siteId;
        setParsedRows(newRows);
    };

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Client Proposal Builder</h2>
                    <p style={{ color: '#6b7280', margin: 0 }}>Upload an Excel sheet of selected locations to auto-generate a beautiful web proposal deck.</p>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 300px', minWidth: '300px' }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px dashed #d1d5db', textAlign: 'center', cursor: 'pointer', position: 'relative' }}>
                        <input 
                            type="file" 
                            accept=".xlsx,.xls,.csv,.ppt,.pptx" 
                            onChange={handleFileUpload}
                            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '16px' }}><FileSpreadsheet size={40} color="#10b981" /><Presentation size={40} color="#f59e0b" /></div>
                        <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', color: '#374151' }}>Drop Excel or PPT File</h3>
                        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>Or click to browse (.xlsx, .pptx)</p>
                    </div>

                    {parsedRows.length > 0 && (
                        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e5e7eb', marginTop: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 600 }}>Proposal Settings</h3>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Client/Brand Name</label>
                                <input 
                                    type="text" 
                                    value={clientName}
                                    onChange={(e) => setClientName(e.target.value)}
                                    placeholder="e.g. Pears Soap"
                                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', outline: 'none' }}
                                />
                            </div>
                            
                            <button 
                                onClick={generateProposalLink}
                                style={{ width: '100%', padding: '12px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}
                            >
                                <Presentation size={18} /> Generate Deck
                            </button>

                            {proposalUrl && (
                                <div style={{ marginTop: '20px', padding: '16px', background: '#ecfdf5', border: '1px solid #10b981', borderRadius: '8px' }}>
                                    <h4 style={{ margin: '0 0 8px', color: '#065f46', display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={16} /> Proposal Ready!</h4>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input type="text" readOnly value={proposalUrl} style={{ flex: 1, padding: '8px', border: '1px solid #a7f3d0', borderRadius: '4px', background: '#fff', fontSize: '0.8rem' }} />
                                        <button onClick={() => window.open(proposalUrl, '_blank')} style={{ padding: '8px 12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}><ExternalLink size={16} /></button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div style={{ flex: '2 1 600px', minWidth: '400px' }}>
                    {isProcessing ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                            <RefreshCw size={32} className="qm-spin" style={{ margin: '0 auto 16px', display: 'block', color: '#4f46e5' }} />
                            <p>Analyzing and matching locations...</p>
                        </div>
                    ) : parsedRows.length > 0 ? (
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Matched Sites ({parsedRows.filter(r => r.matchedSite).length} / {parsedRows.length})</h3>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '0.8rem', color: '#6b7280', textTransform: 'uppercase' }}>
                                            <th style={{ padding: '12px 16px' }}>Excel Location</th>
                                            <th style={{ padding: '12px 16px' }}>Status</th>
                                            <th style={{ padding: '12px 16px' }}>Master Database Match</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedRows.map((row, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '12px 16px', fontSize: '0.9rem', color: '#111827', maxWidth: '250px' }}>
                                                    <div style={{ fontWeight: 500 }}>{row.originalLocation}</div>
                                                    <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>{row.originalCity} {row.w && row.h ? `(${row.w}x${row.h})` : ''}</div>
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    {row.matchedSite ? (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: '#ecfdf5', color: '#059669', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
                                                            <CheckCircle2 size={14} /> MATCHED
                                                        </span>
                                                    ) : (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: '#fef2f2', color: '#dc2626', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
                                                            <AlertCircle size={14} /> MISSING
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 16px', minWidth: '300px' }}>
                                                    {row.matchedSite ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <img src={getImageUrl(row.matchedSite)} alt="" style={{ width: '48px', height: '36px', objectFit: 'cover', borderRadius: '4px', background: '#e5e7eb' }} />
                                                            <div>
                                                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>{row.matchedSite['Location '] || row.matchedSite['Locality Site Location']}</div>
                                                                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>ID: {row.matchedSite.UniqueID || row.matchedSite._SiteID || row.matchedSite['Site Code'] || 'N/A'}</div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                            <Search size={16} color="#9ca3af" style={{ position: 'absolute', left: '10px' }} />
                                                            <select 
                                                                onChange={(e) => handleManualMatch(idx, e.target.value)}
                                                                style={{ width: '100%', padding: '8px 8px 8px 32px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem', appearance: 'none', background: '#fff' }}
                                                            >
                                                                <option value="">-- Manual Link to Site --</option>
                                                                {hoardings.slice(0, 100).map(h => {
                                                                    const sid = h.UniqueID || h._SiteID || h.ID || h['Site Code'];
                                                                    return sid ? <option key={sid} value={sid}>{h['Location ']} ({h.City})</option> : null;
                                                                })}
                                                            </select>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: '60px', textAlign: 'center', background: '#f9fafb', borderRadius: '12px', border: '1px dashed #d1d5db', color: '#6b7280' }}>
                            <Presentation size={48} color="#d1d5db" style={{ margin: '0 auto 16px', display: 'block' }} />
                            <h3 style={{ margin: '0 0 8px', color: '#374151' }}>No Data Yet</h3>
                            <p style={{ margin: 0, maxWidth: '300px', marginLeft: 'auto', marginRight: 'auto' }}>Upload an Excel or PPT file containing client site selections to build a proposal.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProposalBuilder;
