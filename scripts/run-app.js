import { execSync, spawn } from 'child_process';
import process from 'process';

if (process.platform === 'win32') {
    try {
        execSync('taskkill /F /IM electron.exe /T', { stdio: 'ignore' });
    } catch (e) {
        // No prior instance running, safe to continue
    }
}

const child = spawn('npx', ['electron', '.'], {
    shell: true,
    stdio: 'inherit'
});

child.on('exit', (code) => {
    process.exit(code || 0);
});
