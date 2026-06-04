const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionSecret() {
    const secret = process.env.AES_256_GCM_KEY || process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
        throw new Error('AES_256_GCM_KEY atau ENCRYPTION_KEY wajib diatur di production.');
    }
    return secret || 'al-muraqabah-dev-encryption-key-change-me';
}

function getKey() {
    const secret = getEncryptionSecret();
    if (/^[a-f0-9]{64}$/i.test(secret)) return Buffer.from(secret, 'hex');

    try {
        const decoded = Buffer.from(secret, 'base64');
        if (decoded.length === 32) return decoded;
    } catch (error) {
        // Fallback to SHA-256 derivation below.
    }

    return crypto.createHash('sha256').update(secret).digest();
}

function encryptText(value) {
    if (value === null || value === undefined || value === '') return null;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv, { authTagLength: TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptText(value) {
    if (value === null || value === undefined || value === '') return null;
    const text = String(value);
    if (!text.startsWith('v1:')) return text;

    const [, ivText, tagText, encryptedText] = text.split(':');
    if (!ivText || !tagText || !encryptedText) throw new Error('Format ciphertext tidak valid.');

    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivText, 'base64'), { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(Buffer.from(tagText, 'base64'));
    return Buffer.concat([
        decipher.update(Buffer.from(encryptedText, 'base64')),
        decipher.final()
    ]).toString('utf8');
}

function encryptNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (Number.isNaN(number)) return null;
    return encryptText(String(number));
}

function decryptNumber(encryptedValue, fallbackValue = null) {
    const source = encryptedValue || fallbackValue;
    if (source === null || source === undefined || source === '') return null;
    const decrypted = decryptText(source);
    const number = Number(decrypted);
    return Number.isNaN(number) ? null : number;
}

module.exports = {
    encryptText,
    decryptText,
    encryptNumber,
    decryptNumber
};
