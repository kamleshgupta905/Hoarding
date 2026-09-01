const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

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
                    label: 'Open Web Portal',
                    click: () => shell.openExternal('https://hoarding-hd9a.vercel.app/admin/dashboard')
                },
                {
                    label: 'Staff Upload Link',
                    click: () => shell.openExternal('https://hoarding-hd9a.vercel.app/staff/upload')
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

// 🚀 Zero-Touch Automated Silent Background Updater (GitHub Releases)
function checkForUpdatesSilently() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

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
    autoUpdater.quitAndInstall();
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
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

app.whenReady().then(createWindow);

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
