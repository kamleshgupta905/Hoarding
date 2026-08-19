const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    platform: process.platform,
    checkForUpdates: () => ipcRenderer.send('check-for-updates'),
    installUpdate: () => ipcRenderer.send('install-update-now'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    onUpdateAvailable: (callback) => {
        ipcRenderer.on('update-available', (_event, value) => callback(value));
    },
    onUpdateDownloaded: (callback) => {
        ipcRenderer.on('update-downloaded', (_event, value) => callback(value));
    }
});
