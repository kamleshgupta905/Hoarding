import React, { useState, useRef, useMemo } from 'react';
import { 
  X, UploadCloud, FileSpreadsheet, Presentation, CheckCircle2, 
  AlertTriangle, ArrowRight, Layers, DollarSign, Calendar, 
  RotateCcw, Sparkles, Filter, ChevronRight, Check, AlertCircle, Loader2
} from 'lucide-react';
import { readWorkbook } from '../core/workbookIO';
import { parsePptx } from '../core/pptxEngine';
import { 
  parseBulkBookingRows, 
  matchPptSlidesToBookings, 
  commitBulkBookings 
} from '../core/bulkBookingEngine';
import './BulkBookingWizard.css';

const CLIENT_BADGE_COLORS = [
  { bg: 'rgba(99, 102, 241, 0.12)', text: '#4338ca', border: '#c7d2fe' },
  { bg: 'rgba(16, 185, 129, 0.12)', text: '#065f46', border: '#a7f3d0' },
  { bg: 'rgba(245, 158, 11, 0.12)', text: '#92400e', border: '#fde68a' },
  { bg: 'rgba(236, 72, 153, 0.12)', text: '#9d174d', border: '#fbcfe8' },
  { bg: 'rgba(14, 165, 233, 0.12)', text: '#0369a1', border: '#bae6fd' },
  { bg: 'rgba(168, 85, 247, 0.12)', text: '#6b21a8', border: '#e9d5ff' }
];

