import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, Database, FileUp, Settings,
    FileText, LogOut, Search, Eye, EyeOff,
    TrendingUp, MapPin, CheckCircle, Smartphone,
    Bell, HelpCircle, Plus, Filter, Download,
    MessageSquare, Mail, User, Calendar, CheckSquare,
    MoreVertical, ExternalLink, ShieldCheck, Menu, X, UploadCloud, RefreshCw, Zap, XCircle, Share2, Trash2, Camera, Table2, Save, Undo2, Redo2, FileDown, Copy, Timer, Clock3, PanelLeftClose, PanelLeftOpen, Maximize2, Minimize2,
    BarChart3, PieChart, Activity, Sparkles, ArrowUpRight, Layers, Compass, DollarSign, Award, Flame, Check, ChevronRight
} from 'lucide-react';
import { analyzeHoardingImage } from '../services/aiService';
import { fetchHoardings, compressImage, syncToGoogleSheet, exportProposalExcel, PROPOSAL_COLUMNS, getImageUrl, downloadHoardingImage, fetchStaffUploads, reviewStaffPhoto, detectStaffPhotoOrientation, fetchSheetGrid, saveSheetGrid } from '../services/dataService';
import ImageLightbox from '../components/ImageLightbox';
import { clearAdminSession, getAdminSession, getStaffUploadLink } from '../services/secureApi';
import { isInternalHeader } from '../core/hoardingSchema';
import { blobToDataUrl, prepareImageOrientation } from '../core/imageOrientation';
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

