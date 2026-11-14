const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    platform: process.platform,
    checkForUpdates: () => ipcRenderer.send('check-for-updates'),
    clearCache: () => ipcRenderer.invoke('clear-cache'),
    installUpdate: () => ipcRenderer.send('install-update-now'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    onUpdateChecking: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('update-checking', handler);
        return () => ipcRenderer.removeListener('update-checking', handler);
    },
    onUpdateAvailable: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('update-available', handler);
        return () => ipcRenderer.removeListener('update-available', handler);
    },
    onUpdateNotAvailable: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('update-not-available', handler);
        return () => ipcRenderer.removeListener('update-not-available', handler);
    },
    onUpdateError: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('update-error', handler);
        return () => ipcRenderer.removeListener('update-error', handler);
    },
    onUpdateProgress: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('update-progress', handler);
        return () => ipcRenderer.removeListener('update-progress', handler);
    },
    onUpdateDownloaded: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('update-downloaded', handler);
        return () => ipcRenderer.removeListener('update-downloaded', handler);
    },
    extractPptxNative: (params) => ipcRenderer.invoke('extract-pptx-native', params),
    onPptxProgress: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('pptx-progress', handler);
        return () => ipcRenderer.removeListener('pptx-progress', handler);
    },
    openLogFolder: () => ipcRenderer.invoke('open-log-folder'),
    logEvent: (level, message, meta) => ipcRenderer.send('log-app-event', { level, message, meta }),
    postAppsScript: (params) => ipcRenderer.invoke('post-apps-script', params),
});
