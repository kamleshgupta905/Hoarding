const { app, BrowserWindow, ipcMain, dialog, Menu, shell, session, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// 🔒 Enforce Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

let mainWindow = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function getLogFile() {
    try {
        const logDir = path.join(app.getPath('userData'), 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        return path.join(logDir, 'app.log');
    } catch (e) {
        return null;
    }
}

function logToFile(level, message, meta) {
    try {
        const file = getLogFile();
        if (!file) return;
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] [${level}] ${message} ${meta ? (typeof meta === 'string' ? meta : JSON.stringify(meta)) : ''}\n`;
        fs.appendFileSync(file, line, 'utf8');
    } catch (e) {
        console.error('Failed to write log:', e);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'Heera Advertising Admin Desktop',
        backgroundColor: '#0f172a',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true
        }
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:3000/admin/dashboard');
    } else {
        // Load production built index.html
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/admin/dashboard' });
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        if (!isDev) {
            // Check for updates automatically on launch
            checkForUpdatesSilently();
        }
    });

    // Fallback: Ensure window displays even if ready-to-show is delayed
    setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            mainWindow.show();
            if (!isDev) checkForUpdatesSilently();
        }
    }, 2500);

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error('[WebContents Load Failure]:', errorCode, errorDescription, validatedURL);
    });

    // Handle ESC key to exit full screen and F11 to toggle full screen
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Escape' && input.type === 'keyDown') {
            if (mainWindow.isFullScreen()) {
                mainWindow.setFullScreen(false);
                event.preventDefault();
            }
        }
        if (input.key === 'F11' && input.type === 'keyDown') {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
            event.preventDefault();
        }
    });

    // Navigation guard: Block navigating away inside the Electron window
    mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
        try {
            const parsed = new URL(navigationUrl);
            if (isDev && parsed.origin === 'http://localhost:3000') return;
            if (parsed.protocol === 'file:') return;
        } catch (e) {}
        event.preventDefault();
        shell.openExternal(navigationUrl);
    });

    // Open external links in default system browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http:') || url.startsWith('https:')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    createApplicationMenu();
}

function createApplicationMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Check for Updates...',
                    click: () => checkForUpdatesManually()
                },
                {
                    label: 'Clear Cache & Reload',
                    accelerator: 'CmdOrCtrl+Shift+R',
                    click: async () => {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            await mainWindow.webContents.session.clearCache();
                            await mainWindow.webContents.session.clearStorageData();
                            mainWindow.webContents.reloadIgnoringCache();
                        }
                    }
                },
                { type: 'separator' },
                { role: 'quit', label: 'Exit' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Open Logs Folder',
                    click: async () => {
                        try {
                            const logDir = path.join(app.getPath('userData'), 'logs');
                            if (!fs.existsSync(logDir)) {
                                fs.mkdirSync(logDir, { recursive: true });
                            }
                            await shell.openPath(logDir);
                        } catch (e) {
                            console.error('Cannot open log folder:', e);
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Open Web Portal',
                    click: () => shell.openExternal('https://hoarding-hd9a.vercel.app/admin/dashboard')
                },
                {
                    label: 'Staff Upload Link',
                    click: () => shell.openExternal('https://hoarding-hd9a.vercel.app/staff/upload')
                },
                { type: 'separator' },
                {
                    label: 'Download Android Staff Camera APK...',
                    click: () => shell.openExternal('https://github.com/kamleshgupta905/Hoarding/releases/download/staff-apk-latest/heera-staff-camera.apk')
                },
                {
                    label: 'Download Latest Windows Releases (.exe)...',
                    click: () => shell.openExternal('https://github.com/kamleshgupta905/hoarding-desktop-releases/releases/latest')
                },
                { type: 'separator' },
                {
                    label: `Version ${app.getVersion()}`,
                    enabled: false
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// 🚀 Zero-Touch Automated Silent Background Updater (Public GitHub Releases)
function checkForUpdatesSilently() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    // ⚡ CRITICAL: Disable differential download so updater streams the full setup .exe directly
    // GitHub Releases CDN stalls/hangs on multi-range blockmap requests in electron-updater
    autoUpdater.disableDifferentialDownload = true;
    try {
        autoUpdater.setFeedURL({
            provider: 'github',
            owner: 'kamleshgupta905',
            repo: 'hoarding-desktop-releases'
        });
    } catch (e) {}

    // Check silently on startup after 2.5s
    setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify().catch(err => {
            console.log('[AutoUpdater Startup Notice]:', err.message);
        });
    }, 2500);

    // Continuous background check every 15 minutes
    setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify().catch(err => {
            console.log('[AutoUpdater Periodic Notice]:', err.message);
        });
    }, 15 * 60 * 1000);
}

function checkForUpdatesManually() {
    autoUpdater.autoDownload = true;
    autoUpdater.disableDifferentialDownload = true;
    try {
        autoUpdater.setFeedURL({
            provider: 'github',
            owner: 'kamleshgupta905',
            repo: 'hoarding-desktop-releases'
        });
    } catch (e) {}
    autoUpdater.checkForUpdates().then(result => {
        if (!result || !result.updateInfo) {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-not-available', null);
            }
        }
    }).catch(err => {
        console.error('[Update Check Error]:', err);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-error', err.message || 'Unable to check for updates.');
        }
    });
}

autoUpdater.on('checking-for-update', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-checking');
    }
});

autoUpdater.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-available', info);
    }
});

autoUpdater.on('update-not-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-not-available', info);
    }
});

autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater Error]:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-error', err?.message || String(err));
    }
});

autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-progress', progressObj);
    }
});

autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-downloaded', info);
    }
});

const { extractPptxNative } = require('./pptxNative.cjs');

// IPC Handlers
ipcMain.on('check-for-updates', () => {
    checkForUpdatesManually();
});

ipcMain.on('install-update-now', () => {
    // isSilent = true (unattended), isForceRunAfter = true (auto-restart)
    autoUpdater.quitAndInstall(true, true);
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('clear-cache', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        await mainWindow.webContents.session.clearCache();
        await mainWindow.webContents.session.clearStorageData();
        mainWindow.webContents.reloadIgnoringCache();
        return true;
    }
    return false;
});

ipcMain.handle('extract-pptx-native', async (event, params) => {
    try {
        const { filePath, fileBuffer, sites, groqApiKey } = params || {};
        const result = await extractPptxNative({
            filePath,
            fileBuffer: fileBuffer ? Buffer.from(fileBuffer) : null,
            sites: sites || [],
            groqApiKey: groqApiKey || '',
            onProgress: (progressData) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('pptx-progress', progressData);
                }
            }
        });
        return { success: true, slides: result };
    } catch (err) {
        console.error('[Native PPTX Error]:', err);
        return { success: false, error: err.message || String(err) };
    }
});

ipcMain.handle('open-log-folder', async () => {
    try {
        const logDir = path.join(app.getPath('userData'), 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        await shell.openPath(logDir);
        return true;
    } catch (e) {
        return false;
    }
});

// 📡 Google Apps Script proxy — bypasses renderer CORS redirects cleanly in Node.js
ipcMain.handle('post-apps-script', async (event, { url, payload, timeoutMs = 60000 }) => {
    const targetUrl = url || 'https://script.google.com/macros/s/AKfycbwmtW7Y71md_XoIk8A0JWrsWKSN-YuFgCcdahe5R56mADlGtH-t9Pj98YhPt3-Z1DoI5g/exec';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload),
            redirect: 'follow',
            signal: controller.signal
        });
        clearTimeout(timer);
        const text = await response.text();
        try {
            const data = JSON.parse(text);
            return { success: true, data };
        } catch {
            return { success: response.ok, rawText: text };
        }
    } catch (err) {
        clearTimeout(timer);
        return { success: false, error: err.message || String(err) };
    }
});

ipcMain.on('log-app-event', (event, { level, message, meta }) => {
    logToFile(level || 'INFO', message || '', meta);
});

// Also load .env.local if present on disk
function loadLocalEnvIfPresent() {
    const candidates = [
        path.join(__dirname, '..', '.env.local'),
        path.join(__dirname, '.env.local'),
        path.join(process.cwd(), '.env.local'),
        path.join(app.getPath('userData'), '.env.local')
    ];
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                const content = fs.readFileSync(p, 'utf8');
                content.split('\n').forEach(line => {
                    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?\s*$/);
                    if (match && !process.env[match[1]]) {
                        process.env[match[1]] = match[2]?.trim().replace(/^['"]|['"]$/g, '') || '';
                    }
                });
                break;
            }
        } catch (e) {}
    }
}
loadLocalEnvIfPresent();


app.whenReady().then(() => {
    // Media & audio permissions
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'audioCapture', 'mediaKeySystem'];
        if (allowedPermissions.includes(permission)) {
            callback(true);
        } else {
            callback(false);
        }
    });

    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
        const allowedPermissions = ['media', 'audioCapture', 'mediaKeySystem'];
        return allowedPermissions.includes(permission);
    });

    // Content Security Policy: Enforce security while whitelisting AI & Google endpoints
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const responseHeaders = Object.assign({}, details.responseHeaders);
        const csp = [
            "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: file: http://localhost:*",
            "connect-src 'self' https://*.google.com https://*.googleusercontent.com https://*.googleapis.com https://script.google.com https://script.googleusercontent.com https://docs.google.com https://drive.google.com https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com https://api.groq.com https://sheets.googleapis.com https://*.supabase.co https://*.vercel.app https://api.github.com https://github.com ws://localhost:* http://localhost:* data: blob:",
            "media-src 'self' blob: data: mediastream:",
            "img-src 'self' data: blob: https: http:",
            "font-src 'self' data: https:",
            "style-src 'self' 'unsafe-inline' https:"
        ].join('; ');

        responseHeaders['Content-Security-Policy'] = [csp];
        callback({ responseHeaders });
    });

    createWindow();
});

app.on('will-quit', () => {
    try {
        globalShortcut.unregisterAll();
    } catch (e) {}
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
