import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, Database, FileUp, Settings,
    Scissors,
    FileText, LogOut, Search, Eye, EyeOff,
    TrendingUp, MapPin, CheckCircle, Smartphone,
    Bell, HelpCircle, Plus, Filter, Download,
    MessageSquare, Mail, User, Users, Package, ShoppingBag, BarChart2, FolderTree, Calendar, CheckSquare,
    MoreVertical, ExternalLink, ShieldCheck, Menu, X, UploadCloud, RefreshCw, Zap, XCircle, Share2, Trash2, Camera, Table2, Save, Undo2, Redo2, FileDown, Copy, Timer, Clock3, PanelLeftClose, PanelLeftOpen, Maximize2, Minimize2,
    BarChart3, PieChart, Activity, Sparkles, ArrowUpRight, Layers, Compass, DollarSign, Award, Flame, Check, ChevronRight, Monitor, QrCode, Printer, BookOpen
} from 'lucide-react';
import { analyzeHoardingImage } from '../services/aiService';
import { fetchHoardings, compressImage, syncToGoogleSheet, exportProposalExcel, PROPOSAL_COLUMNS, getImageUrl, downloadHoardingImage, fetchStaffUploads, reviewStaffPhoto, detectStaffPhotoOrientation, fetchSheetGrid, saveSheetGrid, addDeletedSite } from '../services/dataService';
import ImageLightbox from '../components/ImageLightbox';
import { clearAdminSession, getAdminSession, getStaffUploadLink } from '../services/secureApi';
import { isInternalHeader } from '../core/hoardingSchema';
import { blobToDataUrl, prepareImageOrientation } from '../core/imageOrientation';
import { parsePptx, releasePptxPreviews } from '../core/pptxEngine';
import { HIRA_LOGO } from '../assets/hiraLogoData';
import './AdminDashboard.css';

const SHEET_HISTORY_LIMIT = 30;
const HIDDEN_SHEET_COLUMN_LETTERS = new Set(['T', 'W', 'X', 'Y', 'Z']);

const wait = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

const readFileAsDataUrl = (file, onProgress) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected file could not be read.'));
    reader.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
});

const formatProcessingTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

const estimateUploadDuration = (file, type) => {
    const sizeInMb = Math.max(1, Math.ceil(file.size / (1024 * 1024)));
    if (type === 'excel') {
        return sizeInMb <= 2 ? '30-60 seconds' : `about ${Math.min(3, sizeInMb)} minutes`;
    }
    return sizeInMb <= 8 ? '1-2 minutes' : `about ${Math.min(8, Math.max(2, Math.ceil(sizeInMb / 4)))} minutes`;
};

