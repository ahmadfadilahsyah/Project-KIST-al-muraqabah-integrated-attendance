const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

const dbPath = path.join(__dirname, 'absensi.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Users table (nim sebagai primary key, email nullable)
  db.run(`CREATE TABLE IF NOT EXISTS users (
    nim TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    email TEXT,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'student'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    judul TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    active BOOLEAN DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nim TEXT NOT NULL,
    session_id INTEGER NOT NULL,
    scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(nim) REFERENCES users(nim),
    FOREIGN KEY(session_id) REFERENCES sessions(id),
    UNIQUE(nim, session_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS qr_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    session_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT 0,
    FOREIGN KEY(session_id) REFERENCES sessions(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS class_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    radius_meters INTEGER NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Insert dosen default
  const hashedDosen = bcrypt.hashSync('dosen123', 10);
  db.run(`INSERT OR IGNORE INTO users (nim, nama, email, password, role) VALUES (?, ?, ?, ?, ?)`,
    ['D001', 'Dosen Al Muraqabah', 'dosen@example.com', hashedDosen, 'lecturer']);

  // Insert lokasi kelas default
  db.get(`SELECT COUNT(*) as count FROM class_settings`, (err, row) => {
    if (row.count === 0) {
      db.run(`INSERT INTO class_settings (latitude, longitude, radius_meters) VALUES (?, ?, ?)`,
        [-7.771377, 110.377498, 50]);
    }
  });
});

db.close(() => {
  console.log('Database siap.');
});