const AdminDashboard = ({ hoardings, setHoardings }) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [searchTerm, setSearchTerm] = useState('');
    const [inventoryCityFilter, setInventoryCityFilter] = useState('All');
    const [inventoryStatusFilter, setInventoryStatusFilter] = useState('All');
    const [inventoryLocalityFilter, setInventoryLocalityFilter] = useState('All');
    const [inventoryMediaFilter, setInventoryMediaFilter] = useState('All');
    const [inventorySizeFilter, setInventorySizeFilter] = useState('All');
    const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('All');
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
    const [scriptUrl] = useState('https://script.google.com/macros/s/AKfycbwBpAJ0e7kYoDusrtkvaSj0A2PErD4vcMsNzL60EkzMELGTj6dpT16BaM9htFyDVI9a-Q/exec');
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
    const [overviewChartTab, setOverviewChartTab] = useState('zones'); // 'zones' | 'media' | 'pricing'
    const [hoveredChartItem, setHoveredChartItem] = useState(null);

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
        const intervalId = setInterval(refreshStaffUploads, 30000);
        return () => {
            active = false;
            clearInterval(intervalId);
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
                localStorage.setItem('hoardings_cache', JSON.stringify(freshData));
                showToast("Data Synced with Google Sheet!", "success");
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

    const handleFileUpload = (e, type) => {
        const file = e.target.files[0];
        if (!file) return;
        if (fileProcessing) {
            setUploadNotice({ status: 'error', message: 'One upload is already processing. Please wait for it to finish.', fileName: file.name });
            e.target.value = null;
            return;
        }

        const estimate = estimateUploadDuration(file, type);
        setFileProcessing({
            type,
            fileName: file.name,
            phase: 'Reading selected file',
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
                const fileData = await readFileAsDataUrl(file, (progress) => updateFileProcessing({ phase: 'Reading selected file', progress }));
                updateFileProcessing({ phase: type === 'excel' ? 'Uploading for validation' : 'Uploading PPT and starting matching', progress: 100 });

                if (type === 'excel') {
                    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                    setExcelImportToken(token);
                    setExcelImportPreview({ status: 'PROCESSING', fileName: file.name, summary: null });
                    await fetch(scriptUrl, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify({
                            action: 'previewExcelImport',
                            sessionToken: getAdminSession(),
                            token,
                            fileName: file.name,
                            fileData,
                            mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                        })
                    });
                    updateFileProcessing({ phase: 'Validating rows and matching headers' });
                    const preview = await waitForExcelPreview(token);
                    setExcelImportPreview(preview);
                    setIsExcelImportOpen(true);
                    completeBackgroundUpload('ready', 'Excel preview is ready. Review it and approve the import when you are ready.');
                    return;
                }

                const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                await fetch(scriptUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({
                        action: 'uploadPptAndProcess',
                        sessionToken: getAdminSession(),
                        token,
                        fileName: file.name,
                        fileData,
                        mimeType: file.type || 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
                    })
                });
                updateFileProcessing({ phase: 'Extracting slides and matching site photos' });
                const result = await waitForPptJob(token, (job) => updateFileProcessing({ phase: job.phase || 'Processing PPT' }));
                if (result.status === 'FAILED') throw new Error(result.error || 'PPT processing failed.');
                window.dispatchEvent(new CustomEvent('hoardings:sync-requested', { detail: { action: 'pptUpload', fileName: file.name } }));
                await wait(1200);
                const freshData = await fetchHoardings();
                if (freshData?.length) setHoardings(freshData);
                completeBackgroundUpload('completed', 'PPT processing is complete. Matched site images have been refreshed.');
            } catch (error) {
                completeBackgroundUpload('error', type === 'excel' ? `Excel preview failed: ${error.message}` : `PPT processing failed: ${error.message}`);
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
                await fetch(scriptUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ action: 'approveExcelImport', sessionToken: getAdminSession(), token: excelImportToken })
                });
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

                    // 🧠 AI CALL
                    const aiResult = await analyzeHoardingImage(base64Data, hoardings);

                    // 🎯 ROBUST INDEX MATCHING
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
                            const listName = String(h["Location "]).toLowerCase();
                            return listName === aiLoc || listName.includes(aiLoc) || aiLoc.includes(listName);
                        });
                    }

                    const finalLocation = matchedData ? matchedData["Location "] : null;

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

                    // 🚀 AUTO-SYNC: If location is matched, upload immediately!
                    if (finalLocation) {
                        await triggerAutoUpload(i, updatedImages[i]);
                    }

                } catch (error) {
                    console.error("Processing failed", error);
                    setDailyImages(prev => {
                        const next = [...prev];
                        next[i] = { ...next[i], aiLoading: false };
                        return next;
                    });
                }
            }
        }
    };

    const triggerAutoUpload = async (index, imageData) => {
        setDailyImages(prev => {
            const next = [...prev];
            next[index].uploading = true;
            return next;
        });

        try {
            const base64 = await compressImage(imageData.file);

            const targetHoarding = hoardings.find(h => h["Location "] === imageData.matchedLocation);
            const hasExistingImage = targetHoarding && targetHoarding.ImageURL &&
                targetHoarding.ImageURL.trim() !== "" &&
                !targetHoarding.ImageURL.includes("unsplash.com");

            // 🏰 Resolve updated History state locally
            let updatedHistory = targetHoarding.History || [];
            if (hasExistingImage) {
                updatedHistory = [imageData.preview, ...updatedHistory];
            }

            const historyString = updatedHistory.map(item => {
                const url = typeof item === 'object' ? item.url : item;
                const time = typeof item === 'object' ? item.timestamp || Date.now() : Date.now();
                return `${url}|${time}`;
            }).join(',');

            await syncToGoogleSheet({
                action: 'updateHoarding',
                siteName: imageData.matchedLocation,
                status: imageData.status,
                fields: { "ExecutionHistory": historyString },
                fileData: base64,
                mimeType: 'image/jpeg',
                mode: hasExistingImage ? 'archive' : 'replace'
            });

            setDailyImages(prev => {
                const next = [...prev];
                next[index].uploaded = true;
                next[index].uploading = false;
                return next;
            });

            setHoardings(prev => prev.map(h => {
                if (h["Location "] === imageData.matchedLocation) {
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
                        // Per your earlier rule: "missing old images ke case main ExecutionHistory main update mat karna"
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
                next[index].uploading = false;
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

                    await fetch(scriptUrl, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify({
                            action: 'dumpImage',
                            siteName: 'UNIDENTIFIED',
                            fileData: base64,
                            mimeType: imgData.file.type,
                            reasoning: imgData.reasoning || "AI could not match location"
                        })
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

        // Mark as uploading
        const newImages = [...dailyImages];
        newImages[index].uploading = true;
        setDailyImages(newImages);

        try {
            const base64 = await compressImage(img.file);

            // 🛡️ Logic to prevent replacing master images
            const targetHoarding = hoardings.find(h => h["Location "] === img.matchedLocation);
            const hasExistingImage = targetHoarding && targetHoarding.ImageURL &&
                targetHoarding.ImageURL.trim() !== "" &&
                !targetHoarding.ImageURL.includes("unsplash.com");

            // 🏰 Resolve updated History state locally
            let updatedHistory = targetHoarding.History || [];
            if (hasExistingImage) {
                updatedHistory = [img.preview, ...updatedHistory];
            }

            const historyString = updatedHistory.map(item => {
                const url = typeof item === 'object' ? item.url : item;
                const time = typeof item === 'object' ? item.timestamp || Date.now() : Date.now();
                return `${url}|${time}`;
            }).join(',');

            await syncToGoogleSheet({
                action: 'updateHoarding',
                siteName: img.matchedLocation,
                status: img.status,
                fields: { "ExecutionHistory": historyString },
                fileData: base64,
                mimeType: 'image/jpeg',
                mode: hasExistingImage ? 'archive' : 'replace'
            });

            // Update local state to reflect success (Optimistic UI)
            newImages[index].uploaded = true;
            newImages[index].uploading = false;
            setDailyImages(newImages);

            // Also update the main hoardings list locally
            setHoardings(prev => prev.map(h => {
                if (h["Location "] === img.matchedLocation) {
                    let updatedHistory = h.History || [];
                    let finalImageURL = h.ImageURL;

                    if (hasExistingImage) {
                        // 🏰 Keep master photo, add to History
                        updatedHistory = [img.preview, ...updatedHistory];
                        if (!updatedHistory.includes(h.ImageURL)) {
                            updatedHistory.push(h.ImageURL);
                        }
                    } else {
                        // 🆕 No master photo: New image becomes master, No history
                        finalImageURL = img.preview;
                        updatedHistory = [];
                    }

                    return {
                        ...h,
                        STATUS: img.status,
                        ImageURL: finalImageURL,
                        History: updatedHistory
                    };
                }
                return h;
            }));

            alert(`🚀 Success! "${img.matchedLocation}" has been synced to ${hasExistingImage ? 'Execution History' : 'Site Photo'}.`);

        } catch (error) {
            console.error("Sync Error:", error);
            alert("Upload failed. Please check your internet connection.");
            newImages[index].uploading = false;
            setDailyImages(newImages);
        }
    };

    // ------------------------------------------------------------------
    // 🖥️ UI COMPONENTS
    // ------------------------------------------------------------------

    const toggleStatus = (siteName) => {
        const updated = hoardings.map(h => {
            if (h["Location "] === siteName) {
                return { ...h, STATUS: h.STATUS === 'Disabled' ? 'Available' : 'Disabled' };
            }
            return h;
        });
        setHoardings(updated);
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

            const siteLocationName = String(formData["Location "] || formData.Location || formData["Locality Site Location"] || '').trim();
            const siteCityName = String(formData.City || formData.city || '').trim();
            const siteLocalityName = String(formData.Locality || formData.Area || formData["Area"] || '').trim();
            const price = String(formData["Avg Monthly Cost (INR)"] ?? formData["Rental Per Month"] ?? formData["Avg. monthly Cost"] ?? formData.Price ?? '0').trim();
            const size = String(formData["Size (Large/Medium/Small)"] ?? formData["Size (Large/ Medium/ Small)"] ?? formData.Size ?? '').trim();
            const mediaFormat = String(formData["Media Format (Front Lit / Back Lit / Non Lit)"] ?? formData["Media Format"] ?? formData["Media Type"] ?? '').trim();

            const fullCleanFields = { 
                ...cleanFields,
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

            await syncToGoogleSheet({
                action: 'addHoarding',
                fields: fullCleanFields,
                siteName: siteLocationName,
                fileData: fileData,
                mimeType: mimeType
            });
            showToast("Asset Added Successfully!", "success");
            setHoardings(prev => {
                const next = [...prev, fullCleanFields];
                try {
                    localStorage.setItem('hoardings_cache', JSON.stringify(next));
                    localStorage.setItem('last_hoardings_update', Date.now().toString());
                } catch {}
                return next;
            });
            window.dispatchEvent(new CustomEvent('hoardings:sync-requested', { detail: { action: 'addHoarding' } }));
            setIsAddModalOpen(false);
            setFormData({});
            setSelectedAssetFile(null);
        } catch (err) {
            showToast("Error adding asset: " + err.message, "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditAsset = async (e) => {
        e.preventDefault();
        setIsLoading(true);
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

            const siteLocationName = String(formData["Location "] || formData.Location || formData["Locality Site Location"] || selectedHoarding["Location "] || '').trim();
            const siteCityName = String(formData.City || formData.city || selectedHoarding.City || '').trim();
            const siteLocalityName = String(formData.Locality || formData.Area || formData["Area"] || selectedHoarding.Locality || '').trim();
            const price = String(formData["Avg Monthly Cost (INR)"] ?? formData["Rental Per Month"] ?? formData["Avg. monthly Cost"] ?? formData.Price ?? '0').trim();
            const size = String(formData["Size (Large/Medium/Small)"] ?? formData["Size (Large/ Medium/ Small)"] ?? formData.Size ?? '').trim();
            const mediaFormat = String(formData["Media Format (Front Lit / Back Lit / Non Lit)"] ?? formData["Media Format"] ?? formData["Media Type"] ?? '').trim();

            const fullUpdatedFields = {
                ...cleanFields,
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

            await syncToGoogleSheet({
                action: 'updateHoarding',
                siteName: selectedHoarding["Location "] || selectedHoarding.Location || selectedHoarding["Locality Site Location"],
                fields: fullUpdatedFields,
                fileData: fileData,
                mimeType: mimeType
            });
            showToast("Asset Updated Successfully!", "success");
            setHoardings(prev => {
                const targetKey = String(selectedHoarding["Location "] || selectedHoarding.Location || selectedHoarding["Locality Site Location"] || '').trim().toLowerCase();
                const next = prev.map(h => {
                    const hKey = String(h["Location "] || h.Location || h["Locality Site Location"] || '').trim().toLowerCase();
                    return hKey === targetKey ? { ...h, ...fullUpdatedFields } : h;
                });
                try {
                    localStorage.setItem('hoardings_cache', JSON.stringify(next));
                    localStorage.setItem('last_hoardings_update', Date.now().toString());
                } catch {}
                return next;
            });
            setIsEditModalOpen(false);
            setSelectedHoarding(null);
            setFormData({});
            setSelectedAssetFile(null);
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

        // 1. Immediately dismiss modal so UI is fully responsive
        setDeleteTarget(null);

        // 2. Optimistically remove from state immediately
        setHoardings(prev => {
            const next = prev.filter((h, idx) => {
                if (targetSiteObj && h === targetSiteObj) return false;
                if (targetIndex !== -1 && idx === targetIndex) return false;
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
            } catch {}
            return next;
        });

        showToast("Asset Deleted Successfully!", "success");

        // 3. Fire-and-forget sync to Google Sheets in background without freezing the UI
        try {
            syncToGoogleSheet({
                action: 'deleteHoarding',
                siteName: siteName || targetLocality || 'Hoarding Site',
                city: targetCity,
                locality: targetLocality
            }).catch(err => {
                console.error("Delete background sync warning:", err);
            });
        } catch (err) {
            console.error("Delete background sync warning:", err);
        }
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
        const size = h["Size (Large/Medium/Small)"] || h["Size (Large/ Medium/ Small)"] || h.Size || '';
        const media = h["Media Format (Front Lit / Back Lit / Non Lit)"] || h["Media Format"] || h["Media Type"] || '';

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
            STATUS: h.STATUS || 'Available'
        });
        setSelectedAssetFile(null);
        setIsEditModalOpen(true);
    };

    const filteredInventory = useMemo(() => {
        const cleanSearch = searchTerm.trim().toLowerCase();
        const selectedCity = inventoryCityFilter.toLowerCase();

        return hoardings.filter(h => {
            if (!h) return false;
            const siteTitle = String(h["Locality Site Location"] || h["Location "] || h["Location"] || "");
            const siteLocality = String(h["Locality"] || h["Area"] || "");
            const matchSearch = !cleanSearch ||
                siteTitle.toLowerCase().includes(cleanSearch) ||
                String(h.City || "").toLowerCase().includes(cleanSearch) ||
                siteLocality.toLowerCase().includes(cleanSearch) ||
                String(h["Traffic From"] || "").toLowerCase().includes(cleanSearch) ||
                String(h["Traffic To"] || "").toLowerCase().includes(cleanSearch);
            if (!matchSearch) return false;

            const hCity = (h.City || "").trim().toLowerCase();
            const matchCity = inventoryCityFilter === 'All' || hCity === selectedCity;
            if (!matchCity) return false;

            const matchStatus = inventoryStatusFilter === 'All' ||
                (inventoryStatusFilter === 'Offline' ? h.STATUS === 'Disabled' : h.STATUS === inventoryStatusFilter);
            if (!matchStatus) return false;

            const matchLocality = inventoryLocalityFilter === 'All' || siteLocality === inventoryLocalityFilter;
            if (!matchLocality) return false;

            const matchMedia = inventoryMediaFilter === 'All' || (h["Media Format (Front Lit / Back Lit / Non Lit)"] || h["Media Format"] || h["Media Type"]) === inventoryMediaFilter;
            if (!matchMedia) return false;

            const matchSize = inventorySizeFilter === 'All' || (h["Size (Large/Medium/Small)"] || h["Size"]) === inventorySizeFilter;
            if (!matchSize) return false;

            const matchCategory = inventoryCategoryFilter === 'All' || (h["Site Category"] || h["Category"]) === inventoryCategoryFilter;
            if (!matchCategory) return false;

            const price = Number(h["Avg Monthly Cost (INR)"] || h["Rental Per Month"] || 0);
            let matchPrice = true;
            if (inventoryPriceFilter === '0-25k') matchPrice = price <= 25000;
            if (inventoryPriceFilter === '25k-50k') matchPrice = price > 25000 && price <= 50000;
            if (inventoryPriceFilter === '50k-100k') matchPrice = price > 50000 && price <= 100000;
            if (inventoryPriceFilter === '100k+') matchPrice = price > 100000;

            return matchPrice;
        });
    }, [hoardings, searchTerm, inventoryCityFilter, inventoryStatusFilter, inventoryLocalityFilter, inventoryMediaFilter, inventorySizeFilter, inventoryCategoryFilter, inventoryPriceFilter]);

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

    const inventoryCities = ['All', ...new Set(hoardings.map(h => {
        const city = h.City?.trim();
        if (!city) return null;
        return city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
    }).filter(Boolean))];
    const inventoryStatuses = ['All', 'Available', 'Occupied', 'Offline'];
    const inventoryTargetHoardings = inventoryCityFilter === 'All'
        ? hoardings
        : hoardings.filter(h => (h.City || '').trim().toLowerCase() === inventoryCityFilter.toLowerCase());
    const inventoryLocalities = ['All', ...new Set(inventoryTargetHoardings.map(h => (h["Locality"] || h["Area"] || '').trim()).filter(Boolean))].sort((a, b) => a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b));
    const inventoryMediaFormats = ['All', ...new Set(hoardings.map(h => h["Media Format (Front Lit / Back Lit / Non Lit)"]).filter(Boolean))];
    const inventorySizes = ['All', ...new Set(hoardings.map(h => h["Size (Large/Medium/Small)"]).filter(Boolean))];
    const inventoryCategories = ['All', ...new Set(hoardings.map(h => h["Site Category"]).filter(Boolean))];
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

    const reviewQueue = staffUploads.filter(upload => upload.Status === 'REVIEW_REQUIRED' && !pendingStaffReviewIds[upload.UploadId]);
    // Filter to only recent approved/active uploads from the current session or last 24h (shows 0 when none today)
    const recentPhotoUpdates = staffUploads.filter(upload => {
        if (upload.Status === 'REVIEW_REQUIRED' || upload.Status === 'REJECTED') return false;
        const uploadTime = new Date(upload.ReviewedAt || upload.CapturedAt || 0).getTime();
        return uploadTime > 0 && (Date.now() - uploadTime < 86400000);
    }).slice(0, 12);

    // Dynamic Overview Analytics
    const totalHoardingsCount = hoardings.length;
    const occupiedCount = hoardings.filter(h => h.STATUS === 'Occupied').length;
    const availableCount = hoardings.filter(h => h.STATUS === 'Available' || !h.STATUS).length;
    const offlineCount = hoardings.filter(h => h.STATUS === 'Disabled').length;
    
    const totalMonthlyRevenue = hoardings.reduce((sum, h) => {
        const v = parseFloat(String(h["Rental Per Month"] || h["Avg Monthly Cost (INR)"] || 0).replace(/[^0-9.]/g, '')) || 0;
        return sum + v;
    }, 0);
    const avgMonthlyRate = totalHoardingsCount > 0 ? Math.round(totalMonthlyRevenue / totalHoardingsCount) : 0;
    
    const totalSqFt = hoardings.reduce((sum, h) => {
        const sqft = parseFloat(h["Total Sq. Ft"]) || (parseFloat(h["Width"]) * parseFloat(h["Height"])) || 0;
        return sum + sqft;
    }, 0);

    // Prime Corridors / Localities Breakdown (Top 8 from real Meerut data)
    const zoneMap = {};
    hoardings.forEach(h => {
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
    hoardings.forEach(h => {
        const p = parseFloat(String(h["Rental Per Month"] || h["Avg Monthly Cost (INR)"] || 0).replace(/[^0-9.]/g, '')) || 0;
        const tier = overviewPriceTiers.find(t => p >= t.min && p < t.max);
        if (tier) tier.count++;
    });

    // Top Prime Highlight Sites
    const primeHighlightSites = hoardings.slice(0, 4);

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
        if (event.key === 'Delete' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
            event.preventDefault();
            clearSheetSelection();
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

    const normalizedSheetSearch = sheetSearch.trim().toLowerCase();
    const visibleSheetRows = normalizedSheetSearch
        ? sheetRows
            .map((row, index) => ({ row, index }))
            .filter(({ row }) => row.some(cell => String(cell || '').toLowerCase().includes(normalizedSheetSearch)))
        : sheetRows.map((row, index) => ({ row, index }));
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
                                        <label>Location (Unique ID)*</label>
                                        <input 
                                            required 
                                            value={formData["Location "] ?? formData.Location ?? formData["Locality Site Location"] ?? ''} 
                                            onChange={e => setFormData({
                                                ...formData, 
                                                "Location ": e.target.value, 
                                                Location: e.target.value, 
                                                "Locality Site Location": e.target.value
                                            })}
                                            disabled={isEditModalOpen}
                                            placeholder="e.g. Maruti True Value Meerut"
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
                                        <label>Locality</label>
                                        <input 
                                            value={formData.Locality ?? formData.Area ?? ''} 
                                            onChange={e => setFormData({
                                                ...formData, 
                                                Locality: e.target.value, 
                                                Area: e.target.value
                                            })}
                                            placeholder="e.g. Partapur"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Media Format</label>
                                        <select 
                                            value={formData["Media Format (Front Lit / Back Lit / Non Lit)"] ?? formData["Media Format"] ?? formData["Media Type"] ?? ''} 
                                            onChange={e => setFormData({
                                                ...formData, 
                                                "Media Format (Front Lit / Back Lit / Non Lit)": e.target.value,
                                                "Media Format": e.target.value,
                                                "Media Type": e.target.value
                                            })}
                                        >
                                            <option value="">Select Format</option>
                                            <option value="Front Lit">Front Lit</option>
                                            <option value="Back Lit">Back Lit</option>
                                            <option value="Non Lit">Non Lit</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Size</label>
                                        <input 
                                            value={formData["Size (Large/Medium/Small)"] ?? formData["Size (Large/ Medium/ Small)"] ?? formData.Size ?? ''} 
                                            onChange={e => setFormData({
                                                ...formData, 
                                                "Size (Large/Medium/Small)": e.target.value,
                                                "Size (Large/ Medium/ Small)": e.target.value,
                                                Size: e.target.value
                                            })}
                                            placeholder="e.g. 20x10"
                                        />
                                    </div>
                                </div>
                                <div className="form-row three-cols">
                                    <div className="form-group">
                                        <label>Monthly Cost (INR)</label>
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
                                            placeholder="e.g. 50000"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Latitude (Optional)</label>
                                        <input 
                                            value={formData.Latitude ?? ''} 
                                            onChange={e => setFormData({...formData, Latitude: e.target.value})}
                                            placeholder="e.g. 28.9845"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Longitude (Optional)</label>
                                        <input 
                                            value={formData.Longitude ?? ''} 
                                            onChange={e => setFormData({...formData, Longitude: e.target.value})}
                                            placeholder="e.g. 77.7064"
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
                                            value={formData.STATUS || 'Available'} 
                                            onChange={e => setFormData({...formData, STATUS: e.target.value})}
                                            style={{ borderColor: formData.STATUS === 'Occupied' ? '#f87171' : '#4ade80' }}
                                        >
                                            <option value="Available">Available</option>
                                            <option value="Occupied">Occupied</option>
                                            <option value="Disabled">Disabled (Offline)</option>
                                        </select>
                                    </div>
                                    
                                    {formData.STATUS === 'Occupied' && (
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
                <div className="modal-overlay" style={{ zIndex: 99999 }}>
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
                            <button onClick={() => setDeleteTarget(null)} style={{ color: '#94a3b8' }}><X size={20} /></button>
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
                                onClick={() => handleDeleteAsset(deleteTarget)}
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

            {/* Side Navigation */}
            <aside className={`admin-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-logo">
                    <div className="logo-icon">
                        <Layers size={20} color="white" strokeWidth={2.4} />
                    </div>
                    <div className="sidebar-brand-wrap">
                        <span className="brand-title">AdHoardings</span>
                        <span className="brand-badge">ADMIN</span>
                    </div>
                </div>

                <div className="menu-group">
                    <div className="group-title">Analytics</div>
                    <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                        <LayoutDashboard size={19} />
                        <span>Overview</span>
                    </button>
                    <button className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
                        <Database size={19} />
                        <span>Inventory</span>
                    </button>
                    <button className={`nav-item ${activeTab === 'sheet-editor' ? 'active' : ''}`} onClick={() => setActiveTab('sheet-editor')}>
                        <Table2 size={19} />
                        <span>Excel Sheet</span>
                    </button>
                    <button className={`nav-item ${activeTab === 'clients' ? 'active' : ''}`} onClick={() => setActiveTab('clients')}>
                        <User size={19} />
                        <span>Clients & Booking</span>
                    </button>
                </div>

                <div className="menu-group">
                    <div className="group-title">Automation</div>
                    <button className={`nav-item ${activeTab === 'daily-update' ? 'active' : ''}`} onClick={() => setActiveTab('daily-update')}>
                        <Zap size={19} />
                        <span>Daily Updates</span>
                        <span className="badge-new badge-ai">AI</span>
                    </button>
                    <button className={`nav-item ${activeTab === 'staff-review' ? 'active' : ''}`} onClick={() => setActiveTab('staff-review')}>
                        <Camera size={19} />
                        <span>Review Required</span>
                        {reviewQueue.length > 0 && <span className="badge-new badge-count">{reviewQueue.length}</span>}
                    </button>
                </div>

                <div className="sidebar-footer">
                    <button className="nav-item view-website-btn" onClick={() => navigate('/')}>
                        <ExternalLink size={18} />
                        <span>View Website</span>
                    </button>
                    <div className="user-profile">
                        <div className="user-avatar-wrap">
                            <div className="user-avatar" style={{ backgroundImage: 'url(https://i.pravatar.cc/100?u=admin)', backgroundSize: 'cover' }}></div>
                            <span className="online-indicator"></span>
                        </div>
                        <div className="user-info">
                            <span className="name">Admin Manager</span>
                            <span className="email">admin@adhoardings.com</span>
                        </div>
                        <button onClick={handleLogout} className="sidebar-logout-btn" title="Logout">
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="admin-main-content">
                <header className="admin-top-bar">
                    <div className="top-bar-left">
                        <button className="sidebar-collapse-toggle" onClick={toggleSidebar} title={isSidebarCollapsed ? 'Open navigation' : 'Close navigation'} aria-label={isSidebarCollapsed ? 'Open navigation' : 'Close navigation'}>
                            {isSidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
                        </button>
                        <h2>
                            {activeTab === 'dashboard' && 'Performance Insights'}
                            {activeTab === 'inventory' && 'Asset Management'}
                            {activeTab === 'sheet-editor' && 'Live Excel Sheet'}
                            {activeTab === 'daily-update' && 'Daily AI Updates'}
                            {activeTab === 'staff-review' && 'Staff Photo Review'}
                        </h2>
                    </div>
                    <div className="top-bar-right">
                        <div className="admin-search-box">
                            <Search size={18} color="#808191" />
                            <input
                                placeholder="Search inventory..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="action-btns">
                            <button className="btn-secondary-admin" onClick={handleForceSync} disabled={isLoading} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '10px' }}>
                                <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} /> Sync with Sheet
                            </button>
                            {fileProcessing && (
                                <div className="file-processing-timer" role="status" aria-live="polite" title={`${fileProcessing.fileName}: ${fileProcessing.phase}`}>
                                    <Timer size={16} />
                                    <div className="file-processing-copy">
                                        <strong>{formatProcessingTime(processingSeconds)}</strong>
                                        <span>{fileProcessing.type === 'excel' ? 'Excel' : 'PPT'}: {fileProcessing.phase}</span>
                                    </div>
                                </div>
                            )}
                            <label className="btn-primary-admin" style={{ cursor: 'pointer' }}>
                                <Download size={18} />
                                Excel Sync
                                <input type="file" style={{ display: 'none' }} accept=".xlsx,.xls,.csv" disabled={Boolean(fileProcessing)} onChange={(e) => handleFileUpload(e, 'excel')} />
                            </label>
                            <label className="btn-primary-admin" style={{ background: '#6c5dd3', borderColor: '#6c5dd3', color: 'white', cursor: 'pointer' }}>
                                <Plus size={18} />
                                PPT Upload
                                <input type="file" style={{ display: 'none' }} accept=".ppt,.pptx" disabled={Boolean(fileProcessing)} onChange={(e) => handleFileUpload(e, 'ppt')} />
                            </label>

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
                                    <button className="qm-btn-secondary" onClick={() => setActiveTab('sheet-editor')} title="Open Master Sheet Editor">
                                        <Table2 size={15} /> Sheet Editor
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

                            {/* 📷 Field Audit Feed */}
                            <div className="qm-card">
                                <div className="qm-card-header">
                                    <div>
                                        <h3 className="qm-card-title">Field Inspection & Audit Center</h3>
                                        <p className="qm-card-desc">Ground staff mobile camera uploads and site photo audit feed</p>
                                    </div>
                                    <div className="qm-header-controls">
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

                                {reviewQueue.length > 0 && (
                                    <div className="dashboard-review-strip">
                                        <div className="dashboard-review-strip-heading">
                                            <span>Review Required</span>
                                            <small>{reviewQueue.length} photo{reviewQueue.length === 1 ? '' : 's'} need a site decision</small>
                                        </div>
                                        <div className="dashboard-review-list">
                                            {reviewQueue.slice(0, 4).map(upload => {
                                                const preview = staffImagePreviews[upload.UploadId];
                                                const imageUrl = preview?.previewUrl || upload.ImageURL;
                                                return (
                                                    <button
                                                        className="dashboard-review-item"
                                                        key={upload.UploadId}
                                                        onClick={() => setActiveTab('staff-review')}
                                                        title="Open Staff Photo Review"
                                                    >
                                                        <img src={imageUrl} alt={upload.SuggestedSite || 'Staff photo needing review'} />
                                                        <span>
                                                            <strong>{upload.SuggestedSite || 'Site match required'}</strong>
                                                            <small>{upload.DistanceM ? `${Math.round(Number(upload.DistanceM))}m away` : 'Manual review needed'}</small>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {recentPhotoUpdates.length > 0 ? (
                                    <div className="recent-photo-grid">
                                        {recentPhotoUpdates.map(upload => (
                                            <article className="recent-photo-card" key={upload.UploadId}>
                                                <img 
                                                    src={upload.ImageURL} 
                                                    alt={upload.ApprovedSite || 'Staff upload'} 
                                                    onClick={() => setPreviewHoarding({ ImageURL: upload.ImageURL, City: 'Staff', "Location ": upload.ApprovedSite || 'Staff upload' })} 
                                                />
                                                <div>
                                                    <strong>{upload.ApprovedSite || upload.SuggestedSite || 'History upload'}</strong>
                                                    <span>{String(upload.Status || 'REVIEW_REQUIRED').replaceAll('_', ' ')}</span>
                                                    <small>{upload.CapturedAt ? new Date(upload.CapturedAt).toLocaleString('en-IN') : ''}</small>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="qm-empty-state">
                                        <div className="qm-empty-icon-box">
                                            <Camera size={26} className="qm-camera-icon" />
                                        </div>
                                        <div className="qm-empty-text">
                                            <h4>All 307 billboard photos verified & linked</h4>
                                            <p>
                                                Every site in the master sheet currently has a verified Google Drive CDN photo. When field inspection photos are submitted via the mobile link, they will appear here for one-click admin verification.
                                            </p>
                                        </div>
                                        <div className="qm-empty-capsules">
                                            <span className="qm-status-capsule"><Check size={13} /> 307 Public Drive URLs</span>
                                            <span className="qm-status-capsule"><Check size={13} /> 0 Missing Photos</span>
                                            <span className="qm-status-capsule"><Check size={13} /> Mobile Camera Ready</span>
                                        </div>
                                    </div>
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
                                                        <div className="sheet-header-cell">
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
                                                    <td className={`sheet-row-number ${isSheetRowSelected(index) ? 'selected-axis' : ''}`}>
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
                                                        backgroundImage: `url(${hoardings.find(h => h["Location "] === img.matchedLocation)?.ImageURL})`,
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
                                                        {hoardings.map((h, i) => (
                                                            <option key={i} value={h["Location "]}>{h["Location "]}</option>
                                                        ))}
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
                                                        const site = hoardings.find(h => h["Location "] === img.matchedLocation);
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
                                <h3>Review Required</h3>
                                <p>Adjacent hoardings and uncertain GPS matches need manual approval.</p>
                            </div>
                            <a className="staff-permanent-link" href={staffUploadLink} target="_blank" rel="noreferrer">
                                <ExternalLink size={16} /> Open Staff Link
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
                            <div className="inventory-header">
                                <div>
                                    <h3>Master Asset List</h3>
                                    <p>Comprehensive record of all outdoor media inventory</p>
                                </div>
                                <div className="inventory-actions">
                                    <button
                                        className="btn-danger-admin"
                                        disabled={inventoryCityFilter === 'All'}
                                        title={inventoryCityFilter === 'All' ? 'Choose a city filter first' : `Delete ${inventoryCityFilter} city data`}
                                        onClick={() => setBulkDeleteTarget({ type: 'city', city: inventoryCityFilter })}
                                    >
                                        <Trash2 size={18} /> Delete City
                                    </button>
                                    <button
                                        className="btn-danger-admin strong"
                                        onClick={() => setBulkDeleteTarget({ type: 'all' })}
                                    >
                                        <Trash2 size={18} /> Delete All
                                    </button>
                                    <button className="btn-primary-admin" style={{ background: '#6c5dd3' }} onClick={() => { 
                                        setFormData({}); 
                                        setSelectedAssetFile(null); 
                                        setIsAddModalOpen(true); 
                                    }}>
                                        <Plus size={18} /> Add New Asset
                                    </button>
                                    <button className="btn-icon" title="Export Inventory"><Download size={18} /></button>
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

                            {isInventoryFilterOpen && (
                                <div className="inventory-filters animate-in">
                                    <div className="inventory-filter-group">
                                        <label>Region / City</label>
                                        <select
                                            value={inventoryCityFilter}
                                            onChange={(e) => {
                                                setInventoryCityFilter(e.target.value);
                                                setInventoryLocalityFilter('All');
                                            }}
                                        >
                                            {inventoryCities.map(city => (
                                                <option key={city} value={city}>{city}</option>
                                            ))}
                                        </select>
                                    </div>
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
                                        <label>Locality</label>
                                        <select value={inventoryLocalityFilter} onChange={(e) => setInventoryLocalityFilter(e.target.value)}>
                                            {inventoryLocalities.map(locality => (
                                                <option key={locality} value={locality}>{locality}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="inventory-filter-group">
                                        <label>Media Format</label>
                                        <select value={inventoryMediaFilter} onChange={(e) => setInventoryMediaFilter(e.target.value)}>
                                            {inventoryMediaFormats.map(format => (
                                                <option key={format} value={format}>{format}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="inventory-filter-group">
                                        <label>Size</label>
                                        <select value={inventorySizeFilter} onChange={(e) => setInventorySizeFilter(e.target.value)}>
                                            {inventorySizes.map(size => (
                                                <option key={size} value={size}>{size}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="inventory-filter-group">
                                        <label>Site Category</label>
                                        <select value={inventoryCategoryFilter} onChange={(e) => setInventoryCategoryFilter(e.target.value)}>
                                            {inventoryCategories.map(category => (
                                                <option key={category} value={category}>{category}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="inventory-filter-group">
                                        <label>Price Range</label>
                                        <select value={inventoryPriceFilter} onChange={(e) => setInventoryPriceFilter(e.target.value)}>
                                            {inventoryPriceRanges.map(([value, label]) => (
                                                <option key={value} value={value}>{label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <button
                                        className="btn-reset-filters"
                                        onClick={() => {
                                            setInventoryCityFilter('All');
                                            setInventoryStatusFilter('All');
                                            setInventoryLocalityFilter('All');
                                            setInventoryMediaFilter('All');
                                            setInventorySizeFilter('All');
                                            setInventoryCategoryFilter('All');
                                            setInventoryPriceFilter('All');
                                            setSearchTerm('');
                                        }}
                                    >
                                        Reset All
                                    </button>
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
                                                        style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                                                        onClick={() => navigate(`/${encodeURIComponent(h.City || 'city')}/${encodeURIComponent(h["Location "] || h.Location || h["Locality Site Location"] || '')}`)}
                                                        title="Open site detail page"
                                                    >
                                                        {h["Locality Site Location"] || h["Location "] || h["Location"] || "Hoarding Site"}
                                                    </div>
                                                    <div className="asset-meta">
                                                        {h["Locality"] || h["Area"] || h.City}
                                                        {h.Width && h.Height ? ` • ${h.Width}x${h.Height} ft` : ''}
                                                        {h["Type of Site (Unipole/Billboard)"] || h["Type"] ? ` • ${h["Type of Site (Unipole/Billboard)"] || h["Type"]}` : ''}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="asset-region">{h.City}</div>
                                                </td>
                                                <td className="asset-price">
                                                    ₹{Number(h["Avg Monthly Cost (INR)"] || h["Rental Per Month"] || 0).toLocaleString('en-IN')}
                                                    <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', fontWeight: '500' }}>/ month</span>
                                                </td>
                                                <td>
                                                    <span className={`status-pill ${h.STATUS === 'Disabled' ? 'disabled' :
                                                        h.STATUS === 'Occupied' ? 'occupied' : 'available'
                                                        }`}>
                                                        {h.STATUS === 'Disabled' ? 'Offline' :
                                                            h.STATUS === 'Occupied' ? 'Occupied' : 'Available'}
                                                    </span>
                                                    {h.STATUS === 'Occupied' && (
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
                                                            className={`btn-icon-small ${h.STATUS === 'Disabled' ? 'hidden' : 'visible'}`}
                                                            onClick={() => toggleStatus(h["Location "] || h.Location)}
                                                            title={h.STATUS === 'Disabled' ? 'Enable Site' : 'Disable Site'}
                                                        >
                                                            {h.STATUS === 'Disabled' ? <EyeOff size={16} /> : <Eye size={16} />}
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

                {activeTab === 'clients' && (
                    <div className="tab-content clients-tab animate-in" style={{ padding: '40px 60px' }}>
                        <header style={{ marginBottom: '40px' }}>
                            <h2 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#11142d', marginBottom: '8px', letterSpacing: '-0.02em' }}>Client Relationships</h2>
                            <p style={{ color: '#808191', fontSize: '1rem', fontWeight: 500 }}>Manage advertiser accounts and campaign performance.</p>
                        </header>

                        {/* 📊 Client CRM Stats */}
                        <div className="client-stats-row">
                            <div className="stat-box">
                                <div className="stat-icon clients-c"><User size={22} /></div>
                                <div>
                                    <span className="stat-val">{[...new Set(hoardings.filter(h => h.BookedBy).map(h => h.BookedBy))].length}</span>
                                    <span className="stat-lbl">Managed Clients</span>
                                </div>
                            </div>
                            <div className="stat-box">
                                <div className="stat-icon active-c"><Zap size={22} /></div>
                                <div>
                                    <span className="stat-val">{hoardings.filter(h => h.STATUS === 'Occupied').length}</span>
                                    <span className="stat-lbl">Active Campaigns</span>
                                </div>
                            </div>
                            <div className="stat-box">
                                <div className="stat-icon market-c"><MapPin size={22} /></div>
                                <div>
                                    <span className="stat-val">{new Set(hoardings.filter(h => h.STATUS === 'Occupied').map(h => h.City)).size}</span>
                                    <span className="stat-lbl">Market Cities</span>
                                </div>
                            </div>
                        </div>

                        <div className="clients-section-controls">
                           <div className="search-pill">
                               <Search size={18} color="#808191" />
                               <input placeholder="Search client database..." />
                           </div>
                        </div>

                        <div className="clients-list-grid">
                            {[...new Set(hoardings.filter(h => h.BookedBy).map(h => h.BookedBy))].map((client, idx) => {
                                const allSitesForClient = hoardings.filter(h => h.BookedBy === client);
                                const activeSites = allSitesForClient.filter(h => h.STATUS === 'Occupied');
                                
                                if (allSitesForClient.length === 0) return null;

                                return (
                                    <div key={idx} className="client-data-card animate-in" style={{ animationDelay: `${idx * 0.1}s` }}>
                                        <div className="client-card-header">
                                            <div className="client-avatar">{client.charAt(0).toUpperCase()}</div>
                                            <div className="client-main-info">
                                                <h4>{client}</h4>
                                                <div className="status-badge-row">
                                                    <span className="status-dot"></span>
                                                    <span>Verified Partner</span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="client-card-stats">
                                            <div className="mini-stat">
                                                <span className="m-val">{activeSites.length}</span>
                                                <span className="m-lbl">Live Sites</span>
                                            </div>
                                            <div className="mini-stat">
                                                <span className="m-val">{allSitesForClient.length - activeSites.length}</span>
                                                <span className="m-lbl">Completed</span>
                                            </div>
                                        </div>

                                        <div className="client-card-actions">
                                            <button 
                                                className="btn-share-link"
                                                onClick={() => {
                                                    const link = `${window.location.origin}/client/${encodeURIComponent(client)}`;
                                                    navigator.clipboard.writeText(link);
                                                    alert(`✅ Link copied!`);
                                                }}
                                            >
                                                <Share2 size={16} /> Share Link
                                            </button>
                                            <button 
                                                className="btn-view-portal"
                                                onClick={() => window.open(`/client/${encodeURIComponent(client)}`, '_blank')}
                                            >
                                                <ExternalLink size={16} /> Portal
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <style>{`
                            .client-stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; margin-bottom: 50px; }
                            .stat-box { background: white; padding: 26px; border-radius: 24px; display: flex; align-items: center; gap: 20px; border: 1px solid #edf2f7; box-shadow: 0 4px 12px rgba(0,0,0,0.01); }
                            .stat-icon { width: 54px; height: 54px; border-radius: 18px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                            .clients-c { background: #f3f0ff; color: #6c5dd3; }
                            .active-c { background: #fff4e5; color: #ff9f43; }
                            .market-c { background: #e5f9f2; color: #20c997; }
                            .stat-val { display: block; font-size: 1.6rem; font-weight: 900; color: #11142d; line-height: 1.1; margin-bottom: 2px; }
                            .stat-lbl { font-size: 0.8rem; color: #b1b1b1; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }

                            .clients-section-controls { margin-bottom: 32px; display: flex; justify-content: space-between; align-items: center; }
                            .search-pill { background: #f4f7fe; border: 1px solid transparent; display: flex; align-items: center; gap: 14px; padding: 14px 24px; border-radius: 16px; width: 400px; transition: all 0.2s; }
                            .search-pill:focus-within { background: white; border-color: #6c5dd3; box-shadow: 0 10px 20px rgba(108, 93, 211, 0.05); }
                            .search-pill input { border: none; outline: none; font-size: 0.95rem; font-weight: 600; color: #11142d; width: 100%; background: transparent; }

                            .clients-list-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 30px; }
                            .client-data-card { background: white; border: 1px solid #edf2f7; border-radius: 28px; padding: 30px; box-shadow: 0 15px 35px rgba(0,0,0,0.02); transition: all 0.3s ease; position: relative; }
                            .client-data-card:hover { transform: translateY(-8px); border-color: #6c5dd3; box-shadow: 0 20px 40px rgba(108, 93, 211, 0.08); }
                            
                            .client-card-header { display: flex; align-items: center; gap: 20px; margin-bottom: 30px; }
                            .client-avatar { width: 60px; height: 60px; background: #6c5dd3; color: white; border-radius: 20px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.5rem; box-shadow: 0 10px 20px rgba(108, 93, 211, 0.15); }
                            .client-main-info h4 { font-size: 1.35rem; font-weight: 900; color: #11142d; margin-bottom: 4px; }
                            .status-badge-row { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: #20c997; font-weight: 800; text-transform: uppercase; }
                            .status-dot { width: 8px; height: 8px; background: #20c997; border-radius: 50%; animation: blink 2s infinite; }

                            .client-card-stats { display: flex; gap: 40px; background: #fbfbfc; padding: 20px 24px; border-radius: 20px; margin-bottom: 30px; border: 1px solid #f1f5f9; }
                            .mini-stat .m-val { display: block; font-size: 1.25rem; font-weight: 900; color: #11142d; }
                            .mini-stat .m-lbl { font-size: 0.75rem; color: #808191; font-weight: 700; text-transform: uppercase; }

                            .client-card-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
                            .client-card-actions button { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 15px; border-radius: 18px; font-weight: 800; font-size: 0.9rem; cursor: pointer; transition: 0.2s; border: none; }
                            .btn-share-link { background: #f3f0ff; color: #6c5dd3; border: 1px solid #e0d7ff !important; }
                            .btn-view-portal { background: #11142d; color: white; }
                            
                            @keyframes blink { 
                                0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; }
                            }
                        `}</style>
                    </div>
                )}
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
