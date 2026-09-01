const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    platform: process.platform,
    checkForUpdates: () => ipcRenderer.send('check-for-updates'),
    installUpdate: () => ipcRenderer.send('install-update-now'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    onUpdateChecking: (callback) => {
        ipcRenderer.on('update-checking', (_event, value) => callback(value));
    },
    onUpdateAvailable: (callback) => {
        ipcRenderer.on('update-available', (_event, value) => callback(value));
    },
    onUpdateNotAvailable: (callback) => {
        ipcRenderer.on('update-not-available', (_event, value) => callback(value));
    },
    onUpdateError: (callback) => {
        ipcRenderer.on('update-error', (_event, value) => callback(value));
    },
    onUpdateProgress: (callback) => {
        ipcRenderer.on('update-progress', (_event, value) => callback(value));
    },
    onUpdateDownloaded: (callback) => {
        ipcRenderer.on('update-downloaded', (_event, value) => callback(value));
    },
    extractPptxNative: (params) => ipcRenderer.invoke('extract-pptx-native', params),
    onPptxProgress: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('pptx-progress', handler);
        return () => ipcRenderer.removeListener('pptx-progress', handler);
    }
});
