const express = require('express');
const db = require('../database');
const { requireAuth, canManageGps } = require('../utils/access');

const router = express.Router();

function requireGpsManager(req, res, next) {
    requireAuth(req, res, () => {
        if (!canManageGps(req.session.user)) return res.status(403).send('Hanya admin, kosma, atau dosen yang dapat mengatur lokasi.');
        next();
    });
}

function saveClassLocation({ class_name, latitude, longitude, created_by }, callback) {
    const radius = 500;
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return callback(new Error('Koordinat lokasi tidak valid.'));
    }

    db.run(
        `INSERT INTO class_settings (class_name, latitude, longitude, radius_meters, updated_at, created_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [class_name || 'Lokasi Kelas Informatika A 2024', lat, lng, radius],
        (err) => callback(err, { class_name: class_name || 'Lokasi Kelas Informatika A 2024', latitude: lat, longitude: lng, radius_meters: radius })
    );
}

router.get('/gps-settings', requireGpsManager, (req, res) => {
    db.get('SELECT * FROM class_settings ORDER BY id DESC LIMIT 1', [], (err, setting) => {
        if (err) return res.status(500).send('Gagal mengambil pengaturan lokasi.');
        res.render('gps-settings', {
            pageTitle: 'Set Lokasi Kelas',
            pageSubtitle: 'Tentukan titik kelas. Radius sistem tetap 75 meter untuk toleransi GPS.',
            setting: setting || { radius_meters: 75 },
            error: null,
            success: null
        });
    });
});

router.post('/gps-settings', requireGpsManager, (req, res) => {
    const renderPage = (error, success = null, setting = req.body) => {
        res.render('gps-settings', {
            pageTitle: 'Set Lokasi Kelas',
            pageSubtitle: 'Tentukan titik kelas. Radius sistem tetap 75 meter untuk toleransi GPS.',
            setting: { ...setting, radius_meters: 75 },
            error,
            success
        });
    };

    saveClassLocation({ ...req.body, created_by: req.session.user.nim }, (err, setting) => {
        if (err) return renderPage(err.message);
        renderPage(null, 'Lokasi kelas berhasil disimpan.', setting);
    });
});

router.post('/api/class-location', requireGpsManager, (req, res) => {
    saveClassLocation({ ...req.body, created_by: req.session.user.nim }, (err, setting) => {
        if (err) return res.status(400).json({ success: false, message: err.message });
        res.json({ success: true, message: 'Titik lokasi kelas berhasil diperbarui.', setting });
    });
});

module.exports = router;
