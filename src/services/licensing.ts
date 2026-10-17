import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as os from 'os';

// The highly secret key used to sign and verify licenses.
// In a real production app, you might obfuscate this string.
const LICENSE_SECRET = 'SUPER_SECRET_RECRUITER_KEY_2026_X9';

/**
 * Executes a system command to retrieve a hardware-based unique ID.
 * Falls back to a random string if wmic is unavailable (e.g. non-Windows or restricted).
 */
function getHardwareUUID(): string {
    try {
        if (process.platform === 'win32') {
            const output = execSync('wmic csproduct get uuid', { encoding: 'utf8' });
            const lines = output.split('\n');
            const uuid = lines[1]?.trim();
            if (uuid && uuid !== '') {
                return uuid;
            }
        } else if (process.platform === 'darwin') {
            const output = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID', { encoding: 'utf8' });
            const match = output.match(/"IOPlatformUUID" = "([^"]+)"/);
            if (match && match[1]) {
                return match[1];
            }
        } else if (process.platform === 'linux') {
            const output = execSync('cat /etc/machine-id', { encoding: 'utf8' });
            return output.trim();
        }
    } catch (e) {
        console.warn('[LICENSE] Could not fetch hardware UUID, falling back to OS username+hostname');
    }

    // Fallback if wmic fails
    return `${os.hostname()}-${os.userInfo().username}`;
}

/**
 * Generates a short, user-friendly System ID based on the hardware UUID.
 */
export function generateSystemId(): string {
    const hwid = getHardwareUUID();
    // Hash the UUID to create a stable, short 12-character ID
    const hash = crypto.createHash('sha256').update(hwid).digest('hex').toUpperCase();
    return `SYS-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}`;
}

/**
 * Generates the valid License Key for a given System ID and Expiration Date String (YYYYMMDD).
 * This mathematically locks the Expiration Date into the HMAC signature.
 */
export function generateLicenseKeyForSystem(systemId: string, expirationDateYYYYMMDD: string, tier: string = 'T1'): string {
    const payload = `${systemId}|${expirationDateYYYYMMDD}|${tier}`;
    const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
    hmac.update(payload);
    const hash = hmac.digest('hex').toUpperCase();
    
    // Obfuscate the date by XORing it and converting to Hex
    const dateInt = parseInt(expirationDateYYYYMMDD, 10);
    const obfuscatedDate = (dateInt ^ 0x5A5A5A5A).toString(16).toUpperCase().padStart(8, '0');
    
    const datePart1 = obfuscatedDate.substring(0, 4);
    const datePart2 = obfuscatedDate.substring(4, 8);
    
    // Hash parts
    const part1 = hash.substring(0, 4);
    const part2 = hash.substring(4, 8);
    const part3 = hash.substring(8, 12);
    
    // Format: XXXX-XXXX-XXXX-XXXX-XXXX-TX
    return `${datePart1}-${datePart2}-${part1}-${part2}-${part3}-${tier}`;
}

/**
 * Result object for verification to return detailed failure reasons.
 */
export interface LicenseVerificationResult {
    valid: boolean;
    error?: string;
    systemId?: string;
    tier?: string;
    daysRemaining?: number;
    expiryDate?: string;
}

/**
 * Verifies if the provided License Key correctly matches the current System ID
 * AND checks if the embedded expiration date has passed.
 */
export function verifyLicense(licenseKey: string): LicenseVerificationResult {
    if (!licenseKey || typeof licenseKey !== 'string') {
        return { valid: false, error: 'Invalid license format.' };
    }

    const parts = licenseKey.trim().toUpperCase().split('-');
    let expiryStr = '';
    let tier = 'T1'; // Default to Tier 1 for backwards compatibility
    
    // Check if it's the new 6-block format with Tier suffix (e.g., -T2)
    if (parts.length === 6 && parts[5].startsWith('T')) {
        tier = parts[5];
        const hexStr = parts[0] + parts[1];
        const xored = parseInt(hexStr, 16);
        const dateInt = xored ^ 0x5A5A5A5A;
        expiryStr = dateInt.toString();
    }
    // Check if it's the 5-block obfuscated format (older, implicitly T1)
    else if (parts.length === 5) {
        const hexStr = parts[0] + parts[1];
        const xored = parseInt(hexStr, 16);
        const dateInt = xored ^ 0x5A5A5A5A;
        expiryStr = dateInt.toString();
    } 
    // Check if it's the old 4-block plaintext format (oldest, implicitly T1)
    else if (parts.length === 4) {
        expiryStr = parts[0];
    } else {
        return { valid: false, error: 'Invalid license format.' };
    }

    if (expiryStr.length !== 8 || isNaN(parseInt(expiryStr))) {
        return { valid: false, error: 'License key is corrupted.' };
    }

    // 1. Time Check
    const year = parseInt(expiryStr.substring(0, 4), 10);
    const month = parseInt(expiryStr.substring(4, 6), 10) - 1; // JS months are 0-indexed
    const day = parseInt(expiryStr.substring(6, 8), 10);
    
    const expiryDate = new Date(year, month, day, 23, 59, 59);
    const today = new Date();
    
    // To get true calendar days remaining, calculate the difference between the ends of both days
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
    
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysRemaining = Math.round((expiryDate.getTime() - todayEnd.getTime()) / msPerDay);

    if (daysRemaining < 0) {
        return { valid: false, error: `License expired on ${expiryDate.toLocaleDateString()}. Please renew.` };
    }

    // 2. Cryptography Check
    const currentSystemId = generateSystemId();
    
    // Reconstruct expected payload to check against existing formats.
    // If it's a 6-block key, use the new payload format. Otherwise, use the old payload format.
    let expectedKey = '';
    if (parts.length === 6) {
        expectedKey = generateLicenseKeyForSystem(currentSystemId, expiryStr, tier);
    } else {
        // Fallback for older keys which were generated without the tier parameter
        const payload = `${currentSystemId}|${expiryStr}`;
        const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
        hmac.update(payload);
        const hash = hmac.digest('hex').toUpperCase();
        
        if (parts.length === 5) {
            const dateInt = parseInt(expiryStr, 10);
            const obfuscatedDate = (dateInt ^ 0x5A5A5A5A).toString(16).toUpperCase().padStart(8, '0');
            const datePart1 = obfuscatedDate.substring(0, 4);
            const datePart2 = obfuscatedDate.substring(4, 8);
            expectedKey = `${datePart1}-${datePart2}-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}`;
        } else {
            expectedKey = `${expiryStr}-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}`;
        }
    }
    
    try {
        const isValid = crypto.timingSafeEqual(
            Buffer.from(licenseKey.trim().toUpperCase()),
            Buffer.from(expectedKey)
        );
        
        if (isValid) {
            return { valid: true, systemId: currentSystemId, tier: tier, daysRemaining, expiryDate: expiryDate.toISOString() };
        } else {
            return { valid: false, error: 'License key does not match this hardware.' };
        }
    } catch (e) {
        return { valid: false, error: 'Failed to verify license key.' };
    }
}