export default function BulkBookingWizard({ 
  isOpen, 
  onClose, 
  hoardings = [], 
  onSuccess = null 
}) {
  // Mode: 'excel' (Only Excel) or 'combo' (Excel + PPT)
  const [mode, setMode] = useState('excel');
  const [step, setStep] = useState(1); // 1: Mode & Upload, 2: Review & Commit, 3: Success

  // File States
  const [excelFile, setExcelFile] = useState(null);
  const [pptFile, setPptFile] = useState(null);

  // Processing & Parsing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [parsedData, setParsedData] = useState(null); // { items, clientGroups, totalSites, conflictsCount }
  const [skipConflicted, setSkipConflicted] = useState(true);
  const [activeClientFilter, setActiveClientFilter] = useState('All');
  const [artworkMode, setArtworkMode] = useState('history_only'); // 'history_only' | 'replace_master'

  // Execution State
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState({ percent: 0, message: '' });
  const [commitResult, setCommitResult] = useState(null);

  const excelInputRef = useRef(null);
  const pptInputRef = useRef(null);

  // Client Color mapping memo
  const clientColorMap = useMemo(() => {
    const map = {};
    if (parsedData?.clientGroups) {
      parsedData.clientGroups.forEach((c, idx) => {
        map[c.name] = CLIENT_BADGE_COLORS[idx % CLIENT_BADGE_COLORS.length];
      });
    }
    return map;
  }, [parsedData]);

  // Handle Drag & Drop Excel
  const handleExcelDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
        setExcelFile(file);
      }
    }
  };

  // Handle Drag & Drop PPT
  const handlePptDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (/\.(pptx)$/i.test(file.name)) {
        setPptFile(file);
      }
    }
  };

  // Process and Analyze Files
  const handleAnalyzeFiles = async () => {
    if (!excelFile) return;

    setIsProcessing(true);
    setProcessingMsg("Reading Excel Media Plan...");

    try {
      // 1. Read Excel
      const excelBuffer = await excelFile.arrayBuffer();
      const { sheets, sheetNames } = await readWorkbook(excelBuffer, excelFile.name);
      const primarySheet = sheets[sheetNames[0]] || [];

      setProcessingMsg("Scanning inventory for date conflicts & grouping clients...");
      let parsed = parseBulkBookingRows(primarySheet, hoardings);

      // 2. If Mode B: Parse PPT and match slides
      if (mode === 'combo' && pptFile) {
        setProcessingMsg("Extracting PPT slides & matching site artworks...");
        const pptBuffer = await pptFile.arrayBuffer();
        const pptResult = await parsePptx(pptBuffer, hoardings, (pct, msg) => {
          setProcessingMsg(`PPT: ${msg}`);
        });

        const slidesList = Array.isArray(pptResult) ? pptResult : (pptResult?.slides || []);
        if (slidesList.length > 0) {
          const matchedItems = matchPptSlidesToBookings(slidesList, parsed.items);
          parsed = {
            ...parsed,
            items: matchedItems
          };
        }
      }

      setParsedData(parsed);
      setStep(2);
    } catch (err) {
      console.error("[Bulk Booking Parse Error]:", err);
      alert(`Error reading files: ${err.message || 'Please check file format'}`);
    } finally {
      setIsProcessing(false);
      setProcessingMsg('');
    }
  };

  // Manual Admin Override for PPT Slide Assignment
  const handleSlideChange = (itemId, newSlideNumber) => {
    setParsedData(prev => {
      if (!prev || !prev.items) return prev;
      const num = newSlideNumber ? parseInt(newSlideNumber, 10) : null;

      const updatedItems = prev.items.map(item => {
        if (item.id === itemId) {
          if (!num) {
            return { ...item, matchedSlide: null };
          }
          const chosenSlide = item.availableSlides?.find(s => s.number === num);
          if (!chosenSlide) return item;
          return {
            ...item,
            matchedSlide: {
              number: chosenSlide.number,
              textSnippet: chosenSlide.textSnippet,
              imageBlob: chosenSlide.imageBlob,
              previewUrl: chosenSlide.previewUrl,
              confidenceScore: 100,
              matchType: 'manual_override'
            }
          };
        }

        // Maintain 1-to-1 uniqueness: if another item had this slide assigned, unassign it
        if (num && item.matchedSlide?.number === num) {
          return { ...item, matchedSlide: null };
        }

        return item;
      });

      return { ...prev, items: updatedItems };
    });
  };

  // Execute Atomic Bulk Booking
  const handleCommit = async () => {
    if (!parsedData || !parsedData.items) return;

    setIsCommitting(true);
    setCommitProgress({ percent: 10, message: "Initiating atomic bulk booking..." });

    try {
      const result = await commitBulkBookings({
        bookingItems: parsedData.items,
        existingHoardings: hoardings,
        skipConflicted,
        artworkMode,
        onProgress: (percent, message) => {
          setCommitProgress({ percent, message });
        }
      });

      setCommitResult(result);
      setStep(3);

      if (onSuccess) {
        onSuccess(result.finalHoardings);
      }
    } catch (err) {
      console.error("[Bulk Booking Commit Error]:", err);
      alert(`Booking failed: ${err.message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  // Reset Wizard
  const handleReset = () => {
    if (parsedData?.items) {
      // Clean up object URLs
      parsedData.items.forEach(item => {
        if (item.matchedSlide?.previewUrl) {
          try { URL.revokeObjectURL(item.matchedSlide.previewUrl); } catch {}
        }
      });
    }
    setStep(1);
    setExcelFile(null);
    setPptFile(null);
    setParsedData(null);
    setCommitResult(null);
    setCommitProgress({ percent: 0, message: '' });
  };

  // Filtered view of items in Step 2 table
  const displayedItems = useMemo(() => {
    if (!parsedData?.items) return [];
    if (activeClientFilter === 'All') return parsedData.items;
    return parsedData.items.filter(i => i.clientName === activeClientFilter);
  }, [parsedData, activeClientFilter]);

  const eligibleCount = useMemo(() => {
    if (!parsedData?.items) return 0;
    return parsedData.items.filter(i => i.matchedSite && (!i.hasConflict || !skipConflicted)).length;
  }, [parsedData, skipConflicted]);

  if (!isOpen) return null;

  return (
    <div className="bulk-wizard-overlay" role="dialog" aria-modal="true">
      <div className="bulk-wizard-modal">
        {/* Top Header */}
        <div className="bulk-wizard-header">
          <div className="bulk-wizard-title-group">
            <div className="bulk-wizard-icon-badge">
              <Layers size={20} color="#6366f1" />
            </div>
            <div>
              <h3>Bulk Campaign Onboarding Wizard</h3>
              <p>Book multiple sites across multiple clients in one seamless workflow</p>
            </div>
          </div>
          <button type="button" className="bulk-wizard-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Step 1: Mode Selection & File Dropzone */}
        {step === 1 && (
          <div className="bulk-wizard-body">
            {/* Mode Selector Cards */}
            <div className="bulk-mode-selector">
              <div 
                className={`bulk-mode-card ${mode === 'excel' ? 'active' : ''}`}
                onClick={() => setMode('excel')}
              >
                <div className="mode-card-radio">
                  <div className="radio-inner" />
                </div>
                <div className="mode-card-icon excel-icon">
                  <FileSpreadsheet size={24} />
                </div>
                <div className="mode-card-info">
                  <h4>Mode 1: Only Excel (Fast Booking)</h4>
                  <p>Fastest way to book. Upload Media Plan / RO with client names, dates & rates.</p>
                  <span className="mode-badge">⚡ 1 File Required</span>
                </div>
              </div>

              <div 
                className={`bulk-mode-card ${mode === 'combo' ? 'active' : ''}`}
                onClick={() => setMode('combo')}
              >
                <div className="mode-card-radio">
                  <div className="radio-inner" />
                </div>
                <div className="mode-card-icon combo-icon">
                  <Presentation size={24} />
                </div>
                <div className="mode-card-info">
                  <h4>Mode 2: Excel + PPT Bundle (Full Campaign)</h4>
                  <p>Excel for dates & clients + PPT deck for photos. AI auto-matches slides to sites.</p>
                  <span className="mode-badge combo">📦 Excel + PPT Required</span>
                </div>
              </div>
            </div>

            {/* Dropzones */}
            <div className={`bulk-dropzone-grid ${mode === 'combo' ? 'dual' : 'single'}`}>
              {/* Excel Dropzone */}
              <div 
                className={`bulk-file-dropzone ${excelFile ? 'has-file' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleExcelDrop}
                onClick={() => excelInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={excelInputRef} 
                  accept=".xlsx, .xls, .csv" 
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) setExcelFile(e.target.files[0]);
                  }}
                />
                <div className="dropzone-content">
                  <FileSpreadsheet size={36} className="dropzone-icon" />
                  {excelFile ? (
                    <div className="file-info-badge">
                      <span className="file-name">{excelFile.name}</span>
                      <span className="file-size">({(excelFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  ) : (
                    <>
                      <h5>Drop Excel Media Plan (.xlsx, .csv)</h5>
                      <p>or click to browse from computer</p>
                    </>
                  )}
                </div>
              </div>

              {/* PPT Dropzone (Mode B) */}
              {mode === 'combo' && (
                <div 
                  className={`bulk-file-dropzone ${pptFile ? 'has-file' : ''}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handlePptDrop}
                  onClick={() => pptInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    ref={pptInputRef} 
                    accept=".pptx" 
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files?.[0]) setPptFile(e.target.files[0]);
                    }}
                  />
                  <div className="dropzone-content">
                    <Presentation size={36} className="dropzone-icon ppt-color" />
                    {pptFile ? (
                      <div className="file-info-badge">
                        <span className="file-name">{pptFile.name}</span>
                        <span className="file-size">({(pptFile.size / (1024 * 1024)).toFixed(1)} MB)</span>
                      </div>
                    ) : (
                      <>
                        <h5>Drop Campaign PPT Deck (.pptx)</h5>
                        <p>contains display artwork / execution photos</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* PPT Artwork Target Destination Selector */}
            {mode === 'combo' && (
              <div style={{
                margin: '16px 0 8px 0',
                padding: '14px 16px',
                background: '#f8fafc',
                borderRadius: '12px',
                border: '1.5px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
              }}>
                <div style={{ fontSize: '0.86rem', fontWeight: '700', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🎯</span>
                  <span>PPT Artwork Slides Destination:</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px 12px',
                    background: artworkMode === 'history_only' ? '#ecfdf5' : '#ffffff',
                    border: artworkMode === 'history_only' ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}>
                    <input 
                      type="radio" 
                      name="bulkArtworkModeStep1" 
                      value="history_only" 
                      checked={artworkMode === 'history_only'} 
                      onChange={() => setArtworkMode('history_only')}
                      style={{ marginTop: '3px' }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: artworkMode === 'history_only' ? '#065f46' : '#1e293b' }}>
                        📁 Save to History Only (Recommended)
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px', lineHeight: 1.3 }}>
                        Keep current master site photo intact; save PPT artwork slides as audit proof in site history.
                      </div>
                    </div>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px 12px',
                    background: artworkMode === 'replace_master' ? '#eef2ff' : '#ffffff',
                    border: artworkMode === 'replace_master' ? '1.5px solid #6366f1' : '1px solid #cbd5e1',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}>
                    <input 
                      type="radio" 
                      name="bulkArtworkModeStep1" 
                      value="replace_master" 
                      checked={artworkMode === 'replace_master'} 
                      onChange={() => setArtworkMode('replace_master')}
                      style={{ marginTop: '3px' }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: artworkMode === 'replace_master' ? '#3730a3' : '#1e293b' }}>
                        🔄 Replace Main Site Photo
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px', lineHeight: 1.3 }}>
                        Update the primary site display photo with the PPT artwork slide; previous master photo is archived.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Instruction Callout */}
            <div className="bulk-instruction-callout">
              <Sparkles size={16} color="#6366f1" />
              <span>
                <strong>Smart Multi-Client Engine:</strong> A single Excel file can contain multiple clients in the <code>Client Name</code> or <code>Booked By</code> column. The engine will auto-group them!
              </span>
            </div>

            {/* Modal Actions */}
            <div className="bulk-wizard-actions">
              <button type="button" className="btn-wizard-cancel" onClick={onClose}>
                Cancel
              </button>
              <button 
                type="button" 
                className="btn-wizard-next" 
                disabled={!excelFile || (mode === 'combo' && !pptFile) || isProcessing}
                onClick={handleAnalyzeFiles}
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={16} className="spin-icon" />
                    <span>{processingMsg || 'Processing...'}</span>
                  </>
                ) : (
                  <>
                    <span>Review & Validate Bookings</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Conflict Radar, Client Grouping & Confirmation Matrix */}
        {step === 2 && parsedData && (
          <div className="bulk-wizard-body step-2-body">
            {/* Top Conflict Radar & Stats Row */}
            <div className="bulk-radar-summary-bar">
              <div className="radar-stat-item">
                <span className="stat-label">Total Sites in File</span>
                <strong className="stat-value">{parsedData.totalSites}</strong>
              </div>
              <div className="radar-stat-item">
                <span className="stat-label">Clients Detected</span>
                <strong className="stat-value">{parsedData.clientGroups.length}</strong>
              </div>
              <div className="radar-stat-item success">
                <span className="stat-label">Ready to Book</span>
                <strong className="stat-value success">{eligibleCount}</strong>
              </div>
              {parsedData.conflictsCount > 0 && (
                <div className="radar-stat-item danger">
                  <span className="stat-label">Date Clashes</span>
                  <strong className="stat-value danger">{parsedData.conflictsCount}</strong>
                </div>
              )}
            </div>

            {/* Conflict Alert Banner (If Any) */}
            {parsedData.conflictsCount > 0 && (
              <div className="bulk-conflict-alert-banner">
                <AlertTriangle size={18} className="alert-icon" />
                <div className="alert-copy">
                  <strong>Conflict Prevention Radar Active:</strong> {parsedData.conflictsCount} site(s) clash with existing client bookings.
                  <label className="skip-checkbox-label">
                    <input 
                      type="checkbox" 
                      checked={skipConflicted} 
                      onChange={(e) => setSkipConflicted(e.target.checked)} 
                    />
                    <span>Automatically skip clashing sites & book remaining {eligibleCount} clear sites</span>
                  </label>
                </div>
              </div>
            )}

            {/* Step 2: Artwork Destination Confirmation Bar */}
            {mode === 'combo' && pptFile && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                padding: '8px 14px',
                background: '#f8fafc',
                borderRadius: '8px',
                marginBottom: '12px',
                fontSize: '0.82rem',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#334155' }}>
                  <span>🎯 PPT Artwork Destination:</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setArtworkMode('history_only')}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '6px',
                      border: artworkMode === 'history_only' ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                      background: artworkMode === 'history_only' ? '#ecfdf5' : '#ffffff',
                      color: artworkMode === 'history_only' ? '#065f46' : '#64748b',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      cursor: 'pointer'
                    }}
                  >
                    📁 Save to History Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setArtworkMode('replace_master')}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '6px',
                      border: artworkMode === 'replace_master' ? '1.5px solid #6366f1' : '1px solid #cbd5e1',
                      background: artworkMode === 'replace_master' ? '#eef2ff' : '#ffffff',
                      color: artworkMode === 'replace_master' ? '#3730a3' : '#64748b',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      cursor: 'pointer'
                    }}
                  >
                    🔄 Replace Master Photo
                  </button>
                </div>
              </div>
            )}

            {/* Multi-Client Filter Chips */}
            <div className="bulk-client-pills-bar">
              <span className="client-filter-label"><Filter size={14} /> Filter Client:</span>
              <button 
                type="button" 
                className={`client-chip ${activeClientFilter === 'All' ? 'active' : ''}`}
                onClick={() => setActiveClientFilter('All')}
              >
                All Clients ({parsedData.totalSites})
              </button>
              {parsedData.clientGroups.map((cg) => {
                const colors = clientColorMap[cg.name] || {};
                return (
                  <button 
                    key={cg.name}
                    type="button" 
                    className={`client-chip ${activeClientFilter === cg.name ? 'active' : ''}`}
                    onClick={() => setActiveClientFilter(cg.name)}
                    style={{
                      borderColor: activeClientFilter === cg.name ? colors.border : undefined,
                      background: activeClientFilter === cg.name ? colors.bg : undefined,
                      color: activeClientFilter === cg.name ? colors.text : undefined
                    }}
                  >
                    <span>{cg.name} ({cg.count})</span>
                    {cg.hasConflicts && <span className="chip-conflict-dot" title="Has date conflict" />}
                  </button>
                );
              })}
            </div>

            {/* Confirmation Matrix Table */}
            <div className="bulk-matrix-table-wrap">
              <table className="bulk-matrix-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Client</th>
                    <th>Site Location</th>
                    <th>Facing</th>
                    <th>City</th>
                    <th>Booking Dates</th>
                    <th>Rent</th>
                    {mode === 'combo' && <th>Matched Photo</th>}
                    <th>Radar Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedItems.map((item, idx) => {
                    const clientColors = clientColorMap[item.clientName] || {};
                    const isSkipped = item.hasConflict && skipConflicted;

                    return (
                      <tr key={item.id} className={isSkipped ? 'row-skipped' : item.hasConflict ? 'row-conflict' : 'row-valid'}>
                        <td className="col-idx">{idx + 1}</td>
                        <td className="col-client">
                          <span 
                            className="client-tag"
                            style={{ 
                              background: clientColors.bg || '#f1f5f9', 
                              color: clientColors.text || '#1e293b',
                              borderColor: clientColors.border || '#cbd5e1'
                            }}
                          >
                            {item.clientName}
                          </span>
                        </td>
                        <td className="col-location">
                          <strong>{item.location}</strong>
                          {(item.matchedSite?.SL || item.sl) && (
                            <span className="site-sl-tag">SL #{item.matchedSite?.SL || item.sl}</span>
                          )}
                        </td>
                        <td className="col-facing">
                          <span className="facing-tag-prominent">
                            {item.facing || item.matchedSite?.Facing || 'Default View'}
                          </span>
                        </td>
                        <td className="col-city">{item.city}</td>
                        <td className="col-dates">
                          <span className="date-span">{item.startDate} → {item.endDate}</span>
                          <small className="days-tag">({item.durationDays} days)</small>
                        </td>
                        <td className="col-rent">₹{Number(item.proRataRent || item.monthlyRent || 0).toLocaleString()}</td>
                        {mode === 'combo' && (
                          <td className="col-photo">
                            <div className="slide-selector-cell">
                              <div className="slide-thumb-preview" title={item.matchedSlide ? `Slide ${item.matchedSlide.number}` : 'No photo'}>
                                {item.matchedSlide?.previewUrl ? (
                                  <>
                                    <img src={item.matchedSlide.previewUrl} alt={`Slide ${item.matchedSlide.number}`} />
                                    <span className="slide-tag">S{item.matchedSlide.number}</span>
                                  </>
                                ) : (
                                  <span className="no-slide-tag">No Photo</span>
                                )}
                              </div>

                              <div className="slide-selector-controls">
                                <select 
                                  className="slide-picker-dropdown"
                                  value={item.matchedSlide?.number || ''}
                                  onChange={(e) => handleSlideChange(item.id, e.target.value)}
                                  title="Change matched slide artwork"
                                >
                                  <option value="">(No Photo)</option>
                                  {item.availableSlides?.map(s => (
                                    <option key={s.number} value={s.number}>
                                      Slide {s.number} {s.isCover ? '[Cover]' : ''} {s.textSnippet ? `— ${s.textSnippet.slice(0, 20)}...` : ''}
                                    </option>
                                  ))}
                                </select>

                                {item.matchedSlide && (
                                  <div className="slide-confidence-row">
                                    {item.matchedSlide.matchType === 'manual_override' ? (
                                      <span className="confidence-pill manual" title="Manually assigned by Admin">
                                        ⚡ 100% Manual
                                      </span>
                                    ) : item.matchedSlide.confidenceScore >= 80 ? (
                                      <span className="confidence-pill high" title="High Confidence Match (SL & Location Verified)">
                                        🎯 {item.matchedSlide.confidenceScore}% Match
                                      </span>
                                    ) : item.matchedSlide.confidenceScore >= 50 ? (
                                      <span className="confidence-pill medium" title="Location Text Matched">
                                        🔍 {item.matchedSlide.confidenceScore}% Likely
                                      </span>
                                    ) : (
                                      <span className="confidence-pill low" title="Sequential Fallback Assignment">
                                        📑 {item.matchedSlide.confidenceScore}% Order
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        )}
                        <td className="col-status">
                          {item.hasConflict ? (
                            <div className="status-conflict-cell">
                              <span className="status-badge conflict" title={item.conflictReason || 'Date conflict'}>
                                <AlertCircle size={12} />
                                <span>{isSkipped ? 'Skipped (Conflict)' : 'Date Conflict'}</span>
                              </span>
                              {item.conflictReason && (
                                <small className="conflict-reason-text">
                                  {item.conflictReason}
                                </small>
                              )}
                            </div>
                          ) : (
                            <span className="status-badge clear">
                              <CheckCircle2 size={12} />
                              <span>Clear to Book</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Commit Action Footer */}
            <div className="bulk-wizard-actions">
              <button type="button" className="btn-wizard-cancel" onClick={handleReset} disabled={isCommitting}>
                <RotateCcw size={15} /> Back
              </button>
              
              <button 
                type="button" 
                className="btn-wizard-commit"
                disabled={eligibleCount === 0 || isCommitting}
                onClick={handleCommit}
              >
                {isCommitting ? (
                  <>
                    <Loader2 size={16} className="spin-icon" />
                    <span>{commitProgress.message || `Booking ${eligibleCount} sites...`}</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Confirm & Book {eligibleCount} Sites</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Success Screen */}
        {step === 3 && commitResult && (
          <div className="bulk-wizard-body step-success">
            <div className="success-icon-wrap">
              <CheckCircle2 size={56} color="#10b981" />
            </div>
            <h4>Bulk Campaign Successfully Onboarded!</h4>
            <p>
              <strong>{commitResult.bookedCount} hoarding sites</strong> have been confirmed and booked across{' '}
              <strong>{parsedData?.clientGroups.length || 1} client campaigns</strong>.
            </p>

            {commitResult.skippedCount > 0 && (
              <p className="skipped-notice">
                ({commitResult.skippedCount} clashing sites were safely bypassed to prevent double bookings).
              </p>
            )}

            <div className="bulk-wizard-actions centered">
              <button type="button" className="btn-wizard-next" onClick={onClose}>
                View in Clients & Bookings
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
