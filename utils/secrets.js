const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

let loaded = false;

function loadJsonSecrets(filePath) {
    if (!fs.existsSync(filePath)) return;

    let secrets;
    try {
        secrets = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        throw new Error(`Vault secret tidak valid: ${filePath}`);
    }

    Object.entries(secrets).forEach(([key, value]) => {
        if (!process.env[key] && value !== null && value !== undefined) {
            process.env[key] = String(value);
        }
    });
}

function loadSecrets() {
    if (loaded) return;

    dotenv.config();

    const defaultVaultPath = path.join(__dirname, '..', 'secrets', 'vault.json');
    const configuredVaultPath = process.env.VAULT_FILE
        ? path.resolve(process.env.VAULT_FILE)
        : defaultVaultPath;

    loadJsonSecrets(configuredVaultPath);
    loaded = true;
}

module.exports = { loadSecrets };
