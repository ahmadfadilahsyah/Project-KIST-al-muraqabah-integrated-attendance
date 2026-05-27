const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Gagal konek database:', err.message);
    } else {
        console.log('Database SQLite terhubung.');
    }
});

function addColumnIfNotExists(tableName, columnName, columnDefinition) {
    db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
        if (err) {
            console.error(`Gagal cek tabel ${tableName}:`, err.message);
            return;
        }

        const exists = columns.some(col => col.name === columnName);

        if (!exists) {
            db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`, (err) => {
                if (err) {
                    console.error(`Gagal tambah kolom ${columnName}:`, err.message);
                } else {
                    console.log(`Kolom ${columnName} berhasil ditambahkan ke ${tableName}`);
                }
            });
        }
    });
}

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            nim TEXT PRIMARY KEY,
            nama TEXT NOT NULL,
            email TEXT,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            judul TEXT,
            expires_at DATETIME,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS qr_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT NOT NULL,
            session_id INTEGER NOT NULL,
            expires_at DATETIME NOT NULL,
            used INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nim TEXT NOT NULL,
            session_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS class_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_name TEXT,
            latitude REAL,
            longitude REAL,
            radius_meters INTEGER DEFAULT 50,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    addColumnIfNotExists('sessions', 'judul', 'TEXT');
    addColumnIfNotExists('sessions', 'expires_at', 'DATETIME');
    addColumnIfNotExists('sessions', 'active', 'INTEGER DEFAULT 1');
    addColumnIfNotExists('sessions', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

    addColumnIfNotExists('qr_tokens', 'used', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('qr_tokens', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

    addColumnIfNotExists('class_settings', 'class_name', 'TEXT');
    addColumnIfNotExists('class_settings', 'radius_meters', 'INTEGER DEFAULT 50');
});

module.exports = db;