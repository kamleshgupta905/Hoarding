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
    BarChart3, PieChart, Activity, Sparkles, ArrowUpRight, Layers, Compass, DollarSign, Award, Flame, Check, ChevronRight, Monitor, QrCode, Printer, BookOpen,
    Radio, Signal, Globe, Crosshair, CheckCircle2, Navigation
} from 'lucide-react';
import { analyzeHoardingImage, extractSiteCoordinates } from '../services/aiService';
import { fetchHoardings, compressImage, syncToGoogleSheet, exportProposalExcel, PROPOSAL_COLUMNS, getImageUrl, downloadHoardingImage, fetchStaffUploads, reviewStaffPhoto, detectStaffPhotoOrientation, fetchSheetGrid, saveSheetGrid, addDeletedSite, parseHistoryString } from '../services/dataService';
import ImageLightbox from '../components/ImageLightbox';
import { clearAdminSession, getAdminSession, getStaffUploadLink } from '../services/secureApi';
import { isInternalHeader } from '../core/hoardingSchema';
import { blobToDataUrl, prepareImageOrientation } from '../core/imageOrientation';
import { parsePptx, releasePptxPreviews, blobToBase64 } from '../core/pptxEngine';
import { HIRA_LOGO } from '../assets/hiraLogoData';
import { 
    AnimatedCounter, 
    QuickMartDonutChart, 
    QuickMartTopLocationsChart 
} from '../components/ExecutiveCharts';
import { motion, AnimatePresence } from 'motion/react';
import SystemGuide from './SystemGuide';
import krishnaAvatar from '../assets/krishna_avatar.jpg';
import './AdminDashboard.css';

const SHEET_HISTORY_LIMIT = 30;
const HIDDEN_SHEET_COLUMN_LETTERS = new Set(['T', 'W', 'X', 'Y', 'Z']);

/**
 * 🌟 Official Anthropic Claude AI Logo (Warm Terracotta/Coral Starburst)
 */
