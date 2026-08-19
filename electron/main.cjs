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
        title: 'AdHoardings Admin Desktop',
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
        mainWindow.loadURL('http://localhost:5173/admin/dashboard');
    } else {
        // Load production built index.html
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'admin/dashboard' });
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        if (!isDev) {
            // Check for updates automatically on launch
            checkForUpdatesSilently();
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

// 🚀 Auto-Updater Logic
function checkForUpdatesSilently() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.checkForUpdates().catch(err => {
        console.log('Update check error:', err.message);
    });
}

function checkForUpdatesManually() {
    autoUpdater.autoDownload = true;
    autoUpdater.checkForUpdates().then(result => {
        if (!result || !result.updateInfo) {
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'No Updates',
                message: 'You are on the latest version of AdHoardings Admin (' + app.getVersion() + ').'
            });
        }
    }).catch(err => {
        dialog.showMessageBox(mainWindow, {
            type: 'error',
            title: 'Update Check Failed',
            message: 'Unable to check for updates: ' + err.message
        });
    });
}

autoUpdater.on('update-available', (info) => {
    if (mainWindow) {
        mainWindow.webContents.send('update-available', info);
    }
});

autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) {
        mainWindow.webContents.send('update-downloaded', info);
    }
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded. Restart the application now to apply the update?`,
        buttons: ['Restart & Install', 'Later']
    }).then(res => {
        if (res.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

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