const MultiSelectFilter = ({ label, options, selected, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isAll = !selected || selected.length === 0 || selected.includes('All');

    const cleanOptions = (options || []).filter(opt => opt && opt !== 'All');
    const filteredOptions = cleanOptions.filter(opt => 
        String(opt).toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleOption = (opt) => {
        if (opt === 'All') {
            onChange(['All']);
            return;
        }
        let next;
        if (isAll) {
            next = [opt];
        } else if (selected.includes(opt)) {
            next = selected.filter(s => s !== opt);
            if (next.length === 0) next = ['All'];
        } else {
            next = [...selected, opt];
        }
        onChange(next);
    };

    const toggleSelectAll = () => {
        if (isAll) {
            onChange([]);
        } else {
            onChange(['All']);
        }
    };

    const displayText = isAll
        ? 'All'
        : selected.length === 1
            ? selected[0]
            : `${selected[0]} (+${selected.length - 1})`;

    return (
        <div className="inventory-filter-group" ref={dropdownRef} style={{ position: 'relative' }}>
            <label>{label}</label>
            <div
                role="button"
                tabIndex={0}
                onClick={() => setIsOpen(!isOpen)}
                onKeyDown={(e) => e.key === 'Enter' && setIsOpen(!isOpen)}
                style={{
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: isOpen ? '1.5px solid #6366f1' : '1px solid #d1d5db',
                    background: '#fff',
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontWeight: isAll ? 400 : 600,
                    color: isAll ? '#4b5563' : '#1e293b',
                    boxShadow: isOpen ? '0 0 0 3px rgba(99, 102, 241, 0.15)' : 'none',
                    transition: 'all 0.15s ease',
                    userSelect: 'none',
                    minHeight: '36px'
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                    {displayText}
                </span>
                <span style={{ fontSize: '9px', color: '#9ca3af', marginLeft: '6px' }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    zIndex: 1050,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    boxShadow: '0 12px 30px -4px rgba(0,0,0,0.15), 0 4px 6px -2px rgba(0,0,0,0.05)',
                    width: '230px',
                    maxHeight: '270px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    {cleanOptions.length > 5 && (
                        <div style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <input
                                type="text"
                                placeholder={`Search ${label}...`}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '5px 8px',
                                    fontSize: '0.78rem',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    outline: 'none',
                                    background: '#fff'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    )}
                    <div style={{ padding: '5px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', background: '#f8fafc' }}>
                        <button 
                            type="button" 
                            onClick={toggleSelectAll} 
                            style={{ background: 'none', border: 'none', color: '#6366f1', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                        >
                            {isAll ? 'Deselect All' : 'Select All'}
                        </button>
                        <span style={{ color: '#64748b', fontWeight: 500 }}>
                            {isAll ? `${cleanOptions.length} Items` : `${selected.length} Selected`}
                        </span>
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0', maxHeight: '180px' }}>
                        <label 
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                padding: '6px 12px', 
                                fontSize: '0.82rem', 
                                cursor: 'pointer',
                                background: isAll ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                                fontWeight: isAll ? 700 : 400
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <input
                                type="checkbox"
                                checked={isAll}
                                onChange={() => toggleOption('All')}
                                style={{ cursor: 'pointer', accentColor: '#6366f1' }}
                            />
                            <span>All</span>
                        </label>
                        {filteredOptions.map(opt => {
                            const isChecked = !isAll && selected.includes(opt);
                            return (
                                <label 
                                    key={opt} 
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '8px', 
                                        padding: '5px 12px', 
                                        fontSize: '0.82rem', 
                                        cursor: 'pointer',
                                        background: isChecked ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                                        color: isChecked ? '#4338ca' : '#1f2937',
                                        fontWeight: isChecked ? 600 : 400
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleOption(opt)}
                                        style={{ cursor: 'pointer', accentColor: '#6366f1' }}
                                    />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

const AdminDashboard = ({ hoardings = [], setHoardings = () => {} }) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [searchTerm, setSearchTerm] = useState('');
    const [inventoryCityFilter, setInventoryCityFilter] = useState(['All']);
    const [inventoryStatusFilter, setInventoryStatusFilter] = useState('All');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [inventoryLocalityFilter, setInventoryLocalityFilter] = useState(['All']);
    const [inventoryMediaFilter, setInventoryMediaFilter] = useState(['All']);
    const [inventorySizeFilter, setInventorySizeFilter] = useState(['All']);
    const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState(['All']);
    const [inventoryPriceFilter, setInventoryPriceFilter] = useState('All');
    const [isInventoryFilterOpen, setIsInventoryFilterOpen] = useState(false);
    const [toast, setToast] = useState(null); // { message: string, type: 'success' | 'error' | 'info' }

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => {
            setToast(current => (current && current.message === message ? null : current));
        }, 4000);
    };

    const [isLoading, setIsLoading] = useState(false);
    const [fileProcessing, setFileProcessing] = useState(null);
    const [processingSeconds, setProcessingSeconds] = useState(0);
    const [uploadNotice, setUploadNotice] = useState(null);
    const [reviewNotice, setReviewNotice] = useState(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem('adhoardings_sidebar_collapsed') === 'true');
    const [isSheetFullscreen, setIsSheetFullscreen] = useState(false);

    // Script URL & API Configuration
    const [scriptUrl] = useState('https://script.google.com/macros/s/AKfycbwmtW7Y71md_XoIk8A0JWrsWKSN-YuFgCcdahe5R56mADlGtH-t9Pj98YhPt3-Z1DoI5g/exec');
    // const API_KEY = '...'; // Removed hardcoded key in favor of VITE_OPENAI_API_KEY in .env
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedHoarding, setSelectedHoarding] = useState(null);
    const [formData, setFormData] = useState({});

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [dailyImages, setDailyImages] = useState([]); // [{file, preview, status, location, aiLoading}]
    const [selectedAssetFile, setSelectedAssetFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null); // { site, index, name, city, locality } or string
    const [bulkDeleteTarget, setBulkDeleteTarget] = useState(null);
    const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('');
    const [selectedProposalKeys, setSelectedProposalKeys] = useState([]);
    const [selectedProposalHeaders, setSelectedProposalHeaders] = useState(PROPOSAL_COLUMNS.map(([label]) => label));
    const [previewHoarding, setPreviewHoarding] = useState(null);
    const [staffUploads, setStaffUploads] = useState([]);
    const [staffUploadLink, setStaffUploadLink] = useState('/staff/upload');
    const [reviewSelections, setReviewSelections] = useState({});
    const [pendingStaffReviewIds, setPendingStaffReviewIds] = useState({});
    const [staffImagePreviews, setStaffImagePreviews] = useState({});
    const orientationCacheRef = useRef(new Map());
    const sheetEditorRef = useRef(null);
    const [excelImportPreview, setExcelImportPreview] = useState(null);
    const [excelImportToken, setExcelImportToken] = useState('');
    const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);
    const [isExcelApproving, setIsExcelApproving] = useState(false);
    const [sheetHeaders, setSheetHeaders] = useState([]);
    const [sheetRows, setSheetRows] = useState([]);
    const [sheetSearch, setSheetSearch] = useState('');
    const [sheetDirty, setSheetDirty] = useState(false);
    const [sheetLoading, setSheetLoading] = useState(false);
    const [sheetSaving, setSheetSaving] = useState(false);
    const [sheetLastSync, setSheetLastSync] = useState('');
    const [sheetHistory, setSheetHistory] = useState([]);
    const [sheetFuture, setSheetFuture] = useState([]);
    const [selectedSheetCell, setSelectedSheetCell] = useState({ row: 0, col: 0 });
    const [sheetSelection, setSheetSelection] = useState({ type: 'cell', row: 0, col: 0 });
    // ✂️ Cut support
    const [cutBuffer, setCutBuffer] = useState(null); // { rows: [[...]], selection: {...} }
    // 🔍 Find & Replace
    const [findReplaceOpen, setFindReplaceOpen] = useState(false);
    const [findQuery, setFindQuery] = useState('');
    const [replaceQuery, setReplaceQuery] = useState('');
    const [findMatchCase, setFindMatchCase] = useState(false);
    const [findMatches, setFindMatches] = useState([]); // [{row, col}]
    const [findMatchIndex, setFindMatchIndex] = useState(-1);
    // 📐 Column & Row Resize
    const [colWidths, setColWidths] = useState({}); // { colIndex: px }
    const [rowHeights, setRowHeights] = useState({}); // { rowIndex: px }
    const [resizingCol, setResizingCol] = useState(null);
    const [resizingRow, setResizingRow] = useState(null);
    const resizeStartRef = useRef(null);
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [clientStatusFilter, setClientStatusFilter] = useState('All');
    const [clientViewMode, setClientViewMode] = useState('table'); // 'table' | 'summary'
    // 🖱️ Right-click Context Menu
    const [contextMenu, setContextMenu] = useState(null); // { x, y, row, col }
    // ↕️ Sort & Filter
    const [sortConfig, setSortConfig] = useState(null); // { col, direction: 'asc'|'desc' }
    const [filterConfig, setFilterConfig] = useState({}); // { colIndex: 'value' }
    const [filterDropdownCol, setFilterDropdownCol] = useState(null);
    const [overviewChartTab, setOverviewChartTab] = useState('zones'); // 'zones' | 'media' | 'pricing'
    const [hoveredChartItem, setHoveredChartItem] = useState(null);
    const [fieldAuditTab, setFieldAuditTab] = useState('matched'); // 'matched' | 'unmatched'
    const [selectedPinpointUpload, setSelectedPinpointUpload] = useState(null);
    const [isAppDownloadModalOpen, setIsAppDownloadModalOpen] = useState(false);



    // Protect Route
    useEffect(() => {
        if (!getAdminSession()) navigate('/admin/login');
        // initializeAI(); // Auto-initialized in service via env var
    }, [navigate]);

    // Handle ESC key to exit fullscreen, close modals, or dismiss popups
    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                    setIsSheetFullscreen(false);
                } else if (isSheetFullscreen) {
                    setIsSheetFullscreen(false);
                } else if (previewHoarding) {
                    setPreviewHoarding(null);
                } else if (isAddModalOpen || isEditModalOpen) {
                    setIsAddModalOpen(false);
                    setIsEditModalOpen(false);
                    setSelectedAssetFile(null);
                } else if (deleteTarget) {
                    setDeleteTarget(null);
                } else if (bulkDeleteTarget) {
                    setBulkDeleteTarget(null);
                } else if (isExcelImportOpen) {
                    setIsExcelImportOpen(false);
                } else if (isInventoryFilterOpen) {
                    setIsInventoryFilterOpen(false);
                }
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [isSheetFullscreen, previewHoarding, isAddModalOpen, isEditModalOpen, deleteTarget, bulkDeleteTarget, isExcelImportOpen, isInventoryFilterOpen]);

    useEffect(() => {
        let active = true;
        const refreshStaffUploads = async () => {
            const uploads = await fetchStaffUploads();
            if (active) setStaffUploads(uploads);
        };
        refreshStaffUploads();
        const intervalId = setInterval(refreshStaffUploads, 8000);

        const handleStaffPhotoUploaded = (e) => {
            if (e && e.detail) {
                setStaffUploads(prev => {
                    const list = Array.isArray(prev) ? prev : [];
                    const exists = list.some(u => u.UploadId === e.detail.UploadId);
                    if (exists) return list;
                    return [e.detail, ...list];
                });
            }
            refreshStaffUploads();
        };

        const handleStorageChange = (e) => {
            if (e.key === 'adh_local_staff_uploads') {
                refreshStaffUploads();
            }
        };

        window.addEventListener('staff:photo-uploaded', handleStaffPhotoUploaded);
        window.addEventListener('storage', handleStorageChange);

        return () => {
            active = false;
            clearInterval(intervalId);
            window.removeEventListener('staff:photo-uploaded', handleStaffPhotoUploaded);
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    useEffect(() => {
        getStaffUploadLink().then(setStaffUploadLink).catch(() => {});
    }, []);

    useEffect(() => {
        const updateFullscreenState = () => setIsSheetFullscreen(document.fullscreenElement === sheetEditorRef.current);
        document.addEventListener('fullscreenchange', updateFullscreenState);
        return () => document.removeEventListener('fullscreenchange', updateFullscreenState);
    }, []);

    useEffect(() => {
        if (!fileProcessing) {
            setProcessingSeconds(0);
            return undefined;
        }

        const startedAt = fileProcessing.startedAt;
        setProcessingSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
        const timer = window.setInterval(() => {
            setProcessingSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [fileProcessing]);

    const handleLogout = () => {
        clearAdminSession();
        navigate('/admin/login');
    };

    const handleForceSync = async () => {
        setIsLoading(true);
        try {
            const freshData = await fetchHoardings();
            if (freshData && freshData.length > 0) {
                setHoardings(freshData);
                try {
                    localStorage.setItem('hoardings_cache', JSON.stringify(freshData));
                    localStorage.setItem('last_hoardings_update', Date.now().toString());
                } catch {}
                showToast(`Data Synced! Loaded ${freshData.length} sites from Google Sheets.`, "success");
                window.dispatchEvent(new CustomEvent('hoardings:sync-requested', { detail: { action: 'manual-sync' } }));
            } else {
                showToast("No data returned from Google Sheets.", "warning");
            }
        } catch (err) {
            showToast("Sync Failed: " + err.message, "error");
        } finally {
            setIsLoading(false);
        }
    };



    // ------------------------------------------------------------------
    // 📂 FILE UPLOAD HANDLERS
    // ------------------------------------------------------------------

    const fetchExcelPreview = async (token) => {
        const response = await fetch(`${scriptUrl}?action=excelImportPreview&token=${encodeURIComponent(token)}&sessionToken=${encodeURIComponent(getAdminSession())}&t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Preview fetch failed: ${response.status}`);
        return response.json();
    };

    const waitForExcelPreview = async (token, expectedStatuses = ['READY', 'NEEDS_REVIEW', 'FAILED']) => {
        for (let attempt = 0; attempt < 45; attempt++) {
            try {
                const data = await fetchExcelPreview(token);
                if (data?.success && expectedStatuses.includes(data.status)) return data;
                if (data?.status === 'FAILED') return data;
            } catch {
                // Apps Script can take a moment to publish the preview record.
            }
            await wait(1500);
        }
        throw new Error('Preview timed out. Please try again.');
    };

    const toggleSidebar = () => {
        setIsSidebarCollapsed(current => {
            const next = !current;
            localStorage.setItem('adhoardings_sidebar_collapsed', String(next));
            return next;
        });
    };

    const toggleSheetFullscreen = async () => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else if (sheetEditorRef.current?.requestFullscreen) {
                await sheetEditorRef.current.requestFullscreen();
            }
        } catch {
            alert('Fullscreen could not be opened in this browser.');
        }
    };

    const fetchFileJobStatus = async (token) => {
        const response = await fetch(`${scriptUrl}?action=fileJobStatus&token=${encodeURIComponent(token)}&sessionToken=${encodeURIComponent(getAdminSession())}&t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Processing status fetch failed: ${response.status}`);
        return response.json();
    };

    const waitForPptJob = async (token, onStatus) => {
        for (let attempt = 0; attempt < 120; attempt++) {
            try {
                const data = await fetchFileJobStatus(token);
                if (data?.success) {
                    onStatus?.(data);
                    if (data.status === 'COMPLETED' || data.status === 'FAILED') return data;
                }
            } catch {
                // The Apps Script request can still be finishing the Drive conversion.
            }
            await wait(1500);
        }
        throw new Error('PPT processing is taking longer than expected. It is still safe in Drive; please check Logs shortly.');
    };

    const updateFileProcessing = (updates) => {
        setFileProcessing(current => current ? { ...current, ...updates } : current);
    };

    const completeBackgroundUpload = (status, message) => {
        setFileProcessing(null);
        setUploadNotice(current => current ? { ...current, status, message } : current);
    };

    // Helper: POST to Apps Script with timeout to prevent infinite hanging
    const postToScript = async (payload, timeoutMs = 120000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(scriptUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            try {
                const json = await response.json();
                if (json && json.error) throw new Error(json.error);
                return json;
            } catch (parseErr) {
                if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
                return { success: true };
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('Upload timed out after ' + Math.round(timeoutMs / 1000) + ' seconds. The file may be too large. Try a smaller PPT file (under 8MB).');
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    };

    const handleFileUpload = (e, type) => {
        const file = e.target.files[0];
        if (!file) return;
        if (fileProcessing) {
            setUploadNotice({ status: 'error', message: 'One upload is already processing. Please wait for it to finish.', fileName: file.name });
            e.target.value = null;
            return;
        }

        const fileSizeMB = file.size / (1024 * 1024);

        const estimate = estimateUploadDuration(file, type);
        setFileProcessing({
            type,
            fileName: file.name,
            phase: 'Starting...',
            progress: 0,
            startedAt: Date.now()
        });
        setUploadNotice({
            status: 'processing',
            type,
            fileName: file.name,
            estimate,
            message: `Estimated time: ${estimate}. You can continue using the dashboard while processing runs in the background.`
        });
        e.target.value = null;

        void (async () => {
            try {
                if (type === 'excel') {
                    // Excel files are usually small, we can keep the base64 approach
                    const fileData = await readFileAsDataUrl(file, (progress) => updateFileProcessing({ phase: 'Reading Excel file', progress }));
                    updateFileProcessing({ phase: 'Uploading for validation', progress: 100 });
                    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                    setExcelImportToken(token);
                    setExcelImportPreview({ status: 'PROCESSING', fileName: file.name, summary: null });
                    await postToScript({
                        action: 'previewExcelImport',
                        sessionToken: getAdminSession(),
                        token,
                        fileName: file.name,
                        fileData,
                        mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    });
                    updateFileProcessing({ phase: 'Validating rows and matching headers' });
                    const preview = await waitForExcelPreview(token);
                    setExcelImportPreview(preview);
                    setIsExcelImportOpen(true);
                    completeBackgroundUpload('ready', 'Excel preview is ready. Review it and approve the import when you are ready.');
                    return;
                }

                // PPT Upload — Fast Client-Side Slide & Photo Extraction (100% Reliable, Zero Cloud Quotas)
                updateFileProcessing({ phase: `Reading PPT file (${fileSizeMB.toFixed(1)}MB)...`, progress: 15 });
                const arrayBuffer = await file.arrayBuffer();

                updateFileProcessing({ phase: 'Analyzing slides and extracting high-res photos...', progress: 35 });
                const slides = await parsePptx(arrayBuffer, hoardings);

                if (!slides || slides.length === 0) {
                    throw new Error('No valid slides could be found in the PPT.');
                }

                const processableSlides = slides.filter(s => s.photoCandidates && s.photoCandidates.length > 0);
                if (processableSlides.length === 0) {
                    throw new Error('No photos could be found in this PPT.');
                }

                updateFileProcessing({ 
                    phase: `Extracted ${processableSlides.length} slides! Syncing photos to Google Sheet...`, 
                    progress: 45 
                });

                let completed = 0;
                let syncedCount = 0;
                const CONCURRENCY = 2;

                const queue = [...processableSlides];
                const workers = Array.from({ length: CONCURRENCY }, async () => {
                    while (queue.length > 0) {
                        const slide = queue.shift();
                        if (!slide) break;

                        const photoCandidate = slide.photoCandidates?.[0];
                        if (!photoCandidate || !photoCandidate.blob) {
                            completed++;
                            continue;
                        }

                        const matchedSite = hoardings.find(h => h._SiteID === slide.suggestedSiteId) || slide.candidates?.[0]?.site;
                        let fallbackName = `Slide_${slide.number}`;
                        if (slide.text && slide.text.trim().length > 0) {
                            fallbackName = slide.text.trim().replace(/\s+/g, ' ').substring(0, 100);
                        }
                        const siteName = matchedSite ? (matchedSite['Locality Site Location'] || matchedSite['Location '] || matchedSite.Location || matchedSite._SiteID) : fallbackName;

                        // 🏷️ Rich File Name with City, Location, Facing, Lat-Long, Dimensions
                        const city = matchedSite?.City || 'Meerut';
                        const locClean = (matchedSite?.Location || matchedSite?.['Locality Site Location'] || matchedSite?.['Location '] || siteName).replace(/[/\\?%*:|"<>]/g, '-').trim();
                        const facingClean = matchedSite?.Facing ? `Facing_${matchedSite.Facing.replace(/[/\\?%*:|"<>]/g, '-').trim()}` : '';
                        const latLongClean = (matchedSite?.['Lat-Long'] || (matchedSite?.Latitude && matchedSite?.Longitude ? `${matchedSite.Latitude},${matchedSite.Longitude}` : '')).replace(/\s+/g, '').replace(/[/\\?%*:|"<>]/g, '-');
                        const sizeClean = matchedSite?.Width && matchedSite?.Height ? `${matchedSite.Width}x${matchedSite.Height}` : '';

                        const descriptiveFileName = [city, locClean, facingClean, latLongClean, sizeClean].filter(Boolean).join('_') + '.jpg';

                        let pureBase64 = '';
                        try {
                            const compressedDataUrl = await compressImage(photoCandidate.blob, 1280, 960, 0.78);
                            pureBase64 = compressedDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
                        } catch (compErr) {
                            console.warn(`[Compression Fallback] Slide ${slide.number}:`, compErr);
                        }

                        let success = false;
                        for (let attempt = 1; attempt <= 5 && !success; attempt++) {
                            try {
                                const res = await syncToGoogleSheet({
                                    action: 'updateHoarding',
                                    sessionToken: getAdminSession(),
                                    siteName: siteName,
                                    siteId: matchedSite?._SiteID || '',
                                    facing: matchedSite?.Facing || '',
                                    latLong: matchedSite?.['Lat-Long'] || '',
                                    fileName: descriptiveFileName,
                                    fileData: pureBase64,
                                    mimeType: 'image/jpeg'
                                });
                                if (res && res.success !== false) {
                                    syncedCount++;
                                    success = true;
                                } else {
                                    throw new Error(res?.error || 'Sync rejected');
                                }
                            } catch (uploadErr) {
                                if (attempt < 5) {
                                    await wait(1200 * attempt);
                                } else {
                                    console.warn(`[PPT Upload] Failed for slide ${slide.number} after 5 attempts:`, uploadErr);
                                }
                            }
                        }

                        completed++;
                        const percent = Math.round(45 + (completed / processableSlides.length) * 50);
                        updateFileProcessing({
                            phase: `⚡ AI Smart Sync: ${completed}/${processableSlides.length} slides (${syncedCount} photos saved)...`,
                            progress: percent
                        });
                    }
                });

                await Promise.all(workers);
                releasePptxPreviews(slides);
                window.dispatchEvent(new CustomEvent('hoardings:sync-requested', { detail: { action: 'pptUpload', fileName: file.name } }));
                await wait(1200);
                const freshData = await fetchHoardings();
                if (freshData?.length) setHoardings(freshData);
                completeBackgroundUpload('completed', `PPT processing complete! ${syncedCount} of ${processableSlides.length} slide photos uploaded and synced.`);
            } catch (error) {
                completeBackgroundUpload('error', type === 'excel' ? `Excel preview failed: ${error.message}` : `PPT failed: ${error.message}`);
            }
        })();
    };

    const approveExcelImport = () => {
        if (!excelImportToken) return;
        setIsExcelApproving(true);
        setIsExcelImportOpen(false);
        setFileProcessing({ type: 'excel', fileName: excelImportPreview?.fileName || 'Excel import', phase: 'Importing approved rows to Google Sheet', progress: 100, startedAt: Date.now() });
        setUploadNotice({ status: 'processing', type: 'excel', fileName: excelImportPreview?.fileName || 'Excel import', estimate: '30-90 seconds', message: 'Estimated time: 30-90 seconds. Your Google Sheet import is running in the background.' });
        void (async () => {
            try {
                await postToScript({ action: 'approveExcelImport', sessionToken: getAdminSession(), token: excelImportToken });
                const result = await waitForExcelPreview(excelImportToken, ['IMPORTED', 'FAILED']);
                setExcelImportPreview(result);
                if (result.status !== 'IMPORTED') throw new Error(result.error || 'Import failed.');
                window.dispatchEvent(new CustomEvent('hoardings:sync-requested', { detail: { action: 'approveExcelImport' } }));
                await wait(1800);
                const [freshData, grid] = await Promise.all([fetchHoardings(), fetchSheetGrid().catch(() => null)]);
                if (freshData && freshData.length > 0) {
                    setHoardings(freshData);
                    localStorage.setItem('hoardings_cache', JSON.stringify(freshData));
                }
                if (grid) {
                    setSheetHeaders(grid.headers);
                    setSheetRows(grid.rows);
                    setSheetLastSync(grid.updatedAt);
                    setSheetDirty(false);
                }
                completeBackgroundUpload('completed', 'Excel import is complete and the website data has been refreshed.');
            } catch (error) {
                completeBackgroundUpload('error', `Excel import failed: ${error.message}`);
            } finally {
                setIsExcelApproving(false);
            }
        })();
    };

    // ------------------------------------------------------------------
    // 🤖 AI DAILY UPDATE HANDLERS
    // ------------------------------------------------------------------

    const handleDailyImageSelect = (e) => {
        const files = Array.from(e.target.files || e.dataTransfer.files);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));

        if (imageFiles.length === 0) return;

        const newImages = imageFiles.map(file => ({
            file,
            preview: URL.createObjectURL(file),
            matchedLocation: null,
            status: 'Unknown',
            confidence: 0,
            aiLoading: false, // Start as false, processImages will set to true
            uploaded: false,
            uploading: false
        }));

        setDailyImages(prev => {
            const updatedList = [...prev, ...newImages];
            // 🚀 Trigger processing separately after state calculation
            setTimeout(() => processImagesWithAI(updatedList), 0);
            return updatedList;
        });
    };

    const onDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = () => {
        setIsDragging(false);
    };

    const onDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        handleDailyImageSelect(e);
    };

    const processImagesWithAI = async (currentBatch = null) => {
        const targetList = currentBatch || dailyImages;
        const imagesToProcess = targetList.filter(img => !img.matchedLocation && !img.uploaded);

        if (imagesToProcess.length === 0) return;

        // Create a local copy to work with for sequential processing
        const updatedImages = [...targetList];

        for (let i = 0; i < updatedImages.length; i++) {
            if (!updatedImages[i].matchedLocation && !updatedImages[i].uploaded && !updatedImages[i].uploading) {
                try {
                    // Update state to show loading for this specific item
                    setDailyImages(prev => {
                        const next = [...prev];
                        if (next[i]) next[i].aiLoading = true;
                        return next;
                    });

                    // Convert file to base64 for AI 
                    const base64Data = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(updatedImages[i].file);
                    });

                    // 🧠 AI CALL (with raw file for instant Hardware EXIF GPS detection)
                    const aiResult = await analyzeHoardingImage(base64Data, hoardings, updatedImages[i].file);

                    // 🎯 ROBUST INDEX & LOCATION RESOLUTION
                    let matchedData = null;

                    // 1. Check if AI returned a valid index (Highest Priority)
                    const idx = parseInt(aiResult.matchedIndex);
                    if (!isNaN(idx) && idx >= 0 && idx < hoardings.length) {
                        matchedData = hoardings[idx];
                    }
                    // 2. Secondary Logic: If Index failed, check if AI returned a matchedLocation string
                    else if (aiResult.matchedLocation) {
                        const aiLoc = String(aiResult.matchedLocation).toLowerCase().trim();
                        matchedData = hoardings.find(h => {
                            const name1 = String(h["Locality Site Location"] || '').toLowerCase().trim();
                            const name2 = String(h["Location "] || '').toLowerCase().trim();
                            const name3 = String(h.Location || '').toLowerCase().trim();
                            return name1 === aiLoc || name2 === aiLoc || name3 === aiLoc ||
                                   (aiLoc.length > 5 && (name1.includes(aiLoc) || aiLoc.includes(name1)));
                        });
                    }

                    const finalLocation = matchedData ? (matchedData["Locality Site Location"] || matchedData["Location "] || matchedData.Location) : null;

                    if (!finalLocation) {
                        console.warn("AI Result did not produce a valid location match:", aiResult);
                    }

                    // 🎯 Update the local object with AI results
                    updatedImages[i] = {
                        ...updatedImages[i],
                        matchedLocation: finalLocation,
                        status: aiResult.status || 'Available',
                        confidence: aiResult.confidence,
                        reasoning: aiResult.reasoning,
                        analysis: aiResult.analysis, // Store the deep landmarks analysis
                        aiLoading: false,
                        matchFailed: !finalLocation // New flag for visual feedback
                    };

                    // Update state progressively to show the match in UI
                    setDailyImages(prev => {
                        const next = [...prev];
                        if (next[i]) next[i] = { ...updatedImages[i] };
                        return next;
                    });

                    // 🚀 AUTO-SYNC: If location is matched, upload and archive to history immediately!
                    if (finalLocation) {
                        await triggerAutoUpload(i, updatedImages[i]);
                    }

                } catch (error) {
                    console.error("Processing failed", error);
                    setDailyImages(prev => {
                        const next = [...prev];
                        if (next[i]) next[i] = { ...next[i], aiLoading: false };
                        return next;
                    });
                }
            }
        }
    };

    const triggerAutoUpload = async (index, imageData) => {
        setDailyImages(prev => {
            const next = [...prev];
            if (next[index]) next[index].uploading = true;
            return next;
        });

        try {
            const base64 = await compressImage(imageData.file);

            const targetHoarding = hoardings.find(h => {
                const loc1 = String(h["Locality Site Location"] || '').trim().toLowerCase();
                const loc2 = String(h["Location "] || '').trim().toLowerCase();
                const loc3 = String(h.Location || '').trim().toLowerCase();
                const target = String(imageData.matchedLocation || '').trim().toLowerCase();
                return loc1 === target || loc2 === target || loc3 === target;
            });

            const hasExistingImage = targetHoarding && targetHoarding.ImageURL &&
                targetHoarding.ImageURL.trim() !== "" &&
                !targetHoarding.ImageURL.includes("unsplash.com");

            // 🏰 Resolve updated History state locally
            let updatedHistory = targetHoarding?.History || [];
            if (hasExistingImage) {
                updatedHistory = [imageData.preview, ...updatedHistory];
            }

            const historyString = updatedHistory.map(item => {
                const url = typeof item === 'object' ? item.url : item;
                const time = typeof item === 'object' ? item.timestamp || Date.now() : Date.now();
                return `${url}|${time}`;
            }).join(',');

            const siteNameResolved = targetHoarding ? (targetHoarding["Locality Site Location"] || targetHoarding["Location "] || targetHoarding.Location) : imageData.matchedLocation;
            const siteIdResolved = targetHoarding ? (targetHoarding.UniqueID || targetHoarding["Unique ID"] || targetHoarding.ID || targetHoarding._SiteID || '') : '';

            await syncToGoogleSheet({
                action: 'updateHoarding',
                siteName: siteNameResolved,
                siteId: siteIdResolved,
                status: imageData.status,
                fields: { 
                    "ExecutionHistory": historyString,
                    STATUS: imageData.status
                },
                fileData: base64,
                mimeType: 'image/jpeg',
                mode: hasExistingImage ? 'archive' : 'replace'
            });

            setDailyImages(prev => {
                const next = [...prev];
                if (next[index]) {
                    next[index].uploaded = true;
                    next[index].uploading = false;
                }
                return next;
            });

            setHoardings(prev => prev.map(h => {
                const loc1 = String(h["Locality Site Location"] || '').trim().toLowerCase();
                const loc2 = String(h["Location "] || '').trim().toLowerCase();
                const loc3 = String(h.Location || '').trim().toLowerCase();
                const target = String(imageData.matchedLocation || '').trim().toLowerCase();

                if (loc1 === target || loc2 === target || loc3 === target) {
                    const hasValidOldImage = h.ImageURL && h.ImageURL.trim() !== "" && !h.ImageURL.includes("unsplash.com");

                    let updatedHistory = h.History || [];
                    let finalImageURL = h.ImageURL;

                    if (hasValidOldImage) {
                        // 🏰 Master image exists: DO NOT REPLACE. Just add to History.
                        const currentHistory = h.History || [];
                        updatedHistory = [imageData.preview, ...currentHistory];

                        // Ensure current master ImageURL is also preserved in history
                        if (!currentHistory.includes(h.ImageURL)) {
                            updatedHistory.push(h.ImageURL);
                        }
                    } else {
                        // 🆕 No master image: The new image becomes the master ImageURL.
                        finalImageURL = imageData.preview;
                        updatedHistory = [];
                    }

                    return {
                        ...h,
                        STATUS: imageData.status,
                        ImageURL: finalImageURL,
                        History: updatedHistory
                    };
                }
                return h;
            }));

        } catch (error) {
            console.error("Auto-sync failed with error:", error);
            alert("⚠️ Auto-Upload Error: " + error.message + ". Check console (F12) for details.");
            setDailyImages(prev => {
                const next = [...prev];
                if (next[index]) next[index].uploading = false;
                return next;
            });
        }
    };

    const dumpUnmatchedImages = async () => {
        const unmatched = dailyImages.filter(img => img.matchFailed && !img.uploaded && !img.uploading);
        if (unmatched.length === 0) {
            alert("No unmatched images to dump.");
            return;
        }

        if (!confirm(`Are you sure you want to dump ${unmatched.length} unmatched images? They will be saved to the Dumping log and removed from here.`)) return;

        // Process each unmatched image one by one
        for (let i = 0; i < dailyImages.length; i++) {
            const imgData = dailyImages[i];
            if (imgData.matchFailed && !imgData.uploaded && !imgData.uploading) {
                // Set uploading for this specific image
                setDailyImages(prev => {
                    const next = [...prev];
                    next[i].uploading = true;
                    return next;
                });

                try {
                    const base64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.readAsDataURL(imgData.file);
                    });

                    await postToScript({
                        action: 'dumpImage',
                        siteName: 'UNIDENTIFIED',
                        fileData: base64,
                        mimeType: imgData.file.type,
                        reasoning: imgData.reasoning || "AI could not match location"
                    });

                    // Remove from list after success
                    setDailyImages(prev => prev.filter((_, idx) => idx !== i));
                    // Adjust loop counter since we removed an item
                    i--;
                } catch (err) {
                    console.error("Dumping failed", err);
                    setDailyImages(prev => {
                        const next = [...prev];
                        next[i].uploading = false;
                        return next;
                    });
                }
            }
        }
    };

    const uploadDailyUpdate = async (index) => {
        const img = dailyImages[index];
        if (!img.matchedLocation) return alert("Please select a location first.");

        // Direct call to the unified triggerAutoUpload engine
        await triggerAutoUpload(index, img);
    };

    // ------------------------------------------------------------------
    // 🖥️ UI COMPONENTS
    // ------------------------------------------------------------------

    const toggleStatus = (targetHoarding) => {
        if (!targetHoarding) return;

        const targetSL = targetHoarding.SL || targetHoarding["S. No."] || targetHoarding["SL NO"];
        const targetId = targetHoarding.UniqueID || targetHoarding["Unique ID"] || targetHoarding.ID || targetHoarding._SiteID;
        const targetLoc = String(targetHoarding["Locality Site Location"] || targetHoarding["Location "] || targetHoarding.Location || '').trim().toLowerCase();
        const targetFacing = String(targetHoarding.Facing || targetHoarding["Traffic View"] || '').trim().toLowerCase();
        const targetLat = String(targetHoarding.Latitude || '').trim();
        const targetLng = String(targetHoarding.Longitude || '').trim();

        const updated = hoardings.map(h => {
            let isMatch = (h === targetHoarding);
            if (!isMatch && targetId && (h.UniqueID || h["Unique ID"] || h.ID || h._SiteID)) {
                isMatch = String(h.UniqueID || h["Unique ID"] || h.ID || h._SiteID).trim().toLowerCase() === String(targetId).trim().toLowerCase();
            }
            if (!isMatch && targetSL && (h.SL || h["S. No."] || h["SL NO"])) {
                isMatch = String(h.SL || h["S. No."] || h["SL NO"]).trim() === String(targetSL).trim();
            }
            if (!isMatch && targetLoc) {
                const hLoc = String(h["Locality Site Location"] || h["Location "] || h.Location || '').trim().toLowerCase();
                const hFacing = String(h.Facing || h["Traffic View"] || '').trim().toLowerCase();
                const hLat = String(h.Latitude || '').trim();
                const hLng = String(h.Longitude || '').trim();
                
                isMatch = (hLoc === targetLoc) && 
                          (!targetFacing || hFacing === targetFacing) && 
                          (!targetLat || hLat === targetLat) && 
                          (!targetLng || hLng === targetLng);
            }

            if (isMatch) {
                const isCurrentlyBooked = (h.STATUS || '').toLowerCase() === 'booked' || (h.STATUS || '').toLowerCase() === 'occupied';
                const newStatus = isCurrentlyBooked ? 'Available' : 'Booked';
                return { ...h, STATUS: newStatus };
            }
            return h;
        });
        setHoardings(updated);
        try {
            localStorage.setItem('hoardings_cache', JSON.stringify(updated));
            localStorage.setItem('last_hoardings_update', Date.now().toString());
        } catch {}
    };

    const handleAddAsset = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            let fileData = null;
            let mimeType = null;
            let previewUrl = "https://images.unsplash.com/photo-1626785774573-4b799315345d?w=800";

            if (selectedAssetFile) {
                fileData = await compressImage(selectedAssetFile);
                mimeType = 'image/jpeg';
                previewUrl = URL.createObjectURL(selectedAssetFile);
            }

            // Prepare History for backend persistence
            const historyArray = formData.History || [];
            const historyString = historyArray.map(item => {
                if (typeof item === 'string') return `${item}|${Date.now()}`;
                return `${item.url || item}|${item.timestamp || Date.now()}`;
            }).join(',');
            
            const cleanFields = { 
                ...formData,
                "ExecutionHistory": historyString
            };
            
            const imageKeys = ['ImageURL', 'imageurl', 'Image URL', 'Site Photo', 'Photo'];
            
            // Remove the property 'History' as it's an object/array (not suitable for simple sheet column)
            // But KEEP 'ExecutionHistory' which is the string version.
            delete cleanFields.History;
            
            if (selectedAssetFile) {
                imageKeys.forEach(key => delete cleanFields[key]);
            } else if (cleanFields.ImageURL && (cleanFields.ImageURL.startsWith('blob:') || cleanFields.ImageURL.includes('localhost'))) {
                delete cleanFields.ImageURL;
            }

            let siteLocationName = String(formData["Location "] || formData.Location || formData["Locality Site Location"] || '').trim();
            const siteCityName = String(formData.City || formData.city || '').trim();
            const siteLocalityName = String(formData.Locality || formData.Area || formData["Area"] || '').trim();
            const price = String(formData["Avg Monthly Cost (INR)"] ?? formData["Rental Per Month"] ?? formData["Avg. monthly Cost"] ?? formData.Price ?? '0').trim();
            const size = String(formData["Size (Large/Medium/Small)"] ?? formData["Size (Large/ Medium/ Small)"] ?? formData.Size ?? '').trim();
            const mediaFormat = String(formData["Media Format (Front Lit / Back Lit / Non Lit)"] ?? formData["Media Format"] ?? formData["Media Type"] ?? '').trim();

            // Auto-generate Site Name if left blank
            if (!siteLocationName) {
                if (siteLocalityName && siteCityName) {
                    siteLocationName = `${siteLocalityName} Site (${siteCityName})`;
                } else if (siteLocalityName) {
                    siteLocationName = `${siteLocalityName} Site`;
                } else if (siteCityName) {
                    siteLocationName = `${siteCityName} Site ${Date.now().toString().slice(-4)}`;
                } else {
                    siteLocationName = `Hoarding Site ${Date.now().toString().slice(-4)}`;
                }
            }

            // Auto-generate Unique ID
            const autoUniqueId = String(formData.UniqueID || formData["Unique ID"] || formData.ID || `ADH-${Date.now().toString().slice(-6)}`);

            const fullCleanFields = { 
                ...cleanFields,
                UniqueID: autoUniqueId,
                "Unique ID": autoUniqueId,
                ID: autoUniqueId,
                "Locality Site Location": siteLocationName,
                "Location ": siteLocationName,
                Location: siteLocationName,
                City: siteCityName,
                city: siteCityName,
                Locality: siteLocalityName,
                Area: siteLocalityName,
                "Avg Monthly Cost (INR)": price,
                "Rental Per Month": price,
                "Avg. monthly Cost": price,
                Price: price,
                "Size (Large/Medium/Small)": size,
                "Size (Large/ Medium/ Small)": size,
                Size: size,
                "Media Format (Front Lit / Back Lit / Non Lit)": mediaFormat,
                "Media Format": mediaFormat,
                "Media Type": mediaFormat,
                STATUS: formData.STATUS || 'Available',
                Latitude: formData.Latitude || '',
                Longitude: formData.Longitude || '',
                BookedBy: formData.BookedBy || '',
                BookingStart: formData.BookingStart || '',
                BookingEnd: formData.BookingEnd || '',
                "ExecutionHistory": historyString,
                ImageURL: previewUrl
            };

            // 1. Instantly update UI state & cache
            setHoardings(prev => {
                const next = [...prev, fullCleanFields];
                try {
                    localStorage.setItem('hoardings_cache', JSON.stringify(next));
                    localStorage.setItem('last_hoardings_update', Date.now().toString());
                    
                    const localRaw = localStorage.getItem('local_added_sites_cache');
                    const localList = localRaw ? JSON.parse(localRaw) : [];
                    localList.push(fullCleanFields);
                    localStorage.setItem('local_added_sites_cache', JSON.stringify(localList));
                } catch {}
                return next;
            });
            showToast("Asset Added Successfully!", "success");
            setIsAddModalOpen(false);
            setFormData({});
            setSelectedAssetFile(null);

            // 2. Background sync to Google Sheet
            syncToGoogleSheet({
                action: 'addHoarding',
                fields: fullCleanFields,
                siteName: siteLocationName,
                fileData: fileData,
                mimeType: mimeType
            }).catch(err => console.warn("Add background sync notice:", err));
        } catch (err) {
            showToast("Error adding asset: " + err.message, "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditAsset = async (e) => {
        e.preventDefault();
        try {
            let fileData = null;
            let mimeType = null;
            let updatedImageURL = formData.ImageURL;

            if (selectedAssetFile) {
                fileData = await compressImage(selectedAssetFile);
                mimeType = 'image/jpeg';
                updatedImageURL = URL.createObjectURL(selectedAssetFile);
            }

            // Prepare History for backend persistence
            const historyArray = formData.History || [];
            const historyString = historyArray.map(item => {
                if (typeof item === 'string') return `${item}|${Date.now()}`;
                return `${item.url || item}|${item.timestamp || Date.now()}`;
            }).join(',');
            
            const cleanFields = { 
                ...formData,
                "ExecutionHistory": historyString
            };
            
            const imageKeys = ['ImageURL', 'imageurl', 'Image URL', 'Site Photo', 'Photo'];
            delete cleanFields.History;
            
            if (selectedAssetFile) {
                imageKeys.forEach(key => delete cleanFields[key]);
            } else if (cleanFields.ImageURL && (cleanFields.ImageURL.startsWith('blob:') || cleanFields.ImageURL.includes('localhost'))) {
                delete cleanFields.ImageURL;
            }

            let siteLocationName = String(formData["Location "] || formData.Location || formData["Locality Site Location"] || selectedHoarding["Location "] || selectedHoarding.Location || '').trim();
            const siteCityName = String(formData.City || formData.city || selectedHoarding.City || '').trim();
            const siteLocalityName = String(formData.Locality || formData.Area || formData["Area"] || selectedHoarding.Locality || '').trim();
            const price = String(formData["Avg Monthly Cost (INR)"] ?? formData["Rental Per Month"] ?? formData["Avg. monthly Cost"] ?? formData.Price ?? '0').trim();
            const size = String(formData["Size (Large/Medium/Small)"] ?? formData["Size (Large/ Medium/ Small)"] ?? formData.Size ?? '').trim();
            const mediaFormat = String(formData["Media Format (Front Lit / Back Lit / Non Lit)"] ?? formData["Media Format"] ?? formData["Media Type"] ?? '').trim();

            if (!siteLocationName) {
                siteLocationName = selectedHoarding["Location "] || selectedHoarding.Location || `${siteLocalityName || 'Hoarding'} Site`;
            }

            const autoUniqueId = String(formData.UniqueID || formData["Unique ID"] || selectedHoarding.UniqueID || selectedHoarding["Unique ID"] || `ADH-${Date.now().toString().slice(-6)}`);

            const fullUpdatedFields = {
                ...cleanFields,
                UniqueID: autoUniqueId,
                "Unique ID": autoUniqueId,
                ID: autoUniqueId,
                "Locality Site Location": siteLocationName,
                "Location ": siteLocationName,
                Location: siteLocationName,
                City: siteCityName,
                city: siteCityName,
                Locality: siteLocalityName,
                Area: siteLocalityName,
                "Avg Monthly Cost (INR)": price,
                "Rental Per Month": price,
                "Avg. monthly Cost": price,
                Price: price,
                "Size (Large/Medium/Small)": size,
                "Size (Large/ Medium/ Small)": size,
                Size: size,
                "Media Format (Front Lit / Back Lit / Non Lit)": mediaFormat,
                "Media Format": mediaFormat,
                "Media Type": mediaFormat,
                STATUS: formData.STATUS || 'Available',
                Latitude: formData.Latitude || '',
                Longitude: formData.Longitude || '',
                BookedBy: formData.BookedBy || '',
                BookingStart: formData.BookingStart || '',
                BookingEnd: formData.BookingEnd || '',
                ImageURL: updatedImageURL
            };

            const targetSite = selectedHoarding;
            const targetKey = String(targetSite["Location "] || targetSite.Location || targetSite["Locality Site Location"] || '').trim().toLowerCase();
            const targetId = String(targetSite.UniqueID || targetSite["Unique ID"] || targetSite.ID || targetSite._SiteID || '').trim().toLowerCase();

            // 1. Instantly update UI state & cache with precision targeting (matching SL, Facing, Lat-Long)
            const targetSL = targetSite.SL || targetSite["S. No."] || targetSite["SL NO"];
            const targetFacing = String(targetSite.Facing || targetSite["Traffic View"] || '').trim().toLowerCase();
            const targetLat = String(targetSite.Latitude || '').trim();
            const targetLng = String(targetSite.Longitude || '').trim();

            setHoardings(prev => {
                const next = prev.map(h => {
                    const isTarget = (h === targetSite) ||
                        (targetId && String(h.UniqueID || h["Unique ID"] || h.ID || h._SiteID || '').trim().toLowerCase() === targetId) ||
                        (targetSL && String(h.SL || h["S. No."] || h["SL NO"]).trim() === String(targetSL).trim()) ||
                        (
                            targetKey && String(h["Location "] || h.Location || h["Locality Site Location"] || '').trim().toLowerCase() === targetKey &&
                            (!targetFacing || String(h.Facing || h["Traffic View"] || '').trim().toLowerCase() === targetFacing) &&
                            (!targetLat || String(h.Latitude || '').trim() === targetLat) &&
                            (!targetLng || String(h.Longitude || '').trim() === targetLng)
                        );
                    return isTarget ? { ...h, ...fullUpdatedFields } : h;
                });
                try {
                    localStorage.setItem('hoardings_cache', JSON.stringify(next));
                    localStorage.setItem('last_hoardings_update', Date.now().toString());
                } catch {}
                return next;
            });

            showToast("Asset Updated Successfully!", "success");
            setIsEditModalOpen(false);
            setSelectedHoarding(null);
            setFormData({});
            setSelectedAssetFile(null);

            // 2. Background sync to Google Sheet
            syncToGoogleSheet({
                action: 'updateHoarding',
                siteName: targetSite["Locality Site Location"] || targetSite["Location "] || targetSite.Location,
                siteId: targetSite.UniqueID || targetSite["Unique ID"] || targetSite.ID || targetSite._SiteID || '',
                fields: fullUpdatedFields,
                fileData: fileData,
                mimeType: mimeType
            }).catch(err => console.warn("Update background sync notice:", err));
        } catch (err) {
            showToast("Error updating asset: " + err.message, "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteAsset = async (target) => {
        if (!target) return;
        const targetSiteObj = typeof target === 'object' ? target.site : null;
        const targetIndex = typeof target === 'object' ? target.index : -1;
        const siteName = typeof target === 'object' ? target.name : String(target).trim();
        const targetClean = siteName ? siteName.trim().toLowerCase() : '';
        const targetCity = typeof target === 'object' ? String(target.city || '').trim().toLowerCase() : '';
        const targetLocality = typeof target === 'object' ? String(target.locality || '').trim().toLowerCase() : '';
        const targetId = targetSiteObj ? String(targetSiteObj.UniqueID || targetSiteObj["Unique ID"] || targetSiteObj.ID || targetSiteObj._SiteID || '').trim().toLowerCase() : '';

        // Record in deleted sites cache so it NEVER returns on refresh
        if (targetId) addDeletedSite(targetId);
        if (targetClean) addDeletedSite(targetClean);

        // 1. Immediately dismiss modal so UI is fully responsive
        setDeleteTarget(null);

        // 2. Optimistically remove from state immediately
        setHoardings(prev => {
            const next = prev.filter((h, idx) => {
                if (targetSiteObj && h === targetSiteObj) return false;
                if (targetIndex !== -1 && idx === targetIndex) return false;
                const hId = String(h.UniqueID || h["Unique ID"] || h.ID || h._SiteID || '').trim().toLowerCase();
                if (targetId && hId && hId === targetId) return false;
                const hName = String(h["Locality Site Location"] || h["Location "] || h.Location || h.site_name || '').trim().toLowerCase();
                const hCity = String(h.City || h.city || '').trim().toLowerCase();
                const hLocality = String(h.Locality || h.Area || '').trim().toLowerCase();

                if (targetClean && targetClean !== 'hoarding site' && hName === targetClean) return false;
                if (targetCity && targetLocality && hCity === targetCity && hLocality === targetLocality) return false;
                if ((!hName || hName === 'hoarding site') && hCity === targetCity && hLocality === targetLocality) return false;
                return true;
            });
            try {
                localStorage.setItem('hoardings_cache', JSON.stringify(next));
                localStorage.setItem('last_hoardings_update', Date.now().toString());

                const localRaw = localStorage.getItem('local_added_sites_cache');
                if (localRaw) {
                    const localList = JSON.parse(localRaw);
                    const filtered = localList.filter(item => {
                        const id = String(item.UniqueID || item["Unique ID"] || item.ID || '').trim().toLowerCase();
                        const name = String(item["Location "] || item.Location || item["Locality Site Location"] || '').trim().toLowerCase();
                        if (targetId && id === targetId) return false;
                        if (targetClean && name === targetClean) return false;
                        return true;
                    });
                    localStorage.setItem('local_added_sites_cache', JSON.stringify(filtered));
                }
            } catch {}
            return next;
        });

        showToast("Asset Deleted Successfully!", "success");

        // 3. Fire-and-forget sync to Google Sheets in background
        syncToGoogleSheet({
            action: 'deleteHoarding',
            siteName: siteName || targetLocality || 'Hoarding Site',
            city: targetCity,
            locality: targetLocality
        }).catch(err => {
            console.error("Delete background sync warning:", err);
        });
    };

    const handleBulkDelete = async () => {
        if (!bulkDeleteTarget) return;

        const isDeleteAll = bulkDeleteTarget.type === 'all';
        if (isDeleteAll && bulkDeleteConfirmText.trim().toUpperCase() !== 'DELETE ALL') {
            alert('Type DELETE ALL to confirm deleting every site.');
            return;
        }

        setIsLoading(true);
        try {
            await syncToGoogleSheet(isDeleteAll
                ? { action: 'deleteAllHoardings', confirmation: bulkDeleteConfirmText.trim().toUpperCase() }
                : { action: 'deleteCityHoardings', city: bulkDeleteTarget.city }
            );

            const freshData = await fetchHoardings();
            setHoardings(freshData || []);
            localStorage.setItem('hoardings_cache', JSON.stringify(freshData || []));
            window.dispatchEvent(new CustomEvent('hoardings:sync-requested', {
                detail: { action: bulkDeleteTarget.type }
            }));

            alert(isDeleteAll ? 'All site data deleted.' : `${bulkDeleteTarget.city} city data deleted.`);
            setBulkDeleteTarget(null);
            setBulkDeleteConfirmText('');
            setInventoryCityFilter('All');
        } catch (err) {
            alert('Error deleting data: ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const openEditModal = (h) => {
        const siteLocation = h["Locality Site Location"] || h["Location "] || h["Location"] || '';
        const price = h["Avg Monthly Cost (INR)"] ?? h["Rental Per Month"] ?? h["Avg. monthly Cost"] ?? h.Price ?? '';
        const locality = h.Locality || h.Area || h["Area"] || '';
        const size = h["Size (Large/Medium/Small)"] || h["Size (Large/ Medium/ Small)"] || (h.Width && h.Height ? `${h.Width}x${h.Height}` : h.Size) || '';
        const media = h["Media Format (Front Lit / Back Lit / Non Lit)"] || h["Media Format"] || h["Media Type"] || h.Media || h.Type || '';
        const facing = h.Facing || h["Traffic View"] || '';
        const trafficFrom = h["Traffic From"] || '';
        const trafficTo = h["Traffic To"] || '';
        const lat = h.Latitude || h.Lat || (h["Lat-Long"] ? h["Lat-Long"].split(',')[0]?.trim() : '');
        const lng = h.Longitude || h.Long || (h["Lat-Long"] ? h["Lat-Long"].split(',')[1]?.trim() : '');

        setSelectedHoarding(h);
        setFormData({
            ...h,
            "Location ": siteLocation,
            Location: siteLocation,
            "Locality Site Location": siteLocation,
            City: h.City || h.city || '',
            city: h.City || h.city || '',
            Locality: locality,
            Area: locality,
            Facing: facing,
            "Traffic View": facing,
            "Traffic From": trafficFrom,
            "Traffic To": trafficTo,
            Latitude: lat,
            Longitude: lng,
            "Lat-Long": h["Lat-Long"] || (lat && lng ? `${lat}, ${lng}` : ''),
            "Rental Per Month": price,
            "Avg Monthly Cost (INR)": price,
            "Avg. monthly Cost": price,
            Price: price,
            "Size (Large/Medium/Small)": size,
            "Size (Large/ Medium/ Small)": size,
            Size: size,
            "Media Format (Front Lit / Back Lit / Non Lit)": media,
            "Media Format": media,
            "Media Type": media,
            Media: media,
            STATUS: h.STATUS || 'Available'
        });
        setSelectedAssetFile(null);
        setIsEditModalOpen(true);
    };

    const isSiteAvailableForDateRange = (h, startDateStr, endDateStr) => {
        const isBooked = (h.STATUS || '').toLowerCase() === 'booked' || (h.STATUS || '').toLowerCase() === 'occupied';
        if (!isBooked) return true;

        if (!h.BookingStart && !h.BookingEnd) return false;
        if (!startDateStr && !endDateStr) return false;

        const parseD = (dStr) => {
            if (!dStr) return null;
            const d = new Date(dStr);
            return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        };

        const reqStart = parseD(startDateStr);
        const reqEnd = parseD(endDateStr);
        const bStart = parseD(h.BookingStart);
        const bEnd = parseD(h.BookingEnd);

        if (bStart && bEnd) {
            const overlaps = (!reqStart || bEnd >= reqStart) && (!reqEnd || bStart <= reqEnd);
            return !overlaps;
        } else if (bStart) {
            if (reqEnd && reqEnd < bStart) return true;
            return false;
        } else if (bEnd) {
            if (reqStart && reqStart > bEnd) return true;
            return false;
        }
        return false;
    };

    const filteredInventory = useMemo(() => {
        const cleanSearch = searchTerm.trim().toLowerCase();

        return hoardings.filter(h => {
            if (!h) return false;

            // 🔍 Universal multi-field search: Matches location, city, client name, facing, traffic, or ANY field
            let matchSearch = true;
            if (cleanSearch) {
                const searchKeywords = cleanSearch.split(/\s+/).filter(Boolean);

                const siteTitle = String(h["Locality Site Location"] || h["Location "] || h["Location"] || "").toLowerCase();
                const siteLocality = String(h["Locality"] || h["Area"] || "").toLowerCase();
                const city = String(h.City || "").toLowerCase();
                const facing = String(h.Facing || h["Traffic View"] || "").toLowerCase();
                const bookedBy = String(h.BookedBy || h.ClientName || h["Client Name"] || h.Customer || "").toLowerCase();
                const trafficFrom = String(h["Traffic From"] || "").toLowerCase();
                const trafficTo = String(h["Traffic To"] || "").toLowerCase();
                const media = String(h.Media || h["Media Format"] || h.Type || "").toLowerCase();
                const status = String(h.STATUS || h.Status || "").toLowerCase();
                const sl = String(h.SL || h["S. No."] || h["SL NO"] || "").toLowerCase();
                const dimensions = `${h.Width || ''} ${h.Height || ''} ${h["Total SQ.ft"] || ''} ${h.Size || ''}`.toLowerCase();
                const price = String(h["Rental Per Month"] || h["Avg Monthly Cost (INR)"] || "").toLowerCase();

                // Concatenate all searchable text for deep search
                const allFieldValues = Object.entries(h)
                    .filter(([k]) => !k.startsWith('_') && k !== 'ImageURL' && k !== 'driveUrl')
                    .map(([, v]) => String(v || ''))
                    .join(' ')
                    .toLowerCase();

                const combinedText = `${allFieldValues} ${siteTitle} ${siteLocality} ${city} ${facing} ${bookedBy} ${trafficFrom} ${trafficTo} ${media} ${status} ${sl} ${dimensions} ${price}`;

                // All typed keywords must match somewhere in the hoarding info
                matchSearch = searchKeywords.every(keyword => combinedText.includes(keyword));
            }
            if (!matchSearch) return false;

            const hCity = (h.City || "").trim().toLowerCase();
            const isAllCity = !inventoryCityFilter || inventoryCityFilter.length === 0 || inventoryCityFilter.includes('All');
            const matchCity = isAllCity || inventoryCityFilter.some(c => c.toLowerCase() === hCity);
            if (!matchCity) return false;

            // Status & Date Range Availability Filter
            let matchStatus = true;
            const isBooked = (h.STATUS || '').toLowerCase() === 'booked' || (h.STATUS || '').toLowerCase() === 'occupied';
            const isAvailable = !isBooked;

            if (filterStartDate || filterEndDate) {
                const isAvailInDates = isSiteAvailableForDateRange(h, filterStartDate, filterEndDate);
                if (inventoryStatusFilter === 'Available') matchStatus = isAvailInDates;
                else if (inventoryStatusFilter === 'Booked') matchStatus = !isAvailInDates;
            } else {
                if (inventoryStatusFilter === 'Available') matchStatus = isAvailable;
                else if (inventoryStatusFilter === 'Booked') matchStatus = isBooked;
            }
            if (!matchStatus) return false;

            const siteLocality = (h["Locality"] || h["Area"] || "").trim().toLowerCase();
            const isAllLocality = !inventoryLocalityFilter || inventoryLocalityFilter.length === 0 || inventoryLocalityFilter.includes('All');
            const matchLocality = isAllLocality || inventoryLocalityFilter.some(l => l.toLowerCase() === siteLocality);
            if (!matchLocality) return false;

            const hMedia = (h["Media Format (Front Lit / Back Lit / Non Lit)"] || h["Media Format"] || h["Media Type"] || h.Media || '');
            const isAllMedia = !inventoryMediaFilter || inventoryMediaFilter.length === 0 || inventoryMediaFilter.includes('All');
            const matchMedia = isAllMedia || inventoryMediaFilter.includes(hMedia);
            if (!matchMedia) return false;

            const hSize = (h["Size (Large/Medium/Small)"] || h["Size"] || (h.Width && h.Height ? `${h.Width}x${h.Height}` : ''));
            const isAllSize = !inventorySizeFilter || inventorySizeFilter.length === 0 || inventorySizeFilter.includes('All');
            const matchSize = isAllSize || inventorySizeFilter.includes(hSize);
            if (!matchSize) return false;

            const hCat = (h["Site Category"] || h["Category"] || '');
            const isAllCat = !inventoryCategoryFilter || inventoryCategoryFilter.length === 0 || inventoryCategoryFilter.includes('All');
            const matchCategory = isAllCat || inventoryCategoryFilter.includes(hCat);
            if (!matchCategory) return false;

            const price = Number(h["Avg Monthly Cost (INR)"] || h["Rental Per Month"] || 0);
            let matchPrice = true;
            if (inventoryPriceFilter === '0-25k') matchPrice = price <= 25000;
            if (inventoryPriceFilter === '25k-50k') matchPrice = price > 25000 && price <= 50000;
            if (inventoryPriceFilter === '50k-100k') matchPrice = price > 50000 && price <= 100000;
            if (inventoryPriceFilter === '100k+') matchPrice = price > 100000;

            return matchPrice;
        });
    }, [hoardings, searchTerm, inventoryCityFilter, inventoryStatusFilter, filterStartDate, filterEndDate, inventoryLocalityFilter, inventoryMediaFilter, inventorySizeFilter, inventoryCategoryFilter, inventoryPriceFilter]);

    const getProposalKey = (h, index = 0) => [
        h["Location "],
        h.City,
        h.Width,
        h.Height,
        h.Latitude,
        h.Longitude,
        index
    ].filter(Boolean).join('|');

    const filteredInventoryKeys = filteredInventory.map((h, i) => getProposalKey(h, i));
    const selectedProposalSites = filteredInventory.filter((h, i) =>
        selectedProposalKeys.includes(getProposalKey(h, i))
    );
    const isAllFilteredSelected = filteredInventory.length > 0 &&
        filteredInventoryKeys.every(key => selectedProposalKeys.includes(key));

    const toggleProposalSelection = (key) => {
        setSelectedProposalKeys(prev =>
            prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]
        );
    };

    const toggleAllFilteredSelection = () => {
        setSelectedProposalKeys(prev => {
            if (isAllFilteredSelected) {
                return prev.filter(key => !filteredInventoryKeys.includes(key));
            }
            return [...new Set([...prev, ...filteredInventoryKeys])];
        });
    };

    const handleDownloadProposal = () => {
        const cityPart = inventoryCityFilter === 'All' ? 'all-cities' : inventoryCityFilter;
        const statusPart = inventoryStatusFilter === 'All' ? 'all-status' : inventoryStatusFilter;
        exportProposalExcel(selectedProposalSites, `proposal-${cityPart}-${statusPart}-${new Date().toISOString().slice(0, 10)}.xls`, selectedProposalHeaders);
    };

    const toggleProposalHeader = (label) => {
        setSelectedProposalHeaders(prev => {
            if (prev.includes(label)) {
                return prev.length === 1 ? prev : prev.filter(item => item !== label);
            }
            return [...prev, label];
        });
    };
    const safeHoardings = Array.isArray(hoardings) ? hoardings : [];
    const safeStaffUploads = Array.isArray(staffUploads) ? staffUploads : [];

    const inventoryCities = ['All', ...new Set(safeHoardings.map(h => {
        const city = h.City?.trim();
        if (!city) return null;
        return city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
    }).filter(Boolean))];
    const inventoryStatuses = ['All', 'Available', 'Booked'];
    const isAllCityFilter = !inventoryCityFilter || inventoryCityFilter.length === 0 || inventoryCityFilter.includes('All');
    const inventoryTargetHoardings = isAllCityFilter
        ? safeHoardings
        : safeHoardings.filter(h => inventoryCityFilter.some(c => c.toLowerCase() === (h.City || '').trim().toLowerCase()));
    const inventoryLocalities = ['All', ...new Set(inventoryTargetHoardings.map(h => (h["Locality"] || h["Area"] || '').trim()).filter(Boolean))].sort((a, b) => a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b));
    const inventoryMediaFormats = ['All', ...new Set(safeHoardings.map(h => h["Media Format (Front Lit / Back Lit / Non Lit)"]).filter(Boolean))];
    const inventorySizes = ['All', ...new Set(safeHoardings.map(h => h["Size (Large/Medium/Small)"]).filter(Boolean))];
    const inventoryCategories = ['All', ...new Set(safeHoardings.map(h => h["Site Category"]).filter(Boolean))];
    const inventoryPriceRanges = [
        ['All', 'All Prices'],
        ['0-25k', 'Under ₹25k'],
        ['25k-50k', '₹25k - ₹50k'],
        ['50k-100k', '₹50k - ₹1L'],
        ['100k+', 'Above ₹1L']
    ];

    const openInventory = (status = 'All') => {
        setInventoryStatusFilter(status);
        setActiveTab('inventory');
    };

    const reviewQueue = safeStaffUploads.filter(upload => upload && upload.Status === 'REVIEW_REQUIRED' && !pendingStaffReviewIds[upload.UploadId]);
    
    // 📅 2-Day (48 Hours) Auto-Purge for Unmatched Photos
    const TWO_DAYS_MS = 48 * 3600 * 1000;
    const isOlderThan2Days = (time) => {
        if (!time) return false;
        const ts = new Date(time).getTime();
        return !isNaN(ts) && (Date.now() - ts > TWO_DAYS_MS);
    };

    // ✅ AI Auto-Matched Photos (50m Geofenced & Approved)
    const matchedPhotoUpdates = safeStaffUploads.filter(upload => {
        if (!upload) return false;
        return upload.Status === 'AUTO_APPROVED' || 
               upload.Decision === 'GEMINI_GPS_AUTO_MATCH' || 
               upload.Decision === 'GPS_AUTO_MATCH' || 
               upload.Status === 'APPROVED';
    });

    // ⚠️ Unmatched / Out-of-Range Photos (Active, not older than 2 days)
    const unmatchedPhotoUpdates = safeStaffUploads.filter(upload => {
        if (!upload) return false;
        const isMatched = upload.Status === 'AUTO_APPROVED' || 
                          upload.Decision === 'GEMINI_GPS_AUTO_MATCH' || 
                          upload.Decision === 'GPS_AUTO_MATCH' || 
                          upload.Status === 'APPROVED';
        if (isMatched) return false;
        // Purge if older than 2 days
        return !isOlderThan2Days(upload.CapturedAt || upload.ReviewedAt);
    });

    const purgedUnmatchedCount = safeStaffUploads.filter(upload => {
        if (!upload) return false;
        const isMatched = upload.Status === 'AUTO_APPROVED' || 
                          upload.Decision === 'GEMINI_GPS_AUTO_MATCH' || 
                          upload.Decision === 'GPS_AUTO_MATCH' || 
                          upload.Status === 'APPROVED';
        return !isMatched && isOlderThan2Days(upload.CapturedAt || upload.ReviewedAt);
    }).length;

    // 📅 Today's Live Staff Uploads
    const todayDateString = new Date().toDateString();
    const todayStaffUploads = safeStaffUploads.filter(upload => {
        if (!upload) return false;
        const d = new Date(upload.CapturedAt || upload.ReviewedAt || 0);
        return d.toDateString() === todayDateString;
    });
    const todayAutoApprovedCount = todayStaffUploads.filter(u => u && (u.Status === 'AUTO_APPROVED' || u.Decision === 'GEMINI_GPS_AUTO_MATCH' || u.Decision === 'GPS_AUTO_MATCH')).length;

    // Filter to only recent approved/active uploads from the last 24h
    const recentPhotoUpdates = matchedPhotoUpdates.slice(0, 16);

    // Dynamic Overview Analytics
    const totalHoardingsCount = safeHoardings.length;
    const bookedCount = safeHoardings.filter(h => h && ((h.STATUS || '').toLowerCase() === 'booked' || (h.STATUS || '').toLowerCase() === 'occupied')).length;
    const availableCount = safeHoardings.filter(h => h && !((h.STATUS || '').toLowerCase() === 'booked' || (h.STATUS || '').toLowerCase() === 'occupied')).length;
    
    const totalMonthlyRevenue = safeHoardings.reduce((sum, h) => {
        if (!h) return sum;
        const v = parseFloat(String(h["Rental Per Month"] || h["Avg Monthly Cost (INR)"] || 0).replace(/[^0-9.]/g, '')) || 0;
        return sum + v;
    }, 0);
    const avgMonthlyRate = totalHoardingsCount > 0 ? Math.round(totalMonthlyRevenue / totalHoardingsCount) : 0;
    
    const totalSqFt = safeHoardings.reduce((sum, h) => {
        if (!h) return sum;
        const sqft = parseFloat(h["Total Sq. Ft"]) || (parseFloat(h["Width"]) * parseFloat(h["Height"])) || 0;
        return sum + sqft;
    }, 0);

    // Prime Corridors / Localities Breakdown (Top 8 from real Meerut data)
    const zoneMap = {};
    safeHoardings.forEach(h => {
        if (!h) return;
        const z = (h["Locality"] || h["Area"] || 'Meerut Central').trim();
        if (z) zoneMap[z] = (zoneMap[z] || 0) + 1;
    });
    const overviewTopZones = Object.entries(zoneMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({
            name,
            count,
            percent: ((count / Math.max(totalHoardingsCount, 1)) * 100).toFixed(1)
        }));
    const maxZoneCount = Math.max(...overviewTopZones.map(z => z.count), 1);

    // Pricing Distribution Tiers
    const overviewPriceTiers = [
        { label: 'Under ₹25,000 / mo', min: 0, max: 25000, count: 0, color: '#0ea5e9' },
        { label: '₹25,000 - ₹50,000 / mo', min: 25000, max: 50000, count: 0, color: '#4f46e5' },
        { label: '₹50,000 - ₹1,00,000 / mo', min: 50000, max: 100000, count: 0, color: '#8b5cf6' },
        { label: 'Above ₹1,00,000 / mo', min: 100000, max: Infinity, count: 0, color: '#059669' },
    ];
    safeHoardings.forEach(h => {
        if (!h) return;
        const p = parseFloat(String(h["Rental Per Month"] || h["Avg Monthly Cost (INR)"] || 0).replace(/[^0-9.]/g, '')) || 0;
        const tier = overviewPriceTiers.find(t => p >= t.min && p < t.max);
        if (tier) tier.count++;
    });

    // Top Prime Highlight Sites
    const primeHighlightSites = safeHoardings.slice(0, 4);


    useEffect(() => {
        let cancelled = false;
        const updatePreviews = async () => {
            const reviewItems = staffUploads.filter(upload => upload.Status === 'REVIEW_REQUIRED' && upload.ImageURL);
            for (const upload of reviewItems) {
                if (orientationCacheRef.current.has(upload.ImageURL)) continue;
                orientationCacheRef.current.set(upload.ImageURL, { pending: true });
                try {
                    const initial = await prepareImageOrientation(upload.ImageURL);
                    const aiRotation = initial.rotation ? 0 : (await detectStaffPhotoOrientation(upload.ImageURL)).rotation;
                    const legacyRotation = !upload.OrientationNormalized && initial.height > initial.width ? 270 : 0;
                    const selectedRotation = aiRotation || legacyRotation;
                    const corrected = selectedRotation ? await prepareImageOrientation(upload.ImageURL, selectedRotation) : initial;
                    orientationCacheRef.current.set(upload.ImageURL, corrected);
                    if (!cancelled) {
                        setStaffImagePreviews(current => ({ ...current, [upload.UploadId]: corrected }));
                    }
                } catch {
                    orientationCacheRef.current.set(upload.ImageURL, { rotation: 0, previewUrl: upload.ImageURL });
                }
            }
        };
        updatePreviews();
        return () => { cancelled = true; };
    }, [staffUploads]);

    const handleStaffReview = (upload, reviewAction) => {
        const siteName = reviewSelections[upload.UploadId] || upload.SuggestedSite || '';
        if ((reviewAction === 'approve' || reviewAction === 'historyOnly') && !siteName) {
            alert('Please select a site first.');
            return;
        }
        const actionLabel = reviewAction === 'approve' ? 'Approve and update' : reviewAction === 'historyOnly' ? 'Save to history' : 'Reject';
        setPendingStaffReviewIds(current => ({ ...current, [upload.UploadId]: true }));
        setStaffUploads(current => current.filter(item => item.UploadId !== upload.UploadId));
        setReviewNotice({ status: 'processing', title: `${actionLabel} sent`, message: 'Google Sheet sync is completing in the background. You can continue reviewing other photos.' });

        void (async () => {
            try {
                const corrected = staffImagePreviews[upload.UploadId];
                const replacementImage = corrected?.rotation && corrected.blob
                    ? { fileData: await blobToDataUrl(corrected.blob), mimeType: 'image/jpeg' }
                    : {};
                await reviewStaffPhoto(upload.UploadId, reviewAction, siteName, replacementImage);
                const [uploads, freshData] = await Promise.all([
                    fetchStaffUploads(),
                    reviewAction === 'reject' ? Promise.resolve(null) : fetchHoardings()
                ]);
                setStaffUploads(uploads);
                if (freshData?.length) setHoardings(freshData);
                setPendingStaffReviewIds(current => {
                    const next = { ...current };
                    delete next[upload.UploadId];
                    return next;
                });
                setReviewNotice({ status: 'completed', title: `${actionLabel} complete`, message: 'Google Sheet and live dashboard are updated.' });
            } catch (error) {
                setStaffUploads(current => current.some(item => item.UploadId === upload.UploadId) ? current : [upload, ...current]);
                setPendingStaffReviewIds(current => {
                    const next = { ...current };
                    delete next[upload.UploadId];
                    return next;
                });
                setReviewNotice({ status: 'error', title: `${actionLabel} needs attention`, message: error.message || 'The photo was restored to the review queue.' });
            }
        })();
    };

    const isImageLikeHeader = (header = '') => {
        const clean = String(header).toLowerCase();
        return clean.includes('image') || clean.includes('photo') || clean.includes('pic') || clean.includes('executionhistory') || clean.includes('history');
    };

    const isUrlValue = (value = '') => /^https?:\/\//i.test(String(value).trim());

    const makeSheetSnapshot = () => ({
        headers: [...sheetHeaders],
        rows: sheetRows.map(row => [...row])
    });

    const applySheetSnapshot = (snapshot) => {
        setSheetHeaders(snapshot.headers.map(value => String(value ?? '')));
        setSheetRows(snapshot.rows.map(row => row.map(value => String(value ?? ''))));
        setSheetDirty(true);
    };

    const rememberSheetState = () => {
        setSheetHistory(prev => [...prev.slice(-SHEET_HISTORY_LIMIT + 1), makeSheetSnapshot()]);
        setSheetFuture([]);
    };

    const undoSheetChange = () => {
        setSheetHistory(prev => {
            if (!prev.length) return prev;
            const previous = prev[prev.length - 1];
            setSheetFuture(future => [makeSheetSnapshot(), ...future.slice(0, SHEET_HISTORY_LIMIT - 1)]);
            applySheetSnapshot(previous);
            return prev.slice(0, -1);
        });
    };

    const redoSheetChange = () => {
        setSheetFuture(prev => {
            if (!prev.length) return prev;
            const next = prev[0];
            setSheetHistory(history => [...history.slice(-SHEET_HISTORY_LIMIT + 1), makeSheetSnapshot()]);
            applySheetSnapshot(next);
            return prev.slice(1);
        });
    };

    const markSheetChanged = () => {
        setSheetDirty(true);
    };

    const loadSheetEditor = async () => {
        setSheetLoading(true);
        try {
            const grid = await fetchSheetGrid();
            setSheetHeaders(grid.headers.length ? grid.headers : ['S. No.']);
            setSheetRows(grid.rows);
            setSheetLastSync(grid.updatedAt);
            setSheetDirty(false);
            setSheetHistory([]);
            setSheetFuture([]);
            setSelectedSheetCell({ row: 0, col: 0 });
            setSheetSelection({ type: 'cell', row: 0, col: 0 });
        } catch (error) {
            alert(`Sheet load failed: ${error.message}`);
        } finally {
            setSheetLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'sheet-editor' && sheetHeaders.length === 0 && !sheetLoading) {
            loadSheetEditor();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const updateSheetHeader = (colIndex, value) => {
        rememberSheetState();
        setSheetHeaders(prev => prev.map((header, idx) => idx === colIndex ? value : header));
        markSheetChanged();
    };

    const updateSheetCellLive = (rowIndex, colIndex, value) => {
        setSheetRows(prev => prev.map((row, rIdx) => {
            if (rIdx !== rowIndex) return row;
            const nextRow = [...row];
            while (nextRow.length < sheetHeaders.length) nextRow.push('');
            nextRow[colIndex] = value;
            return nextRow;
        }));
        markSheetChanged();
    };

    const selectSheetCell = (rowIndex, colIndex) => {
        setSelectedSheetCell({ row: rowIndex, col: colIndex });
        setSheetSelection({ type: 'cell', row: rowIndex, col: colIndex });
    };

    const selectSheetRow = (rowIndex) => {
        setSelectedSheetCell({ row: rowIndex, col: selectedSheetCell.col });
        setSheetSelection({ type: 'row', row: rowIndex });
    };

    const selectSheetColumn = (colIndex) => {
        setSelectedSheetCell({ row: selectedSheetCell.row, col: colIndex });
        setSheetSelection({ type: 'column', col: colIndex });
    };

    const selectVisibleSheet = () => {
        const firstVisible = visibleSheetColumns[0]?.index || 0;
        setSelectedSheetCell({ row: 0, col: firstVisible });
        setSheetSelection({ type: 'sheet' });
    };

    const addSheetRow = (afterIndex = sheetRows.length - 1, position = 'after') => {
        rememberSheetState();
        const insertAt = position === 'before'
            ? Math.max(0, Math.min(afterIndex, sheetRows.length))
            : Math.max(0, Math.min(afterIndex + 1, sheetRows.length));
        setSheetRows(prev => [
            ...prev.slice(0, insertAt),
            Array(sheetHeaders.length).fill(''),
            ...prev.slice(insertAt)
        ]);
        selectSheetCell(insertAt, selectedSheetCell.col || 0);
        markSheetChanged();
    };

    const deleteSheetRow = (rowIndex) => {
        rememberSheetState();
        setSheetRows(prev => prev.filter((_, idx) => idx !== rowIndex));
        const nextRow = Math.max(0, Math.min(rowIndex, sheetRows.length - 2));
        selectSheetCell(nextRow, selectedSheetCell.col);
        markSheetChanged();
    };

    const addSheetColumn = (afterIndex = sheetHeaders.length - 1, position = 'after') => {
        rememberSheetState();
        const insertAt = position === 'before'
            ? Math.max(0, Math.min(afterIndex, sheetHeaders.length))
            : Math.max(0, Math.min(afterIndex + 1, sheetHeaders.length));
        const name = `New Column ${sheetHeaders.length + 1}`;
        setSheetHeaders(prev => [...prev.slice(0, insertAt), name, ...prev.slice(insertAt)]);
        setSheetRows(prev => prev.map(row => [...row.slice(0, insertAt), '', ...row.slice(insertAt)]));
        selectSheetCell(selectedSheetCell.row || 0, insertAt);
        markSheetChanged();
    };

    const deleteSheetColumn = (colIndex) => {
        if (sheetHeaders.length <= 1) {
            alert('At least one column is required.');
            return;
        }
        rememberSheetState();
        setSheetHeaders(prev => prev.filter((_, idx) => idx !== colIndex));
        setSheetRows(prev => prev.map(row => row.filter((_, idx) => idx !== colIndex)));
        selectSheetCell(selectedSheetCell.row, Math.max(0, Math.min(colIndex, sheetHeaders.length - 2)));
        markSheetChanged();
    };

    const getSelectionColumns = () => {
        if (sheetSelection.type === 'column') return [sheetSelection.col];
        if (sheetSelection.type === 'row' || sheetSelection.type === 'sheet') return visibleSheetColumns.map(column => column.index);
        return [selectedSheetCell.col];
    };

    const getSelectionRows = () => {
        if (sheetSelection.type === 'row') return [sheetSelection.row];
        if (sheetSelection.type === 'column' || sheetSelection.type === 'sheet') return sheetRows.map((_, index) => index);
        return [selectedSheetCell.row];
    };

    const clearSheetSelection = () => {
        rememberSheetState();
        const rowsToClear = getSelectionRows();
        const colsToClear = getSelectionColumns();
        setSheetRows(prev => prev.map((row, rowIndex) => {
            if (!rowsToClear.includes(rowIndex)) return row;
            const nextRow = [...row];
            while (nextRow.length < sheetHeaders.length) nextRow.push('');
            colsToClear.forEach(colIndex => {
                nextRow[colIndex] = '';
            });
            return nextRow;
        }));
        markSheetChanged();
    };

    const deleteSheetSelection = () => {
        if (sheetSelection.type === 'row') {
            deleteSheetRow(sheetSelection.row);
            return;
        }
        if (sheetSelection.type === 'column') {
            deleteSheetColumn(sheetSelection.col);
            return;
        }
        clearSheetSelection();
    };

    const copySheetSelection = async () => {
        const rowsToCopy = getSelectionRows();
        const colsToCopy = getSelectionColumns();
        const lines = rowsToCopy.map(rowIndex => colsToCopy.map(colIndex => sheetRows[rowIndex]?.[colIndex] || '').join('\t'));
        const text = lines.join('\n');
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
        }
    };

    // Cut: Copy + Clear
    const cutSheetSelection = async () => {
        const rowsToCopy = getSelectionRows();
        const colsToCopy = getSelectionColumns();
        const cutData = rowsToCopy.map(r => colsToCopy.map(c => sheetRows[r]?.[c] || ''));
        setCutBuffer({ rows: cutData, selection: { ...sheetSelection }, selectedCell: { ...selectedSheetCell } });
        await copySheetSelection();
        clearSheetSelection();
    };
    const pasteCutBuffer = () => {
        if (!cutBuffer) return; rememberSheetState();
        const tR = selectedSheetCell.row, tC = selectedSheetCell.col;
        setSheetRows(prev => {
            const n = prev.map(row => [...row]);
            while (n.length < tR + cutBuffer.rows.length) n.push(Array(sheetHeaders.length).fill(''));
            cutBuffer.rows.forEach((cr, ro) => cr.forEach((cell, co) => {
                const ti = tR + ro, tj = tC + co;
                if (ti < n.length) { while (n[ti].length <= tj) n[ti].push(''); n[ti][tj] = cell; }
            }));
            return n;
        });
        setCutBuffer(null); markSheetChanged();
    };

    // Find & Replace
    const runFindReplace = (query, mc) => {
        if (!query) { setFindMatches([]); setFindMatchIndex(-1); return; }
        const q = mc ? query : query.toLowerCase(); const m = [];
        sheetRows.forEach((row, ri) => row.forEach((cell, ci) => {
            const v = mc ? String(cell || '') : String(cell || '').toLowerCase();
            if (v.includes(q)) m.push({ row: ri, col: ci });
        }));
        setFindMatches(m); setFindMatchIndex(m.length > 0 ? 0 : -1);
        if (m.length > 0) selectSheetCell(m[0].row, m[0].col);
    };
    const findNext = () => { if (!findMatches.length) return; const n = (findMatchIndex + 1) % findMatches.length; setFindMatchIndex(n); selectSheetCell(findMatches[n].row, findMatches[n].col); };
    const findPrev = () => { if (!findMatches.length) return; const p = (findMatchIndex - 1 + findMatches.length) % findMatches.length; setFindMatchIndex(p); selectSheetCell(findMatches[p].row, findMatches[p].col); };
    const replaceCurrent = () => {
        if (findMatchIndex < 0 || findMatchIndex >= findMatches.length) return; rememberSheetState();
        const { row, col } = findMatches[findMatchIndex];
        setSheetRows(prev => prev.map((r, ri) => { if (ri !== row) return r; const n = [...r]; while (n.length <= col) n.push('');
            const src = String(n[col]); if (findMatchCase) { n[col] = src.split(findQuery).join(replaceQuery); } else { n[col] = src.toLowerCase().split(findQuery.toLowerCase()).join(replaceQuery); }
            return n; }));
        markSheetChanged(); runFindReplace(findQuery, findMatchCase);
    };
    const replaceAllMatches = () => {
        if (!findQuery) return; rememberSheetState(); let c = 0;
        setSheetRows(prev => prev.map(row => row.map(cell => {
            const src = String(cell || ''); const v = findMatchCase ? src : src.toLowerCase(); const q = findMatchCase ? findQuery : findQuery.toLowerCase();
            if (v.includes(q)) { c++; return findMatchCase ? src.split(findQuery).join(replaceQuery) : src.toLowerCase().split(q).join(replaceQuery); } return cell; })));
        markSheetChanged(); runFindReplace(findQuery, findMatchCase); if (c > 0) showToast('Replaced ' + c + ' occurrence(s)', 'success');
    };

    const isSheetCellSelected = (rowIndex, colIndex) => {
        if (sheetSelection.type === 'sheet') return visibleSheetColumns.some(column => column.index === colIndex);
        if (sheetSelection.type === 'row') return sheetSelection.row === rowIndex;
        if (sheetSelection.type === 'column') return sheetSelection.col === colIndex;
        return sheetSelection.row === rowIndex && sheetSelection.col === colIndex;
    };

    const isSheetColumnSelected = (colIndex) => sheetSelection.type === 'column' && sheetSelection.col === colIndex;

    const isSheetRowSelected = (rowIndex) => sheetSelection.type === 'row' && sheetSelection.row === rowIndex;

    const getSheetSelectionLabel = () => {
        if (sheetSelection.type === 'sheet') return 'All';
        if (sheetSelection.type === 'row') return `Row ${sheetSelection.row + 2}`;
        if (sheetSelection.type === 'column') return `Column ${getColumnLabel(sheetSelection.col)}`;
        return `${getColumnLabel(selectedSheetCell.col)}${selectedSheetCell.row + 2}`;
    };

    const handleSheetPaste = (event, rowIndex, colIndex) => {
        const pasted = event.clipboardData?.getData('text/plain') || '';
        if (!pasted.includes('\t') && !pasted.includes('\n')) return;
        event.preventDefault();
        rememberSheetState();
        const matrix = pasted
            .replace(/\r/g, '')
            .split('\n')
            .filter((line, idx, lines) => line !== '' || idx < lines.length - 1)
            .map(line => line.split('\t'));

        setSheetRows(prev => {
            const next = prev.map(row => [...row]);
            const neededRows = rowIndex + matrix.length;
            while (next.length < neededRows) next.push(Array(sheetHeaders.length).fill(''));
            const neededCols = colIndex + Math.max(...matrix.map(row => row.length));
            if (neededCols > sheetHeaders.length) {
                const extra = neededCols - sheetHeaders.length;
                setSheetHeaders(headers => [
                    ...headers,
                    ...Array.from({ length: extra }, (_, idx) => `New Column ${headers.length + idx + 1}`)
                ]);
                next.forEach(row => {
                    while (row.length < neededCols) row.push('');
                });
            }
            matrix.forEach((pasteRow, rOffset) => {
                pasteRow.forEach((cell, cOffset) => {
                    next[rowIndex + rOffset][colIndex + cOffset] = cell;
                });
            });
            return next;
        });
        markSheetChanged();
    };

    const handleSheetKeyDown = (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            undoSheetChange();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
            event.preventDefault();
            redoSheetChange();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
            event.preventDefault();
            selectVisibleSheet();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') {
            event.preventDefault(); cutSheetSelection();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h') {
            event.preventDefault(); setFindReplaceOpen(prev => !prev);
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
            event.preventDefault(); setFindReplaceOpen(true);
        }
        if (event.key === 'Escape') {
            if (contextMenu) { closeContextMenu(); return; }
            if (findReplaceOpen) { setFindReplaceOpen(false); return; }
        }
        if (event.key === 'Delete' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
            event.preventDefault(); clearSheetSelection();
        }
    };

    const exportSheetCsv = () => {
        const escapeCsv = (value) => {
            const text = String(value ?? '');
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        };
        const csv = [sheetHeaders, ...sheetRows].map(row => row.map(escapeCsv).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `hoardings-master-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const getColumnLabel = (index) => {
        let label = '';
        let num = index + 1;
        while (num > 0) {
            const mod = (num - 1) % 26;
            label = String.fromCharCode(65 + mod) + label;
            num = Math.floor((num - mod) / 26);
        }
        return label;
    };

    const isPrimarySiteColumn = (header = '') => String(header).toLowerCase().replace(/[^a-z0-9]/g, '') === 'localitysitelocation';

    const handleSaveSheetGrid = async () => {
        if (!sheetHeaders.length) return;
        setSheetSaving(true);
        try {
            await saveSheetGrid({ headers: sheetHeaders, rows: sheetRows });
            window.dispatchEvent(new CustomEvent('hoardings:sync-requested', { detail: { action: 'saveSheetGrid' } }));
            await new Promise(resolve => setTimeout(resolve, 2500));
            const [grid, freshData] = await Promise.all([fetchSheetGrid(), fetchHoardings()]);
            setSheetHeaders(grid.headers);
            setSheetRows(grid.rows);
            setSheetLastSync(grid.updatedAt);
            setSheetDirty(false);
            setSheetHistory([]);
            setSheetFuture([]);
            if (freshData && freshData.length > 0) {
                setHoardings(freshData);
                localStorage.setItem('hoardings_cache', JSON.stringify(freshData));
            }
            alert('Sheet saved. Website data refreshed.');
        } catch (error) {
            alert(`Sheet save failed: ${error.message}`);
        } finally {
            setSheetSaving(false);
        }
    };

    // Column Resize
    const handleColResizeStart = (e, ci) => {
        e.preventDefault(); e.stopPropagation(); const sx = e.clientX, sw = colWidths[ci] || 150;
        document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
        const mv = me => setColWidths(p => ({ ...p, [ci]: Math.max(60, sw + me.clientX - sx) }));
        const up = () => { document.body.style.cursor=''; document.body.style.userSelect=''; document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    };
    const handleRowResizeStart = (e, ri) => {
        e.preventDefault(); e.stopPropagation(); const sy = e.clientY, sh = rowHeights[ri] || 32;
        document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none';
        const mv = me => setRowHeights(p => ({ ...p, [ri]: Math.max(24, sh + me.clientY - sy) }));
        const up = () => { document.body.style.cursor=''; document.body.style.userSelect=''; document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    };

    // Context Menu
    const handleContextMenu = (e, ri, ci) => { e.preventDefault(); e.stopPropagation(); selectSheetCell(ri, ci); setContextMenu({ x: e.clientX, y: e.clientY, row: ri, col: ci }); };
    const closeContextMenu = () => setContextMenu(null);
    useEffect(() => { if (!contextMenu) return; const h = () => closeContextMenu(); document.addEventListener('click',h); document.addEventListener('scroll',h,true);
        return () => { document.removeEventListener('click',h); document.removeEventListener('scroll',h,true); }; }, [contextMenu]);

    // Sort & Filter
    const toggleSort = ci => setSortConfig(p => p&&p.col===ci ? (p.direction==='asc'?{col:ci,direction:'desc'}:null) : {col:ci,direction:'asc'});
    const applyFilter = (ci,v) => { setFilterConfig(p => { const n={...p}; if(!v||v==='__ALL__')delete n[ci];else n[ci]=v; return n; }); setFilterDropdownCol(null); };
    const getFilterValues = ci => { const vals=new Set(); sheetRows.forEach(r=>{const v=String(r[ci]||'').trim();if(v)vals.add(v);}); return ['__ALL__',...Array.from(vals).sort()]; };

    const normalizedSheetSearch = sheetSearch.trim().toLowerCase();
    const processedSheetRows = useMemo(() => {
        let res = sheetRows.map((row, index) => ({ row, index }));
        Object.entries(filterConfig).forEach(([ci, fv]) => { res = res.filter(({ row }) => String(row[Number(ci)] || '').trim() === fv); });
        if (normalizedSheetSearch) res = res.filter(({ row }) => row.some(cell => String(cell || '').toLowerCase().includes(normalizedSheetSearch)));
        if (sortConfig) { const { col, direction } = sortConfig; res.sort((a, b) => { const aV = String(a.row[col] || ''), bV = String(b.row[col] || ''); const aN = parseFloat(aV.replace(/[^\d.-]/g, '')), bN = parseFloat(bV.replace(/[^\d.-]/g, '')); if (!isNaN(aN) && !isNaN(bN)) return direction === 'asc' ? aN - bN : bN - aN; return direction === 'asc' ? aV.localeCompare(bV) : bV.localeCompare(aV); }); }
        return res;
    }, [sheetRows, filterConfig, normalizedSheetSearch, sortConfig]);
    const visibleSheetRows = processedSheetRows;
    const visibleSheetColumns = sheetHeaders
        .map((header, index) => ({ header, index, label: getColumnLabel(index), isSite: isPrimarySiteColumn(header) }))
        .filter(column => !HIDDEN_SHEET_COLUMN_LETTERS.has(column.label) && !isInternalHeader(column.header, column.index));
    const hiddenSheetColumnCount = sheetHeaders.length - visibleSheetColumns.length;
    const selectedSheetValue = sheetRows[selectedSheetCell.row]?.[selectedSheetCell.col] || '';
    const selectedSheetAddress = getSheetSelectionLabel();

    return (
        <div className={`admin-dashboard ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
            <ImageLightbox
                imageUrl={previewHoarding ? getImageUrl(previewHoarding) : ''}
                alt={previewHoarding?.["Location "]}
                onClose={() => setPreviewHoarding(null)}
                onDownload={previewHoarding ? () => downloadHoardingImage(previewHoarding) : null}
            />
            {isLoading && (
                <div className="loading-overlay">
                    <div className="loading-card">
                        <div className="spinner"></div>
                        <div className="loading-text">
                            <h3>Syncing Data Pipeline</h3>
                            <p>Uploading and processing your file...</p>
                        </div>
                    </div>
                </div>
            )}

            {isExcelImportOpen && (
                <div className="modal-overlay">
                    <div className="modal-card excel-preview-modal">
                        <div className="modal-header">
                            <h3>Excel Import Preview</h3>
                            <button onClick={() => setIsExcelImportOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body excel-preview-body">
                            <div className="excel-preview-title">
                                <div>
                                    <strong>{excelImportPreview?.fileName || 'Excel file'}</strong>
                                    <span className={`excel-preview-status ${String(excelImportPreview?.status || '').toLowerCase()}`}>
                                        {excelImportPreview?.status || 'PROCESSING'}
                                    </span>
                                </div>
                                <p>Upload is only a dry run. Google Sheet will change after approval.</p>
                            </div>

                            {!excelImportPreview?.summary ? (
                                <div className="excel-preview-loading">
                                    <div className="spinner"></div>
                                    <span>Checking headers, duplicates, missing fields, and lat/long...</span>
                                </div>
                            ) : (
                                <>
                                    <div className="excel-preview-stats">
                                        <div><strong>{excelImportPreview.summary.totalRows || 0}</strong><span>Total Rows</span></div>
                                        <div><strong>{excelImportPreview.summary.newRows || 0}</strong><span>New Rows</span></div>
                                        <div><strong>{excelImportPreview.summary.updatedRows || 0}</strong><span>Updated Rows</span></div>
                                        <div><strong>{excelImportPreview.summary.skippedRows || 0}</strong><span>Skipped</span></div>
                                        <div><strong>{excelImportPreview.summary.duplicateSites?.length || 0}</strong><span>Duplicates</span></div>
                                        <div><strong>{excelImportPreview.summary.invalidLatLong?.length || 0}</strong><span>Invalid Lat/Long</span></div>
                                    </div>

                                    <div className="excel-preview-grid">
                                        <section>
                                            <h4>Header Mapping</h4>
                                            {excelImportPreview.summary.mappedHeaders?.length ? (
                                                <ul>
                                                    {excelImportPreview.summary.mappedHeaders.slice(0, 10).map((item, idx) => (
                                                        <li key={idx}>{item.incomingHeader} mapped to {item.targetHeader}</li>
                                                    ))}
                                                </ul>
                                            ) : <p>No unusual header mapping needed.</p>}
                                        </section>
                                        <section>
                                            <h4>Unknown Headers</h4>
                                            {excelImportPreview.summary.unknownHeaders?.length ? (
                                                <ul>
                                                    {excelImportPreview.summary.unknownHeaders.slice(0, 12).map((header, idx) => <li key={idx}>{header}</li>)}
                                                </ul>
                                            ) : <p>None.</p>}
                                        </section>
                                        <section>
                                            <h4>Missing Required Fields</h4>
                                            {excelImportPreview.summary.missingRequired?.length ? (
                                                <ul>
                                                    {excelImportPreview.summary.missingRequired.slice(0, 8).map((item, idx) => (
                                                        <li key={idx}>Row {item.row}: {(item.fields || []).join(', ')}</li>
                                                    ))}
                                                </ul>
                                            ) : <p>None.</p>}
                                        </section>
                                        <section>
                                            <h4>Invalid / Duplicate Rows</h4>
                                            {(excelImportPreview.summary.invalidLatLong?.length || excelImportPreview.summary.duplicateSites?.length) ? (
                                                <ul>
                                                    {excelImportPreview.summary.invalidLatLong?.slice(0, 5).map((item, idx) => <li key={`lat-${idx}`}>Row {item.row}: invalid lat/long</li>)}
                                                    {excelImportPreview.summary.duplicateSites?.slice(0, 5).map((item, idx) => <li key={`dup-${idx}`}>Row {item.row}: duplicate of row {item.duplicateOfRow}</li>)}
                                                </ul>
                                            ) : <p>None.</p>}
                                        </section>
                                    </div>

                                    {excelImportPreview.summary.blockingErrors?.length > 0 && (
                                        <div className="excel-preview-warning">
                                            {excelImportPreview.summary.blockingErrors.join(' ')}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setIsExcelImportOpen(false)}>Cancel</button>
                            <button
                                className="btn-primary-admin"
                                onClick={approveExcelImport}
                                disabled={!excelImportPreview?.summary || isExcelApproving || excelImportPreview?.status === 'FAILED' || excelImportPreview?.status === 'IMPORTED'}
                            >
                                <CheckCircle size={18} /> {isExcelApproving ? 'Importing...' : excelImportPreview?.status === 'IMPORTED' ? 'Imported' : 'Approve Import'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Modal */}
            {isSettingsOpen && (
                <div className="modal-overlay">
                    <div className="modal-card">
                        <div className="modal-header">
                            <h3>⚙️ System Settings</h3>
                            <button onClick={() => setIsSettingsOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <p className="modal-help">System is currently running on Enterprise AI License. All detections are active.</p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-primary-admin" onClick={() => setIsSettingsOpen(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Asset Modal */}
            {(isAddModalOpen || isEditModalOpen) && (
                <div className="modal-overlay">
                    <div className="modal-card crud-modal">
                        <div className="modal-header">
                            <h3>{isAddModalOpen ? '➕ Add New Media Asset' : '✏️ Edit Asset Details'}</h3>
                            <button onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); setSelectedAssetFile(null); }}><X size={20} /></button>
                        </div>
                        <form onSubmit={isAddModalOpen ? handleAddAsset : handleEditAsset}>
                            <div className="modal-body crud-form">
                                <div className="form-row three-cols">
                                    <div className="form-group span-two">
                                        <label>Site Name / Landmark</label>
                                        <input 
                                            value={formData["Location "] ?? formData.Location ?? formData["Locality Site Location"] ?? ''} 
                                            onChange={e => setFormData({
                                                ...formData, 
                                                "Location ": e.target.value, 
                                                Location: e.target.value, 
                                                "Locality Site Location": e.target.value
                                            })}
                                            placeholder="e.g. Maruti True Value / Clock Tower (Optional)"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>City*</label>
                                        <input 
                                            required 
                                            value={formData.City ?? formData.city ?? ''} 
                                            onChange={e => setFormData({
                                                ...formData, 
                                                City: e.target.value, 
                                                city: e.target.value
                                            })}
                                            placeholder="e.g. Meerut"
                                        />
                                    </div>
                                </div>
                                <div className="form-row three-cols">
                                    <div className="form-group">
                                        <label>Locality / Area</label>
                                        <input 
                                            value={formData.Locality ?? formData.Area ?? ''} 
                                            onChange={e => setFormData({
                                                ...formData, 
                                                Locality: e.target.value, 
                                                Area: e.target.value
                                            })}
                                            placeholder="e.g. Partapur / Begum Bridge"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Facing / Traffic View*</label>
                                        <input 
                                            value={formData.Facing ?? formData["Traffic View"] ?? ''} 
                                            onChange={e => setFormData({
                                                ...formData, 
                                                Facing: e.target.value,
                                                "Traffic View": e.target.value
                                            })}
                                            placeholder="e.g. Modipuram / Delhi Road"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Media Format</label>
                                        <select 
                                            value={formData["Media Format (Front Lit / Back Lit / Non Lit)"] ?? formData["Media Format"] ?? formData["Media Type"] ?? formData.Media ?? ''} 
                                            onChange={e => setFormData({
                                                ...formData, 
                                                "Media Format (Front Lit / Back Lit / Non Lit)": e.target.value,
                                                "Media Format": e.target.value,
                                                "Media Type": e.target.value,
                                                Media: e.target.value
                                            })}
                                        >
                                            <option value="">Select Format</option>
                                            <option value="Front Lit">Front Lit</option>
                                            <option value="Back Lit">Back Lit</option>
                                            <option value="Non Lit">Non Lit</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row three-cols">
                                    <div className="form-group">
                                        <label>Traffic From</label>
                                        <input 
                                            value={formData["Traffic From"] ?? ''} 
                                            onChange={e => setFormData({
                                                ...formData, 
                                                "Traffic From": e.target.value
                                            })}
                                            placeholder="e.g. Delhi"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Traffic To</label>
                                        <input 
                                            value={formData["Traffic To"] ?? ''} 
                                            onChange={e => setFormData({
                                                ...formData, 
                                                "Traffic To": e.target.value
                                            })}
                                            placeholder="e.g. Dehradun / Modipuram"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Size (Dimensions)</label>
                                        <input 
                                            value={formData["Size (Large/Medium/Small)"] ?? formData["Size (Large/ Medium/ Small)"] ?? formData.Size ?? ''} 
                                            onChange={e => setFormData({
                                                ...formData, 
                                                "Size (Large/Medium/Small)": e.target.value,
                                                "Size (Large/ Medium/ Small)": e.target.value,
                                                Size: e.target.value
                                            })}
                                            placeholder="e.g. 40x10 ft"
                                        />
                                    </div>
                                </div>
                                <div className="form-row three-cols">
                                    <div className="form-group">
                                        <label>Monthly Cost / Commercials (INR)</label>
                                        <input 
                                            type="number"
                                            value={formData["Avg Monthly Cost (INR)"] ?? formData["Rental Per Month"] ?? formData["Avg. monthly Cost"] ?? formData.Price ?? ''} 
                                            onChange={e => setFormData({
                                                ...formData, 
                                                "Avg Monthly Cost (INR)": e.target.value,
                                                "Rental Per Month": e.target.value,
                                                "Avg. monthly Cost": e.target.value,
                                                Price: e.target.value
                                            })}
                                            placeholder="e.g. 60000"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Latitude*</label>
                                        <input 
                                            required
                                            value={formData.Latitude ?? ''} 
                                            onChange={e => setFormData({...formData, Latitude: e.target.value})}
                                            placeholder="e.g. 28.9981"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Longitude*</label>
                                        <input 
                                            required
                                            value={formData.Longitude ?? ''} 
                                            onChange={e => setFormData({...formData, Longitude: e.target.value})}
                                            placeholder="e.g. 77.7058"
                                        />
                                    </div>
                                </div>

                                <div className="form-row three-cols booking-section animate-in" style={{ 
                                    background: 'rgba(108, 93, 211, 0.05)', 
                                    padding: '15px', 
                                    borderRadius: '12px',
                                    border: '1px solid rgba(108, 93, 211, 0.1)',
                                    marginBottom: '20px'
                                }}>
                                    <div className="form-group">
                                        <label>STATUS</label>
                                        <select 
                                            value={(formData.STATUS === 'Booked' || formData.STATUS === 'Occupied') ? 'Booked' : 'Available'} 
                                            onChange={e => setFormData({...formData, STATUS: e.target.value})}
                                            style={{ borderColor: (formData.STATUS === 'Booked' || formData.STATUS === 'Occupied') ? '#f87171' : '#4ade80' }}
                                        >
                                            <option value="Available">Available</option>
                                            <option value="Booked">Booked</option>
                                        </select>
                                    </div>
                                    
                                    {(formData.STATUS === 'Booked' || formData.STATUS === 'Occupied') && (
                                        <>
                                            <div className="form-group">
                                                <label>Client Name (BookedBy)</label>
                                                <input 
                                                    value={formData.BookedBy || ''} 
                                                    onChange={e => setFormData({...formData, BookedBy: e.target.value})}
                                                    placeholder="e.g. Samsung India"
                                                    className="animate-in"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Booking Start Date</label>
                                                <input 
                                                    type="date"
                                                    value={formData.BookingStart || ''} 
                                                    onChange={e => setFormData({...formData, BookingStart: e.target.value})}
                                                    className="animate-in"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Booking End Date</label>
                                                <input 
                                                    type="date"
                                                    value={formData.BookingEnd || ''} 
                                                    onChange={e => setFormData({...formData, BookingEnd: e.target.value})}
                                                    className="animate-in"
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="form-row">
                                    <div className="form-group full-width">
                                        <label>Site Photo / Image (Optional)</label>
                                        <div 
                                            className={`file-drop-zone ${selectedAssetFile ? 'has-file' : ''}`}
                                            onClick={() => document.getElementById('asset-file-input').click()}
                                        >
                                            {selectedAssetFile ? (
                                                <div className="selected-file-preview animate-in">
                                                    <div className="preview-image-wrapper">
                                                        <img src={URL.createObjectURL(selectedAssetFile)} alt="Preview" />
                                                        <div className="upload-badge"><UploadCloud size={14} /> NEW</div>
                                                    </div>
                                                    <div className="file-info">
                                                        <span className="file-name">{selectedAssetFile.name}</span>
                                                        <span className="file-status">Selected & Ready to Sync</span>
                                                    </div>
                                                    <button 
                                                        type="button" 
                                                        className="remove-file-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedAssetFile(null);
                                                            const input = document.getElementById('asset-file-input');
                                                            if (input) input.value = '';
                                                        }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="drop-zone-content">
                                                    <UploadCloud size={32} color="#6c5dd3" />
                                                    <p>Click to Upload or Drag Image</p>
                                                    <span className="helper-text">Select a photo for this media asset</span>
                                                    <button type="button" className="btn-select-dummy" style={{
                                                        marginTop: '10px',
                                                        padding: '8px 16px',
                                                        background: 'var(--primary-accent)',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '8px',
                                                        fontSize: '12px',
                                                        fontWeight: '700',
                                                        cursor: 'pointer'
                                                    }}>Choose File / Image</button>
                                                </div>
                                            )}
                                            <input 
                                                id="asset-file-input"
                                                type="file" 
                                                accept="image/*"
                                                onChange={e => setSelectedAssetFile(e.target.files[0])}
                                                style={{ display: 'none' }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); setSelectedAssetFile(null); }}>Cancel</button>
                                <button type="submit" className="btn-primary-admin">{isAddModalOpen ? 'Create Media Asset' : 'Save Changes'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 🗑️ Custom Premium Glassmorphic Delete Confirmation Modal */}
            {deleteTarget && (
                <div 
                    className="modal-overlay" 
                    style={{ zIndex: 99999 }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setDeleteTarget(null);
                    }}
                >
                    <div className="modal-card confirmation-modal animate-in" style={{ 
                        maxWidth: '460px',
                        background: '#1e293b',
                        border: '1px solid rgba(248, 113, 113, 0.3)',
                        borderRadius: '20px',
                        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 30px rgba(248, 113, 113, 0.15)',
                        overflow: 'hidden'
                    }}>
                        <div className="modal-header" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', padding: '20px 24px' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#f87171', margin: 0, fontSize: '1.15rem' }}>
                                <Trash2 size={22} color="#f87171" /> Confirm Deletion
                            </h3>
                            <button type="button" onClick={() => setDeleteTarget(null)} style={{ color: '#94a3b8' }}><X size={20} /></button>
                        </div>
                        <div className="modal-body" style={{ padding: '24px' }}>
                            <p style={{ fontSize: '15px', lineHeight: '1.6', color: '#cbd5e1', margin: 0 }}>
                                Are you sure you want to permanently delete <strong style={{ color: '#ffffff', fontWeight: '700' }}>"{typeof deleteTarget === 'object' ? deleteTarget.name : deleteTarget}"</strong>?
                            </p>
                            {typeof deleteTarget === 'object' && (deleteTarget.city || deleteTarget.locality) && (
                                <div style={{ 
                                    marginTop: '12px', 
                                    display: 'inline-flex', 
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 14px', 
                                    background: 'rgba(255,255,255,0.06)', 
                                    borderRadius: '20px', 
                                    fontSize: '13px', 
                                    color: '#94a3b8' 
                                }}>
                                    📍 {deleteTarget.city} {deleteTarget.locality ? `• ${deleteTarget.locality}` : ''}
                                </div>
                            )}
                            <div className="warning-box" style={{ 
                                marginTop: '20px', 
                                padding: '14px 16px', 
                                background: 'rgba(239, 68, 68, 0.08)', 
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                borderLeft: '4px solid #ef4444',
                                borderRadius: '10px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                fontSize: '13px',
                                color: '#fca5a5'
                            }}>
                                <Zap size={18} style={{ marginTop: '2px', flexShrink: 0, color: '#ef4444' }} />
                                <span>This operation is permanent. It will immediately remove the site from this dashboard and the live website.</span>
                            </div>
                        </div>
                        <div className="modal-footer" style={{ 
                            background: 'rgba(0,0,0,0.25)', 
                            padding: '16px 24px', 
                            display: 'flex', 
                            justifyContent: 'flex-end', 
                            gap: '12px',
                            borderTop: '1px solid rgba(255, 255, 255, 0.06)'
                        }}>
                            <button 
                                type="button" 
                                className="btn-secondary" 
                                style={{ 
                                    padding: '10px 20px',
                                    background: 'rgba(255,255,255,0.06)',
                                    color: '#cbd5e1',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                }} 
                                onClick={() => setDeleteTarget(null)}
                            >
                                No, Keep it
                            </button>
                            <button 
                                type="button" 
                                className="btn-primary-admin danger" 
                                style={{ 
                                    padding: '10px 24px', 
                                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', 
                                    color: 'white',
                                    fontWeight: '700',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)'
                                }} 
                                onClick={() => {
                                    const target = deleteTarget;
                                    setDeleteTarget(null);
                                    if (target) handleDeleteAsset(target);
                                }}
                            >
                                Yes, Delete Site
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {bulkDeleteTarget && (
                <div className="modal-overlay">
                    <div className="modal-card confirmation-modal animate-in" style={{ maxWidth: '480px' }}>
                        <div className="modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Trash2 size={22} color="#f87171" /> Bulk Delete
                            </h3>
                            <button onClick={() => {
                                setBulkDeleteTarget(null);
                                setBulkDeleteConfirmText('');
                            }}><X size={20} /></button>
                        </div>
                        <div className="modal-body" style={{ padding: '24px' }}>
                            <p style={{ fontSize: '15px', lineHeight: '1.5', color: '#808191' }}>
                                {bulkDeleteTarget.type === 'all' ? (
                                    <>You are deleting <strong style={{ color: '#fff' }}>all sites</strong> from the master sheet.</>
                                ) : (
                                    <>You are deleting every site in <strong style={{ color: '#fff' }}>{bulkDeleteTarget.city}</strong>.</>
                                )}
                                {' '}This cannot be reversed.
                            </p>
                            <div className="warning-box" style={{
                                marginTop: '20px',
                                padding: '15px',
                                background: 'rgba(249, 115, 22, 0.08)',
                                border: '1px solid rgba(249, 115, 22, 0.2)',
                                borderLeft: '4px solid #f97316',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                fontSize: '13px',
                                color: '#f97316'
                            }}>
                                <Zap size={18} style={{ marginTop: '2px', flexShrink: 0 }} />
                                <span>Website inventory will update after the sheet deletion completes.</span>
                            </div>
                            {bulkDeleteTarget.type === 'all' && (
                                <div className="modal-input" style={{ marginTop: '20px' }}>
                                    <label>Type DELETE ALL</label>
                                    <input
                                        value={bulkDeleteConfirmText}
                                        onChange={(e) => setBulkDeleteConfirmText(e.target.value)}
                                        placeholder="DELETE ALL"
                                    />
                                </div>
                            )}
                        </div>
                        <div className="modal-footer" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px 24px', justifyContent: 'flex-end', gap: '12px' }}>
                            <button type="button" className="btn-secondary" style={{ padding: '10px 20px' }} onClick={() => {
                                setBulkDeleteTarget(null);
                                setBulkDeleteConfirmText('');
                            }}>Cancel</button>
                            <button
                                type="button"
                                className="btn-primary-admin danger"
                                style={{
                                    padding: '10px 20px',
                                    background: '#f87171',
                                    color: 'white',
                                    fontWeight: '600',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    opacity: bulkDeleteTarget.type === 'all' && bulkDeleteConfirmText.trim().toUpperCase() !== 'DELETE ALL' ? 0.55 : 1
                                }}
                                disabled={bulkDeleteTarget.type === 'all' && bulkDeleteConfirmText.trim().toUpperCase() !== 'DELETE ALL'}
                                onClick={handleBulkDelete}
                            >
                                Delete Forever
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* Mobile Menu Toggle */}
            <button className="mobile-admin-toggle" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Side Navigation (QuickMart Style with HIRA Logo) */}
            <aside className={`admin-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 8px 20px', borderBottom: '1px solid #1f2937' }}>
                    <div style={{ background: '#ffffff', padding: '4px 10px', borderRadius: '10px', display: 'flex', alignItems: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
                        <img src={HIRA_LOGO} alt="HIRA Advertising" style={{ height: '34px', width: 'auto', display: 'block', objectFit: 'contain' }} />
                    </div>
                </div>

                <div className="sidebar-nav-list">
                    <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                        <LayoutDashboard size={18} />
                        <span>Dashboard</span>
                    </button>
                    <button className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
                        <Database size={18} />
                        <span>Inventory</span>
                    </button>
                    <button className={`nav-item ${activeTab === 'staff-review' ? 'active' : ''}`} onClick={() => setActiveTab('staff-review')}>
                        <Camera size={18} />
                        <span>Review</span>
                        {reviewQueue.length > 0 && <span className="badge-new badge-count">{reviewQueue.length}</span>}
                    </button>
                    <button className={`nav-item ${activeTab === 'clients' ? 'active' : ''}`} onClick={() => setActiveTab('clients')}>
                        <Users size={18} />
                        <span>Clients & Booking</span>
                    </button>
                    <button className={`nav-item ${activeTab === 'daily-update' ? 'active' : ''}`} onClick={() => setActiveTab('daily-update')}>
                        <Zap size={18} />
                        <span>Daily Updates</span>
                        <span className="badge-new badge-ai">AI</span>
                    </button>
                    <button className="nav-item" onClick={() => window.open('/guide', '_blank')}>
                        <BookOpen size={18} />
                        <span>System Guide</span>
                    </button>
                    <button className="nav-item" onClick={() => setIsAppDownloadModalOpen(true)}>
                        <Download size={18} />
                        <span>Download Apps</span>
                    </button>
                    <button className="nav-item" onClick={() => setIsSettingsOpen(true)}>
                        <Settings size={18} />
                        <span>Settings</span>
                    </button>
                </div>

                <div className="sidebar-bottom">
                    <button className="nav-item logout-nav-item" onClick={handleLogout}>
                        <LogOut size={18} />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="admin-main-content">
                <header className="admin-top-bar">
                    <div className="top-bar-left">
                        <button className="sidebar-collapse-toggle" onClick={toggleSidebar} title={isSidebarCollapsed ? 'Open navigation' : 'Close navigation'} aria-label={isSidebarCollapsed ? 'Open navigation' : 'Close navigation'}>
                            {isSidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
                        </button>
                        <button 
                            onClick={() => navigate('/')}
                            className="view-storefront-btn"
                            title="Open public website storefront"
                        >
                            <span>View storefront</span>
                            <div className="storefront-icon-box">
                                <ExternalLink size={12} />
                            </div>
                        </button>
                    </div>
                    <div className="top-bar-right">
                        {(activeTab === 'inventory' || activeTab === 'dashboard') && (
                            <div className="action-btns">
                                {fileProcessing && (
                                    <div className="file-processing-timer" role="status" aria-live="polite" title={`${fileProcessing.fileName}: ${fileProcessing.phase}`}>
                                        <Timer size={15} />
                                        <div className="file-processing-copy">
                                            <strong>{formatProcessingTime(processingSeconds)}</strong>
                                            <span>{fileProcessing.type === 'excel' ? 'Excel' : 'PPT'}: {fileProcessing.phase}</span>
                                        </div>
                                    </div>
                                )}
                                <label className="btn-primary-admin" style={{ cursor: 'pointer', padding: '7px 14px', fontSize: '0.82rem' }}>
                                    <Download size={16} />
                                    Excel Sync
                                    <input type="file" style={{ display: 'none' }} accept=".xlsx,.xls,.csv" disabled={Boolean(fileProcessing)} onChange={(e) => handleFileUpload(e, 'excel')} />
                                </label>
                                <label className="btn-primary-admin" style={{ background: '#00c851', borderColor: '#00c851', color: 'white', cursor: 'pointer', padding: '7px 14px', fontSize: '0.82rem' }}>
                                    <Plus size={16} />
                                    PPT Upload
                                    <input type="file" style={{ display: 'none' }} accept=".ppt,.pptx" disabled={Boolean(fileProcessing)} onChange={(e) => handleFileUpload(e, 'ppt')} />
                                </label>
                            </div>
                        )}

                        {/* 🔔 Notification Bell */}
                        <button className="topbar-icon-btn" title="Notifications">
                            <Bell size={20} />
                        </button>

                        {/* 👤 Admin Profile (QuickMart Illustrated Persona Style) */}
                        <div className="topbar-user-profile" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div className="topbar-user-avatar" style={{ 
                                width: '38px', 
                                height: '38px', 
                                borderRadius: '50%', 
                                overflow: 'hidden', 
                                background: '#fef3c7', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                flexShrink: 0,
                                border: '2px solid #ffffff',
                                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)'
                            }}>
                                <img 
                                    src="/krishna_avatar.jpg" 
                                    alt="Hare Krishna" 
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            </div>
                            <span className="topbar-user-name" style={{ 
                                fontSize: '0.92rem', 
                                fontWeight: 700, 
                                color: '#111827',
                                letterSpacing: '-0.01em'
                            }}>
                                Hare Krishna
                            </span>
                        </div>
                    </div>
                </header>

                {activeTab === 'dashboard' && (
                    <div className="dashboard-view qm-dashboard-view animate-in">
                        <div className="qm-main-container">
                            
                            {/* 🌟 Header Section */}
                            <div className="qm-header-section">
                                <div className="qm-header-text">
                                    <h2 className="qm-page-title">Executive Dashboard</h2>
                                    <p className="qm-page-subtitle">
                                        Real-time analytics, revenue capacity, arterial corridor performance & verified asset inventory
                                    </p>
                                </div>
                                <div className="qm-header-controls">
                                    <button className="qm-btn-secondary" onClick={() => exportProposalExcel(hoardings)} title="Export clean proposal deck for clients">
                                        <FileDown size={15} /> Export Proposal
                                    </button>
                                    <button className="qm-btn-primary" onClick={() => setIsAddModalOpen(true)}>
                                        <Plus size={16} /> Add Asset
                                    </button>
                                </div>
                            </div>

                            {/* 📈 4 QuickMart KPI Stat Cards */}
                            <div className="qm-kpi-grid">
                                
                                {/* Card 1: Total Inventory */}
                                <div 
                                    className="qm-kpi-card clickable" 
                                    role="button" 
                                    tabIndex={0} 
                                    onClick={() => openInventory('All')} 
                                    onKeyDown={(e) => e.key === 'Enter' && openInventory('All')}
                                >
                                    <div className="qm-kpi-top">
                                        <span className="qm-kpi-label">TOTAL INVENTORY</span>
                                        <div className="qm-kpi-icon-box qm-blue">
                                            <Layers size={19} />
                                        </div>
                                    </div>
                                    <div className="qm-kpi-value-row">
                                        <span className="qm-kpi-main-val">{totalHoardingsCount}</span>
                                        <span className="qm-kpi-unit">Sites</span>
                                    </div>
                                    <div className="qm-kpi-progress-bar">
                                        <div className="qm-kpi-progress-fill qm-blue" style={{ width: '100%' }}></div>
                                    </div>
                                    <div className="qm-kpi-meta-row">
                                        <span className="qm-kpi-subtext">{totalSqFt.toLocaleString('en-IN')} sq. ft total area</span>
                                        <span className="qm-badge qm-badge-blue">100% Active</span>
                                    </div>
                                </div>

                                {/* Card 2: Portfolio Monthly Capacity */}
                                <div className="qm-kpi-card">
                                    <div className="qm-kpi-top">
                                        <span className="qm-kpi-label">MONTHLY REVENUE</span>
                                        <div className="qm-kpi-icon-box qm-green">
                                            <DollarSign size={19} />
                                        </div>
                                    </div>
                                    <div className="qm-kpi-value-row">
                                        <span className="qm-kpi-main-val">₹{(totalMonthlyRevenue / 10000000).toFixed(2)}</span>
                                        <span className="qm-kpi-unit">Cr / mo</span>
                                    </div>
                                    <div className="qm-kpi-progress-bar">
                                        <div className="qm-kpi-progress-fill qm-green" style={{ width: '100%' }}></div>
                                    </div>
                                    <div className="qm-kpi-meta-row">
                                        <span className="qm-kpi-subtext">₹{avgMonthlyRate.toLocaleString('en-IN')} avg / site</span>
                                        <span className="qm-badge qm-badge-green">Valued</span>
                                    </div>
                                </div>

                                {/* Card 3: Available for Booking */}
                                <div 
                                    className="qm-kpi-card clickable" 
                                    role="button" 
                                    tabIndex={0} 
                                    onClick={() => openInventory('Available')} 
                                    onKeyDown={(e) => e.key === 'Enter' && openInventory('Available')}
                                >
                                    <div className="qm-kpi-top">
                                        <span className="qm-kpi-label">AVAILABLE SITES</span>
                                        <div className="qm-kpi-icon-box qm-sky">
                                            <CheckCircle size={19} />
                                        </div>
                                    </div>
                                    <div className="qm-kpi-value-row">
                                        <span className="qm-kpi-main-val">{availableCount}</span>
                                        <span className="qm-kpi-unit">Sites</span>
                                    </div>
                                    <div className="qm-kpi-progress-bar">
                                        <div 
                                            className="qm-kpi-progress-fill qm-sky" 
                                            style={{ width: `${(availableCount / Math.max(totalHoardingsCount, 1)) * 100}%` }}
                                        ></div>
                                    </div>
                                    <div className="qm-kpi-meta-row">
                                        <span className="qm-kpi-subtext">{((availableCount / Math.max(totalHoardingsCount, 1)) * 100).toFixed(1)}% available to book</span>
                                        <span className="qm-badge qm-badge-sky">Ready to Pitch</span>
                                    </div>
                                </div>

                                {/* Card 4: Media Verification */}
                                <div className="qm-kpi-card">
                                    <div className="qm-kpi-top">
                                        <span className="qm-kpi-label">VERIFIED ASSETS</span>
                                        <div className="qm-kpi-icon-box qm-purple">
                                            <Camera size={19} />
                                        </div>
                                    </div>
                                    <div className="qm-kpi-value-row">
                                        <span className="qm-kpi-main-val">100%</span>
                                        <span className="qm-kpi-unit">Verified</span>
                                    </div>
                                    <div className="qm-kpi-progress-bar">
                                        <div className="qm-kpi-progress-fill qm-purple" style={{ width: '100%' }}></div>
                                    </div>
                                    <div className="qm-kpi-meta-row">
                                        <span className="qm-kpi-subtext">307 high-res photo CDN links</span>
                                        <span className="qm-badge qm-badge-purple">Verified</span>
                                    </div>
                                </div>

                            </div>

                            {/* 📊 Two-Column QuickMart Analytics Grid */}
                            <div className="qm-bento-grid">
                                
                                {/* 🗺️ Left Card: Prime Corridors (Real Meerut Data) */}
                                <div className="qm-card">
                                    <div className="qm-card-header">
                                        <div>
                                            <h3 className="qm-card-title">Arterial Corridors & Locality Distribution</h3>
                                            <p className="qm-card-desc">Billboard concentration across key arterial corridors in Meerut</p>
                                        </div>
                                        <span className="qm-header-badge">{overviewTopZones.length} Corridors</span>
                                    </div>

                                    <div className="qm-corridors-list">
                                        {overviewTopZones.map((zone, idx) => {
                                            const barWidth = Math.max(6, (parseFloat(zone.percent) / (parseFloat(overviewTopZones[0]?.percent) || 1)) * 100);
                                            return (
                                                <div 
                                                    key={zone.name} 
                                                    className="qm-corridor-row"
                                                    onClick={() => {
                                                        setInventoryLocalityFilter(zone.name);
                                                        setActiveTab('inventory');
                                                    }}
                                                    title={`Click to view ${zone.count} sites on ${zone.name}`}
                                                >
                                                    <div className="qm-corridor-label-group">
                                                        <span className="qm-corridor-index">0{idx + 1}</span>
                                                        <span className="qm-corridor-name">{zone.name}</span>
                                                    </div>
                                                    <div className="qm-corridor-bar-track">
                                                        <div 
                                                            className="qm-corridor-bar-fill" 
                                                            style={{ width: `${barWidth}%` }}
                                                        ></div>
                                                    </div>
                                                    <div className="qm-corridor-stats">
                                                        <span className="qm-corridor-count">{zone.count} <small>sites</small></span>
                                                        <span className="qm-corridor-pct">{zone.percent}%</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* 📋 Right Card: Commercial Matrix & Price Tiers */}
                                <div className="qm-card">
                                    <div className="qm-card-header">
                                        <div>
                                            <h3 className="qm-card-title">Commercial Specifications Matrix</h3>
                                            <p className="qm-card-desc">Rental tiers and display specifications breakdown</p>
                                        </div>
                                        <span className="qm-header-badge">307 Sites Priced</span>
                                    </div>

                                    <div className="qm-spec-grid">
                                        <div className="qm-spec-box">
                                            <span className="qm-spec-label">AVG MONTHLY RENT</span>
                                            <strong className="qm-spec-number">₹{avgMonthlyRate.toLocaleString('en-IN')}</strong>
                                            <small className="qm-spec-sub">per billboard</small>
                                        </div>
                                        <div className="qm-spec-box">
                                            <span className="qm-spec-label">TOTAL DISPLAY AREA</span>
                                            <strong className="qm-spec-number">{totalSqFt.toLocaleString('en-IN')}</strong>
                                            <small className="qm-spec-sub">sq. ft coverage</small>
                                        </div>
                                        <div className="qm-spec-box">
                                            <span className="qm-spec-label">MEDIA FORMAT</span>
                                            <strong className="qm-spec-number">Billboard / Unipole</strong>
                                            <small className="qm-spec-sub">100% Front Lit (FL)</small>
                                        </div>
                                        <div className="qm-spec-box">
                                            <span className="qm-spec-label">SITE CATEGORY</span>
                                            <strong className="qm-spec-number">Grade-A Prime</strong>
                                            <small className="qm-spec-sub">100% verified OOH</small>
                                        </div>
                                    </div>

                                    <div className="qm-tier-section">
                                        <span className="qm-tier-heading">Rental Bracket Distribution</span>
                                        <div className="qm-tier-stack">
                                            {overviewPriceTiers.map(tier => {
                                                const pct = ((tier.count / Math.max(totalHoardingsCount, 1)) * 100).toFixed(1);
                                                return (
                                                    <div key={tier.label} className="qm-tier-row">
                                                        <div className="qm-tier-left">
                                                            <span className="qm-color-dot" style={{ background: tier.color }}></span>
                                                            <span className="qm-tier-label">{tier.label}</span>
                                                        </div>
                                                        <div className="qm-tier-right">
                                                            <strong className="qm-tier-count">{tier.count} sites</strong>
                                                            <span className="qm-tier-pct">{pct}%</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                            </div>

                            {/* 📷 Field Audit Feed (Matched & Unmatched Sections) */}
                            <div className="qm-card">
                                <div className="qm-card-header" style={{ flexWrap: 'wrap', gap: '14px' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            <h3 className="qm-card-title">📅 Live Field Audit & Staff Uploads</h3>
                                            <span style={{ background: 'rgba(217, 119, 87, 0.12)', color: '#d97757', border: '1px solid rgba(217, 119, 87, 0.35)', padding: '3px 10px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#d97757' }}>
                                                    <path d="M4.5 12a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 0 3H6A1.5 1.5 0 0 1 4.5 12zm7.5-7.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-3 0V6A1.5 1.5 0 0 1 12 4.5zm-5.3 2.2a1.5 1.5 0 0 1 2.12 0l8.48 8.48a1.5 1.5 0 1 1-2.12 2.12L6.7 8.82a1.5 1.5 0 0 1 0-2.12zm10.6 0a1.5 1.5 0 0 1 0 2.12L8.82 17.3a1.5 1.5 0 1 1-2.12-2.12l8.48-8.48a1.5 1.5 0 0 1 2.12 0z"/>
                                                </svg>
                                                Claude AI Active (50m)
                                            </span>
                                        </div>
                                        <p className="qm-card-desc">
                                            Auto-matched 50m geofenced billboard photos & ground staff camera activity
                                        </p>
                                    </div>
                                    <div className="qm-header-controls">
                                        <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', gap: '4px' }}>
                                            <button 
                                                className={`qm-subtab-btn ${fieldAuditTab === 'matched' ? 'active' : ''}`}
                                                onClick={() => setFieldAuditTab('matched')}
                                                style={{
                                                    padding: '6px 14px',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    fontSize: '0.78rem',
                                                    fontWeight: 800,
                                                    cursor: 'pointer',
                                                    background: fieldAuditTab === 'matched' ? '#10b981' : 'transparent',
                                                    color: fieldAuditTab === 'matched' ? '#ffffff' : '#64748b',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                ✅ AI Auto-Matched ({matchedPhotoUpdates.length})
                                            </button>
                                            <button 
                                                className={`qm-subtab-btn ${fieldAuditTab === 'unmatched' ? 'active' : ''}`}
                                                onClick={() => setFieldAuditTab('unmatched')}
                                                style={{
                                                    padding: '6px 14px',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    fontSize: '0.78rem',
                                                    fontWeight: 800,
                                                    cursor: 'pointer',
                                                    background: fieldAuditTab === 'unmatched' ? '#f59e0b' : 'transparent',
                                                    color: fieldAuditTab === 'unmatched' ? '#ffffff' : '#64748b',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                ⚠️ Unmatched / Out-of-Range ({unmatchedPhotoUpdates.length})
                                            </button>
                                        </div>

                                        <button 
                                            className="qm-btn-primary"
                                            onClick={() => setIsAppDownloadModalOpen(true)}
                                            style={{
                                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                                color: '#ffffff',
                                                border: 'none',
                                                padding: '7px 14px',
                                                borderRadius: '10px',
                                                fontSize: '0.8rem',
                                                fontWeight: 800,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                                            }}
                                            title="Download Staff Mobile APK & Windows Desktop App"
                                        >
                                            <Download size={14} /> Download Apps (APK & PC)
                                        </button>
                                        <button 
                                            className="qm-btn-secondary"
                                            onClick={() => {
                                                if (navigator.clipboard) {
                                                    navigator.clipboard.writeText(window.location.origin + '/staff/upload');
                                                    alert('Staff mobile upload link copied to clipboard!');
                                                }
                                            }}
                                            title="Copy mobile camera upload link for ground staff"
                                        >
                                            <Share2 size={14} /> Copy Staff Link
                                        </button>
                                        <button className="qm-btn-secondary" onClick={() => setActiveTab('staff-review')}>
                                            <Camera size={14} /> Review Queue ({reviewQueue.length})
                                        </button>
                                    </div>
                                </div>

                                {fieldAuditTab === 'unmatched' && (
                                    <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '12px', padding: '10px 14px', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#b45309', fontWeight: 700 }}>
                                            <Clock3 size={16} />
                                            <span>⏳ <strong>2-Day Auto-Purge Active:</strong> Unmatched photos not assigned to a site within 48 hours are automatically purged.</span>
                                        </div>
                                        {purgedUnmatchedCount > 0 && (
                                            <span style={{ fontSize: '0.72rem', background: '#ffffff', padding: '3px 8px', borderRadius: '6px', color: '#78350f', border: '1px solid rgba(245, 158, 11, 0.3)', fontWeight: 800 }}>
                                                {purgedUnmatchedCount} purged
                                            </span>
                                        )}
                                    </div>
                                )}

                                {fieldAuditTab === 'matched' ? (
                                    matchedPhotoUpdates.length > 0 ? (
                                        <div className="recent-photo-grid">
                                            {matchedPhotoUpdates.slice(0, 16).map(upload => {
                                                const isAuto = upload.Status === 'AUTO_APPROVED' || upload.Decision === 'GEMINI_GPS_AUTO_MATCH' || upload.Decision === 'GPS_AUTO_MATCH';
                                                return (
                                                    <article className="recent-photo-card" key={upload.UploadId}>
                                                        <img 
                                                            src={upload.ImageURL} 
                                                            alt={upload.ApprovedSite || 'Staff upload'} 
                                                            onClick={() => setPreviewHoarding({ ImageURL: upload.ImageURL, City: 'Staff', "Location ": upload.ApprovedSite || 'Staff upload' })} 
                                                            style={{ cursor: 'pointer' }}
                                                        />
                                                        <div>
                                                            <strong>{upload.ApprovedSite || upload.SuggestedSite || 'History upload'}</strong>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '3px 0' }}>
                                                                {isAuto ? (
                                                                    <span style={{ color: '#10b981', fontWeight: 800, fontSize: '0.72rem' }}>
                                                                        ✨ AI Auto-Approved (50m)
                                                                    </span>
                                                                ) : (
                                                                    <span>{String(upload.Status || 'APPROVED').replaceAll('_', ' ')}</span>
                                                                )}
                                                            </div>
                                                            <small>{upload.CapturedAt ? new Date(upload.CapturedAt).toLocaleString('en-IN') : ''}</small>
                                                            
                                                            <button 
                                                                type="button"
                                                                onClick={() => setSelectedPinpointUpload(upload)}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    marginTop: '8px',
                                                                    padding: '4px 10px',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid #e2e8f0',
                                                                    background: '#f8fafc',
                                                                    color: '#3b82f6',
                                                                    fontSize: '0.74rem',
                                                                    fontWeight: 800,
                                                                    cursor: 'pointer'
                                                                }}
                                                                title="View staff exact pinpoint location on map"
                                                            >
                                                                <MapPin size={12} /> Pinpoint Location
                                                            </button>
                                                        </div>
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="qm-empty-state">
                                            <div className="qm-empty-icon-box">
                                                <Camera size={26} className="qm-camera-icon" />
                                            </div>
                                            <div className="qm-empty-text">
                                                <h4>All billboard photos verified & linked</h4>
                                                <p>
                                                    When ground staff captures a billboard photo on mobile, Claude AI will automatically match it within a 50m radius and save it straight into the site's History section without manual review.
                                                </p>
                                            </div>
                                            <div className="qm-empty-capsules">
                                                <span className="qm-status-capsule"><Check size={13} /> 50m Geofencing Ready</span>
                                                <span className="qm-status-capsule" style={{ color: '#d97757', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#d97757' }}>
                                                        <path d="M4.5 12a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 0 3H6A1.5 1.5 0 0 1 4.5 12zm7.5-7.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-3 0V6A1.5 1.5 0 0 1 12 4.5zm-5.3 2.2a1.5 1.5 0 0 1 2.12 0l8.48 8.48a1.5 1.5 0 1 1-2.12 2.12L6.7 8.82a1.5 1.5 0 0 1 0-2.12zm10.6 0a1.5 1.5 0 0 1 0 2.12L8.82 17.3a1.5 1.5 0 1 1-2.12-2.12l8.48-8.48a1.5 1.5 0 0 1 2.12 0z"/>
                                                    </svg>
                                                    Claude Vision AI Active
                                                </span>
                                                <span className="qm-status-capsule"><Check size={13} /> Mobile Camera Ready</span>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    unmatchedPhotoUpdates.length > 0 ? (
                                        <div className="recent-photo-grid">
                                            {unmatchedPhotoUpdates.map(upload => (
                                                <article className="recent-photo-card" key={upload.UploadId} style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}>
                                                    <img 
                                                        src={upload.ImageURL} 
                                                        alt={upload.SuggestedSite || 'Unmatched photo'} 
                                                        onClick={() => setPreviewHoarding({ ImageURL: upload.ImageURL, City: 'Staff', "Location ": upload.SuggestedSite || 'Unmatched' })} 
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                    <div>
                                                        <strong>{upload.SuggestedSite || 'No 50m Hoarding Match'}</strong>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '3px 0' }}>
                                                            <span style={{ color: '#f59e0b', fontWeight: 800, fontSize: '0.72rem' }}>
                                                                ⚠️ {upload.DistanceM ? `${Math.round(Number(upload.DistanceM))}m away` : 'Out of 50m range'}
                                                            </span>
                                                        </div>
                                                        <small>{upload.CapturedAt ? new Date(upload.CapturedAt).toLocaleString('en-IN') : ''}</small>
                                                        
                                                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                                                            <button 
                                                                type="button"
                                                                onClick={() => setSelectedPinpointUpload(upload)}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    padding: '4px 8px',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid #e2e8f0',
                                                                    background: '#f8fafc',
                                                                    color: '#3b82f6',
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: 800,
                                                                    cursor: 'pointer'
                                                                }}
                                                                title="View staff exact pinpoint location on map"
                                                            >
                                                                <MapPin size={11} /> Map
                                                            </button>
                                                            <button 
                                                                type="button"
                                                                onClick={() => setActiveTab('staff-review')}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    padding: '4px 8px',
                                                                    borderRadius: '8px',
                                                                    border: 'none',
                                                                    background: '#6c5dd3',
                                                                    color: '#ffffff',
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: 800,
                                                                    cursor: 'pointer'
                                                                }}
                                                                title="Manually assign to a hoarding site"
                                                            >
                                                                Assign
                                                            </button>
                                                        </div>
                                                    </div>
                                                </article>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="qm-empty-state">
                                            <div className="qm-empty-icon-box" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                                                <CheckCircle size={26} />
                                            </div>
                                            <div className="qm-empty-text">
                                                <h4>Zero Unmatched Photos</h4>
                                                <p>
                                                    All staff camera photos are matching automatically within 50m geofencing. There are no pending unmatched photos in the 48-hour window.
                                                </p>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>

                            {/* 🏆 Featured Prime Inventory Showcase */}
                            <div className="qm-card">
                                <div className="qm-card-header">
                                    <div>
                                        <h3 className="qm-card-title">Featured Prime Billboard Locations</h3>
                                        <p className="qm-card-desc">High-visibility inventory from Delhi Road & Begum Bridge</p>
                                    </div>
                                    <button className="qm-btn-secondary" onClick={() => openInventory('All')}>
                                        View All {totalHoardingsCount} Sites <ChevronRight size={14} />
                                    </button>
                                </div>

                                <div className="qm-showcase-grid">
                                    {primeHighlightSites.map((site, index) => {
                                        const siteImage = getImageUrl(site);
                                        const siteLocation = site["Locality Site Location"] || site["Location "] || site["Location"] || site["Site Name"] || `Site #${index + 1}`;
                                        const siteArea = site["Locality"] || site["Area"] || 'Meerut';
                                        const siteSize = site["Size (Large/Medium/Small)"] || site["Size"] || '40x20';
                                        const siteMedia = site["Media Format (Front Lit / Back Lit / Non Lit)"] || site["Type of Site (Unipole/Billboard)"] || 'Front Lit';
                                        const sitePrice = site["Rental Per Month"] || site["Avg Monthly Cost (INR)"] || '₹45,000';

                                        return (
                                            <div 
                                                key={index} 
                                                className="qm-showcase-card"
                                                onClick={() => setPreviewHoarding(site)}
                                                title="Click to open image preview"
                                            >
                                                <div className="qm-showcase-media">
                                                    <img src={siteImage} alt={siteLocation} className="qm-showcase-img" loading="lazy" />
                                                    <span className="qm-media-badge">{siteArea}</span>
                                                </div>
                                                <div className="qm-showcase-body">
                                                    <h4 className="qm-showcase-heading">{siteLocation}</h4>
                                                    <div className="qm-showcase-specs">
                                                        <span>{siteMedia}</span>
                                                        <span>{siteSize}</span>
                                                    </div>
                                                    <div className="qm-showcase-footer">
                                                        <span className="qm-showcase-price">
                                                            {typeof sitePrice === 'number' ? `₹${sitePrice.toLocaleString('en-IN')}` : (String(sitePrice).startsWith('₹') ? sitePrice : `₹${sitePrice}`)} <small>/mo</small>
                                                        </span>
                                                        <button className="qm-btn-preview" onClick={(e) => { e.stopPropagation(); setPreviewHoarding(site); }}>
                                                            <Eye size={13} /> Preview
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                        </div>
                    </div>
                )}

                {activeTab === 'sheet-editor' && (
                    <div className="dashboard-view animate-in">
                        <div className="sheet-editor-panel" ref={sheetEditorRef}>
                            <div className="sheet-editor-header">
                                <div>
                                    <h3>Hoardings Master Sheet</h3>
                                    <p>{visibleSheetColumns.length} visible columns, {hiddenSheetColumnCount} hidden backend columns, {sheetRows.length} rows</p>
                                    {sheetLastSync && <span>Last loaded: {new Date(sheetLastSync).toLocaleString('en-IN')}</span>}
                                </div>
                                <div className="sheet-editor-actions">
                                    <button className="sheet-fullscreen-button" onClick={toggleSheetFullscreen} title={isSheetFullscreen ? 'Exit fullscreen' : 'Open Excel workspace in fullscreen'}>
                                        {isSheetFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                                        {isSheetFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                                    </button>
                                    <button className="btn-primary-admin" onClick={handleSaveSheetGrid} disabled={!sheetDirty || sheetSaving || sheetLoading}>
                                        <Save size={17} /> {sheetSaving ? 'Saving...' : 'Save Sheet'}
                                    </button>
                                </div>
                            </div>

                            <div className="sheet-ribbon">
                                <div className="sheet-ribbon-group">
                                    <button onClick={undoSheetChange} disabled={!sheetHistory.length || sheetSaving}><Undo2 size={16} /> Undo</button>
                                    <button onClick={redoSheetChange} disabled={!sheetFuture.length || sheetSaving}><Redo2 size={16} /> Redo</button>
                                    <button onClick={loadSheetEditor} disabled={sheetLoading || sheetSaving}><RefreshCw size={16} className={sheetLoading ? 'animate-spin' : ''} /> Reload</button>
                                </div>
                                <div className="sheet-ribbon-group">
                                    <button onClick={() => addSheetRow(selectedSheetCell.row, 'before')} disabled={sheetLoading || sheetSaving}><Plus size={16} /> Row Above</button>
                                    <button onClick={() => addSheetRow(selectedSheetCell.row, 'after')} disabled={sheetLoading || sheetSaving}><Plus size={16} /> Row Below</button>
                                    <button onClick={() => addSheetColumn(selectedSheetCell.col, 'before')} disabled={sheetLoading || sheetSaving}><Plus size={16} /> Col Left</button>
                                    <button onClick={() => addSheetColumn(selectedSheetCell.col, 'after')} disabled={sheetLoading || sheetSaving}><Plus size={16} /> Col Right</button>
                                </div>
                                <div className="sheet-ribbon-group">
                                    <button onClick={cutSheetSelection} disabled={!sheetRows.length || sheetLoading} title="Cut (Ctrl+X)"><Scissors size={16} /> Cut</button>
                                    <button onClick={copySheetSelection} disabled={!sheetRows.length || sheetLoading}><Copy size={16} /> Copy</button>
                                    <button onClick={clearSheetSelection} disabled={sheetLoading || sheetSaving}><X size={16} /> Clear Selection</button>
                                    <button onClick={deleteSheetSelection} disabled={!sheetRows.length || sheetLoading || sheetSaving || (sheetSelection.type === 'column' && sheetHeaders.length <= 1)}><Trash2 size={16} /> Delete Selection</button>
                                    <button onClick={exportSheetCsv} disabled={!sheetHeaders.length}><FileDown size={16} /> CSV</button>
                                </div>
                                <div className="sheet-save-state-wrap">
                                    <span className={`sheet-save-state ${sheetDirty ? 'dirty' : ''}`}>
                                        {sheetDirty ? 'Unsaved changes' : 'All changes saved'}
                                    </span>
                                </div>
                            </div>

                            <div className="sheet-formula-bar">
                                <div className="sheet-name-box">{selectedSheetAddress}</div>
                                <div className="sheet-formula-input">
                                    <span>fx</span>
                                    <input
                                        value={selectedSheetValue}
                                        onChange={(e) => updateSheetCellLive(selectedSheetCell.row, selectedSheetCell.col, e.target.value)}
                                        onFocus={rememberSheetState}
                                    />
                                </div>
                                <div className="sheet-search-box">
                                    <Search size={17} />
                                    <input
                                        value={sheetSearch}
                                        onChange={(e) => setSheetSearch(e.target.value)}
                                        placeholder="Find in sheet..."
                                    />
                                </div>
                            </div>

                            <div className="sheet-grid-shell" onKeyDown={handleSheetKeyDown}>
                                {sheetLoading ? (
                                    <div className="sheet-empty-state">Loading sheet...</div>
                                ) : (
                                    <table className="sheet-grid-table">
                                        <thead>
                                            <tr>
                                                <th className={`sheet-row-number ${sheetSelection.type === 'sheet' ? 'selected-axis' : ''}`}>
                                                    <button
                                                        type="button"
                                                        className="sheet-corner-select"
                                                        onClick={selectVisibleSheet}
                                                        title="Select visible sheet"
                                                    >
                                                        #
                                                    </button>
                                                </th>
                                                {visibleSheetColumns.map(({ header, index: colIndex, label, isSite }) => (
                                                    <th key={`header-${colIndex}`} className={`${isSite ? 'sheet-site-column' : ''} ${isSheetColumnSelected(colIndex) ? 'selected-axis' : ''}`}>
                                                        <button
                                                            type="button"
                                                            className="sheet-column-letter"
                                                            onClick={() => selectSheetColumn(colIndex)}
                                                            title={`Select column ${label}`}
                                                        >
                                                            {label}
                                                        </button>
                                                        <span style={{ display: "inline-flex", alignItems: "center", gap: "1px", marginLeft: "2px" }}>
                                                            <button type="button" onClick={(e) => { e.stopPropagation(); toggleSort(colIndex); }} title="Sort" style={{ fontSize: "10px", padding: "0 2px", background: sortConfig && sortConfig.col === colIndex ? "#dbeafe" : "transparent", border: "none", cursor: "pointer", borderRadius: "2px", color: sortConfig && sortConfig.col === colIndex ? "#1d4ed8" : "#94a3b8", lineHeight: 1.5 }}>
                                                                {sortConfig && sortConfig.col === colIndex ? (sortConfig.direction === "asc" ? "▲" : "▼") : "⇅"}
                                                            </button>
                                                            <button type="button" onClick={(e) => { e.stopPropagation(); setFilterDropdownCol(filterDropdownCol === colIndex ? null : colIndex); }} title="Filter" style={{ fontSize: "10px", padding: "0 2px", background: filterConfig[colIndex] ? "#fef3c7" : "transparent", border: "none", cursor: "pointer", borderRadius: "2px", color: filterConfig[colIndex] ? "#b45309" : "#94a3b8", lineHeight: 1.5 }}>
                                                                ⏷
                                                            </button>
                                                        </span>
                                                        <div className="sheet-header-cell" style={{ position: 'relative' }}>
                                                            {filterDropdownCol === colIndex && (
                                                                <div className="sheet-filter-dropdown" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '200px', overflowY: 'auto', minWidth: '140px' }}>
                                                                    {getFilterValues(colIndex).map((v, i) => (
                                                                        <button key={i} onClick={(e) => { e.stopPropagation(); applyFilter(colIndex, v); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 10px', fontSize: '11px', border: 'none', background: (v === '__ALL__' && !filterConfig[colIndex]) || filterConfig[colIndex] === v ? '#eff6ff' : '#fff', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                                                                            {v === '__ALL__' ? '✦ Show All' : v}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <input
                                                                value={header}
                                                                onChange={(e) => updateSheetHeader(colIndex, e.target.value)}
                                                                title="Edit header"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => deleteSheetColumn(colIndex)}
                                                                title="Delete column"
                                                                aria-label={`Delete column ${header || colIndex + 1}`}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visibleSheetRows.map(({ row, index }) => (
                                                <tr key={`sheet-row-${index}`}>
                                                    <td className={`sheet-row-number ${isSheetRowSelected(index) ? 'selected-axis' : ''}`} style={{ position: 'relative', ...(rowHeights[index] ? { height: rowHeights[index] } : {}) }}>
                                                        <div>
                                                            <button
                                                                type="button"
                                                                className="sheet-row-select-button"
                                                                onClick={() => selectSheetRow(index)}
                                                                title={`Select row ${index + 2}`}
                                                            >
                                                                {index + 2}
                                                            </button>
                                                            <button type="button" onClick={() => deleteSheetRow(index)} title="Delete row">
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                    {visibleSheetColumns.map(({ header, index: colIndex, isSite }) => {
                                                        const value = row[colIndex] || '';
                                                        const imageLike = isImageLikeHeader(header) || isUrlValue(value);
                                                        const selected = isSheetCellSelected(index, colIndex);
                                                        return (
                                                            <td key={`cell-${index}-${colIndex}`} className={`${imageLike ? 'sheet-link-data-cell' : ''} ${selected ? 'selected' : ''} ${isSite ? 'sheet-site-column' : ''}`}>
                                                                {imageLike && isUrlValue(value) && (
                                                                    <a href={value} target="_blank" rel="noreferrer">View</a>
                                                                )}
                                                                <textarea
                                                                    value={value}
                                                                    onFocus={() => {
                                                                        selectSheetCell(index, colIndex);
                                                                        rememberSheetState();
                                                                    }}
                                                                    onClick={() => selectSheetCell(index, colIndex)}
                                                                    onContextMenu={(e) => handleContextMenu(e, index, colIndex)}
                                                                    onPaste={(e) => handleSheetPaste(e, index, colIndex)}
                                                                    onChange={(e) => updateSheetCellLive(index, colIndex, e.target.value)}
                                                                    rows={1}
                                                                    aria-label={`${header || 'Column'} row ${index + 2}`}
                                                                />
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                            {visibleSheetRows.length === 0 && (
                                                <tr>
                                                    <td className="sheet-empty-state" colSpan={Math.max(visibleSheetColumns.length + 1, 2)}>
                                                        No rows match this search.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {contextMenu && (
                                <div className="sheet-context-menu" style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 10000, background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: '4px 0', minWidth: '180px', fontSize: '12px' }}>
                                    <button onClick={() => { copySheetSelection(); closeContextMenu(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>📋 Copy <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '10px' }}>Ctrl+C</span></button>
                                    <button onClick={() => { cutSheetSelection(); closeContextMenu(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>✂️ Cut <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '10px' }}>Ctrl+X</span></button>
                                    <button onClick={() => { clearSheetSelection(); closeContextMenu(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>🗑️ Clear <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '10px' }}>Del</span></button>
                                    <div style={{ height: '1px', background: '#e5e7eb', margin: '4px 0' }} />
                                    <button onClick={() => { addSheetRow(contextMenu.row, 'before'); closeContextMenu(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>➕ Insert Row Above</button>
                                    <button onClick={() => { addSheetRow(contextMenu.row, 'after'); closeContextMenu(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>➕ Insert Row Below</button>
                                    <button onClick={() => { addSheetColumn(contextMenu.col, 'before'); closeContextMenu(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>➕ Insert Column Left</button>
                                    <button onClick={() => { addSheetColumn(contextMenu.col, 'after'); closeContextMenu(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>➕ Insert Column Right</button>
                                    <div style={{ height: '1px', background: '#e5e7eb', margin: '4px 0' }} />
                                    <button onClick={() => { toggleSort(contextMenu.col); closeContextMenu(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>↕️ Sort Column</button>
                                    <button onClick={() => { setFilterDropdownCol(contextMenu.col); closeContextMenu(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>🔽 Filter Column</button>
                                    <button onClick={() => { deleteSheetRow(contextMenu.row); closeContextMenu(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', color: '#ef4444' }}>🗑️ Delete Row</button>
                                    <button onClick={() => { deleteSheetColumn(contextMenu.col); closeContextMenu(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', color: '#ef4444' }}>🗑️ Delete Column</button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'daily-update' && (
                    <div className="dashboard-view animate-in">
                        <div
                            className={`upload-zone-container ${isDragging ? 'dragging' : ''}`}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                        >
                            <div className="upload-header">
                                <h3>📸 Daily Proof of Execution</h3>
                                <p>Upload raw site images. AI will detect the location and status automatically.</p>
                            </div>

                            <div className="upload-actions-bar">
                                <label className="upload-trigger-btn">
                                    <Plus size={20} /> Add Images
                                    <input type="file" multiple accept="image/*" onChange={handleDailyImageSelect} style={{ display: 'none' }} />
                                </label>
                                {dailyImages.length > 0 && (
                                    <button className="ai-process-btn" onClick={processImagesWithAI}>
                                        <Zap size={20} fill="currentColor" /> Auto-Detect with AI
                                    </button>
                                )}
                                {dailyImages.some(img => img.matchFailed && !img.uploaded) && (
                                    <button className="ai-process-btn dump-btn" onClick={dumpUnmatchedImages} title="Move unmatched images to dumping log">
                                        <XCircle size={20} /> Dump All Red
                                    </button>
                                )}
                            </div>

                            {dailyImages.length > 0 ? (
                                <div className="daily-images-grid">
                                    {dailyImages.map((img, idx) => (
                                        <div key={idx} className={`daily-card ${img.uploaded ? 'uploaded' : ''} ${img.matchFailed && !img.uploaded ? 'match-failed' : ''}`}>
                                            <div className="daily-images-container">
                                                <div className="img-preview" title="New Captured Image" style={{ backgroundImage: `url(${img.preview})` }}>
                                                    <span className="img-label">NEW</span>
                                                    {img.aiLoading && <div className="ai-spinner-overlay"><div className="spinner"></div></div>}
                                                    {img.uploaded && <div className="uploaded-overlay"><CheckCircle size={30} color="#4ade80" /></div>}
                                                    {img.matchFailed && !img.uploaded && (
                                                        <div className="match-failed-overlay">
                                                            <XCircle size={30} color="#f87171" />
                                                        </div>
                                                    )}
                                                </div>

                                                {img.matchedLocation && (
                                                    <div className="img-preview ref-image" title="Old Reference Image" style={{
                                                        backgroundImage: `url(${hoardings.find(h => (h["Locality Site Location"] || h["Location "] || h.Location) === img.matchedLocation)?.ImageURL})`,
                                                        backgroundSize: 'cover',
                                                        backgroundPosition: 'center'
                                                    }}>
                                                        <span className="img-label ref">REF</span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="card-controls">
                                                <div className="control-group">
                                                    <label>Location Match</label>
                                                    <select
                                                        value={img.matchedLocation || ""}
                                                        onChange={(e) => {
                                                            const newImages = [...dailyImages];
                                                            newImages[idx].matchedLocation = e.target.value;
                                                            setDailyImages(newImages);
                                                        }}
                                                        disabled={img.uploaded}
                                                    >
                                                        <option value="">-- Select Location --</option>
                                                        {hoardings.map((h, i) => {
                                                            const siteName = h["Locality Site Location"] || h["Location "] || h.Location || `Site #${i + 1}`;
                                                            return (
                                                                <option key={i} value={siteName}>{siteName}</option>
                                                            );
                                                        })}
                                                    </select>
                                                </div>

                                                <div className="control-group">
                                                    <label>Status</label>
                                                    <div className="status-toggles">
                                                        <button
                                                            className={`toggle-btn ${img.status === 'Available' ? 'active-green' : ''}`}
                                                            onClick={() => {
                                                                const newImages = [...dailyImages];
                                                                newImages[idx].status = 'Available';
                                                                setDailyImages(newImages);
                                                            }}
                                                            disabled={img.uploaded}
                                                        >Available</button>
                                                        <button
                                                            className={`toggle-btn ${img.status === 'Occupied' ? 'active-red' : ''}`}
                                                            onClick={() => {
                                                                const newImages = [...dailyImages];
                                                                newImages[idx].status = 'Occupied';
                                                                setDailyImages(newImages);
                                                            }}
                                                            disabled={img.uploaded}
                                                        >Occupied</button>
                                                    </div>
                                                </div>

                                                <div className="control-group ai-reasoning-box">
                                                    <div className="ai-meta-pills">
                                                        {img.analysis?.billboardType && <span className="meta-pill">{img.analysis.billboardType}</span>}
                                                        {img.analysis?.keyLandmarks?.slice(0, 2).map((l, k) => <span key={k} className="meta-pill landmark">{l}</span>)}
                                                    </div>
                                                    <label>AI Confidence: {Math.round((img.confidence || 0) * 100)}%</label>
                                                    {img.reasoning && <p className="ai-reasoning-text"><span>Logic:</span> {img.reasoning}</p>}

                                                    {img.matchedLocation && (() => {
                                                        const site = hoardings.find(h => (h["Locality Site Location"] || h["Location "] || h.Location) === img.matchedLocation);
                                                        if (site && site.Latitude && site.Longitude) {
                                                            return (
                                                                <a
                                                                    href={`https://www.google.com/maps?q=${site.Latitude},${site.Longitude}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="view-on-maps-link"
                                                                >
                                                                    📍 View on Maps
                                                                </a>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>

                                                {!img.uploaded && (
                                                    <button
                                                        className="upload-single-btn"
                                                        onClick={() => uploadDailyUpdate(idx)}
                                                        disabled={!img.matchedLocation || img.uploading}
                                                    >
                                                        {img.uploading ? 'Syncing...' : 'Confirm & Sync'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="empty-upload-state">
                                    <UploadCloud size={48} color="#ccc" />
                                    <p>Drag and drop images here or use the "Add Images" button</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'staff-review' && (
                    <div className="staff-review-view animate-in">
                        <div className="staff-review-header">
                            <div>
                                <h3>Live Field Audit & Staff Uploads</h3>
                                <p>Real-time GPS geofenced photos, 50m auto-matching, and audit approval queue.</p>
                            </div>
                            <a className="staff-permanent-link" href={staffUploadLink} target="_blank" rel="noreferrer">
                                <ExternalLink size={16} /> Open Staff Camera Link
                            </a>
                        </div>
                        {reviewQueue.length > 0 ? (
                            <>
                            <datalist id="staff-site-options">
                                {hoardings.map(site => (
                                    <option value={site["Location "]} key={`${site.City}-${site["Location "]}`}>{site.City}</option>
                                ))}
                            </datalist>
                            <div className="staff-review-grid">
                                {reviewQueue.map(upload => {
                                    const selectedSite = reviewSelections[upload.UploadId] || upload.SuggestedSite || '';
                                    const preview = staffImagePreviews[upload.UploadId];
                                    const reviewImageUrl = preview?.previewUrl || upload.ImageURL;
                                    return (
                                        <article className="staff-review-card" key={upload.UploadId}>
                                            <button className="staff-review-image" onClick={() => setPreviewHoarding({ ImageURL: reviewImageUrl, City: 'Staff', "Location ": selectedSite || 'Review photo' })}>
                                                <img src={reviewImageUrl} alt="Staff capture" />
                                            </button>
                                            <div className="staff-review-body">
                                                <div className="staff-review-meta">
                                                    <span>{upload.Decision?.replaceAll('_', ' ')}</span>
                                                    <small>{upload.CapturedAt ? new Date(upload.CapturedAt).toLocaleString('en-IN') : ''}</small>
                                                </div>
                                                <a className="staff-map-link" href={`https://www.google.com/maps?q=${upload.Latitude},${upload.Longitude}`} target="_blank" rel="noreferrer">
                                                    <MapPin size={15} /> GPS Map
                                                </a>
                                                <label>
                                                    Match Site
                                                    <input
                                                        list="staff-site-options"
                                                        value={selectedSite}
                                                        placeholder="Search or enter site name"
                                                        onChange={(event) => setReviewSelections(prev => ({ ...prev, [upload.UploadId]: event.target.value }))}
                                                    />
                                                </label>
                                                <div className="nearby-sites">
                                                    {(upload.NearbySites || []).slice(0, 4).map(site => {
                                                        const hoarding = hoardings.find(item => item["Location "] === site.siteName);
                                                        return (
                                                            <button type="button" key={site.siteName} onClick={() => setReviewSelections(prev => ({ ...prev, [upload.UploadId]: site.siteName }))}>
                                                                <img src={getImageUrl(hoarding)} alt={site.siteName} />
                                                                <span>{site.distanceM}m</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <div className="staff-review-actions">
                                                    <button className="approve" onClick={() => handleStaffReview(upload, 'approve')}>Approve & Update</button>
                                                    <button className="history" onClick={() => handleStaffReview(upload, 'historyOnly')}>History Only</button>
                                                    <button className="reject" onClick={() => handleStaffReview(upload, 'reject')}>Reject</button>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                            </>
                        ) : <div className="staff-review-empty"><CheckCircle size={42} /><h3>Review queue clear hai</h3><p>Adjacent ya doubtful photos yahan automatically aayengi.</p></div>}
                    </div>
                )}

                {activeTab === 'inventory' && (
                    <div className="inventory-view-container animate-in">
                        <div className="inventory-card">
                            <div className="inventory-header" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', width: '100%' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>Master Asset Inventory</h3>
                                        <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '0.86rem' }}>{filteredInventory.length} active hoarding assets across operational regions</p>
                                    </div>
                                    <div className="inventory-actions">
                                        <button className="btn-primary-admin" style={{ background: '#6c5dd3' }} onClick={() => { 
                                            setFormData({}); 
                                            setSelectedAssetFile(null); 
                                            setIsAddModalOpen(true); 
                                        }}>
                                            <Plus size={18} /> Add New Asset
                                        </button>
                                        <button className="btn-icon" title="Export Inventory" onClick={() => exportProposalExcel(hoardings)}><Download size={18} /></button>
                                        <button
                                            className={`btn-icon ${isInventoryFilterOpen ? 'active-accent' : ''}`}
                                            onClick={() => setIsInventoryFilterOpen(!isInventoryFilterOpen)}
                                            title="Toggle Filters"
                                        >
                                            <Filter size={18} />
                                        </button>
                                        <button
                                            className="btn-primary-admin proposal-download-btn"
                                            disabled={selectedProposalSites.length === 0}
                                            onClick={handleDownloadProposal}
                                            title={selectedProposalSites.length === 0 ? 'Select sites first' : 'Download selected proposal'}
                                        >
                                            <Download size={18} /> Proposal ({selectedProposalSites.length})
                                        </button>
                                    </div>
                                </div>

                                {/* 🔍 Universal Multi-field Search Bar */}
                                <div style={{
                                    background: '#f3f4f6',
                                    borderRadius: '9999px',
                                    padding: '10px 20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    width: '100%',
                                    maxWidth: '680px',
                                    marginTop: '4px',
                                    border: '1px solid #e5e7eb'
                                }}>
                                    <Search size={18} color="#9ca3af" />
                                    <input 
                                        type="text"
                                        placeholder="Search location, city, client name, facing, area, size or any keyword..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            outline: 'none',
                                            width: '100%',
                                            fontSize: '0.92rem',
                                            color: '#111827',
                                            fontWeight: 500
                                        }}
                                    />
                                    {searchTerm && (
                                        <button 
                                            onClick={() => setSearchTerm('')} 
                                            style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', background: 'transparent', border: 'none' }}
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            </div>

                            {isInventoryFilterOpen && (
                                <div className="inventory-filters animate-in">
                                    <MultiSelectFilter
                                        label="Region / City"
                                        options={inventoryCities}
                                        selected={inventoryCityFilter}
                                        onChange={(val) => {
                                            setInventoryCityFilter(val);
                                            setInventoryLocalityFilter(['All']);
                                        }}
                                    />
                                    <div className="inventory-filter-group">
                                        <label>Live Status</label>
                                        <select
                                            value={inventoryStatusFilter}
                                            onChange={(e) => setInventoryStatusFilter(e.target.value)}
                                        >
                                            {inventoryStatuses.map(status => (
                                                <option key={status} value={status}>{status}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="inventory-filter-group">
                                        <label>Campaign Start Date</label>
                                        <input 
                                            type="date" 
                                            value={filterStartDate} 
                                            onChange={(e) => setFilterStartDate(e.target.value)}
                                            style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.84rem', outline: 'none' }}
                                        />
                                    </div>
                                    <div className="inventory-filter-group">
                                        <label>Campaign End Date</label>
                                        <input 
                                            type="date" 
                                            value={filterEndDate} 
                                            onChange={(e) => setFilterEndDate(e.target.value)}
                                            style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.84rem', outline: 'none' }}
                                        />
                                    </div>
                                    <MultiSelectFilter
                                        label="Locality"
                                        options={inventoryLocalities}
                                        selected={inventoryLocalityFilter}
                                        onChange={setInventoryLocalityFilter}
                                    />
                                    <MultiSelectFilter
                                        label="Media Format"
                                        options={inventoryMediaFormats}
                                        selected={inventoryMediaFilter}
                                        onChange={setInventoryMediaFilter}
                                    />
                                    <MultiSelectFilter
                                        label="Size"
                                        options={inventorySizes}
                                        selected={inventorySizeFilter}
                                        onChange={setInventorySizeFilter}
                                    />
                                    <MultiSelectFilter
                                        label="Site Category"
                                        options={inventoryCategories}
                                        selected={inventoryCategoryFilter}
                                        onChange={setInventoryCategoryFilter}
                                    />
                                    <div className="inventory-filter-group">
                                        <label>Price Range</label>
                                        <select value={inventoryPriceFilter} onChange={(e) => setInventoryPriceFilter(e.target.value)}>
                                            {inventoryPriceRanges.map(([value, label]) => (
                                                <option key={value} value={value}>{label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <button
                                            className="btn-reset-filters"
                                            onClick={() => {
                                                setInventoryCityFilter(['All']);
                                                setInventoryStatusFilter('All');
                                                setFilterStartDate('');
                                                setFilterEndDate('');
                                                setInventoryLocalityFilter(['All']);
                                                setInventoryMediaFilter(['All']);
                                                setInventorySizeFilter(['All']);
                                                setInventoryCategoryFilter(['All']);
                                                setInventoryPriceFilter('All');
                                                setSearchTerm('');
                                            }}
                                        >
                                            Reset Filters
                                        </button>
                                        
                                        <button
                                            className="btn-danger-admin"
                                            style={{ padding: '8px 14px', fontSize: '0.84rem' }}
                                            disabled={!inventoryCityFilter || inventoryCityFilter.length === 0 || inventoryCityFilter.includes('All')}
                                            title={inventoryCityFilter.includes('All') ? 'Choose a city filter first' : `Delete selected city data`}
                                            onClick={() => setBulkDeleteTarget({ type: 'city', city: inventoryCityFilter[0] })}
                                        >
                                            <Trash2 size={15} /> Delete {inventoryCityFilter.includes('All') || inventoryCityFilter.length === 0 ? 'City' : inventoryCityFilter.join(', ')}
                                        </button>

                                        <button
                                            className="btn-danger-admin strong"
                                            style={{ padding: '8px 14px', fontSize: '0.84rem' }}
                                            onClick={() => setBulkDeleteTarget({ type: 'all' })}
                                            title="Delete all hoarding data"
                                        >
                                            <Trash2 size={15} /> Delete All
                                        </button>
                                    </div>
                                    <div className="proposal-header-picker">
                                        <div className="proposal-header-picker-top">
                                            <span>Proposal Headers</span>
                                            <div>
                                                <button type="button" onClick={() => setSelectedProposalHeaders(PROPOSAL_COLUMNS.map(([label]) => label))}>All</button>
                                                <button type="button" onClick={() => setSelectedProposalHeaders(['Image Link', 'S. No.', 'City', 'Locality', 'Location ', 'Traffic From', 'Traffic To', 'Size (Large/ Medium/ Small)', 'Avg. monthly Cost', 'STATUS'])}>Basic</button>
                                            </div>
                                        </div>
                                        <div className="proposal-header-options">
                                            {PROPOSAL_COLUMNS.map(([label]) => (
                                                <label key={label}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedProposalHeaders.includes(label)}
                                                        onChange={() => toggleProposalHeader(label)}
                                                    />
                                                    <span>{label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="table-wrapper">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th className="select-col">
                                                <input
                                                    type="checkbox"
                                                    checked={isAllFilteredSelected}
                                                    onChange={toggleAllFilteredSelection}
                                                    aria-label="Select all filtered sites"
                                                />
                                            </th>
                                            <th className="image-col">Image</th>
                                            <th>Media Asset Details</th>
                                            <th>Market / Region</th>
                                            <th>Commercials</th>
                                            <th>Live Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredInventory.map((h, i) => (
                                            <tr key={i}>
                                                <td className="select-col">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedProposalKeys.includes(getProposalKey(h, i))}
                                                        onChange={() => toggleProposalSelection(getProposalKey(h, i))}
                                                        aria-label={`Select ${h["Location "]}`}
                                                    />
                                                </td>
                                                <td className="image-col">
                                                    <img
                                                        className="inventory-thumbnail"
                                                        src={getImageUrl(h)}
                                                        alt={h["Location "]}
                                                        loading="lazy"
                                                        onClick={() => setPreviewHoarding(h)}
                                                        title="Open full screen preview"
                                                        onError={(e) => {
                                                            e.target.src = 'https://placehold.co/120x84?text=No+Image';
                                                        }}
                                                    />
                                                </td>
                                                <td>
                                                    <div 
                                                        className="asset-title" 
                                                        style={{ cursor: 'pointer', transition: 'color 0.2s', fontWeight: '700', fontSize: '14px' }}
                                                        onClick={() => navigate(`/${encodeURIComponent(h.City || 'city')}/${encodeURIComponent(h["Location "] || h.Location || h["Locality Site Location"] || '')}`)}
                                                        title="Open site detail page"
                                                    >
                                                        {h["Locality Site Location"] || h["Location "] || h["Location"] || "Hoarding Site"}
                                                    </div>
                                                    <div className="asset-meta" style={{ marginTop: '3px', fontSize: '12px', color: '#6366f1' }}>
                                                        {h.Facing && <span style={{ fontWeight: '600' }}>Facing: {h.Facing}</span>}
                                                        {h["Traffic From"] && <span style={{ color: '#64748b' }}> • {h["Traffic From"]} ➔ {h["Traffic To"] || ''}</span>}
                                                        {(h.Latitude && h.Longitude) && <span style={{ color: '#94a3b8', fontSize: '11px' }}> • 📍 {h.Latitude}, {h.Longitude}</span>}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="asset-region" style={{ fontWeight: '700', color: '#1e293b', fontSize: '13px' }}>
                                                        {h.City || 'Meerut'}
                                                    </div>
                                                    <div className="asset-meta" style={{ marginTop: '2px', fontSize: '12px', color: '#475569' }}>
                                                        <span style={{ fontWeight: '600', color: '#334155' }}>{h["Locality"] || h["Area"] || h.City}</span>
                                                        {(h.Width && h.Height) ? ` • ${h.Width}x${h.Height} ft` : (h.Size ? ` • ${h.Size}` : '')}
                                                        {(h["Type of Site (Unipole/Billboard)"] || h["Type"] || h.Media) ? ` • ${h["Type of Site (Unipole/Billboard)"] || h["Type"] || h.Media}` : ''}
                                                    </div>
                                                </td>
                                                <td className="asset-price">
                                                    ₹{Number(h["Avg Monthly Cost (INR)"] || h["Rental Per Month"] || 0).toLocaleString('en-IN')}
                                                    <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', fontWeight: '500' }}>/ month</span>
                                                    {h.Facing && (
                                                        <span style={{ fontSize: '10px', color: '#4338ca', background: '#e0e7ff', padding: '1px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '3px', fontWeight: '600' }}>
                                                            {h.Facing}
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className={`status-pill ${(h.STATUS === 'Booked' || h.STATUS === 'Occupied') ? 'occupied' : 'available'}`}>
                                                        {(h.STATUS === 'Booked' || h.STATUS === 'Occupied') ? 'Booked' : 'Available'}
                                                    </span>
                                                    {(h.STATUS === 'Booked' || h.STATUS === 'Occupied') && (
                                                        <div className="table-booking-info" style={{ fontSize: '10px', marginTop: '4px', color: '#808191' }}>
                                                            {h.BookedBy && <div title="Client Name">👤 {h.BookedBy}</div>}
                                                            {h.BookingStart && <div title="Start Date">Start: {new Date(h.BookingStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>}
                                                            {h.BookingEnd && <div title="Expiry Date">📅 {new Date(h.BookingEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="action-row">
                                                        <button 
                                                            className="btn-icon-small view" 
                                                            onClick={() => navigate(`/${encodeURIComponent(h.City || 'city')}/${encodeURIComponent(h["Location "] || h.Location || h["Locality Site Location"] || '')}`)}
                                                            title="View Detail Page"
                                                            style={{ color: '#6c5dd3' }}
                                                        >
                                                            <ExternalLink size={16} />
                                                        </button>
                                                        <button 
                                                            className="btn-icon-small edit" 
                                                            onClick={() => openEditModal(h)}
                                                            title="Edit Details"
                                                        >
                                                            <Settings size={16} />
                                                        </button>
                                                        <button
                                                            className={`btn-icon-small ${(h.STATUS === 'Booked' || h.STATUS === 'Occupied') ? 'occupied-btn' : 'available-btn'}`}
                                                            onClick={() => toggleStatus(h)}
                                                            title={(h.STATUS === 'Booked' || h.STATUS === 'Occupied') ? 'Mark as Available' : 'Mark as Booked'}
                                                        >
                                                            {(h.STATUS === 'Booked' || h.STATUS === 'Occupied') ? <CheckCircle size={16} /> : <Calendar size={16} />}
                                                        </button>
                                                        <button 
                                                            className="btn-icon-small delete" 
                                                            onClick={() => {
                                                                const siteTitle = h["Locality Site Location"] || h["Location "] || h.Location || h.site_name || (h.City ? `${h.City} Site` : "Hoarding Site");
                                                                setDeleteTarget({
                                                                    site: h,
                                                                    index: i,
                                                                    name: siteTitle,
                                                                    city: h.City || h.city || '',
                                                                    locality: h.Locality || h.Area || ''
                                                                });
                                                            }}
                                                            title="Delete Site"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {selectedProposalSites.length > 0 && (
                                <div className="proposal-panel">
                                    <div className="proposal-panel-header">
                                        <div>
                                            <h4>Client Proposal Selection</h4>
                                            <p>{selectedProposalSites.length} selected site(s). Export uses clean image links, hides Drive/ImageURL columns, and includes {selectedProposalHeaders.length} selected header(s).</p>
                                        </div>
                                        <div className="proposal-panel-actions">
                                            <button className="btn-reset-filters" onClick={() => setSelectedProposalKeys([])}>Clear</button>
                                            <button className="btn-primary-admin" onClick={handleDownloadProposal}>
                                                <Download size={18} /> Download Excel
                                            </button>
                                        </div>
                                    </div>
                                    <div className="proposal-preview-table">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>S. No.</th>
                                                    <th>City</th>
                                                    <th>Locality</th>
                                                    <th>Location</th>
                                                    <th>Traffic</th>
                                                    <th>Status</th>
                                                    <th>Booking</th>
                                                    <th>Cost</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedProposalSites.map((site, idx) => (
                                                    <tr key={`${site["Location "]}-${idx}`}>
                                                        <td>{idx + 1}</td>
                                                        <td>{site.City}</td>
                                                        <td>{site["Area"]}</td>
                                                        <td>{site["Location "]}</td>
                                                        <td>{[site["Traffic From"], site["Traffic To"]].filter(Boolean).join(' to ')}</td>
                                                        <td>{site.STATUS || 'Available'}</td>
                                                        <td>
                                                            {site.STATUS === 'Occupied'
                                                                ? [site.BookingStart, site.BookingEnd].filter(Boolean).join(' to ') || site.BookedBy || 'Occupied'
                                                                : 'Available'}
                                                        </td>
                                                        <td>₹{Number(site["Rental Per Month"] || 0).toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'clients' && (() => {
                    const allBookedSites = hoardings.filter(h => h && h.BookedBy && String(h.BookedBy).trim() !== '');

                    // Search filter
                    const filteredSites = allBookedSites.filter(h => {
                        const search = clientSearchTerm.toLowerCase().trim();
                        if (!search) return true;
                        const bookedBy = String(h.BookedBy || '').toLowerCase();
                        const location = String(h['Location '] || h.Location || '').toLowerCase();
                        const city = String(h.City || '').toLowerCase();
                        return bookedBy.includes(search) || location.includes(search) || city.includes(search);
                    });

                    // Avatar backgrounds from QuickMart palette
                    const avatarBgs = ['#ffd5dc', '#ffdfbf', '#b6e3f4', '#c0aede', '#d1d4f9', '#fed7aa', '#fbcfe8', '#e9d5ff'];

                    return (
                        <div className="tab-content clients-tab animate-in" style={{ padding: '36px 48px', background: '#f9fafb', minHeight: 'calc(100vh - 72px)' }}>
                            
                            {/* 🌟 Header Section */}
                            <div style={{ marginBottom: '24px' }}>
                                <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
                                    Clients & Booking
                                </h1>
                                <p style={{ color: '#6b7280', fontSize: '0.95rem', margin: 0, fontWeight: 500 }}>
                                    {allBookedSites.length} active bookings across all locations
                                </p>
                            </div>

                            {/* 🔍 Search Box (QuickMart Full Width Pill) */}
                            <div style={{ background: '#ffffff', borderRadius: '16px', padding: '16px 20px', marginBottom: '24px', border: '1px solid #f3f4f6', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                                <div style={{ background: '#f3f4f6', borderRadius: '9999px', padding: '12px 22px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <Search size={18} color="#9ca3af" />
                                    <input 
                                        type="text"
                                        placeholder="Search bookings by client, location or city..."
                                        value={clientSearchTerm}
                                        onChange={(e) => setClientSearchTerm(e.target.value)}
                                        style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.95rem', color: '#111827', fontWeight: 500 }}
                                    />
                                    {clientSearchTerm && (
                                        <button onClick={() => setClientSearchTerm('')} style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', background: 'transparent', border: 'none' }}>✕</button>
                                    )}
                                </div>
                            </div>

                            {/* 📋 Bookings Table (Clean White Card Layout) */}
                            <div style={{ background: '#ffffff', borderRadius: '18px', padding: '20px 28px', border: '1px solid #f3f4f6', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <th style={{ padding: '16px 16px 14px 16px', fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', width: '220px' }}>CLIENT / ADVERTISER</th>
                                            <th style={{ padding: '16px 16px 14px 16px', fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', width: '250px' }}>SITE LOCATION</th>
                                            <th style={{ padding: '16px 16px 14px 16px', fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', width: '120px' }}>CITY</th>
                                            <th style={{ padding: '16px 16px 14px 16px', fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', width: '130px' }}>RENTAL/MONTH</th>
                                            <th style={{ padding: '16px 16px 14px 16px', fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', width: '180px' }}>BOOKING DATES</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredSites.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} style={{ padding: '60px 20px', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                                                            <Calendar size={28} />
                                                        </div>
                                                        <strong style={{ fontSize: '1.05rem', color: '#111827' }}>No Bookings Found</strong>
                                                        <p style={{ color: '#6b7280', fontSize: '0.86rem', margin: 0, maxWidth: '400px' }}>
                                                            {clientSearchTerm ? 'No bookings match your search query.' : 'Booked hoarding sites will appear here.'}
                                                        </p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredSites.map((h, idx) => {
                                                const clientName = String(h.BookedBy).trim();
                                                const avatarBg = avatarBgs[idx % avatarBgs.length];
                                                // Using initials avatar to avoid default persona images
                                                const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(clientName)}&backgroundColor=${avatarBg.replace('#', '')}&textColor=000000`;
                                                const location = String(h['Location '] || h.Location || 'Unknown Location');
                                                const city = String(h.City || 'Unknown');
                                                const price = Number(h['Rental Per Month'] || h['Avg Monthly Cost (INR)'] || 0) || 0;
                                                const start = h.BookingStart ? new Date(h.BookingStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Unknown';
                                                const end = h.BookingEnd ? new Date(h.BookingEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Ongoing';
                                                
                                                return (
                                                    <tr 
                                                        key={idx}
                                                        style={{ 
                                                            borderBottom: idx === filteredSites.length - 1 ? 'none' : '1px solid #f3f4f6',
                                                            transition: 'background 0.15s ease'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        {/* CLIENT (Avatar + Name) */}
                                                        <td style={{ padding: '18px 16px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                                <div style={{
                                                                    width: '42px', height: '42px', borderRadius: '50%', backgroundColor: avatarBg, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                                                }}>
                                                                    <img src={avatarUrl} alt={clientName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => e.currentTarget.style.display = 'none'} />
                                                                </div>
                                                                <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#111827' }}>
                                                                    {clientName}
                                                                </span>
                                                            </div>
                                                        </td>

                                                        {/* SITE LOCATION */}
                                                        <td style={{ padding: '18px 16px' }}>
                                                            <div style={{ fontSize: '0.86rem', color: '#4b5563', fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {location}
                                                            </div>
                                                            <div style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: 500, marginTop: '2px' }}>
                                                                {h.Media || 'Unipole'} • {h.Dimensions || h.Width + 'x' + h.Height || ''}
                                                            </div>
                                                        </td>

                                                        {/* CITY */}
                                                        <td style={{ padding: '18px 16px' }}>
                                                            <span style={{ padding: '4px 10px', background: '#f3f4f6', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600, color: '#4b5563' }}>
                                                                {city}
                                                            </span>
                                                        </td>

                                                        {/* RENTAL / MONTH */}
                                                        <td style={{ padding: '18px 16px' }}>
                                                            <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#00c851' }}>
                                                                ₹{price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                        </td>

                                                        {/* BOOKING DATES */}
                                                        <td style={{ padding: '18px 16px' }}>
                                                            <div style={{ fontSize: '0.82rem', color: '#4b5563', fontWeight: 600 }}>
                                                                {start} → {end}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })()}
                {uploadNotice && (
                    <aside className={`upload-background-notice ${uploadNotice.status}`} role="status" aria-live="polite">
                        <div className="upload-notice-icon">
                            {uploadNotice.status === 'processing' ? <Clock3 size={21} /> : uploadNotice.status === 'error' ? <XCircle size={21} /> : <CheckCircle size={21} />}
                        </div>
                        <div className="upload-notice-copy">
                            <strong>{uploadNotice.fileName || 'Background upload'}</strong>
                            <span>{uploadNotice.message}</span>
                            {fileProcessing && <small>{formatProcessingTime(processingSeconds)} elapsed: {fileProcessing.phase}</small>}
                        </div>
                        <button type="button" onClick={() => setUploadNotice(null)} title="Close notification" aria-label="Close notification"><X size={18} /></button>
                    </aside>
                )}
                {reviewNotice && (
                    <aside className={`review-sync-notice ${reviewNotice.status}`} role="status" aria-live="polite">
                        <div className="review-notice-icon">
                            {reviewNotice.status === 'processing' ? <RefreshCw size={19} className="animate-spin" /> : reviewNotice.status === 'error' ? <XCircle size={19} /> : <CheckCircle size={19} />}
                        </div>
                        <div>
                            <strong>{reviewNotice.title}</strong>
                            <span>{reviewNotice.message}</span>
                        </div>
                        <button type="button" onClick={() => setReviewNotice(null)} title="Close notification" aria-label="Close notification"><X size={17} /></button>
                    </aside>
                )}

                {/* 📍 Staff Photo Pinpoint Location Map Modal */}
                {selectedPinpointUpload && (() => {
                    const lat = parseFloat(selectedPinpointUpload.Latitude || selectedPinpointUpload.Lat || selectedPinpointUpload.lat || 28.9845);
                    const lng = parseFloat(selectedPinpointUpload.Longitude || selectedPinpointUpload.Long || selectedPinpointUpload.lng || 77.7064);
                    const site = selectedPinpointUpload.ApprovedSite || selectedPinpointUpload.SuggestedSite || 'Field Capture Point';
                    const distance = selectedPinpointUpload.DistanceM ? Math.round(Number(selectedPinpointUpload.DistanceM)) : null;
                    const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.0035}%2C${lat - 0.0035}%2C${lng + 0.0035}%2C${lat + 0.0035}&layer=mapnik&marker=${lat}%2C${lng}`;

                    return (
                        <div className="admin-modal-overlay animate-in" style={{ zIndex: 1100 }} onClick={() => setSelectedPinpointUpload(null)}>
                            <div className="admin-modal-content" style={{ maxWidth: '620px', padding: '0', overflow: 'hidden', borderRadius: '24px' }} onClick={e => e.stopPropagation()}>
                                <div style={{ background: '#0f172a', color: 'white', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa' }}>
                                            <MapPin size={20} />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900 }}>Staff Capture Pinpoint Location</h3>
                                            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                                                {selectedPinpointUpload.CapturedAt ? new Date(selectedPinpointUpload.CapturedAt).toLocaleString('en-IN') : 'Real-time GPS capture'}
                                            </p>
                                        </div>
                                    </div>
                                    <button 
                                        type="button" 
                                        onClick={() => setSelectedPinpointUpload(null)} 
                                        style={{ background: 'rgba(255, 255, 255, 0.1)', border: 'none', color: '#ffffff', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                    <div>
                                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Target Site</span>
                                        <strong style={{ display: 'block', fontSize: '0.92rem', color: '#0f172a', marginTop: '2px' }}>{site}</strong>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>GPS Proximity</span>
                                        <strong style={{ display: 'block', fontSize: '0.92rem', color: distance && distance <= 50 ? '#10b981' : '#f59e0b', marginTop: '2px' }}>
                                            {distance !== null ? `📍 ${distance}m from site (50m Geofence)` : '📍 GPS Point Recorded'}
                                        </strong>
                                    </div>
                                </div>

                                <div style={{ height: '320px', width: '100%', position: 'relative', background: '#e2e8f0' }}>
                                    <iframe 
                                        title="Staff GPS Pinpoint Map"
                                        src={mapUrl}
                                        style={{ width: '100%', height: '100%', border: 'none' }}
                                    />
                                    <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(15, 23, 42, 0.88)', color: 'white', padding: '6px 12px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700, backdropFilter: 'blur(8px)' }}>
                                        Lat: {lat.toFixed(5)}, Lng: {lng.toFixed(5)}
                                    </div>
                                </div>

                                <div style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', gap: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <img 
                                            src={selectedPinpointUpload.ImageURL} 
                                            alt="Captured thumbnail" 
                                            style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #cbd5e1' }} 
                                        />
                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Staff Photo</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <a 
                                            href={`https://www.google.com/maps?q=${lat},${lng}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                padding: '10px 16px',
                                                borderRadius: '12px',
                                                background: '#4f46e5',
                                                color: 'white',
                                                textDecoration: 'none',
                                                fontSize: '0.85rem',
                                                fontWeight: 800,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <ExternalLink size={14} /> Open in Google Maps
                                        </a>
                                        <button 
                                            type="button" 
                                            onClick={() => setSelectedPinpointUpload(null)}
                                            style={{ padding: '10px 18px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer' }}
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* 🖼️ High-Res Image Preview Lightbox with 90° Rotate Straighten */}
                {previewHoarding && (
                    <ImageLightbox 
                        imageUrl={previewHoarding.ImageURL || previewHoarding.previewUrl || getImageUrl(previewHoarding)}
                        alt={previewHoarding["Location "] || previewHoarding.City || 'Photo preview'}
                        onClose={() => setPreviewHoarding(null)}
                        onDownload={() => downloadHoardingImage(previewHoarding.ImageURL || getImageUrl(previewHoarding), previewHoarding["Location "] || 'Hoarding')}
                    />
                )}

                {/* 📥 Native Apps Download Modal (Staff Android APK & Windows Desktop App) */}
                {isAppDownloadModalOpen && (
                    <div 
                        className="admin-modal-overlay" 
                        onClick={() => setIsAppDownloadModalOpen(false)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(15, 23, 42, 0.75)',
                            backdropFilter: 'blur(8px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 10000,
                            padding: '20px'
                        }}
                    >
                        <div 
                            className="admin-modal-content"
                            onClick={e => e.stopPropagation()}
                            style={{
                                background: '#ffffff',
                                borderRadius: '24px',
                                maxWidth: '820px',
                                width: '100%',
                                maxHeight: '90vh',
                                overflowY: 'auto',
                                boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.3)',
                                border: '1px solid rgba(226, 232, 240, 0.8)',
                                padding: '32px'
                            }}
                        >
                            {/* Modal Header */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '18px' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                        <div style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff', width: '38px', height: '38px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Download size={20} />
                                        </div>
                                        <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#0f172a' }}>Download Official Applications</h2>
                                    </div>
                                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem' }}>
                                        Install high-speed native apps for Ground Staff Mobile Audits and Executive Desktop Administration.
                                    </p>
                                </div>
                                <button 
                                    type="button" 
                                    onClick={() => setIsAppDownloadModalOpen(false)}
                                    style={{ background: '#f1f5f9', border: 'none', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: 'pointer', transition: 'all 0.2s ease' }}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Two App Cards Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                                
                                {/* 📱 Card 1: Staff Camera Android APK */}
                                <div style={{ background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)', border: '1.5px solid #86efac', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ background: '#10b981', color: '#ffffff', padding: '10px', borderRadius: '14px', display: 'flex' }}>
                                                <Smartphone size={24} />
                                            </div>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#065f46' }}>Heera Staff Camera</h3>
                                                <span style={{ fontSize: '0.74rem', color: '#047857', fontWeight: 700 }}>Android Mobile App</span>
                                            </div>
                                        </div>
                                        <span style={{ background: '#10b981', color: '#ffffff', fontSize: '0.72rem', fontWeight: 800, padding: '4px 10px', borderRadius: '20px' }}>
                                            Latest APK (~15MB)
                                        </span>
                                    </div>

                                    <ul style={{ margin: '0 0 18px 0', padding: '0 0 0 16px', color: '#334155', fontSize: '0.82rem', lineHeight: '1.6' }}>
                                        <li>⚡ <strong>0s Instant Camera Viewfinder:</strong> Direct launch without loading delays.</li>
                                        <li>📍 <strong>50m Smart GPS Geofence:</strong> Auto-matches billboard location.</li>
                                        <li>🔄 <strong>In-App Auto Update:</strong> Updates automatically on newer releases.</li>
                                        <li>📶 <strong>Offline Storage Queue:</strong> Captures even without active internet.</li>
                                    </ul>

                                    {/* QR Code + Download Button */}
                                    <div style={{ background: '#ffffff', border: '1px solid #dcfce7', borderRadius: '16px', padding: '14px', display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                                        <img 
                                            src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=https%3A%2F%2Fgithub.com%2Fkamleshgupta905%2FHoarding%2Freleases%2Fdownload%2Fstaff-apk-latest%2Fheera-staff-camera.apk" 
                                            alt="Scan to Download APK" 
                                            style={{ width: '85px', height: '85px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                                        />
                                        <div style={{ fontSize: '0.76rem', color: '#475569' }}>
                                            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <QrCode size={14} color="#10b981" /> Scan from Phone Camera
                                            </div>
                                            Scan this QR code with any mobile camera to download APK directly onto your Android device.
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <a 
                                            href="https://github.com/kamleshgupta905/Hoarding/releases/download/staff-apk-latest/heera-staff-camera.apk" 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            style={{
                                                background: '#10b981',
                                                color: '#ffffff',
                                                padding: '12px 18px',
                                                borderRadius: '12px',
                                                textAlign: 'center',
                                                fontWeight: 800,
                                                fontSize: '0.9rem',
                                                textDecoration: 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px',
                                                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                                            }}
                                        >
                                            <Download size={18} /> Download Android APK (Direct)
                                        </a>
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                if (navigator.clipboard) {
                                                    navigator.clipboard.writeText('https://github.com/kamleshgupta905/Hoarding/releases/download/staff-apk-latest/heera-staff-camera.apk');
                                                    alert('Direct APK download link copied to clipboard!');
                                                }
                                            }}
                                            style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#475569', padding: '8px 12px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                        >
                                            <Share2 size={13} /> Copy Direct APK Link
                                        </button>
                                    </div>
                                </div>

                                {/* 💻 Card 2: Windows Desktop App (.exe) */}
                                <div style={{ background: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)', border: '1.5px solid #93c5fd', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ background: '#2563eb', color: '#ffffff', padding: '10px', borderRadius: '14px', display: 'flex' }}>
                                                <Monitor size={24} />
                                            </div>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#1e40af' }}>Heera Hoardings PC</h3>
                                                <span style={{ fontSize: '0.74rem', color: '#1d4ed8', fontWeight: 700 }}>Windows Desktop App</span>
                                            </div>
                                        </div>
                                        <span style={{ background: '#2563eb', color: '#ffffff', fontSize: '0.72rem', fontWeight: 800, padding: '4px 10px', borderRadius: '20px' }}>
                                            Windows (.exe)
                                        </span>
                                    </div>

                                    <ul style={{ margin: '0 0 18px 0', padding: '0 0 0 16px', color: '#334155', fontSize: '0.82rem', lineHeight: '1.6' }}>
                                        <li>⚡ <strong>60 FPS Native Performance:</strong> Ultra-fast local SQLite and caching.</li>
                                        <li>📊 <strong>Full Excel Sheet & Audit Sync:</strong> Work seamlessly offline or online.</li>
                                        <li>🔔 <strong>Desktop System Notifications:</strong> Instant alert on field audit submissions.</li>
                                        <li>🖥️ <strong>Standalone Executable:</strong> Dedicated window without browser tabs.</li>
                                    </ul>

                                    <div style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: '16px', padding: '14px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ background: '#dbeafe', color: '#2563eb', padding: '10px', borderRadius: '12px', display: 'flex' }}>
                                            <Sparkles size={20} />
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: '#334155' }}>
                                            <strong>Standalone Windows Setup:</strong>
                                            <div style={{ color: '#64748b', fontSize: '0.73rem', marginTop: '2px' }}>
                                                Compiled via GitHub CI/CD with automatic update hooks.
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <a 
                                            href="https://github.com/kamleshgupta905/Hoarding/releases" 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            style={{
                                                background: '#2563eb',
                                                color: '#ffffff',
                                                padding: '12px 18px',
                                                borderRadius: '12px',
                                                textAlign: 'center',
                                                fontWeight: 800,
                                                fontSize: '0.9rem',
                                                textDecoration: 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px',
                                                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)'
                                            }}
                                        >
                                            <Download size={18} /> Download Desktop App Releases
                                        </a>
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                setIsAppDownloadModalOpen(false);
                                                window.open('/guide', '_blank');
                                            }}
                                            style={{ background: '#f8fafc', border: '1.5px solid #6366f1', color: '#4f46e5', padding: '10px 14px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}
                                        >
                                            <FileText size={15} color="#4f46e5" /> System Functionality & User Guide (PDF)
                                        </button>
                                    </div>
                                </div>

                            </div>

                            {/* Modal Footer */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                                <button 
                                    type="button" 
                                    onClick={() => setIsAppDownloadModalOpen(false)}
                                    style={{ padding: '10px 22px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer' }}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}


                {/* 🍞 Floating Glassmorphic Toast Notifications */}
                {toast && (
                    <div className="admin-toast-container">
                        <div className={`admin-toast ${toast.type}`}>
                            {toast.type === 'success' && <CheckCircle size={18} color="#10b981" />}
                            {toast.type === 'error' && <XCircle size={18} color="#f43f5e" />}
                            {toast.type === 'info' && <Zap size={18} color="#3b82f6" />}
                            <span>{toast.message}</span>
                            <button type="button" onClick={() => setToast(null)} title="Dismiss">
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default AdminDashboard;
