const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL belum diatur. Isi di file .env untuk lokal atau Railway Variables untuk deploy.');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

function normalizeSql(sql) {
    let normalized = String(sql);

    // Kompatibilitas query SQLite lama ke PostgreSQL
    normalized = normalized.replace(/datetime\s*\(\s*['"]now['"]\s*\)/gi, 'CURRENT_TIMESTAMP');
    normalized = normalized.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
    normalized = normalized.replace(/status\s*=\s*"inactive"/gi, "status = 'inactive'");
    normalized = normalized.replace(/status\s*=\s*"active"/gi, "status = 'active'");

    // Tambahkan ON CONFLICT DO NOTHING untuk query lama INSERT OR IGNORE yang sudah dinormalisasi.
    // Hanya jika query belum punya ON CONFLICT dan query asalnya mengandung INSERT OR IGNORE.
    if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql) && !/ON\s+CONFLICT/i.test(normalized)) {
        normalized = normalized.replace(/;\s*$/, '');
        normalized += ' ON CONFLICT DO NOTHING';
    }

    let index = 0;
    normalized = normalized.replace(/\?/g, () => {
        index += 1;
        return `$${index}`;
    });

    return normalized;
}

function addReturningIdIfNeeded(sql) {
    const trimmed = sql.trim();

    if (!/^INSERT\s+INTO/i.test(trimmed) || /RETURNING\s+/i.test(trimmed)) {
        return sql;
    }

    // Tabel users memakai nim sebagai PRIMARY KEY, jadi tidak punya kolom id.
    if (/^INSERT\s+INTO\s+users/i.test(trimmed)) {
        return sql;
    }

    // Tabel-tabel ini punya kolom id, sehingga kompatibel dengan callback sqlite: this.lastID.
    const tablesWithId = [
        'class_officers',
        'subjects',
        'subject_lecturers',
        'subject_pjs',
        'sessions',
        'qr_tokens',
        'attendance',
        'attendance_logs',
        'class_settings',
        'galleries',
        'documents'
    ];

    const shouldReturnId = tablesWithId.some(table => {
        const regex = new RegExp(`^INSERT\\s+INTO\\s+${table}\\b`, 'i');
        return regex.test(trimmed);
    });

    if (!shouldReturnId) return sql;

    return trimmed.replace(/;\s*$/, '') + ' RETURNING id';
}

async function queryAsync(sql, params = []) {
    const normalized = normalizeSql(sql);
    return pool.query(normalized, params);
}

async function runAsync(sql, params = []) {
    const normalized = addReturningIdIfNeeded(normalizeSql(sql));
    return pool.query(normalized, params);
}

async function allAsync(sql, params = []) {
    const result = await queryAsync(sql, params);
    return result.rows;
}

async function getAsync(sql, params = []) {
    const rows = await allAsync(sql, params);
    return rows[0];
}

function run(sql, params, callback) {
    if (typeof params === 'function') {
        callback = params;
        params = [];
    }

    runAsync(sql, params)
        .then(result => {
            const context = {
                lastID: result.rows && result.rows[0] ? result.rows[0].id : undefined,
                changes: result.rowCount || 0
            };
            if (callback) callback.call(context, null);
        })
        .catch(err => {
            if (callback) callback(err);
            else console.error('Database run error:', err.message);
        });
}

function all(sql, params, callback) {
    if (typeof params === 'function') {
        callback = params;
        params = [];
    }

    allAsync(sql, params)
        .then(rows => callback && callback(null, rows))
        .catch(err => {
            if (callback) callback(err);
            else console.error('Database all error:', err.message);
        });
}

function get(sql, params, callback) {
    if (typeof params === 'function') {
        callback = params;
        params = [];
    }

    getAsync(sql, params)
        .then(row => callback && callback(null, row))
        .catch(err => {
            if (callback) callback(err);
            else console.error('Database get error:', err.message);
        });
}

function serialize(callback) {
    if (typeof callback === 'function') callback();
}

function close(callback) {
    pool.end()
        .then(() => callback && callback(null))
        .catch(err => callback && callback(err));
}

async function seedUserIfNotExists(nim, nama, password, role, email = null, mustChangePassword = 0) {
    const existing = await getAsync('SELECT nim FROM users WHERE nim = ?', [nim]);
    if (existing) return;

    const hashedPassword = await bcrypt.hash(password, 10);
    await runAsync(
        `INSERT INTO users (nim, nama, email, password, role, status, must_change_password, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)`,
        [nim, nama, email, hashedPassword, role, mustChangePassword]
    );
    console.log(`Akun demo dibuat: ${nim} / ${password}`);
}

async function initDatabase() {
    try {
        await pool.query('SELECT 1');
        console.log('Database PostgreSQL terhubung.');

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS users (
                nim VARCHAR(50) PRIMARY KEY,
                nama TEXT NOT NULL,
                email TEXT,
                password TEXT NOT NULL,
                role VARCHAR(30) NOT NULL DEFAULT 'student',
                status VARCHAR(30) NOT NULL DEFAULT 'active',
                must_change_password INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP
            )
        `);

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS class_officers (
                id SERIAL PRIMARY KEY,
                user_nim VARCHAR(50) NOT NULL REFERENCES users(nim) ON DELETE CASCADE,
                position VARCHAR(50) NOT NULL,
                period VARCHAR(50),
                status VARCHAR(30) NOT NULL DEFAULT 'active',
                created_by VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_nim, position, status)
            )
        `);

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS subjects (
                id SERIAL PRIMARY KEY,
                code VARCHAR(50) UNIQUE,
                name TEXT NOT NULL,
                semester INTEGER,
                status VARCHAR(30) NOT NULL DEFAULT 'active',
                created_by VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP
            )
        `);

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS subject_lecturers (
                id SERIAL PRIMARY KEY,
                subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                lecturer_nim VARCHAR(50) NOT NULL REFERENCES users(nim) ON DELETE CASCADE,
                academic_year VARCHAR(50),
                semester INTEGER,
                status VARCHAR(30) NOT NULL DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(subject_id, lecturer_nim, academic_year, semester)
            )
        `);

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS subject_pjs (
                id SERIAL PRIMARY KEY,
                subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                student_nim VARCHAR(50) NOT NULL REFERENCES users(nim) ON DELETE CASCADE,
                assigned_by VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(subject_id, student_nim)
            )
        `);

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                judul TEXT,
                subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
                created_by VARCHAR(50),
                expires_at TIMESTAMP,
                duration_minutes INTEGER DEFAULT 60,
                active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS qr_tokens (
                id SERIAL PRIMARY KEY,
                token TEXT NOT NULL,
                session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                expires_at TIMESTAMP NOT NULL,
                used INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS attendance (
                id SERIAL PRIMARY KEY,
                nim VARCHAR(50) NOT NULL REFERENCES users(nim) ON DELETE CASCADE,
                session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                status VARCHAR(30) NOT NULL DEFAULT 'hadir',
                method VARCHAR(50) NOT NULL DEFAULT 'qr_scan',
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                gps_accuracy DOUBLE PRECISION,
                distance_meters DOUBLE PRECISION,
                note TEXT,
                updated_by VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP,
                UNIQUE(nim, session_id)
            )
        `);

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS attendance_logs (
                id SERIAL PRIMARY KEY,
                attendance_id INTEGER NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
                old_status VARCHAR(30),
                new_status VARCHAR(30) NOT NULL,
                reason TEXT,
                changed_by VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS class_settings (
                id SERIAL PRIMARY KEY,
                class_name TEXT,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                radius_meters INTEGER DEFAULT 75,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS system_settings (
                id INTEGER PRIMARY KEY,
                gps_radius_meter INTEGER NOT NULL DEFAULT 75,
                qr_refresh_second INTEGER NOT NULL DEFAULT 30,
                default_session_minute INTEGER NOT NULL DEFAULT 60,
                min_session_minute INTEGER NOT NULL DEFAULT 15,
                max_session_minute INTEGER NOT NULL DEFAULT 120,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS schedules (
                id SERIAL PRIMARY KEY,
                subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                day VARCHAR(30) NOT NULL,
                start_time VARCHAR(20),
                end_time VARCHAR(20),
                room TEXT,
                status VARCHAR(30) NOT NULL DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS announcements (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                visibility VARCHAR(30) NOT NULL DEFAULT 'public',
                created_by VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS class_profile (
                id INTEGER PRIMARY KEY,
                class_name TEXT DEFAULT 'Informatika A 2024',
                generation TEXT DEFAULT '2024',
                description TEXT,
                instagram_url TEXT,
                email TEXT,
                logo_url TEXT,
                hero_image_url TEXT,
                updated_by VARCHAR(50),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS galleries (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                image_url TEXT NOT NULL,
                visibility VARCHAR(30) NOT NULL DEFAULT 'public',
                uploaded_by VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS documents (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                file_url TEXT NOT NULL,
                category VARCHAR(50),
                uploaded_by VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await queryAsync(`
            INSERT INTO system_settings (id)
            VALUES (1)
            ON CONFLICT (id) DO NOTHING
        `);

        await queryAsync(`
            INSERT INTO class_profile (id, class_name, generation, description, instagram_url, email)
            VALUES (
                1,
                'Informatika A 2024',
                '2024',
                'Portal digital kelas Informatika A Angkatan 2024.',
                'https://www.instagram.com/abstractbanget?igsh=eHJnbHFxZmV0NDFt',
                NULL
            )
            ON CONFLICT (id) DO NOTHING
        `);


        await queryAsync(`ALTER TABLE galleries ADD COLUMN IF NOT EXISTS visibility VARCHAR(30) NOT NULL DEFAULT 'public'`);
        await queryAsync(`ALTER TABLE class_profile ADD COLUMN IF NOT EXISTS updated_by VARCHAR(50)`);

        await seedUserIfNotExists('A001', 'Admin Kelas', 'admin123', 'admin', 'admin@example.com');
        await seedUserIfNotExists('D001', 'Dosen Demo', 'dosen123', 'lecturer', 'dosen@example.com', 1);
        await seedUserIfNotExists('M001', 'Mahasiswa Demo', 'mahasiswa123', 'student', 'mahasiswa@example.com');
        await seedUserIfNotExists('M002', 'Kosma Demo', 'kosma123', 'student', 'kosma@example.com');

        await queryAsync(`
            INSERT INTO class_officers (user_nim, position, period, status, created_by)
            VALUES ('M002', 'kosma', '2024/2025', 'active', 'A001')
            ON CONFLICT (user_nim, position, status) DO NOTHING
        `);

        await queryAsync(`
            INSERT INTO subjects (code, name, semester, status, created_by)
            VALUES ('IF2401', 'Pemrograman Web', 1, 'active', 'A001')
            ON CONFLICT (code) DO NOTHING
        `);

        await queryAsync(`
            INSERT INTO subject_lecturers (subject_id, lecturer_nim, academic_year, semester, status, created_at)
            SELECT id, 'D001', '2024/2025', semester, 'active', CURRENT_TIMESTAMP
            FROM subjects
            WHERE code = 'IF2401'
            ON CONFLICT (subject_id, lecturer_nim, academic_year, semester) DO NOTHING
        `);

        await queryAsync(`
            INSERT INTO subject_pjs (subject_id, student_nim, assigned_by, created_at)
            SELECT id, 'M002', 'A001', CURRENT_TIMESTAMP
            FROM subjects
            WHERE code = 'IF2401'
            ON CONFLICT (subject_id, student_nim) DO NOTHING
        `);

        console.log('Database PostgreSQL siap digunakan.');
    } catch (err) {
        console.error('Gagal inisialisasi PostgreSQL:', err.message);
    }
}

initDatabase();

module.exports = {
    run,
    all,
    get,
    serialize,
    close,
    runAsync,
    allAsync,
    getAsync,
    query: queryAsync,
    pool
};
