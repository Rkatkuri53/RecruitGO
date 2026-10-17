import { createWindowsInstaller } from 'electron-winstaller';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildInstaller() {
    try {
        console.log('Creating Windows Installer (Setup.exe)... This might take a few minutes.');
        await createWindowsInstaller({
            appDirectory: path.join(__dirname, 'release-builds', 'MyRecruiter-Tier2-win32-x64'),
            outputDirectory: path.join(__dirname, 'release'),
            authors: 'MyRecruiter',
            exe: 'MyRecruiter.exe',
            setupExe: 'MyRecruiter-Tier2_Setup.exe',
            noMsi: true,
        });
        console.log('Successfully created installer at release/MyRecruiter-Setup.exe!');
    } catch (e) {
        console.error('Installer creation failed:', e.message);
    }
}
buildInstaller();
