const argon2 = require('argon2');
const bcrypt = require('bcrypt');

const DEFAULT_PASSWORD_MIN_LENGTH = 10;

const ARGON2_OPTIONS = {
    type: argon2.argon2id,
    memoryCost: parseInt(process.env.ARGON2_MEMORY_COST || '65536', 10),
    timeCost: parseInt(process.env.ARGON2_TIME_COST || '3', 10),
    parallelism: parseInt(process.env.ARGON2_PARALLELISM || '1', 10)
};

function getPasswordMinLength() {
    const configured = parseInt(process.env.PASSWORD_MIN_LENGTH || '', 10);
    if (Number.isNaN(configured)) return DEFAULT_PASSWORD_MIN_LENGTH;
    return Math.max(configured, DEFAULT_PASSWORD_MIN_LENGTH);
}

function validatePasswordStrength(password) {
    const minLength = getPasswordMinLength();
    const errors = [];

    if (!password || password.length < minLength) {
        errors.push(`Password minimal ${minLength} karakter.`);
    }
    if (!/[a-z]/.test(password || '')) errors.push('Password harus memiliki huruf kecil.');
    if (!/[A-Z]/.test(password || '')) errors.push('Password harus memiliki huruf besar.');
    if (!/[0-9]/.test(password || '')) errors.push('Password harus memiliki angka.');
    if (!/[^A-Za-z0-9]/.test(password || '')) errors.push('Password harus memiliki simbol.');

    return {
        valid: errors.length === 0,
        message: errors.join(' ')
    };
}

function hashPassword(password) {
    return argon2.hash(password, ARGON2_OPTIONS);
}

async function verifyPassword(password, hash) {
    if (!hash) return false;
    if (hash.startsWith('$argon2id$')) return argon2.verify(hash, password);
    if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
        return bcrypt.compare(password, hash);
    }
    return false;
}

function needsPasswordRehash(hash) {
    if (!hash || !hash.startsWith('$argon2id$')) return true;
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
}

module.exports = {
    getPasswordMinLength,
    validatePasswordStrength,
    hashPassword,
    verifyPassword,
    needsPasswordRehash
};
