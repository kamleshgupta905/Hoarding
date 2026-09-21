import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Presentation, 
  Layers, 
  X, 
  CheckCircle2, 
  ArrowRight, 
  Trash2,
  Image,
  FolderArchive
} from 'lucide-react';
import './HeaderSitesUploadModal.css';

export default function HeaderSitesUploadModal({
  isOpen,
  onClose,
  onStartUpload,
  disabled = false
}) {
  const [mode, setMode] = useState('excel'); // 'excel' | 'ppt' | 'combo'
  const [pptDestination, setPptDestination] = useState('history'); // 'history' | 'main'
  const [excelFile, setExcelFile] = useState(null);
  const [pptFile, setPptFile] = useState(null);

  const excelInputRef = useRef(null);
  const pptInputRef = useRef(null);

  if (!isOpen) return null;

  const handleExcelDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && /\.(xlsx|xls|csv)$/i.test(file.name)) {
      setExcelFile(file);
    }
  };

  const handlePptDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && /\.(pptx?|ppt)$/i.test(file.name)) {
      setPptFile(file);
    }
  };

  const isSubmitDisabled = () => {
    if (disabled) return true;
    if (mode === 'excel') return !excelFile;
    if (mode === 'ppt') return !pptFile;
    if (mode === 'combo') return !excelFile || !pptFile;
    return true;
  };

  const handleSubmit = () => {
    if (isSubmitDisabled()) return;
    onStartUpload({
      mode,
      excelFile,
      pptFile,
      pptDestination
    });
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  return (
    <div className="header-upload-modal-overlay" onClick={onClose}>
      <div 
        className="header-upload-modal-card" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="header-upload-modal-header">
          <div className="hu-header-left">
            <div className="hu-header-icon">
              <UploadCloud size={22} color="#4f46e5" />
            </div>
            <div className="hu-header-text">
              <h3>Upload Sites Inventory</h3>
              <p>Select an ingestion mode for hoarding sites & display photos</p>
            </div>
          </div>
          <button 
            type="button" 
            className="hu-modal-close-btn" 
            onClick={onClose}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="header-upload-modal-body">
          {/* 1. Mode Selector */}
          <div>
            <div className="hu-section-title">Step 1: Choose Ingestion Mode</div>
            <div className="hu-modes-grid">
              {/* Mode 1: Excel Only */}
              <div 
                className={`hu-mode-card ${mode === 'excel' ? 'active' : ''}`}
                onClick={() => setMode('excel')}
              >
                <div className="hu-mode-header">
                  <div className="hu-mode-icon-wrap excel">
                    <FileSpreadsheet size={18} />
                  </div>
                  <div className="hu-radio-circle">
                    {mode === 'excel' && <div className="hu-radio-dot" />}
                  </div>
                </div>
                <h4>1. Only Excel</h4>
                <p>Add or update sites and specifications in master sheet.</p>
                <span className="hu-mode-badge">⚡ 1 File Required</span>
              </div>

              {/* Mode 2: PPT Only */}
              <div 
                className={`hu-mode-card ${mode === 'ppt' ? 'active' : ''}`}
                onClick={() => setMode('ppt')}
              >
                <div className="hu-mode-header">
                  <div className="hu-mode-icon-wrap ppt">
                    <Presentation size={18} />
                  </div>
                  <div className="hu-radio-circle">
                    {mode === 'ppt' && <div className="hu-radio-dot" />}
                  </div>
                </div>
                <h4>2. Only PPT</h4>
                <p>Extract display photos from slides and match to hoardings.</p>
                <span className="hu-mode-badge">📸 1 File Required</span>
              </div>

              {/* Mode 3: Combo */}
              <div 
                className={`hu-mode-card ${mode === 'combo' ? 'active' : ''}`}
                onClick={() => setMode('combo')}
              >
                <div className="hu-mode-header">
                  <div className="hu-mode-icon-wrap combo">
                    <Layers size={18} />
                  </div>
                  <div className="hu-radio-circle">
                    {mode === 'combo' && <div className="hu-radio-dot" />}
                  </div>
                </div>
                <h4>3. Excel + PPT</h4>
                <p>Sync new sites via Excel, then match slide photos sequentially.</p>
                <span className="hu-mode-badge">📦 Both Required</span>
              </div>
            </div>
          </div>

          {/* 2. PPT Destination Selector (Shown for Mode 2 & Mode 3) */}
          {(mode === 'ppt' || mode === 'combo') && (
            <div className="hu-target-selector">
              <div className="hu-target-header">
                <span className="hu-target-label">
                  <Image size={15} /> PPT Photo Destination (Save Target):
                </span>
              </div>
              <div className="hu-target-cards">
                {/* Option A: Save to History */}
                <div 
                  className={`hu-target-card ${pptDestination === 'history' ? 'active' : ''}`}
                  onClick={() => setPptDestination('history')}
                >
                  <div className="hu-target-card-top">
                    <span className="hu-target-card-title">📁 Save to History</span>
                    <span className="hu-mode-badge" style={{ background: pptDestination === 'history' ? '#fef3c7' : '#f1f5f9', color: pptDestination === 'history' ? '#b45309' : '#64748b' }}>
                      Recommended
                    </span>
                  </div>
                  <p className="hu-target-card-desc">
                    Saves photos into site's execution proof history. Main display photo remains intact.
                  </p>
                </div>

                {/* Option B: As Main Image */}
                <div 
                  className={`hu-target-card ${pptDestination === 'main' ? 'active' : ''}`}
                  onClick={() => setPptDestination('main')}
                >
                  <div className="hu-target-card-top">
                    <span className="hu-target-card-title">🔄 As Main Image</span>
                    <span className="hu-mode-badge" style={{ background: pptDestination === 'main' ? '#e0e7ff' : '#f1f5f9', color: pptDestination === 'main' ? '#4338ca' : '#64748b' }}>
                      Replace Photo
                    </span>
                  </div>
                  <p className="hu-target-card-desc">
                    Sets photo as the site's primary master display image (ImageURL) in database & sheet.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 3. File Dropzones */}
          <div className="hu-dropzones-area">
            <div className="hu-section-title">Step 2: Choose File(s) to Upload</div>

            {/* Excel Dropzone */}
            {(mode === 'excel' || mode === 'combo') && (
              <div className="hu-dropzone-wrap">
                <span className="hu-dropzone-label">
                  <FileSpreadsheet size={14} color="#16a34a" /> Master Sheet (Excel / CSV):
                </span>
                <input 
                  type="file" 
                  ref={excelInputRef}
                  accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) setExcelFile(e.target.files[0]);
                  }}
                />
                {!excelFile ? (
                  <div 
                    className="hu-dropzone"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleExcelDrop}
                    onClick={() => excelInputRef.current?.click()}
                  >
                    <div className="hu-dropzone-icon">
                      <FileSpreadsheet size={20} color="#16a34a" />
                    </div>
                    <span className="hu-dropzone-text">Click or drop Excel file here</span>
                    <span className="hu-dropzone-sub">Supports .xlsx, .xls, .csv formats</span>
                  </div>
                ) : (
                  <div className="hu-file-selected-row">
                    <div className="hu-file-selected-info">
                      <CheckCircle2 size={16} color="#16a34a" />
                      <span>{excelFile.name}</span>
                      <small style={{ color: '#64748b' }}>({formatFileSize(excelFile.size)})</small>
                    </div>
                    <button 
                      type="button" 
                      className="hu-file-remove-btn" 
                      onClick={() => setExcelFile(null)}
                      title="Remove file"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* PPT Dropzone */}
            {(mode === 'ppt' || mode === 'combo') && (
              <div className="hu-dropzone-wrap">
                <span className="hu-dropzone-label">
                  <Presentation size={14} color="#db2777" /> Presentation Deck (PPT / PPTX):
                </span>
                <input 
                  type="file" 
                  ref={pptInputRef}
                  accept=".pptx,.ppt"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) setPptFile(e.target.files[0]);
                  }}
                />
                {!pptFile ? (
                  <div 
                    className="hu-dropzone"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handlePptDrop}
                    onClick={() => pptInputRef.current?.click()}
                  >
                    <div className="hu-dropzone-icon">
                      <Presentation size={20} color="#db2777" />
                    </div>
                    <span className="hu-dropzone-text">Click or drop PPT deck here</span>
                    <span className="hu-dropzone-sub">Supports .pptx and .ppt formats</span>
                  </div>
                ) : (
                  <div className="hu-file-selected-row">
                    <div className="hu-file-selected-info">
                      <CheckCircle2 size={16} color="#db2777" />
                      <span>{pptFile.name}</span>
                      <small style={{ color: '#64748b' }}>({formatFileSize(pptFile.size)})</small>
                    </div>
                    <button 
                      type="button" 
                      className="hu-file-remove-btn" 
                      onClick={() => setPptFile(null)}
                      title="Remove file"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="header-upload-modal-footer">
          <button 
            type="button" 
            className="hu-btn-cancel" 
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className="hu-btn-submit"
            disabled={isSubmitDisabled()}
            onClick={handleSubmit}
          >
            <span>
              {mode === 'excel' && 'Start Excel Ingestion'}
              {mode === 'ppt' && `Upload PPT (${pptDestination === 'history' ? 'Save to History' : 'As Main Image'})`}
              {mode === 'combo' && `Start Combined Upload (${pptDestination === 'history' ? 'Save to History' : 'As Main Image'})`}
            </span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
