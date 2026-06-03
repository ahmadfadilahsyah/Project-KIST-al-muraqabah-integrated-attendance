require('dotenv').config();

// Loading database.js connects to PostgreSQL and runs the schema initializer.
// Keep this file as a small compatibility entrypoint for older setup notes.
const db = require('./database');

db.ready
    .then(() => {
        db.close((err) => {
            if (err) {
                console.error('Gagal menutup koneksi database:', err.message);
                process.exit(1);
            }
            console.log('Inisialisasi database selesai.');
        });
    })
    .catch((err) => {
        console.error('Gagal inisialisasi database:', err.message);
        process.exit(1);
    });
