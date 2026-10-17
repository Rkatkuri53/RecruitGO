import { app, BrowserWindow, Tray, Menu, dialog } from 'electron';
import * as path from 'path';
import * as url from 'url';
import fs from 'fs';

process.on('uncaughtException', (error) => {
    dialog.showErrorBox('Fatal Error', error.stack || error.message || 'Unknown Error');
});

process.on('unhandledRejection', (reason) => {
    dialog.showErrorBox('Fatal Promise Rejection', String(reason));
});

import dotenv from 'dotenv';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;


const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the correct location (dev vs installed)
const devEnvPath = path.join(__dirname, '../../.env');
const prodEnvPath = path.join(process.resourcesPath || '', '.env');
const userDataEnvPath = path.join(app.getPath('userData'), '.env');

// First load base envs
if (fs.existsSync(prodEnvPath)) {
    dotenv.config({ path: prodEnvPath });
} else if (fs.existsSync(devEnvPath)) {
    dotenv.config({ path: devEnvPath });
}

// Then override with the User Data envs (where settings/license are saved)
if (fs.existsSync(userDataEnvPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(userDataEnvPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}


let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const isDev = process.env.NODE_ENV !== 'production';

let isQuiting = false;

// Disable GPU to prevent Chromium network service crashes on some machines
app.disableHardwareAcceleration();

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        // Set AppData path
        const userDataPath = app.getPath('userData');
        process.env.AGENT_DATA_PATH = userDataPath;

        // Boot Express server silently in the background
        console.log(`[ELECTRON] Starting Express Server. Data path: ${userDataPath}`);
        // We dynamic import the server so process.env.AGENT_DATA_PATH is applied first
        import('../server/index.js').catch(err => {
            console.error('[ELECTRON] Failed to start Express server:', err);
            dialog.showErrorBox('Backend Crash', 'The local server failed to start: ' + (err.stack || err.message));
        });

        createWindow();
        createTray();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });

        // Setup Auto Updater
        if (!isDev) {
            autoUpdater.checkForUpdatesAndNotify();
            
            autoUpdater.on('update-available', () => {
                console.log('[UPDATER] Update available.');
            });
            autoUpdater.on('update-downloaded', () => {
                console.log('[UPDATER] Update downloaded, prompting restart...');
                dialog.showMessageBox({
                    type: 'info',
                    title: 'Update Ready',
                    message: 'A new version of MyRecruiter is ready. Restart now to install?',
                    buttons: ['Restart', 'Later']
                }).then((returnValue) => {
                    if (returnValue.response === 0) {
                        autoUpdater.quitAndInstall();
                    }
                });
            });
        }
    });

    // Close to tray behavior
    app.on('window-all-closed', () => {
        app.quit();
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1300,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        title: 'MyRecruiter',
        icon: path.join(__dirname, '../../public/icon.png'),
        show: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        autoHideMenuBar: true
    });

    // Force show immediately so window is always visible
    mainWindow.show();
    mainWindow.focus();

    // Error listeners for diagnostics
    mainWindow.webContents.on('did-fail-load', (_event: any, errorCode: number, errorDescription: string) => {
        console.error(`[ELECTRON] Page failed to load: ${errorCode} ${errorDescription}`);
    });

    mainWindow.webContents.on('render-process-gone', (_event: any, details: any) => {
        console.error(`[ELECTRON] Render process gone:`, details);
    });

    mainWindow.webContents.on('did-finish-load', () => {
        console.log('[ELECTRON] Dashboard loaded successfully.');
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    // Keyboard shortcuts for Reload and DevTools
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
            mainWindow?.reload();
            event.preventDefault();
        } else if (input.key === 'F5') {
            mainWindow?.reload();
            event.preventDefault();
        } else if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
            mainWindow?.webContents.toggleDevTools();
            event.preventDefault();
        } else if (input.key === 'F12') {
            mainWindow?.webContents.toggleDevTools();
            event.preventDefault();
        }
    });

    // Retry loading the dashboard until the Express server is fully ready
    let retryCount = 0;
    const loadDashboard = async () => {
        if (!mainWindow) return;
        retryCount++;
        try {
            console.log(`[ELECTRON] Loading dashboard (attempt ${retryCount})...`);
            await mainWindow.loadURL('http://localhost:8745/?v=' + Date.now());
        } catch (e: any) {
            console.log(`[ELECTRON] Server not ready (${e.message}), retrying in 1s...`);
            if (retryCount > 10) {
                dialog.showErrorBox('Connection Timeout', 'Failed to connect to the local server after 10 seconds. The app might be blocked by a firewall or missing dependencies.');
                app.quit();
                return;
            }
            setTimeout(loadDashboard, 1000);
        }
    };
    
    loadDashboard();

    mainWindow.on('close', (_event: any) => {
        // Force quit instead of hiding to tray to prevent zombie processes
        isQuiting = true;
        app.quit();
    });
}

function createTray() {
    // Determine icon path based on platform/packaging
    const iconPath = path.join(__dirname, '../../public/icon.png');
    
    // We will create a dummy icon if it doesn't exist just to prevent crashes during dev
    if (!fs.existsSync(iconPath)) {
        // Fallback or ignore
    }

    try {
        tray = new Tray(iconPath);
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Open MyRecruiter', click: () => {
                mainWindow?.show();
            } },
            { type: 'separator' },
            { label: 'Quit', click: () => {
                isQuiting = true;
                app.quit();
            } }
        ]);
        tray.setToolTip('MyRecruiter');
        tray.setContextMenu(contextMenu);

        tray.on('click', () => {
            mainWindow?.show();
        });
    } catch (e) {
        console.warn('Tray icon failed to load. Ensure public/icon.png exists.');
    }
}
