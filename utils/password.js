const bcrypt = require('bcrypt');

const MIN_BCRYPT_ROUNDS = 12;
const MAX_BCRYPT_ROUNDS = 15;
const DEFAULT_PASSWORD_MIN_LENGTH = 10;

function getBcryptRounds() {
    const configured = parseInt(process.env.BCRYPT_ROUNDS || '', 10);
    if (Number.isNaN(configured)) return MIN_BCRYPT_ROUNDS;
    return Math.min(Math.max(configured, MIN_BCRYPT_ROUNDS), MAX_BCRYPT_ROUNDS);
}

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
    return bcrypt.hash(password, getBcryptRounds());
}

function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

function needsPasswordRehash(hash) {
    try {
        return bcrypt.getRounds(hash) < getBcryptRounds();
    } catch (err) {
        return true;
    }
}

module.exports = {
    getBcryptRounds,
    getPasswordMinLength,
    validatePasswordStrength,
    hashPassword,
    verifyPassword,
    needsPasswordRehash
};
