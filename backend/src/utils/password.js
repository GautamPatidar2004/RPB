const crypto = require('crypto');

/**
 * Hash a plaintext password safely using Node.js stdlib scrypt with a cryptographic salt.
 * @param {string} password
 * @returns {string} format: "salt:hexHash"
 */
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

/**
 * Verify a plaintext password against a stored "salt:hexHash".
 * Uses timingSafeEqual to prevent side-channel timing attacks.
 * @param {string} password
 * @param {string} storedHash
 * @returns {boolean}
 */
function verifyPassword(password, storedHash) {
    if (!password || !storedHash || !storedHash.includes(':')) {
        return false;
    }
    const [salt, key] = storedHash.split(':');
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    if (keyBuffer.length !== derivedKey.length) {
        return false;
    }
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

module.exports = {
    hashPassword,
    verifyPassword
};