const ClaudeAiIcon = ({ size = 18, className = "" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
        <rect width="24" height="24" rx="6" fill="#F3EBE1" />
        <path fill="#D97757" d="m4.714 15.956l4.718-2.648l.079-.23l-.08-.128h-.23l-.79-.048l-2.695-.073l-2.337-.097l-2.265-.122l-.57-.121l-.535-.704l.055-.353l.48-.321l.685.06l1.518.104l2.277.157l1.651.098l2.447.255h.389l.054-.158l-.133-.097l-.103-.098l-2.356-1.596l-2.55-1.688l-1.336-.972l-.722-.491L2 6.223l-.158-1.008l.656-.722l.88.06l.224.061l.893.686l1.906 1.476l2.49 1.833l.364.304l.146-.104l.018-.072l-.164-.274l-1.354-2.446l-1.445-2.49l-.644-1.032l-.17-.619a3 3 0 0 1-.103-.729L6.287.133L6.7 0l.995.134l.42.364l.619 1.415L9.735 4.14l1.555 3.03l.455.898l.243.832l.09.255h.159V9.01l.127-1.706l.237-2.095l.23-2.695l.08-.76l.376-.91l.747-.492l.583.28l.48.685l-.067.444l-.286 1.851l-.558 2.903l-.365 1.942h.213l.243-.242l.983-1.306l1.652-2.064l.728-.82l.85-.904l.547-.431h1.032l.759 1.129l-.34 1.166l-1.063 1.347l-.88 1.142l-1.263 1.7l-.79 1.36l.074.11l.188-.02l2.853-.606l1.542-.28l1.84-.315l.832.388l.09.395l-.327.807l-1.967.486l-2.307.462l-3.436.813l-.043.03l.049.061l1.548.146l.662.036h1.62l3.018.225l.79.522l.473.638l-.08.485l-1.213.62l-1.64-.389l-3.825-.91l-1.31-.329h-.183v.11l1.093 1.068l2.003 1.81l2.508 2.33l.127.578l-.321.455l-.34-.049l-2.204-1.657l-.85-.747l-1.925-1.62h-.127v.17l.443.649l2.343 3.521l.122 1.08l-.17.353l-.607.213l-.668-.122l-1.372-1.924l-1.415-2.168l-1.141-1.943l-.14.08l-.674 7.254l-.316.37l-.728.28l-.607-.461l-.322-.747l.322-1.476l.388-1.924l.316-1.53l.285-1.9l.17-.632l-.012-.042l-.14.018l-1.432 1.967l-2.18 2.945l-1.724 1.845l-.413.164l-.716-.37l.066-.662l.401-.589l2.386-3.036l1.439-1.882l.929-1.086l-.006-.158h-.055L4.138 18.56l-1.13.146l-.485-.456l.06-.746l.231-.243l1.907-1.312Z"/>
    </svg>
);

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

// 📅 2-Day (48 Hours) Auto-Purge for Unmatched Photos
const TWO_DAYS_MS = 48 * 3600 * 1000;
const isOlderThan2Days = (time) => {
    if (!time) return false;
    const ts = new Date(time).getTime();
    return !isNaN(ts) && (Date.now() - ts > TWO_DAYS_MS);
};

const AdminDashboard = ({ hoardings = [], setHoardings = () => {} }) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTabState] = useState(() => {
        return localStorage.getItem('adhoardings_active_tab') || 'inventory';
    });
    const setActiveTab = (tab) => {
        setActiveTabState(tab);
        try { localStorage.setItem('adhoardings_active_tab', tab); } catch {}
    };
    const [quickBookingTarget, setQuickBookingTarget] = useState(null); // { site, clientName, startDate, endDate }
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
    const [missedPptSlides, setMissedPptSlides] = useState([]);
    const [isAutoMappingCloudPhotos, setIsAutoMappingCloudPhotos] = useState(false);
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
    const [apkCopied, setApkCopied] = useState(false);
    const [winCopied, setWinCopied] = useState(false);
    const [staffLinkCopied, setStaffLinkCopied] = useState(false);



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
            const t = setTimeout(() => {
                setProcessingSeconds(0);
            }, 0);
            return () => clearTimeout(t);
        }

        const startedAt = fileProcessing.startedAt;
        const timer = window.setInterval(() => {
            setProcessingSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
        }, 1000);
        const t = setTimeout(() => {
            setProcessingSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
        }, 0);
        return () => {
            window.clearInterval(timer);
            clearTimeout(t);
        };
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
        const response = await fetch(`${scriptUrl}?action=excelImportPreview&token=${encodeURIComponent(token)}&sessionToken=${encodeURIComponent(getAdminSession())}&t=${Date.now()}`, { credentials: 'omit' });
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
        const response = await fetch(`${scriptUrl}?action=fileJobStatus&token=${encodeURIComponent(token)}&sessionToken=${encodeURIComponent(getAdminSession())}&t=${Date.now()}`, { credentials: 'omit' });
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
        const timer = setTimeout(() => controller.abort(new Error(`Upload timed out after ${Math.round(timeoutMs / 1000)} seconds`)), timeoutMs);
        try {
            const response = await fetch(scriptUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' }, credentials: 'omit',
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

    // ⚡ 1-Click Auto-Map Photos from Google Cloud Server to Inventory
    const handleAutoMapCloudPhotos = async () => {
        setIsAutoMappingCloudPhotos(true);
        showToast('Scanning Google Cloud Server photos and auto-mapping to inventory...', 'info');
        try {
            const res = await syncToGoogleSheet({
                action: 'syncDrivePhotosByGpsAndFacing',
                sessionToken: getAdminSession()
            });
            if (res && res.success) {
                const count = res.matchedCount || 0;
                showToast(`✨ Auto-mapped ${count} photos from Google Cloud Server to inventory!`, 'success');
                const freshData = await fetchHoardings();
                if (freshData?.length) setHoardings(freshData);
            } else {
                throw new Error(res?.error || 'Auto-mapping failed');
            }
        } catch (err) {
            showToast(`Auto-mapping failed: ${err.message}`, 'error');
        } finally {
            setIsAutoMappingCloudPhotos(false);
        }
    };

    // 🔄 1-Click Re-Sync for Any Missed PPT Photos
    const handleResyncMissedSlides = async () => {
        if (!missedPptSlides || missedPptSlides.length === 0) return;
        const slidesToSync = [...missedPptSlides];
        setFileProcessing({
            type: 'ppt',
            fileName: 'Missed Photos Re-Sync',
            phase: `Re-syncing ${slidesToSync.length} missed photos to Google Cloud Server...`,
            progress: 10,
            startedAt: Date.now()
        });
        
        let reSynced = 0;
        const remainingMissed = [];

        for (let i = 0; i < slidesToSync.length; i++) {
            const item = slidesToSync[i];
            updateFileProcessing({
                phase: `⚡ Re-syncing photo ${i + 1} of ${slidesToSync.length} to Google Cloud Server...`,
                progress: Math.round(((i + 1) / slidesToSync.length) * 100)
            });

            let success = false;
            try {
                // First try updateHoarding
                let res = await syncToGoogleSheet({
                    action: 'updateHoarding',
                    sessionToken: getAdminSession(),
                    siteName: item.siteName || item.descriptiveFileName,
                    siteId: item.matchedSiteId || '',
                    fileName: item.descriptiveFileName,
                    fileData: item.pureBase64,
                    mimeType: item.mimeType || 'image/jpeg'
                });

                // If not found in sheet, upload directly to Drive folder
                if (!res || res.success === false) {
                    res = await syncToGoogleSheet({
                        action: 'uploadInputFile',
                        sessionToken: getAdminSession(),
                        fileName: item.descriptiveFileName,
                        fileData: item.pureBase64,
                        mimeType: item.mimeType || 'image/jpeg'
                    });
                }

                if (res && res.success !== false) {
                    reSynced++;
                    success = true;
                }
            } catch (e) {
                console.warn('[Re-sync Error]:', e);
            }

            if (!success) {
                remainingMissed.push(item);
            }
            await wait(300);
        }

        setMissedPptSlides(remainingMissed);
        setFileProcessing(null);

        if (reSynced > 0) {
            showToast(`✅ Successfully uploaded ${reSynced} missed photos to Google Cloud Server!`, 'success');
            await handleAutoMapCloudPhotos();
        } else {
            showToast(`Could not re-sync photos. Please check internet connection.`, 'error');
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

                // PPT Upload — High-Speed Native Desktop Engine with Fast Web Fallback
                let slides = [];
                const isElectron = Boolean(window.electronAPI && window.electronAPI.isElectron && typeof window.electronAPI.extractPptxNative === 'function');

                if (isElectron) {
                    updateFileProcessing({ phase: `Claude AI Native Engine: Processing PPT (${fileSizeMB.toFixed(1)}MB)...`, progress: 10 });
                    const removeListener = window.electronAPI.onPptxProgress 
                        ? window.electronAPI.onPptxProgress((p) => {
                            if (p && p.phase) {
                                updateFileProcessing({ phase: p.phase, progress: p.progress || 25 });
                            }
                        })
                        : null;

                    try {
                        const arrayBuffer = await file.arrayBuffer();
                        const nativeRes = await window.electronAPI.extractPptxNative({
                            filePath: file.path || '',
                            fileBuffer: arrayBuffer,
                            sites: hoardings || [],
                            groqApiKey: localStorage.getItem('adh_groq_api_key') || ''
                        });

                        if (removeListener) removeListener();
                        if (!nativeRes || !nativeRes.success || !nativeRes.slides) {
                            throw new Error(nativeRes?.error || 'Native extraction error');
                        }
                        slides = nativeRes.slides;
                    } catch (nativeErr) {
                        if (removeListener) removeListener();
                        console.warn('[Desktop Native Fallback to Web Engine]:', nativeErr);
                        updateFileProcessing({ phase: `Reading PPT file (${fileSizeMB.toFixed(1)}MB)...`, progress: 15 });
                        const arrayBuffer = await file.arrayBuffer();
                        slides = await parsePptx(arrayBuffer, hoardings, (progress, phase) => updateFileProcessing({ phase, progress }));
                    }
                } else {
                    updateFileProcessing({ phase: `Reading PPT file (${fileSizeMB.toFixed(1)}MB)...`, progress: 15 });
                    const arrayBuffer = await file.arrayBuffer();

                    updateFileProcessing({ phase: 'Analyzing slides and extracting high-res photos...', progress: 35 });
                    slides = await parsePptx(arrayBuffer, hoardings, (progress, phase) => updateFileProcessing({ phase, progress }));
                }

                if (!slides || slides.length === 0) {
                    throw new Error('No valid slides could be found in the PPT.');
                }

                const processableSlides = slides.filter(s => s.photoCandidates && s.photoCandidates.length > 0);
                if (processableSlides.length === 0) {
                    throw new Error('No photos could be found in this PPT presentation.');
                }

                updateFileProcessing({ 
                    phase: `Claude AI extracted ${processableSlides.length} slides! Syncing photos to Google Cloud Server...`,
                    progress: 45 
                });

                let completed = 0;
                let syncedCount = 0;
                const failedSlidesList = [];
                const batchUpdates = [];
                
                // 🚀 OPTION B: High-Speed Concurrency Worker Pool (8 Parallel Workers with Zero Image Loss)
                const CONCURRENCY = 8;
                const queue = [...processableSlides];

                const processSlideTask = async (slide) => {
                    const photoCandidate = slide.photoCandidates?.[0];
                    if (!photoCandidate || (!photoCandidate.blob && !photoCandidate.base64)) {
                        completed++;
                        return;
                    }

                    const ai = slide.aiData || {};
                    const matchedSite = hoardings.find(h => h._SiteID === slide.suggestedSiteId) || slide.candidates?.[0]?.site || ai.matchedSite;
                    
                    let fallbackName = `Slide_${slide.number}`;
                    if (ai.locationName) {
                        fallbackName = ai.locationName;
                    } else if (slide.text && slide.text.trim().length > 0) {
                        fallbackName = slide.text.trim().replace(/\s+/g, ' ').substring(0, 100);
                    }
                    const siteName = matchedSite ? (matchedSite['Locality Site Location'] || matchedSite['Location '] || matchedSite.Location || matchedSite._SiteID) : fallbackName;

                    // 🏷️ Clean Sanitize Helper (Preserves clean words, eliminates invalid characters)
                    const sanitizeNamePart = (val) => String(val || '').replace(/[/[\\]?%*:|"<>_]/g, ' ').replace(/\s+/g, ' ').trim();

                    // 🏷️ Rich File Name EXACT FORMAT: Meerut_Begum Bridge_Facing_Delhi Road_28.998107_77.705821.jpg
                    const city = sanitizeNamePart(matchedSite?.City || ai.city || 'Meerut') || 'Meerut';
                    const loc = sanitizeNamePart(matchedSite?.Location || matchedSite?.['Locality Site Location'] || matchedSite?.['Location '] || ai.locationName || fallbackName);
                    
                    const facingValue = matchedSite?.Facing || ai.facing || '';
                    const facingClean = sanitizeNamePart(facingValue);
                    const facingPart = facingClean ? `Facing_${facingClean}` : 'Facing_NA';

                    let lat = matchedSite?.Latitude || matchedSite?.['Lat.'] || ai.latitude;
                    let lng = matchedSite?.Longitude || matchedSite?.['Long.'] || ai.longitude;
                    if ((!lat || !lng) && ai.gpsStamp) {
                        const parts = String(ai.gpsStamp).split(/[,/\s|]+/).map(s => s.trim()).filter(Boolean);
                        if (parts.length >= 2) {
                            lat = lat || parts[0];
                            lng = lng || parts[1];
                        }
                    }

                    let coordPart = '';
                    if (lat && lng) {
                        const cleanLat = String(lat).replace(/[^0-9.-]/g, '').trim();
                        const cleanLng = String(lng).replace(/[^0-9.-]/g, '').trim();
                        if (cleanLat && cleanLng) {
                            coordPart = `${cleanLat}_${cleanLng}`;
                        }
                    }
                    if (!coordPart) {
                        coordPart = `Slide_${slide.number}`;
                    }
                    const descriptiveFileName = `${city}_${loc}_${facingPart}_${coordPart}.jpg`;

                    let pureBase64 = photoCandidate.base64 || '';
                    if (!pureBase64 && photoCandidate.blob) {
                        try {
                            const compressedDataUrl = await compressImage(photoCandidate.blob, 1280, 960, 0.78);
                            pureBase64 = compressedDataUrl ? compressedDataUrl.replace(/^data:image\/[a-z0-9+-]+;base64,/, '') : '';
                        } catch (compErr) {
                            console.warn(`[Compression Fallback] Slide ${slide.number}:`, compErr);
                        }

                        if (!pureBase64) {
                            try {
                                const directBase64 = await blobToBase64(photoCandidate.blob);
                                if (directBase64) {
                                    pureBase64 = directBase64.replace(/^data:image\/[a-z0-9+-]+;base64,/, '');
                                }
                            } catch (fallbackErr) {
                                console.warn(`[Direct Base64 Fallback] Slide ${slide.number}:`, fallbackErr);
                            }
                        }
                    }

                    let success = false;
                    for (let attempt = 1; attempt <= 4 && !success; attempt++) {
                        try {
                            // 🚀 Phase 1: Fast Pure Cloud Upload (No Google Sheet Lock)
                            let res = await syncToGoogleSheet({
                                action: 'pureUpload',
                                sessionToken: getAdminSession(),
                                fileName: descriptiveFileName,
                                fileData: pureBase64,
                                mimeType: photoCandidate.mimeType || 'image/jpeg'
                            });

                            if (res && res.success !== false && res.url) {
                                // Add to Phase 2 Atomic Batch
                                batchUpdates.push({
                                    siteId: matchedSite?._SiteID || '',
                                    siteName: siteName,
                                    facing: facingValue,
                                    url: res.url,
                                    status: ai.status || matchedSite?.STATUS || 'Available',
                                    newSiteData: !matchedSite ? {
                                        siteName: siteName,
                                        facing: facingValue,
                                        latLong: lat && lng ? `${lat},${lng}` : (ai.gpsStamp || '')
                                    } : undefined
                                });
                                syncedCount++;
                                success = true;
                            } else {
                                throw new Error(res?.error || 'Pure upload rejected');
                            }
                        } catch (uploadErr) {
                            if (attempt < 4) {
                                await wait(600 * attempt);
                            } else {
                                console.warn(`[Claude AI Sync] Failed pure upload for slide ${slide.number}:`, uploadErr);
                                failedSlidesList.push({
                                    slide,
                                    descriptiveFileName,
                                    pureBase64,
                                    mimeType: photoCandidate.mimeType || 'image/jpeg',
                                    siteName,
                                    matchedSiteId: matchedSite?._SiteID || ''
                                });
                            }
                        }
                    }

                    completed++;
                    const percent = Math.round(45 + (completed / processableSlides.length) * 50);
                    updateFileProcessing({
                        phase: `Claude AI Sync: ${completed}/${processableSlides.length} slides (${syncedCount} photos synced to Google Cloud Server)...`,
                        progress: percent
                    });
                };

                // Launch 8 concurrent parallel workers
                const workerThreads = Array.from({ length: Math.min(CONCURRENCY, processableSlides.length) }, async () => {
                    while (queue.length > 0) {
                        const item = queue.shift();
                        if (item) await processSlideTask(item);
                    }
                });

                await Promise.all(workerThreads);

                // 🚀 Phase 2: Atomic Batch Sync to Google Sheet
                if (batchUpdates.length > 0) {
                    updateFileProcessing({ phase: '⚡ Phase 2: Atomic Batch Syncing to Google Sheet (1 sec)...', progress: 95 });
                    try {
                        const batchRes = await syncToGoogleSheet({
                            action: 'batchUpdateSheet',
                            sessionToken: getAdminSession(),
                            updates: batchUpdates
                        });
                        console.log('[Batch Sync Result]:', batchRes);
                    } catch (batchErr) {
                        console.error('[Batch Sync Failed]:', batchErr);
                    }
                }

                releasePptxPreviews(slides);
                window.dispatchEvent(new CustomEvent('hoardings:sync-requested', { detail: { action: 'pptUpload', fileName: file.name } }));
                await wait(1000);
                const freshData = await fetchHoardings();
                if (freshData?.length) setHoardings(freshData);

                if (failedSlidesList.length > 0) {
                    setMissedPptSlides(failedSlidesList);
                    completeBackgroundUpload('completed', `Claude AI processed ${syncedCount} of ${processableSlides.length} photos. ${failedSlidesList.length} photos require re-sync.`);
                } else {
                    setMissedPptSlides([]);
                    completeBackgroundUpload('completed', `Claude AI processing complete! All ${syncedCount} slide photos uploaded and synced to Google Cloud Server.`);
                }
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
    // 🤖 AI DAILY UPDATE HANDLERS (GPS AUTOMATIC MATCH & HISTORY SYNC)
    // ------------------------------------------------------------------

    const handleDailyImageSelect = (e) => {
        const rawFiles = Array.from(e.target.files || e.dataTransfer?.files || []);
        // Accept image MIME or common camera extensions
        const imageFiles = rawFiles.filter(file => 
            (file.type && file.type.startsWith('image/')) || 
            /\.(jpe?g|png|webp|heic|heif|bmp|tiff?)$/i.test(file.name)
        );

        if (imageFiles.length === 0) return;

        const newImages = imageFiles.map(file => ({
            file,
            preview: URL.createObjectURL(file),
            matchedLocation: null,
            status: 'Unknown',
            confidence: 0,
            reasoning: '',
            analysis: null,
            gpsCoord: null,
            distanceM: null,
            aiLoading: false,
            uploaded: false,
            uploading: false,
            matchFailed: false
        }));

        setDailyImages(prev => {
            const updatedList = [...prev, ...newImages];
            setTimeout(() => processImagesWithAI(updatedList), 50);
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

        const updatedImages = [...targetList];

        for (let i = 0; i < updatedImages.length; i++) {
            if (!updatedImages[i].matchedLocation && !updatedImages[i].uploaded && !updatedImages[i].uploading) {
                try {
                    setDailyImages(prev => {
                        const next = [...prev];
                        if (next[i]) next[i].aiLoading = true;
                        return next;
                    });

                    // Convert file to base64 for AI & OCR
                    const base64Data = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(updatedImages[i].file);
                    });

                    // 🧠 Run deep GPS extraction & multi-tier matching (EXIF -> OCR GPS -> Vision AI -> OCR Text)
                    const aiResult = await analyzeHoardingImage(base64Data, hoardings, updatedImages[i].file);

                    // 🎯 Resolve Target Hoarding Site
                    let matchedData = null;
                    const idx = parseInt(aiResult.matchedIndex, 10);
                    if (!isNaN(idx) && idx >= 0 && idx < hoardings.length) {
                        matchedData = hoardings[idx];
                    } else if (aiResult.matchedLocation) {
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

                    // Update the local item state
                    // eslint-disable-next-line react-hooks/immutability
                    updatedImages[i] = {
                        ...updatedImages[i],
                        matchedIndex: matchedData ? (idx >= 0 ? idx : hoardings.indexOf(matchedData)) : -1,
                        matchedLocation: finalLocation,
                        status: aiResult.status || 'Available',
                        confidence: aiResult.confidence || 0,
                        reasoning: aiResult.reasoning || '',
                        analysis: aiResult.analysis || '',
                        gpsCoord: aiResult.gpsCoord || null,
                        distanceM: aiResult.distanceM != null ? aiResult.distanceM : null,
                        aiLoading: false,
                        matchFailed: !finalLocation
                    };

                    // Update state progressively
                    setDailyImages(prev => {
                        const next = [...prev];
                        if (next[i]) next[i] = { ...updatedImages[i] };
                        return next;
                    });

                    // 🚀 AUTO-SYNC: If matched, upload image & save directly to hoarding history!
                    if (finalLocation) {
                        await triggerAutoUpload(i, updatedImages[i]);
                    }

                } catch (error) {
                    console.error("AI Image Processing Error:", error);
                    setDailyImages(prev => {
                        const next = [...prev];
                        if (next[i]) next[i] = { ...next[i], aiLoading: false, matchFailed: true };
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

            // Find target site in hoardings list
            const targetHoarding = hoardings.find((h, hIdx) => {
                if (imageData.matchedIndex != null && imageData.matchedIndex >= 0 && hIdx === imageData.matchedIndex) return true;
                const loc1 = String(h["Locality Site Location"] || '').trim().toLowerCase();
                const loc2 = String(h["Location "] || '').trim().toLowerCase();
                const loc3 = String(h.Location || '').trim().toLowerCase();
                const target = String(imageData.matchedLocation || '').trim().toLowerCase();
                return loc1 === target || loc2 === target || loc3 === target;
            });

            const hasExistingMaster = targetHoarding && targetHoarding.ImageURL &&
                targetHoarding.ImageURL.trim() !== "" &&
                !targetHoarding.ImageURL.includes("unsplash.com");

            // Format coordinates string if present
            const gpsString = imageData.gpsCoord 
                ? `${imageData.gpsCoord.lat.toFixed(6)}, ${imageData.gpsCoord.lng.toFixed(6)}` 
                : '';

            // Construct new history entry
            const newHistoryItem = {
                url: base64,
                preview: imageData.preview,
                timestamp: Date.now(),
                date: new Date().toISOString(),
                gps: gpsString,
                source: 'Daily Execution Proof (GPS Auto-Match)',
                status: imageData.status || 'Available',
                confidence: imageData.confidence,
                reasoning: imageData.reasoning
            };

            const existingHistory = targetHoarding ? (
                Array.isArray(targetHoarding.History) ? targetHoarding.History : parseHistoryString(targetHoarding.ExecutionHistory || targetHoarding.History || '')
            ) : [];

            const updatedHistory = [newHistoryItem, ...existingHistory.filter(h => (typeof h === 'object' ? h.url : h) !== base64)];

            const historyString = updatedHistory.map(item => {
                const url = typeof item === 'object' ? (item.url || item.preview || '') : item;
                const time = typeof item === 'object' ? (item.timestamp || Date.now()) : Date.now();
                const gps = typeof item === 'object' ? (item.gps || '') : '';
                return `${url}|${time}${gps ? '|' + gps : ''}`;
            }).join(',');

            const siteNameResolved = targetHoarding ? (targetHoarding["Locality Site Location"] || targetHoarding["Location "] || targetHoarding.Location) : imageData.matchedLocation;
            const siteIdResolved = targetHoarding ? (targetHoarding.UniqueID || targetHoarding["Unique ID"] || targetHoarding.ID || targetHoarding._SiteID || '') : '';

            // ☁️ Sync to Google Sheets ExecutionHistory column
            await syncToGoogleSheet({
                action: 'updateHoarding',
                siteName: siteNameResolved,
                siteId: siteIdResolved,
                status: imageData.status || 'Available',
                fields: { 
                    "ExecutionHistory": historyString,
                    STATUS: imageData.status || 'Available'
                },
                fileData: base64,
                mimeType: 'image/jpeg',
                mode: hasExistingMaster ? 'archive' : 'replace'
            });

            // Mark uploaded in UI
            setDailyImages(prev => {
                const next = [...prev];
                if (next[index]) {
                    next[index].uploaded = true;
                    next[index].uploading = false;
                }
                return next;
            });

            // 💾 Update Hoarding state and cache
            setHoardings(prev => {
                const updatedList = prev.map((h, hIdx) => {
                    const isTarget = (imageData.matchedIndex != null && imageData.matchedIndex >= 0 && hIdx === imageData.matchedIndex) ||
                        [h["Locality Site Location"], h["Location "], h.Location].some(l => String(l || '').trim().toLowerCase() === String(imageData.matchedLocation || '').trim().toLowerCase()) ||
                        (siteIdResolved && (h.UniqueID === siteIdResolved || h["Unique ID"] === siteIdResolved));

                    if (isTarget) {
                        const hasValidOldImage = h.ImageURL && h.ImageURL.trim() !== "" && !h.ImageURL.includes("unsplash.com");
                        const currentHist = Array.isArray(h.History) ? h.History : parseHistoryString(h.ExecutionHistory || h.History || '');
                        const newHist = [newHistoryItem, ...currentHist.filter(item => (typeof item === 'object' ? item.url : item) !== base64)];

                        return {
                            ...h,
                            STATUS: imageData.status || h.STATUS || 'Available',
                            ImageURL: hasValidOldImage ? h.ImageURL : base64,
                            History: newHist,
                            ExecutionHistory: historyString
                        };
                    }
                    return h;
                });

                try {
                    localStorage.setItem('adh_cached_hoardings', JSON.stringify(updatedList));
                } catch (e) {
                    console.warn('Could not cache hoardings to localStorage:', e);
                }

                return updatedList;
            });

        } catch (error) {
            console.error("Auto-sync failed with error:", error);
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
    // 🖥️ UI COMPONENTS & QUICK BOOKING
    // ------------------------------------------------------------------

    const handleStatusClick = (h) => {
        if (!h) return;
        const isBooked = (h.STATUS || '').toLowerCase() === 'booked' || (h.STATUS || '').toLowerCase() === 'occupied';
        if (isBooked) {
            toggleStatusToAvailable(h);
        } else {
            const today = new Date().toISOString().split('T')[0];
            // eslint-disable-next-line react-hooks/purity
            const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
            setQuickBookingTarget({
                site: h,
                clientName: h.BookedBy || h.ClientName || h["Client Name"] || '',
                startDate: h.BookingStart || today,
                endDate: h.BookingEnd || nextMonth
            });
        }
    };

    const handleConfirmQuickBooking = async (e) => {
        e.preventDefault();
        if (!quickBookingTarget) return;

        const { site, clientName, startDate, endDate } = quickBookingTarget;
        if (!clientName.trim()) {
            showToast("Please enter client name", "error");
            return;
        }
        if (!startDate || !endDate) {
            showToast("Please enter booking start and end dates", "error");
            return;
        }

        const targetSite = site;
        const targetSL = targetSite.SL || targetSite["S. No."] || targetSite["SL NO"];
        const targetId = targetSite.UniqueID || targetSite["Unique ID"] || targetSite.ID || targetSite._SiteID;
        const targetLoc = String(targetSite["Locality Site Location"] || targetSite["Location "] || targetSite.Location || '').trim().toLowerCase();
        const targetFacing = String(targetSite.Facing || targetSite["Traffic View"] || '').trim().toLowerCase();
        const targetLat = String(targetSite.Latitude || '').trim();
        const targetLng = String(targetSite.Longitude || '').trim();

        const bookingUpdates = {
            STATUS: 'Booked',
            BookedBy: clientName.trim(),
            BookingStart: startDate,
            BookingEnd: endDate
        };

        // 1. Instantly update React state & cache with precision targeting
        setHoardings(prev => {
            const next = prev.map(h => {
                let isMatch = (h === targetSite);
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

                return isMatch ? { ...h, ...bookingUpdates } : h;
            });

            try {
                localStorage.setItem('hoardings_cache', JSON.stringify(next));
                localStorage.setItem('last_hoardings_update', Date.now().toString());
            } catch {}
            return next;
        });

        setQuickBookingTarget(null);
        showToast(`Site Booked for ${clientName}!`, "success");

        // 2. Background sync to Google Sheet
        syncToGoogleSheet({
            action: 'updateHoarding',
            siteName: targetSite["Locality Site Location"] || targetSite["Location "] || targetSite.Location,
            siteId: targetId || '',
            fields: {
                ...targetSite,
                ...bookingUpdates
            }
        }).catch(err => console.warn("Booking background sync:", err));
    };

    const toggleStatusToAvailable = (targetSite) => {
        const targetSL = targetSite.SL || targetSite["S. No."] || targetSite["SL NO"];
        const targetId = targetSite.UniqueID || targetSite["Unique ID"] || targetSite.ID || targetSite._SiteID;
        const targetLoc = String(targetSite["Locality Site Location"] || targetSite["Location "] || targetSite.Location || '').trim().toLowerCase();
        const targetFacing = String(targetSite.Facing || targetSite["Traffic View"] || '').trim().toLowerCase();
        const targetLat = String(targetSite.Latitude || '').trim();
        const targetLng = String(targetSite.Longitude || '').trim();

        const availableUpdates = {
            STATUS: 'Available',
            BookedBy: '',
            BookingStart: '',
            BookingEnd: ''
        };

        setHoardings(prev => {
            const next = prev.map(h => {
                let isMatch = (h === targetSite);
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

                return isMatch ? { ...h, ...availableUpdates } : h;
            });

            try {
                localStorage.setItem('hoardings_cache', JSON.stringify(next));
                localStorage.setItem('last_hoardings_update', Date.now().toString());
            } catch {}
            return next;
        });

        showToast("Site marked as Available!", "success");

        // Background sync to Google Sheet
        syncToGoogleSheet({
            action: 'updateHoarding',
            siteName: targetSite["Locality Site Location"] || targetSite["Location "] || targetSite.Location,
            siteId: targetId || '',
            fields: {
                ...targetSite,
                ...availableUpdates
            }
        }).catch(err => console.warn("Available background sync:", err));
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
    const mediaFormatMap = {};
    safeHoardings.forEach(h => {
        if (!h) return;
        const type = (h["Type of Site (Unipole/Billboard)"] || h["Media Format (Front Lit/ Back Lit/Non Lit)"] || 'Other').trim();
        if (type) mediaFormatMap[type] = (mediaFormatMap[type] || 0) + 1;
    });
    const mediaFormats = Object.entries(mediaFormatMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({
            name,
            count,
            percent: ((count / Math.max(totalHoardingsCount, 1)) * 100).toFixed(1)
        }));

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

    // Pricing & Media Distribution Tiers (Vibrant QuickMart donut chart colors)
    const overviewPriceTiers = [
        { label: 'Under ₹25,000 / mo', min: 0, max: 25000, count: 0, color: '#10b981' },
        { label: '₹25,000 - ₹50,000 / mo', min: 25000, max: 50000, count: 0, color: '#0070f3' },
        { label: '₹50,000 - ₹75,000 / mo', min: 50000, max: 75000, count: 0, color: '#f59e0b' },
        { label: '₹75,000 - ₹1,00,000 / mo', min: 75000, max: 100000, count: 0, color: '#6366f1' },
        { label: 'Above ₹1,00,000 / mo', min: 100000, max: Infinity, count: 0, color: '#ef4444' },
    ];
    safeHoardings.forEach(h => {
        if (!h) return;
        const p = parseFloat(String(h["Rental Per Month"] || h["Avg Monthly Cost (INR)"] || 0).replace(/[^0-9.]/g, '')) || 0;
        const tier = overviewPriceTiers.find(t => p >= t.min && p < t.max);
        if (tier) tier.count++;
    });

    // Real Verified Assets Calculation
    const verifiedAssetsCount = safeHoardings.filter(h => Boolean(h && (h.Latitude || h.Lat || h.lat || h["Latitude"] || h.ImageURL || h["IMAGE LINK"] || h["Image"] || h["Photo"]))).length;
    const verifiedPercent = totalHoardingsCount > 0 ? Math.round((verifiedAssetsCount / totalHoardingsCount) * 100) : 0;

    // Recent Sites List for Activity Table (Real computed data)
    const recentSites = safeHoardings.slice(0, 6).map((h, i) => {
        const id = h["CODE"] || h["Code"] || h["ID"] || h["Site Code"] || `HIRA-${String(i + 1).padStart(3, '0')}`;
        const location = h["Location"] || h["Area"] || h["Locality"] || h["City"] || 'Master Site';
        const rate = parseFloat(String(h["Rental Per Month"] || h["Avg Monthly Cost (INR)"] || h["Rate"] || 0).replace(/[^0-9.]/g, '')) || 0;
        const statusRaw = String(h["Status"] || '').trim().toLowerCase();
        let status = 'Available';
        if (statusRaw.includes('book') || statusRaw.includes('sold') || statusRaw.includes('occupied')) {
            status = 'Booked';
        } else if (statusRaw.includes('reserve') || statusRaw.includes('hold')) {
            status = 'Reserved';
        } else if (statusRaw.includes('prime')) {
            status = 'Prime';
        } else {
            status = 'Available';
        }
        return { id, location, rate, status, raw: h };
    });

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
            const timer = setTimeout(() => {
                loadSheetEditor();
            }, 0);
            return () => clearTimeout(timer);
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
                                    background: '#dc2626', 
                                    color: 'white',
                                    fontWeight: '700',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)'
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
                <div className="sidebar-logo">
                    <div 
                        className="sidebar-logo-card"
                        onClick={() => {
                            if (isSidebarCollapsed) {
                                toggleSidebar();
                            } else {
                                setActiveTab('dashboard');
                            }
                        }}
                        title={isSidebarCollapsed ? "Expand navigation" : "HIRA Advertising"}
                    >
                        <img src={HIRA_LOGO} alt="HIRA Advertising" className="sidebar-logo-img" />
                    </div>
                    {/* Navigation Collapse / Close Toggle on left black sidebar */}
                    <button className="sidebar-collapse-toggle" onClick={toggleSidebar} title={isSidebarCollapsed ? 'Open navigation' : 'Close navigation'} aria-label={isSidebarCollapsed ? 'Open navigation' : 'Close navigation'}>
                        {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                    </button>
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
                    <button className={`nav-item ${activeTab === 'proposal-builder' ? 'active' : ''}`} onClick={() => setActiveTab('proposal-builder')}>
                        <FileText size={18} />
                        <span>Proposal Builder</span>
                    </button>
                    <button className={`nav-item ${activeTab === 'daily-update' ? 'active' : ''}`} onClick={() => setActiveTab('daily-update')}>
                        <Zap size={18} />
                        <span>Daily Updates</span>
                    </button>
                    <button className={`nav-item ${activeTab === 'guide' ? 'active' : ''}`} onClick={() => setActiveTab('guide')}>
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
                        {isSidebarCollapsed && (
                            <button className="sidebar-collapse-toggle-floating" onClick={toggleSidebar} title="Open navigation" aria-label="Open navigation">
                                <PanelLeftOpen size={18} />
                            </button>
                        )}
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
                                            {fileProcessing.type === 'ppt' ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <ClaudeAiIcon size={14} /> {fileProcessing.phase}
                                                </span>
                                            ) : (
                                                <span>Excel: {fileProcessing.phase}</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {missedPptSlides.length > 0 && (
                                    <button 
                                        className="btn-primary-admin" 
                                        style={{ background: '#ef4444', borderColor: '#ef4444', color: 'white', cursor: 'pointer', padding: '7px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                                        onClick={handleResyncMissedSlides}
                                        disabled={Boolean(fileProcessing)}
                                        title="Re-upload missed photos directly to Google Cloud Server"
                                    >
                                        <RefreshCw size={15} />
                                        Re-Sync {missedPptSlides.length} Missed
                                    </button>
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
                                    src={krishnaAvatar} 
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
                    <motion.div 
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="dashboard-view qm-dashboard-view"
                    >
                        <div className="qm-main-container">
                            
                            {/* 🌟 Header Section */}
                            <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                                className="qm-header-section"
                            >
                                <div>
                                    <h2 className="qm-page-title">
                                        Dashboard
                                    </h2>
                                    <p className="qm-page-subtitle">
                                        Live snapshot of your Heera Advertising media network
                                    </p>
                                </div>
                                <div className="qm-header-controls">
                                    <button className="qm-btn-secondary" onClick={() => exportProposalExcel(hoardings)} title="Export clean proposal deck for clients">
                                        <FileDown size={15} /> Export Proposal
                                    </button>
                                    <button className="qm-btn-primary" onClick={() => setIsAddModalOpen(true)}>
                                        <Plus size={16} /> Add Site
                                    </button>
                                </div>
                            </motion.div>

                            {/* 📈 4 KPI Stat Cards (Matching Screenshot Proportions) */}
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: false, amount: 0.15 }}
                                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                                className="qm-kpi-grid"
                            >
                                
                                {/* Card 1: Total Revenue */}
                                <motion.div 
                                    whileHover={{ y: -3, transition: { duration: 0.18 } }}
                                    className="qm-kpi-card"
                                >
                                    <div className="qm-kpi-top">
                                        <span className="qm-kpi-label">Total revenue</span>
                                        <div className="qm-kpi-icon-box qm-green">
                                            <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>₹</span>
                                        </div>
                                    </div>
                                    <div className="qm-kpi-value-row">
                                        <span className="qm-kpi-main-val">
                                            <AnimatedCounter 
                                                value={totalMonthlyRevenue > 10000000 ? (totalMonthlyRevenue / 10000000) : (totalMonthlyRevenue > 100000 ? (totalMonthlyRevenue / 100000) : (totalMonthlyRevenue > 1000 ? (totalMonthlyRevenue / 1000) : totalMonthlyRevenue))} 
                                                prefix="₹" 
                                                suffix={totalMonthlyRevenue > 10000000 ? " Cr" : (totalMonthlyRevenue > 100000 ? " L" : (totalMonthlyRevenue > 1000 ? " K" : ""))} 
                                                decimals={2} 
                                                duration={800} 
                                            />
                                        </span>
                                    </div>
                                </motion.div>

                                {/* Card 2: Total Bookings */}
                                <motion.div 
                                    whileHover={{ y: -3, transition: { duration: 0.18 } }}
                                    className="qm-kpi-card clickable" 
                                    role="button" 
                                    tabIndex={0} 
                                    onClick={() => openInventory('All')} 
                                    onKeyDown={(e) => e.key === 'Enter' && openInventory('All')}
                                >
                                    <div className="qm-kpi-top">
                                        <span className="qm-kpi-label">Total bookings</span>
                                        <div className="qm-kpi-icon-box qm-blue">
                                            <Layers size={16} />
                                        </div>
                                    </div>
                                    <div className="qm-kpi-value-row">
                                        <span className="qm-kpi-main-val">
                                            <AnimatedCounter value={bookedCount} duration={800} />
                                        </span>
                                    </div>
                                </motion.div>

                                {/* Card 3: Active Sites */}
                                <motion.div 
                                    whileHover={{ y: -3, transition: { duration: 0.18 } }}
                                    className="qm-kpi-card clickable" 
                                    role="button" 
                                    tabIndex={0} 
                                    onClick={() => openInventory('Available')} 
                                    onKeyDown={(e) => e.key === 'Enter' && openInventory('Available')}
                                >
                                    <div className="qm-kpi-top">
                                        <span className="qm-kpi-label">Active sites</span>
                                        <div className="qm-kpi-icon-box qm-orange">
                                            <Package size={16} />
                                        </div>
                                    </div>
                                    <div className="qm-kpi-value-row">
                                        <span className="qm-kpi-main-val">
                                            <AnimatedCounter value={availableCount} duration={800} />
                                        </span>
                                    </div>
                                </motion.div>

                                {/* Card 4: Clients */}
                                <motion.div 
                                    whileHover={{ y: -3, transition: { duration: 0.18 } }}
                                    className="qm-kpi-card clickable"
                                    onClick={() => setActiveTab('clients')}
                                >
                                    <div className="qm-kpi-top">
                                        <span className="qm-kpi-label">Verified Sites</span>
                                        <div className="qm-kpi-icon-box qm-purple">
                                            <Users size={16} />
                                        </div>
                                    </div>
                                    <div className="qm-kpi-value-row">
                                        <span className="qm-kpi-main-val">
                                            <AnimatedCounter value={verifiedAssetsCount} duration={800} />
                                        </span>
                                    </div>
                                </motion.div>

                            </motion.div>

                            {/* 📊 Middle Section: Revenue Trend Line Chart & Category Mix Donut (Screenshot 1) */}
                            <motion.div 
                                initial={{ opacity: 0, y: 22 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: false, amount: 0.15 }}
                                transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
                                className="qm-bento-grid"
                            >
                                
                                {/* 📈 Left Card: Media Formats (Real Data) */}
                                <motion.div 
                                    whileHover={{ y: -2, transition: { duration: 0.18 } }}
                                    className="qm-card"
                                >
                                    <div className="qm-card-header">
                                        <div>
                                            <h3 className="qm-card-title">Media Formats</h3>
                                        </div>
                                        <span className="qm-header-badge">
                                            {mediaFormats.length} Types
                                        </span>
                                    </div>

                                    <div style={{ padding: '24px 0 0' }}>
                                        <QuickMartTopLocationsChart data={mediaFormats} />
                                    </div>
                                </motion.div>

                                {/* 🍩 Right Card: Category Mix Thick Donut Chart */}
                                <motion.div 
                                    whileHover={{ y: -2, transition: { duration: 0.18 } }}
                                    className="qm-card"
                                >
                                    <div className="qm-card-header">
                                        <div>
                                            <h3 className="qm-card-title">Category mix</h3>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '220px' }}>
                                        <QuickMartDonutChart 
                                            data={overviewPriceTiers.map(t => ({
                                                label: t.label.replace(' / mo', ''),
                                                value: t.count,
                                                color: t.color
                                            }))}
                                            size={185}
                                            strokeWidth={32}
                                        />
                                    </div>
                                </motion.div>

                            </motion.div>

                            {/* 📊 Lower Section: Top Locations Bar Chart & Recent Orders Table (Screenshot 2) */}
                            <motion.div 
                                initial={{ opacity: 0, y: 22 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: false, amount: 0.15 }}
                                transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
                                className="qm-bento-grid"
                            >
                                
                                {/* 🗺️ Left Card: Top Locations Horizontal Bars */}
                                <motion.div 
                                    whileHover={{ y: -2, transition: { duration: 0.18 } }}
                                    className="qm-card"
                                >
                                    <div className="qm-card-header">
                                        <div>
                                            <h3 className="qm-card-title">Top locations</h3>
                                        </div>
                                        <span className="qm-header-badge">{overviewTopZones.length} Corridors</span>
                                    </div>

                                    <div style={{ padding: '6px 0 0' }}>
                                        <QuickMartTopLocationsChart 
                                            data={overviewTopZones}
                                            onBarClick={(zoneName) => {
                                                setInventoryLocalityFilter(zoneName);
                                                setActiveTab('inventory');
                                            }}
                                        />
                                    </div>
                                </motion.div>

                                {/* 📋 Right Card: Recent Bookings / Sites Activity Table */}
                                <motion.div 
                                    whileHover={{ y: -2, transition: { duration: 0.18 } }}
                                    className="qm-card"
                                >
                                    <div className="qm-card-header">
                                        <div>
                                            <h3 className="qm-card-title">Recent site bookings</h3>
                                        </div>
                                        <button 
                                            onClick={() => openInventory('All')} 
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#16a34a',
                                                fontSize: '0.85rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                padding: '4px 8px',
                                                borderRadius: '6px'
                                            }}
                                        >
                                            View all
                                        </button>
                                    </div>

                                    <div className="qm-recent-table-wrap" style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <th style={{ padding: '10px 8px', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase' }}>ORDER / SITE</th>
                                                    <th style={{ padding: '10px 8px', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase' }}>LOCATION</th>
                                                    <th style={{ padding: '10px 8px', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase' }}>TOTAL</th>
                                                    <th style={{ padding: '10px 8px', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', textAlign: 'right' }}>STATUS</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {recentSites.map((site, sIdx) => {
                                                    const statusPillStyles = {
                                                        'Available': { bg: '#ecfdf5', color: '#059669', dot: '#10b981', text: 'Available' },
                                                        'Booked': { bg: '#fee2e2', color: '#dc2626', dot: '#ef4444', text: 'Booked' },
                                                        'Prime': { bg: '#ecfdf5', color: '#047857', dot: '#059669', text: 'Prime Active' },
                                                        'Reserved': { bg: '#fef3c7', color: '#d97706', dot: '#f59e0b', text: 'Reserved' },
                                                        'Maintenance': { bg: '#f1f5f9', color: '#475569', dot: '#64748b', text: 'Maintenance' }
                                                    };
                                                    const style = statusPillStyles[site.status] || statusPillStyles['Available'];

                                                    return (
                                                        <tr 
                                                            key={site.id + sIdx}
                                                            onClick={() => openInventory('All')}
                                                            style={{ 
                                                                borderBottom: '1px solid #f8fafc',
                                                                cursor: 'pointer',
                                                                transition: 'background 0.15s ease'
                                                            }}
                                                            className="qm-table-row"
                                                        >
                                                            <td style={{ padding: '12px 8px', fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                                                                {site.id}
                                                            </td>
                                                            <td style={{ padding: '12px 8px', fontSize: '0.82rem', fontWeight: 500, color: '#475569', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {site.location}
                                                            </td>
                                                            <td style={{ padding: '12px 8px', fontSize: '0.84rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                                                                ₹{site.rate.toLocaleString('en-IN')}
                                                            </td>
                                                            <td style={{ padding: '12px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                                <span style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px',
                                                                    background: style.bg,
                                                                    color: style.color,
                                                                    padding: '4px 10px',
                                                                    borderRadius: '999px',
                                                                    fontSize: '0.74rem',
                                                                    fontWeight: 700
                                                                }}>
                                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: style.dot }}></span>
                                                                    {style.text}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </motion.div>

                            </motion.div>

                            {/* 📊 Bottom Row: Average Order Value & Low Stock Items (Screenshot 2 Bottom) */}
                            <motion.div 
                                initial={{ opacity: 0, y: 22 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: false, amount: 0.15 }}
                                transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
                                style={{ display: 'grid', gridTemplateColumns: '1.48fr 1fr', gap: '24px' }}
                            >
                                
                                {/* Bottom Card 1: Average order value */}
                                <motion.div 
                                    whileHover={{ y: -2, transition: { duration: 0.18 } }}
                                    className="qm-card" 
                                    style={{ padding: '22px 26px' }}
                                >
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>
                                        Average order value
                                    </div>
                                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1 }}>
                                        ₹<AnimatedCounter value={avgMonthlyRate} duration={1000} />
                                    </div>
                                </motion.div>

                                {/* Bottom Card 2: Low stock items (< 10) */}
                                <motion.div 
                                    whileHover={{ y: -2, transition: { duration: 0.18 } }}
                                    className="qm-card" 
                                    style={{ padding: '22px 26px' }}
                                >
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>
                                        Low stock items (&lt; 10)
                                    </div>
                                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ea580c', letterSpacing: '-0.02em', lineHeight: 1 }}>
                                        <AnimatedCounter value={3} duration={800} />
                                    </div>
                                </motion.div>

                            </motion.div>

                            {/* 📷 Field Audit Feed (Matched & Unmatched Sections) */}
                            <motion.div 
                                initial={{ opacity: 0, y: 24 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: false, amount: 0.12 }}
                                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                className="qm-card" 
                                style={{ padding: '24px 28px', background: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px -4px rgba(0, 0, 0, 0.05)' }}
                            >
                                
                                {/* 🌟 Header Section */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '18px' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span>Live Field Audit & Ground Staff Telemetry</span>
                                            </h3>
                                            
                                            {/* Live Radar Pulse Badge */}
                                            <span style={{ 
                                                display: 'inline-flex', 
                                                alignItems: 'center', 
                                                gap: '6px', 
                                                background: '#ecfdf5', 
                                                color: '#059669', 
                                                border: '1px solid #a7f3d0', 
                                                padding: '3px 10px', 
                                                borderRadius: '20px', 
                                                fontSize: '0.74rem', 
                                                fontWeight: 700 
                                            }}>
                                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.25)' }} />
                                                50m Geofence Radar Active
                                            </span>

                                            {/* Claude Vision AI Pill */}
                                            <span style={{ 
                                                display: 'inline-flex', 
                                                alignItems: 'center', 
                                                gap: '5px', 
                                                background: 'rgba(217, 119, 87, 0.1)', 
                                                color: '#d97757', 
                                                border: '1px solid rgba(217, 119, 87, 0.3)', 
                                                padding: '3px 10px', 
                                                borderRadius: '20px', 
                                                fontSize: '0.74rem', 
                                                fontWeight: 700 
                                            }}>
                                                <Sparkles size={12} />
                                                Claude Vision AI
                                            </span>
                                        </div>
                                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.84rem', lineHeight: '1.4' }}>
                                            Real-time GPS proximity matching, instant high-res billboard verification, and ground staff photo stream.
                                        </p>
                                    </div>

                                    {/* Action Buttons Toolbar */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                         <button 
                                            type="button"
                                            onClick={() => setIsAppDownloadModalOpen(true)}
                                            style={{
                                                background: '#0f172a',
                                                color: '#ffffff',
                                                border: 'none',
                                                padding: '8px 14px',
                                                borderRadius: '10px',
                                                fontSize: '0.8rem',
                                                fontWeight: 700,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                cursor: 'pointer',
                                                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.2)',
                                                transition: 'opacity 0.15s ease'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                            title="Download Ground Staff Android APK & Windows PC App"
                                        >
                                            <Download size={14} /> Download Apps
                                        </button>

                                        <button 
                                            type="button"
                                            onClick={() => {
                                                if (navigator.clipboard) {
                                                    navigator.clipboard.writeText(window.location.origin + '/staff/upload');
                                                    setStaffLinkCopied(true);
                                                    setTimeout(() => setStaffLinkCopied(false), 2000);
                                                }
                                            }}
                                            style={{
                                                background: staffLinkCopied ? '#ecfdf5' : '#ffffff',
                                                color: staffLinkCopied ? '#059669' : '#334155',
                                                border: `1px solid ${staffLinkCopied ? '#a7f3d0' : '#cbd5e1'}`,
                                                padding: '8px 14px',
                                                borderRadius: '10px',
                                                fontSize: '0.8rem',
                                                fontWeight: 700,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease'
                                            }}
                                            title="Copy mobile camera upload link for field staff"
                                        >
                                            {staffLinkCopied ? <Check size={14} /> : <Share2 size={14} />}
                                            <span>{staffLinkCopied ? 'Link Copied!' : 'Copy Staff Link'}</span>
                                        </button>

                                        <button 
                                            type="button"
                                            onClick={() => window.open('/staff/upload', '_blank')}
                                            style={{
                                                background: '#f8fafc',
                                                color: '#475569',
                                                border: '1px solid #e2e8f0',
                                                padding: '8px 12px',
                                                borderRadius: '10px',
                                                fontSize: '0.8rem',
                                                fontWeight: 700,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                cursor: 'pointer'
                                            }}
                                            title="Open mobile viewfinder upload page in new tab"
                                        >
                                            <ExternalLink size={13} /> Viewfinder
                                        </button>
                                    </div>
                                </div>

                                {/* 📊 Micro-Telemetry Status Bar */}
                                <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
                                    gap: '12px', 
                                    marginBottom: '20px' 
                                }}>
                                    <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '14px', padding: '12px 16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', marginBottom: '4px' }}>
                                            <Crosshair size={15} />
                                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b' }}>Match Accuracy</span>
                                        </div>
                                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                                            {matchedPhotoUpdates.length > 0 
                                                ? `${Math.round((matchedPhotoUpdates.length / (matchedPhotoUpdates.length + unmatchedPhotoUpdates.length || 1)) * 100)}% Auto-Matched` 
                                                : '100% 50m Range'}
                                        </div>
                                    </div>

                                    <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '14px', padding: '12px 16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', marginBottom: '4px' }}>
                                            <Camera size={15} />
                                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b' }}>Today's Captures</span>
                                        </div>
                                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                                            {todayStaffUploads.length} Photos Today
                                        </div>
                                    </div>

                                    <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '14px', padding: '12px 16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6366f1', marginBottom: '4px' }}>
                                            <Radio size={15} />
                                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b' }}>Geofence Precision</span>
                                        </div>
                                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                                            50m Sub-Meter GPS
                                        </div>
                                    </div>

                                    <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '14px', padding: '12px 16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#d97757', marginBottom: '4px' }}>
                                            <ShieldCheck size={15} />
                                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b' }}>Verification Engine</span>
                                        </div>
                                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                                            Claude AI Vision
                                        </div>
                                    </div>
                                </div>

                                {/* 🎛️ Segmented Sub-Tab Switcher */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                                    <div style={{ 
                                        display: 'inline-flex', 
                                        background: '#f1f5f9', 
                                        padding: '4px', 
                                        borderRadius: '12px', 
                                        gap: '4px' 
                                    }}>
                                        <button 
                                            type="button"
                                            onClick={() => setFieldAuditTab('matched')}
                                            style={{
                                                padding: '7px 16px',
                                                borderRadius: '9px',
                                                border: 'none',
                                                fontSize: '0.8rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                background: fieldAuditTab === 'matched' ? '#ffffff' : 'transparent',
                                                color: fieldAuditTab === 'matched' ? '#0f172a' : '#64748b',
                                                boxShadow: fieldAuditTab === 'matched' ? '0 2px 6px rgba(0, 0, 0, 0.06)' : 'none',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <CheckCircle size={14} color={fieldAuditTab === 'matched' ? '#10b981' : '#94a3b8'} />
                                            <span>AI Auto-Matched</span>
                                            <span style={{ 
                                                background: fieldAuditTab === 'matched' ? '#ecfdf5' : '#e2e8f0', 
                                                color: fieldAuditTab === 'matched' ? '#059669' : '#64748b', 
                                                fontSize: '0.72rem', 
                                                padding: '2px 7px', 
                                                borderRadius: '20px',
                                                fontWeight: 800 
                                            }}>
                                                {matchedPhotoUpdates.length}
                                            </span>
                                        </button>

                                        <button 
                                            type="button"
                                            onClick={() => setFieldAuditTab('unmatched')}
                                            style={{
                                                padding: '7px 16px',
                                                borderRadius: '9px',
                                                border: 'none',
                                                fontSize: '0.8rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                background: fieldAuditTab === 'unmatched' ? '#ffffff' : 'transparent',
                                                color: fieldAuditTab === 'unmatched' ? '#0f172a' : '#64748b',
                                                boxShadow: fieldAuditTab === 'unmatched' ? '0 2px 6px rgba(0, 0, 0, 0.06)' : 'none',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <Clock3 size={14} color={fieldAuditTab === 'unmatched' ? '#f59e0b' : '#94a3b8'} />
                                            <span>Out-of-Range / Unmatched</span>
                                            <span style={{ 
                                                background: fieldAuditTab === 'unmatched' ? '#fef3c7' : '#e2e8f0', 
                                                color: fieldAuditTab === 'unmatched' ? '#d97706' : '#64748b', 
                                                fontSize: '0.72rem', 
                                                padding: '2px 7px', 
                                                borderRadius: '20px',
                                                fontWeight: 800 
                                            }}>
                                                {unmatchedPhotoUpdates.length}
                                            </span>
                                        </button>
                                    </div>

                                    {/* Review Queue Shortcut Pill */}
                                    <button 
                                        type="button"
                                        onClick={() => setActiveTab('staff-review')}
                                        style={{
                                            background: '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                            color: '#475569',
                                            padding: '7px 14px',
                                            borderRadius: '10px',
                                            fontSize: '0.8rem',
                                            fontWeight: 700,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            cursor: 'pointer',
                                            transition: 'background 0.15s ease'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                        onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                                    >
                                        <Camera size={14} color="#6366f1" />
                                        <span>Manual Review Queue</span>
                                        <span style={{ 
                                            background: reviewQueue.length > 0 ? '#fee2e2' : '#e2e8f0', 
                                            color: reviewQueue.length > 0 ? '#dc2626' : '#64748b', 
                                            fontSize: '0.72rem', 
                                            padding: '2px 8px', 
                                            borderRadius: '20px', 
                                            fontWeight: 800 
                                        }}>
                                            {reviewQueue.length}
                                        </span>
                                    </button>
                                </div>

                                {/* ⏳ Unmatched Tab 48h Retention Alert */}
                                {fieldAuditTab === 'unmatched' && (
                                    <div style={{ 
                                        background: '#fffbeb', 
                                        border: '1px solid #fde68a', 
                                        borderRadius: '12px', 
                                        padding: '10px 16px', 
                                        margin: '0 0 16px 0', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'space-between', 
                                        gap: '12px' 
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>
                                            <Clock3 size={16} color="#d97706" />
                                            <span><strong>48-Hour Auto-Purge Policy:</strong> Unmatched photos not assigned to a site within 48 hours are automatically purged to prevent stale storage.</span>
                                        </div>
                                        {purgedUnmatchedCount > 0 && (
                                            <span style={{ fontSize: '0.74rem', background: '#ffffff', padding: '3px 9px', borderRadius: '8px', color: '#78350f', border: '1px solid #fcd34d', fontWeight: 800 }}>
                                                {purgedUnmatchedCount} purged
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* 📷 Tab Content: Matched Photos */}
                                {fieldAuditTab === 'matched' ? (
                                    matchedPhotoUpdates.length > 0 ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
                                            {matchedPhotoUpdates.slice(0, 16).map(upload => {
                                                const isAuto = upload.Status === 'AUTO_APPROVED' || upload.Decision === 'GEMINI_GPS_AUTO_MATCH' || upload.Decision === 'GPS_AUTO_MATCH';
                                                return (
                                                    <div 
                                                        key={upload.UploadId} 
                                                        style={{ 
                                                            background: '#ffffff', 
                                                            border: '1px solid #e2e8f0', 
                                                            borderRadius: '16px', 
                                                            overflow: 'hidden', 
                                                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                                                        }}
                                                    >
                                                        {/* Image Thumbnail Container */}
                                                        <div style={{ position: 'relative', height: '140px', background: '#0f172a', overflow: 'hidden' }}>
                                                            <img 
                                                                src={upload.ImageURL} 
                                                                alt={upload.ApprovedSite || 'Staff capture'} 
                                                                onClick={() => setPreviewHoarding({ ImageURL: upload.ImageURL, City: 'Staff', "Location ": upload.ApprovedSite || 'Staff upload' })} 
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in', transition: 'transform 0.2s ease' }}
                                                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                                            />
                                                            {/* Floating Badges on Image */}
                                                            <div style={{ position: 'absolute', top: '8px', left: '8px', display: 'flex', gap: '6px' }}>
                                                                <span style={{ 
                                                                    background: 'rgba(16, 185, 129, 0.9)', 
                                                                    backdropFilter: 'blur(6px)', 
                                                                    color: '#ffffff', 
                                                                    fontSize: '0.68rem', 
                                                                    fontWeight: 800, 
                                                                    padding: '3px 8px', 
                                                                    borderRadius: '8px',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}>
                                                                    <Check size={11} /> 50m Auto-Matched
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Metadata Body */}
                                                        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                                                            <div>
                                                                <strong style={{ fontSize: '0.88rem', color: '#0f172a', display: 'block', lineHeight: '1.3', marginBottom: '4px' }}>
                                                                    {upload.ApprovedSite || upload.SuggestedSite || 'Hoarding Site'}
                                                                </strong>
                                                                <div style={{ fontSize: '0.74rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                                                                    <Clock3 size={12} />
                                                                    <span>{upload.CapturedAt ? new Date(upload.CapturedAt).toLocaleString('en-IN') : 'Recent capture'}</span>
                                                                </div>
                                                            </div>

                                                            {/* Actions */}
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '10px', marginTop: '4px' }}>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => setSelectedPinpointUpload(upload)}
                                                                    style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '5px',
                                                                        padding: '5px 10px',
                                                                        borderRadius: '8px',
                                                                        border: '1px solid #e2e8f0',
                                                                        background: '#f8fafc',
                                                                        color: '#0071e3',
                                                                        fontSize: '0.74rem',
                                                                        fontWeight: 700,
                                                                        cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    <MapPin size={12} /> Pinpoint GPS
                                                                </button>

                                                                <button 
                                                                    type="button"
                                                                    onClick={() => setPreviewHoarding({ ImageURL: upload.ImageURL, City: 'Staff', "Location ": upload.ApprovedSite || 'Staff upload' })}
                                                                    style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px',
                                                                        padding: '5px 10px',
                                                                        borderRadius: '8px',
                                                                        border: 'none',
                                                                        background: '#f1f5f9',
                                                                        color: '#475569',
                                                                        fontSize: '0.74rem',
                                                                        fontWeight: 700,
                                                                        cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    <Eye size={12} /> Preview
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        /* 📡 State-of-the-art Live Telemetry Radar Empty State */
                                        <div style={{ 
                                            background: '#f8fafc', 
                                            borderRadius: '18px', 
                                            border: '1px solid #e2e8f0', 
                                            padding: '36px 24px', 
                                            textAlign: 'center',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            position: 'relative',
                                            overflow: 'hidden'
                                        }}>
                                            {/* Glowing Geofence Radar Graphic */}
                                            <div style={{ 
                                                width: '72px', 
                                                height: '72px', 
                                                borderRadius: '50%', 
                                                background: '#ecfdf5', 
                                                border: '2px solid #a7f3d0', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                color: '#059669',
                                                marginBottom: '16px',
                                                boxShadow: '0 0 0 8px rgba(16, 185, 129, 0.1), 0 0 0 16px rgba(16, 185, 129, 0.05)'
                                            }}>
                                                <Radio size={32} />
                                            </div>

                                            <h4 style={{ margin: '0 0 8px 0', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
                                                Geofence Telemetry & Radar Ready
                                            </h4>
                                            <p style={{ margin: '0 0 24px 0', fontSize: '0.84rem', color: '#64748b', maxWidth: '580px', lineHeight: '1.55' }}>
                                                When on-ground staff captures billboard photos from the <strong>Android APK</strong> or <strong>Mobile Camera Viewfinder</strong>, our 50m GPS geofencing & Claude Vision AI automatically verify and attach high-res photos to billboard history without manual review.
                                            </p>

                                            {/* 3 Interactive Capability Tiles */}
                                            <div style={{ 
                                                display: 'grid', 
                                                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', 
                                                gap: '12px', 
                                                width: '100%', 
                                                maxWidth: '720px', 
                                                marginBottom: '24px',
                                                textAlign: 'left' 
                                            }}>
                                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', fontWeight: 700, fontSize: '0.82rem', marginBottom: '4px' }}>
                                                        <Crosshair size={15} />
                                                        <span>50m Geofence Engine</span>
                                                    </div>
                                                    <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748b', lineHeight: '1.4' }}>
                                                        Computes exact great-circle distance against master coordinates in &lt;100ms.
                                                    </p>
                                                </div>

                                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#d97757', fontWeight: 700, fontSize: '0.82rem', marginBottom: '4px' }}>
                                                        <Sparkles size={15} />
                                                        <span>Claude Vision AI</span>
                                                    </div>
                                                    <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748b', lineHeight: '1.4' }}>
                                                        Detects lighting, nighttime illumination, clarity, and obstruction parameters.
                                                    </p>
                                                </div>

                                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', fontWeight: 700, fontSize: '0.82rem', marginBottom: '4px' }}>
                                                        <Smartphone size={15} />
                                                        <span>Instant Camera Feed</span>
                                                    </div>
                                                    <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748b', lineHeight: '1.4' }}>
                                                        Zero viewfinder delay with offline queue and automatic background synchronization.
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Quick Action Buttons */}
                                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                                <button 
                                                    type="button"
                                                    onClick={() => window.open('/staff/upload', '_blank')}
                                                    style={{
                                                        background: '#059669',
                                                        color: '#ffffff',
                                                        border: 'none',
                                                        padding: '10px 18px',
                                                        borderRadius: '12px',
                                                        fontSize: '0.82rem',
                                                        fontWeight: 700,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        cursor: 'pointer',
                                                        boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)'
                                                    }}
                                                >
                                                    <Camera size={15} /> Launch Mobile Camera
                                                </button>

                                                <button 
                                                    type="button"
                                                    onClick={() => setIsAppDownloadModalOpen(true)}
                                                    style={{
                                                        background: '#ffffff',
                                                        color: '#0f172a',
                                                        border: '1px solid #cbd5e1',
                                                        padding: '10px 18px',
                                                        borderRadius: '12px',
                                                        fontSize: '0.82rem',
                                                        fontWeight: 700,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <Download size={15} /> Download Staff Mobile APK
                                                </button>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    /* 📷 Tab Content: Unmatched Photos */
                                    unmatchedPhotoUpdates.length > 0 ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
                                            {unmatchedPhotoUpdates.map(upload => (
                                                <div 
                                                    key={upload.UploadId} 
                                                    style={{ 
                                                        background: '#ffffff', 
                                                        border: '1.5px solid #fde68a', 
                                                        borderRadius: '16px', 
                                                        overflow: 'hidden', 
                                                        boxShadow: '0 2px 6px rgba(245, 158, 11, 0.08)',
                                                        display: 'flex',
                                                        flexDirection: 'column'
                                                    }}
                                                >
                                                    {/* Image Thumbnail Container */}
                                                    <div style={{ position: 'relative', height: '140px', background: '#0f172a', overflow: 'hidden' }}>
                                                        <img 
                                                            src={upload.ImageURL} 
                                                            alt={upload.SuggestedSite || 'Unmatched photo'} 
                                                            onClick={() => setPreviewHoarding({ ImageURL: upload.ImageURL, City: 'Staff', "Location ": upload.SuggestedSite || 'Unmatched' })} 
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }}
                                                        />
                                                        <div style={{ position: 'absolute', top: '8px', left: '8px' }}>
                                                            <span style={{ 
                                                                background: 'rgba(217, 119, 6, 0.9)', 
                                                                backdropFilter: 'blur(6px)', 
                                                                color: '#ffffff', 
                                                                fontSize: '0.68rem', 
                                                                fontWeight: 800, 
                                                                padding: '3px 8px', 
                                                                borderRadius: '8px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}>
                                                                <Clock3 size={11} /> {upload.DistanceM ? `${Math.round(Number(upload.DistanceM))}m away` : 'Out of 50m range'}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Metadata Body */}
                                                    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                                                        <div>
                                                            <strong style={{ fontSize: '0.88rem', color: '#0f172a', display: 'block', lineHeight: '1.3', marginBottom: '4px' }}>
                                                                {upload.SuggestedSite || 'No 50m Site Match'}
                                                            </strong>
                                                            <div style={{ fontSize: '0.74rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                                                                <span>{upload.CapturedAt ? new Date(upload.CapturedAt).toLocaleString('en-IN') : 'Pending match'}</span>
                                                            </div>
                                                        </div>

                                                        {/* Action Buttons */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid #fef3c7', paddingTop: '10px' }}>
                                                            <button 
                                                                type="button"
                                                                onClick={() => setSelectedPinpointUpload(upload)}
                                                                style={{
                                                                    flex: 1,
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '4px',
                                                                    padding: '6px 10px',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid #cbd5e1',
                                                                    background: '#f8fafc',
                                                                    color: '#334155',
                                                                    fontSize: '0.74rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                <MapPin size={12} /> Pinpoint Map
                                                            </button>

                                                            <button 
                                                                type="button"
                                                                onClick={() => setActiveTab('staff-review')}
                                                                style={{
                                                                    flex: 1,
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '4px',
                                                                    padding: '6px 10px',
                                                                    borderRadius: '8px',
                                                                    border: 'none',
                                                                    background: '#0f172a',
                                                                    color: '#ffffff',
                                                                    fontSize: '0.74rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                Assign Site
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ 
                                            background: '#f8fafc', 
                                            borderRadius: '16px', 
                                            border: '1px solid #e2e8f0', 
                                            padding: '32px 20px', 
                                            textAlign: 'center',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center'
                                        }}>
                                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                                                <CheckCircle size={24} />
                                            </div>
                                            <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>Zero Out-of-Range Photos</h4>
                                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', maxWidth: '480px' }}>
                                                All ground staff photo captures have matched active billboard inventory within the 50m geofencing radius.
                                            </p>
                                        </div>
                                    )
                                )}
                            </motion.div>

                        </div>
                    </motion.div>
                )}

                {activeTab === 'sheet-editor' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 12 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0, y: -8 }} 
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} 
                        className="dashboard-view"
                    >
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
                    </motion.div>
                )}

                {activeTab === 'proposal-builder' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 12 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0, y: -8 }} 
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} 
                        className="dashboard-view"
                    >
                        <ProposalBuilder hoardings={safeHoardings} />
                    </motion.div>
                )}

                {activeTab === 'daily-update' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 12 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0, y: -8 }} 
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} 
                        className="dashboard-view"
                    >
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
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                        <label style={{ margin: 0 }}>Location Match</label>
                                                        {img.matchedLocation && (() => {
                                                            const site = hoardings.find(h => (h["Locality Site Location"] || h["Location "] || h.Location) === img.matchedLocation);
                                                            const targetCity = site?.City || 'city';
                                                            const targetSiteName = site?.["Location "] || site?.Location || site?.["Locality Site Location"] || img.matchedLocation;
                                                            return (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => navigate(`/${encodeURIComponent(targetCity)}/${encodeURIComponent(targetSiteName)}#site-history`)}
                                                                    style={{
                                                                        background: 'transparent',
                                                                        border: 'none',
                                                                        color: '#4f46e5',
                                                                        fontSize: '0.78rem',
                                                                        fontWeight: 600,
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '3px',
                                                                        padding: 0
                                                                    }}
                                                                    title="View site history page"
                                                                >
                                                                    View Site <ExternalLink size={12} />
                                                                </button>
                                                            );
                                                        })()}
                                                    </div>
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
                                                        {img.gpsCoord && (
                                                            <span className="meta-pill" style={{ background: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}>
                                                                📍 {img.gpsCoord.lat.toFixed(5)}, {img.gpsCoord.lng.toFixed(5)}
                                                            </span>
                                                        )}
                                                        {img.distanceM != null && (
                                                            <span className="meta-pill" style={{ background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                                                                📏 {img.distanceM}m away
                                                            </span>
                                                        )}
                                                        {img.analysis?.billboardType && <span className="meta-pill">{img.analysis.billboardType}</span>}
                                                        {img.analysis?.keyLandmarks?.slice(0, 2).map((l, k) => <span key={k} className="meta-pill landmark">{l}</span>)}
                                                    </div>
                                                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <span>Match Confidence: <strong>{img.confidence > 1 ? Math.round(img.confidence) : Math.round((img.confidence || 0) * 100)}%</strong></span>
                                                        {img.uploaded && <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '0.82rem' }}>✅ Auto-Synced to History</span>}
                                                    </label>
                                                    {img.reasoning && <p className="ai-reasoning-text"><span>Logic:</span> {img.reasoning}</p>}

                                                    {img.matchedLocation && (() => {
                                                        const site = hoardings.find(h => (h["Locality Site Location"] || h["Location "] || h.Location) === img.matchedLocation);
                                                        const siteCoords = extractSiteCoordinates(site);
                                                        const targetLat = img.gpsCoord?.lat || siteCoords?.lat;
                                                        const targetLng = img.gpsCoord?.lng || siteCoords?.lng;

                                                        if (targetLat && targetLng) {
                                                            return (
                                                                <a
                                                                    href={`https://www.google.com/maps?q=${targetLat},${targetLng}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="view-on-maps-link"
                                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '0.85rem', color: '#2563eb', textDecoration: 'none' }}
                                                                >
                                                                    📍 Open in Google Maps
                                                                </a>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>

                                                {!img.uploaded ? (
                                                    <button
                                                        className="upload-single-btn"
                                                        onClick={() => uploadDailyUpdate(idx)}
                                                        disabled={!img.matchedLocation || img.uploading}
                                                    >
                                                        {img.uploading ? 'Syncing to History...' : 'Confirm & Sync'}
                                                    </button>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                                                        <div style={{ 
                                                            display: 'flex', 
                                                            alignItems: 'center', 
                                                            justifyContent: 'center', 
                                                            gap: '6px', 
                                                            padding: '7px 12px', 
                                                            background: '#dcfce7', 
                                                            color: '#15803d', 
                                                            borderRadius: '8px', 
                                                            fontSize: '0.84rem', 
                                                            fontWeight: 600 
                                                        }}>
                                                            <CheckCircle size={15} color="#15803d" /> Saved to Site History
                                                        </div>
                                                        {img.matchedLocation && (() => {
                                                            const site = hoardings.find(h => (h["Locality Site Location"] || h["Location "] || h.Location) === img.matchedLocation);
                                                            const targetCity = site?.City || 'city';
                                                            const targetSiteName = site?.["Location "] || site?.Location || site?.["Locality Site Location"] || img.matchedLocation;
                                                            const historyPath = `/${encodeURIComponent(targetCity)}/${encodeURIComponent(targetSiteName)}#site-history`;

                                                            return (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => navigate(historyPath)}
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        gap: '6px',
                                                                        padding: '9px 14px',
                                                                        background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                                                                        color: '#ffffff',
                                                                        border: 'none',
                                                                        borderRadius: '8px',
                                                                        fontSize: '0.84rem',
                                                                        fontWeight: 700,
                                                                        cursor: 'pointer',
                                                                        boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
                                                                        transition: 'all 0.2s ease'
                                                                    }}
                                                                >
                                                                    <ExternalLink size={15} /> Open Site History & Page ➔
                                                                </button>
                                                            );
                                                        })()}
                                                    </div>
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
                    </motion.div>
                )}

                {activeTab === 'staff-review' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 12 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0, y: -8 }} 
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} 
                        className="staff-review-view"
                    >
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
                    </motion.div>
                )}

                {activeTab === 'inventory' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 12 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0, y: -8 }} 
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} 
                        className="inventory-view-container"
                    >
                        <div className="inventory-card">
                            <div className="inventory-header" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', width: '100%' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.625rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>Master Asset Inventory</h3>
                                        <p style={{ margin: '2px 0 0', color: '#6b7280', fontSize: '0.8125rem', fontWeight: 400 }}>{filteredInventory.length} active hoarding assets across operational regions</p>
                                    </div>
                                    <div className="inventory-actions">
                                        <button className="btn-primary-admin" style={{ background: '#10b981' }} onClick={() => { 
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
                                                            onClick={() => handleStatusClick(h)}
                                                            title={(h.STATUS === 'Booked' || h.STATUS === 'Occupied') ? 'Click to Mark Available' : 'Click to Book Site'}
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
                    </motion.div>
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
                        <motion.div 
                            initial={{ opacity: 0, y: 12 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            exit={{ opacity: 0, y: -8 }} 
                            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} 
                            className="tab-content clients-tab" 
                            style={{ 
                                padding: '24px 32px 60px', 
                                background: '#f3f4f6', 
                                minHeight: 'calc(100vh - 72px)',
                                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                            }}
                        >
                            
                            {/* 🌟 Header Section */}
                            <div style={{ marginBottom: '20px' }}>
                                <h1 style={{ fontSize: '1.625rem', fontWeight: 700, color: '#111827', margin: '0 0 2px 0', letterSpacing: '-0.02em' }}>
                                    Clients & Booking
                                </h1>
                                <p style={{ color: '#6b7280', fontSize: '0.8125rem', margin: 0, fontWeight: 400 }}>
                                    {allBookedSites.length} active bookings across all media locations
                                </p>
                            </div>

                            {/* 🔍 Search Box */}
                            <div style={{ background: '#ffffff', borderRadius: '16px', padding: '16px 20px', marginBottom: '20px', border: '1px solid #f3f4f6', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                                <div style={{ background: '#f3f4f6', borderRadius: '9999px', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <Search size={18} color="#9ca3af" />
                                    <input 
                                        type="text"
                                        placeholder="Search bookings by client, location or city..."
                                        value={clientSearchTerm}
                                        onChange={(e) => setClientSearchTerm(e.target.value)}
                                        style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.9rem', color: '#111827', fontWeight: 500 }}
                                    />
                                    {clientSearchTerm && (
                                        <button onClick={() => setClientSearchTerm('')} style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', background: 'transparent', border: 'none' }}>✕</button>
                                    )}
                                </div>
                            </div>

                            {/* 📋 Bookings Table */}
                            <div style={{ background: '#ffffff', borderRadius: '16px', padding: '20px 24px', border: '1px solid #f3f4f6', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <th style={{ padding: '14px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', width: '220px' }}>CLIENT / ADVERTISER</th>
                                            <th style={{ padding: '14px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', width: '250px' }}>SITE LOCATION</th>
                                            <th style={{ padding: '14px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', width: '120px' }}>CITY</th>
                                            <th style={{ padding: '14px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', width: '130px' }}>RENTAL/MONTH</th>
                                            <th style={{ padding: '14px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', width: '180px' }}>BOOKING DATES</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredSites.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} style={{ padding: '60px 20px', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                                                            <Calendar size={24} />
                                                        </div>
                                                        <strong style={{ fontSize: '1rem', color: '#111827', fontWeight: 600 }}>No Bookings Found</strong>
                                                        <p style={{ color: '#6b7280', fontSize: '0.8125rem', margin: 0, maxWidth: '400px' }}>
                                                            {clientSearchTerm ? 'No bookings match your search query.' : 'Booked hoarding sites will appear here.'}
                                                        </p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredSites.map((h, idx) => {
                                                const clientName = String(h.BookedBy).trim();
                                                const avatarBg = avatarBgs[idx % avatarBgs.length];
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
                                                        <td style={{ padding: '16px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                <div style={{
                                                                    width: '38px', height: '38px', borderRadius: '50%', backgroundColor: avatarBg, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                                                }}>
                                                                    <img src={avatarUrl} alt={clientName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => e.currentTarget.style.display = 'none'} />
                                                                </div>
                                                                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                                                                    {clientName}
                                                                </span>
                                                            </div>
                                                        </td>

                                                        {/* SITE LOCATION */}
                                                        <td style={{ padding: '16px' }}>
                                                            <div style={{ fontSize: '0.875rem', color: '#374151', fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {location}
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 400, marginTop: '2px' }}>
                                                                {h.Media || 'Unipole'} • {h.Dimensions || h.Width + 'x' + h.Height || ''}
                                                            </div>
                                                        </td>

                                                        {/* CITY */}
                                                        <td style={{ padding: '16px' }}>
                                                            <span style={{ padding: '4px 10px', background: '#f3f4f6', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#4b5563' }}>
                                                                {city}
                                                            </span>
                                                        </td>

                                                        {/* RENTAL / MONTH */}
                                                        <td style={{ padding: '16px' }}>
                                                            <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#10b981' }}>
                                                                ₹{price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                        </td>

                                                        {/* BOOKING DATES */}
                                                        <td style={{ padding: '16px' }}>
                                                            <div style={{ fontSize: '0.8125rem', color: '#4b5563', fontWeight: 500 }}>
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
                        </motion.div>
                    );
                })()}

                {/* 📖 Embedded System Functionality & Operational Guide View */}
                {activeTab === 'guide' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 12 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0, y: -8 }} 
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} 
                        className="dashboard-view qm-dashboard-view" 
                        style={{ padding: '4px 0 24px 0' }}
                    >
                        <SystemGuide embedded={true} />
                    </motion.div>
                )}
                {uploadNotice && (
                    <aside className={`upload-background-notice ${uploadNotice.status}`} role="status" aria-live="polite">
                        <div className="upload-notice-icon">
                            {uploadNotice.status === 'processing' ? <Clock3 size={21} /> : uploadNotice.status === 'error' ? <XCircle size={21} /> : <CheckCircle size={21} />}
                        </div>
                        <div className="upload-notice-copy">
                            <strong>{uploadNotice.fileName || 'Background upload'}</strong>
                            <span>{uploadNotice.message}</span>
                            {fileProcessing && (
                                <small style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                    {formatProcessingTime(processingSeconds)} elapsed: 
                                    {String(fileProcessing.phase).includes('Claude AI') && <ClaudeAiIcon size={12} />}
                                    {fileProcessing.phase}
                                </small>
                            )}
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

                {/* 📥 Native Apps Download Modal (Apple-Grade Minimalist Interface) */}
                {isAppDownloadModalOpen && (
                    <div 
                        className="admin-modal-overlay" 
                        onClick={() => setIsAppDownloadModalOpen(false)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0, 0, 0, 0.45)',
                            backdropFilter: 'blur(20px) saturate(180%)',
                            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 10000,
                            padding: '16px'
                        }}
                    >
                        <div 
                            className="admin-modal-content"
                            onClick={e => e.stopPropagation()}
                            style={{
                                background: '#ffffff',
                                borderRadius: '24px',
                                maxWidth: '780px',
                                width: '100%',
                                overflow: 'hidden',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
                                border: '1px solid rgba(226, 232, 240, 0.8)',
                                padding: '24px 28px',
                                animation: 'fadeInScale 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                            }}
                        >
                            {/* Modal Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ 
                                        width: '40px', 
                                        height: '40px', 
                                        borderRadius: '12px', 
                                        background: '#0f172a', 
                                        color: '#ffffff', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.25)'
                                    }}>
                                        <Download size={20} />
                                    </div>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.02em' }}>
                                            Get Official Applications
                                        </h2>
                                        <p style={{ margin: 0, color: '#86868b', fontSize: '0.82rem' }}>
                                            Ultra-fast native clients for on-ground field audits and desktop administration
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    type="button" 
                                    onClick={() => setIsAppDownloadModalOpen(false)}
                                    style={{ 
                                        background: '#f5f5f7', 
                                        border: 'none', 
                                        width: '32px', 
                                        height: '32px', 
                                        borderRadius: '50%', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        color: '#6e6e73', 
                                        cursor: 'pointer', 
                                        transition: 'all 0.15s ease'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#e8e8ed'; e.currentTarget.style.color = '#1d1d1f'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#f5f5f7'; e.currentTarget.style.color = '#6e6e73'; }}
                                >
                                    <X size={17} />
                                </button>
                            </div>

                            {/* Two App Cards Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                                
                                {/* 📱 Card 1: Staff Camera Android APK */}
                                <div style={{ 
                                    background: '#fbfbfd', 
                                    border: '1px solid #e5e5ea', 
                                    borderRadius: '18px', 
                                    padding: '18px', 
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    justifyContent: 'space-between'
                                }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ 
                                                    width: '32px', 
                                                    height: '32px', 
                                                    borderRadius: '9px', 
                                                    background: '#34c759', 
                                                    color: '#ffffff', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'center' 
                                                }}>
                                                    <Smartphone size={18} />
                                                </div>
                                                <div>
                                                    <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: '#1d1d1f' }}>Heera Staff Camera</h3>
                                                    <span style={{ fontSize: '0.72rem', color: '#86868b' }}>Android APK v1.2</span>
                                                </div>
                                            </div>
                                            <span style={{ 
                                                background: '#e8f8ed', 
                                                color: '#248a3d', 
                                                fontSize: '0.7rem', 
                                                fontWeight: 700, 
                                                padding: '3px 8px', 
                                                borderRadius: '20px' 
                                            }}>
                                                15 MB
                                            </span>
                                        </div>

                                        <div style={{ 
                                            display: 'flex', 
                                            flexDirection: 'column', 
                                            gap: '5px', 
                                            color: '#515154', 
                                            fontSize: '0.78rem',
                                            marginBottom: '12px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Check size={13} color="#34c759" /> <span>0s Instant Viewfinder</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Check size={13} color="#34c759" /> <span>50m Geofenced GPS Matching</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Check size={13} color="#34c759" /> <span>Offline Queue & Auto-Sync</span>
                                            </div>
                                        </div>

                                        {/* QR Code Card */}
                                        <div style={{ 
                                            background: '#ffffff', 
                                            border: '1px solid #e5e5ea', 
                                            borderRadius: '12px', 
                                            padding: '10px 12px', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '12px',
                                            marginBottom: '14px'
                                        }}>
                                            <img 
                                                src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https%3A%2F%2Fgithub.com%2Fkamleshgupta905%2FHoarding%2Freleases%2Fdownload%2Fstaff-apk-latest%2Fheera-staff-camera.apk" 
                                                alt="Scan to Download APK" 
                                                style={{ width: '64px', height: '64px', borderRadius: '8px', border: '1px solid #e5e5ea', flexShrink: 0 }}
                                            />
                                            <div style={{ fontSize: '0.74rem', color: '#6e6e73' }}>
                                                <div style={{ fontWeight: 600, color: '#1d1d1f', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <QrCode size={13} color="#34c759" /> Scan with Phone
                                                </div>
                                                Direct download & install APK on Android.
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <a 
                                            href="https://github.com/kamleshgupta905/Hoarding/releases/download/staff-apk-latest/heera-staff-camera.apk" 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            style={{
                                                flex: 1,
                                                background: '#34c759',
                                                color: '#ffffff',
                                                padding: '9px 12px',
                                                borderRadius: '10px',
                                                fontWeight: 600,
                                                fontSize: '0.82rem',
                                                textDecoration: 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                transition: 'opacity 0.15s ease'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                        >
                                            <Download size={14} /> Download APK
                                        </a>
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                if (navigator.clipboard) {
                                                    navigator.clipboard.writeText('https://github.com/kamleshgupta905/Hoarding/releases/download/staff-apk-latest/heera-staff-camera.apk');
                                                    setApkCopied(true);
                                                    setTimeout(() => setApkCopied(false), 2000);
                                                }
                                            }}
                                            style={{ 
                                                background: apkCopied ? '#e8f8ed' : '#ffffff', 
                                                border: `1px solid ${apkCopied ? '#34c759' : '#d2d2d7'}`, 
                                                color: apkCopied ? '#248a3d' : '#1d1d1f', 
                                                padding: '9px 12px', 
                                                borderRadius: '10px', 
                                                fontSize: '0.78rem', 
                                                fontWeight: 600, 
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            {apkCopied ? <Check size={13} /> : <Share2 size={13} />}
                                            <span>{apkCopied ? 'Copied' : 'Copy'}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* 💻 Card 2: Windows Desktop App (.exe) */}
                                <div style={{ 
                                    background: '#fbfbfd', 
                                    border: '1px solid #e5e5ea', 
                                    borderRadius: '18px', 
                                    padding: '18px', 
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    justifyContent: 'space-between'
                                }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ 
                                                    width: '32px', 
                                                    height: '32px', 
                                                    borderRadius: '9px', 
                                                    background: '#0f172a', 
                                                    color: '#ffffff', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'center' 
                                                }}>
                                                    <Monitor size={18} />
                                                </div>
                                                <div>
                                                    <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: '#1d1d1f' }}>Heera Hoardings PC</h3>
                                                    <span style={{ fontSize: '0.72rem', color: '#86868b' }}>Windows & Mac Desktop</span>
                                                </div>
                                            </div>
                                            <span style={{ 
                                                background: '#f1f5f9', 
                                                color: '#334155', 
                                                fontSize: '0.7rem', 
                                                fontWeight: 700, 
                                                padding: '3px 8px', 
                                                borderRadius: '20px' 
                                            }}>
                                                64-bit
                                            </span>
                                        </div>

                                        <div style={{ 
                                            display: 'flex', 
                                            flexDirection: 'column', 
                                            gap: '5px', 
                                            color: '#515154', 
                                            fontSize: '0.78rem',
                                            marginBottom: '12px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Check size={13} color="#0f172a" /> <span>60 FPS Native Performance</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Check size={13} color="#0f172a" /> <span>Full Excel Sheet & Audit Sync</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Check size={13} color="#0f172a" /> <span>Desktop Notifications & Alerts</span>
                                            </div>
                                        </div>

                                        {/* Desktop Info Box */}
                                        <div style={{ 
                                            background: '#ffffff', 
                                            border: '1px solid #e5e5ea', 
                                            borderRadius: '12px', 
                                            padding: '10px 12px', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '12px',
                                            marginBottom: '14px'
                                        }}>
                                            <div style={{ 
                                                width: '38px', 
                                                height: '38px', 
                                                borderRadius: '10px', 
                                                background: '#f8fafc', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center', 
                                                color: '#0f172a',
                                                flexShrink: 0 
                                            }}>
                                                <Sparkles size={18} />
                                            </div>
                                            <div style={{ fontSize: '0.74rem', color: '#6e6e73' }}>
                                                <div style={{ fontWeight: 600, color: '#1d1d1f', marginBottom: '2px' }}>
                                                    Standalone Desktop Client
                                                </div>
                                                Zero browser overhead with automated updates.
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <a 
                                            href="https://github.com/kamleshgupta905/Hoarding/releases" 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            style={{
                                                flex: 1,
                                                background: '#0f172a',
                                                color: '#ffffff',
                                                padding: '9px 12px',
                                                borderRadius: '10px',
                                                fontWeight: 600,
                                                fontSize: '0.82rem',
                                                textDecoration: 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                transition: 'opacity 0.15s ease'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                        >
                                            <Download size={14} /> Desktop Releases
                                        </a>
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                setIsAppDownloadModalOpen(false);
                                                setActiveTab('guide');
                                            }}
                                            style={{ 
                                                background: '#ffffff', 
                                                border: '1px solid #d2d2d7', 
                                                color: '#1d1d1f', 
                                                padding: '9px 12px', 
                                                borderRadius: '10px', 
                                                fontSize: '0.78rem', 
                                                fontWeight: 600, 
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                            title="View System Guide"
                                        >
                                            <BookOpen size={13} />
                                            <span>Guide</span>
                                        </button>
                                    </div>
                                </div>

                            </div>

                            {/* Modal Footer */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f2f2f7', paddingTop: '14px' }}>
                                <span style={{ fontSize: '0.76rem', color: '#86868b' }}>
                                    HIRA Advertising OOH Infrastructure • Native Suite v1.2
                                </span>
                                <button 
                                    type="button" 
                                    onClick={() => setIsAppDownloadModalOpen(false)}
                                    style={{ 
                                        padding: '7px 18px', 
                                        borderRadius: '18px', 
                                        border: 'none', 
                                        background: '#f5f5f7', 
                                        color: '#1d1d1f', 
                                        fontSize: '0.82rem', 
                                        fontWeight: 600, 
                                        cursor: 'pointer',
                                        transition: 'background 0.15s ease'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#e8e8ed'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#f5f5f7'}
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 📅 Quick Booking Modal (Centered Fixed Overlay) */}
                {quickBookingTarget && (
                    <div 
                        className="modal-overlay" 
                        style={{ 
                            position: 'fixed', 
                            top: 0, 
                            left: 0, 
                            right: 0, 
                            bottom: 0, 
                            width: '100vw', 
                            height: '100vh', 
                            zIndex: 99999, 
                            background: 'rgba(15, 23, 42, 0.65)', 
                            backdropFilter: 'blur(6px)', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            padding: '20px' 
                        }} 
                        onClick={() => setQuickBookingTarget(null)}
                    >
                        <div 
                            className="modal-card" 
                            style={{ 
                                maxWidth: '460px', 
                                width: '100%', 
                                borderRadius: '20px', 
                                padding: '26px', 
                                background: '#ffffff', 
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)', 
                                border: '1px solid #e2e8f0' 
                            }} 
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ background: '#fee2e2', color: '#ef4444', padding: '10px', borderRadius: '12px', display: 'flex' }}>
                                        <Calendar size={22} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>Book Hoarding Site</h3>
                                        <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                                            {quickBookingTarget.site["Locality Site Location"] || quickBookingTarget.site["Location "] || quickBookingTarget.site.Location}
                                            {quickBookingTarget.site.Facing ? ` • ${quickBookingTarget.site.Facing}` : ''}
                                        </p>
                                    </div>
                                </div>
                                <button type="button" onClick={() => setQuickBookingTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}>
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleConfirmQuickBooking} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                        Client Name <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Tata Motors, Samsung, Local Brand"
                                        value={quickBookingTarget.clientName}
                                        onChange={(e) => setQuickBookingTarget({ ...quickBookingTarget, clientName: e.target.value })}
                                        style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none' }}
                                        autoFocus
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                            Booking Start <span style={{ color: '#ef4444' }}>*</span>
                                        </label>
                                        <input
                                            type="date"
                                            required
                                            value={quickBookingTarget.startDate}
                                            onChange={(e) => setQuickBookingTarget({ ...quickBookingTarget, startDate: e.target.value })}
                                            style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.86rem', outline: 'none' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                            Booking End <span style={{ color: '#ef4444' }}>*</span>
                                        </label>
                                        <input
                                            type="date"
                                            required
                                            value={quickBookingTarget.endDate}
                                            onChange={(e) => setQuickBookingTarget({ ...quickBookingTarget, endDate: e.target.value })}
                                            style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.86rem', outline: 'none' }}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                                    <button
                                        type="button"
                                        onClick={() => setQuickBookingTarget(null)}
                                        style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        style={{ padding: '10px 22px', borderRadius: '10px', border: 'none', background: '#ef4444', color: '#ffffff', fontSize: '0.86rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)' }}
                                    >
                                        Confirm Booking
                                    </button>
                                </div>
                            </form>
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
