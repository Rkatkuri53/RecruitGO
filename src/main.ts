import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null;
let serverProcess: any;

function checkServerReady(callback: () => void) {
    let called = false;
    const done = () => { if (!called) { called = true; callback(); } };

    const interval = setInterval(() => {
        console.log('[ELECTRON] Server not ready, retrying in 500ms...');
        http.get('http://localhost:3000', (res) => {
            clearInterval(interval);
            console.log('[ELECTRON] Server responded with status:', res.statusCode);
            done();
        }).on('error', () => {
            // Server not ready yet...
        });
    }, 500);

    // Fallback: if server doesn't respond in 10 seconds, show window anyway
    setTimeout(() => {
        clearInterval(interval);
        console.log('[ELECTRON] Timeout reached, showing window anyway...');
        done();
    }, 10000);
}

function createWindow() {
    console.log('[DESKTOP] Initializing System-Level Data Paths...');
    const userDataPath = app.getPath('userData');
    process.env.AGENT_DATA_PATH = userDataPath;
    
    // Ensure data directory exists
    const dataDir = path.join(userDataPath, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    console.log('[DESKTOP] Launching Hybrid AI Server...');
    const serverPath = path.join(__dirname, 'server', 'index.js');
    serverProcess = fork(serverPath, [], {
        env: { ...process.env, AGENT_DATA_PATH: userDataPath }
    });

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 900,
        title: "LinkedIn Hybrid Agent | Command Center",
        backgroundColor: '#0f172a',
        show: false, // Don't show until ready
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    checkServerReady(() => {
        mainWindow?.loadURL('http://localhost:3000');
        mainWindow?.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (serverProcess) serverProcess.kill();
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
