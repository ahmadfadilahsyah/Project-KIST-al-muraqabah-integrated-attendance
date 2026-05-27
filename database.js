const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, 'absensi.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Gagal konek database:', err.message);
    } else {
        console.log('Database SQLite terhubung:', dbPath);
    }
});

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function columnExists(tableName, columnName) {
    const columns = await all(`PRAGMA table_info(${tableName})`);
    return columns.some(col => col.name === columnName);
}

async function addColumnIfNotExists(tableName, columnName, columnDefinition) {
    try {
        const exists = await columnExists(tableName, columnName);
        if (!exists) {
            await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
            console.log(`Kolom ${columnName} ditambahkan ke ${tableName}`);
        }
    } catch (err) {
        console.error(`Gagal migrasi ${tableName}.${columnName}:`, err.message);
    }
}

async function seedUserIfNotExists(nim, nama, password, role, email) {
    const rows = await all('SELECT nim FROM users WHERE nim = ?', [nim]);
    if (rows.length > 0) return;

    const hashedPassword = await bcrypt.hash(password, 10);
    await run(
        'INSERT INTO users (nim, nama, email, password, role) VALUES (?, ?, ?, ?, ?)',
        [nim, nama, email, hashedPassword, role]
    );
    console.log(`Akun demo dibuat: ${nim} / ${password}`);
}

async function initDatabase() {
    try {
        await run(`
            CREATE TABLE IF NOT EXISTS users (
                nim TEXT PRIMARY KEY,
                nama TEXT NOT NULL,
                email TEXT,
                password TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                judul TEXT,
                expires_at DATETIME,
                active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS qr_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT NOT NULL,
                session_id INTEGER NOT NULL,
                expires_at DATETIME NOT NULL,
                used INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nim TEXT NOT NULL,
                session_id INTEGER NOT NULL,
                latitude REAL,
                longitude REAL,
                distance_meters REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS class_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_name TEXT,
                latitude REAL,
                longitude REAL,
                radius_meters INTEGER DEFAULT 50,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await addColumnIfNotExists('users', 'email', 'TEXT');
        await addColumnIfNotExists('users', 'created_at', 'DATETIME');

        await addColumnIfNotExists('sessions', 'judul', 'TEXT');
        await addColumnIfNotExists('sessions', 'expires_at', 'DATETIME');
        await addColumnIfNotExists('sessions', 'active', 'INTEGER DEFAULT 1');
        await addColumnIfNotExists('sessions', 'created_at', 'DATETIME');

        await addColumnIfNotExists('qr_tokens', 'used', 'INTEGER DEFAULT 0');
        await addColumnIfNotExists('qr_tokens', 'created_at', 'DATETIME');

        await addColumnIfNotExists('attendance', 'latitude', 'REAL');
        await addColumnIfNotExists('attendance', 'longitude', 'REAL');
        await addColumnIfNotExists('attendance', 'distance_meters', 'REAL');
        await addColumnIfNotExists('attendance', 'created_at', 'DATETIME');

        await addColumnIfNotExists('class_settings', 'class_name', 'TEXT');
        await addColumnIfNotExists('class_settings', 'radius_meters', 'INTEGER DEFAULT 50');
        await addColumnIfNotExists('class_settings', 'updated_at', 'DATETIME');
        await addColumnIfNotExists('class_settings', 'created_at', 'DATETIME');

        await run(`UPDATE sessions SET active = 1 WHERE active IS NULL`);
        await run(`UPDATE sessions SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL`);
        await run(`UPDATE attendance SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL`);
        await run(`UPDATE class_settings SET radius_meters = 50 WHERE radius_meters IS NULL`);

        await seedUserIfNotExists('D001', 'Dosen Demo', 'dosen123', 'lecturer', 'dosen@example.com');
        await seedUserIfNotExists('M001', 'Mahasiswa Demo', 'mahasiswa123', 'student', 'mahasiswa@example.com');

        console.log('Database siap digunakan.');
    } catch (err) {
        console.error('Gagal inisialisasi database:', err.message);
    }
}

initDatabase();

module.exports = db;
