const express = require('express');
const db = require('../database');
const isAuth = require('../middleware/auth');

const router = express.Router();

function isLecturer(req, res, next) {
    isAuth(req, res, () => {
        const role = req.session.user.role;
        if (role !== 'lecturer' && role !== 'teacher' && role !== 'dosen') {
            return res.status(403).send('Hanya dosen yang dapat mengatur lokasi.');
        }
        next();
    });
}

router.get('/gps-settings', isLecturer, (req, res) => {
    db.get('SELECT * FROM class_settings ORDER BY id DESC LIMIT 1', [], (err, setting) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Gagal mengambil pengaturan lokasi.');
        }

        res.render('gps-settings', {
            pageTitle: 'Set Lokasi Jujur',
            pageSubtitle: 'Atur titik lokasi kelas untuk validasi kehadiran',
            setting: setting || {},
            error: null,
            success: null
        });
    });
});

router.post('/gps-settings', isLecturer, (req, res) => {
    const { class_name, latitude, longitude, radius_meters } = req.body;

    const renderPage = (error, success = null, setting = req.body) => {
        res.render('gps-settings', {
            pageTitle: 'Set Lokasi Jujur',
            pageSubtitle: 'Atur titik lokasi kelas untuk validasi kehadiran',
            setting: setting || {},
            error,
            success
        });
    };

    if (!latitude || !longitude || !radius_meters) {
        return renderPage('Latitude, longitude, dan radius wajib diisi.');
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const radius = parseInt(radius_meters, 10);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return renderPage('Koordinat lokasi tidak valid.');
    }

    if (Number.isNaN(radius) || radius < 1) {
        return renderPage('Radius harus berupa angka minimal 1 meter.');
    }

    db.run(
        `INSERT INTO class_settings (class_name, latitude, longitude, radius_meters, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [class_name || 'Lokasi Kelas', lat, lng, radius],
        (err) => {
            if (err) {
                console.error(err);
                return renderPage('Gagal menyimpan lokasi.');
            }

            renderPage(null, 'Lokasi kelas berhasil disimpan.', {
                class_name: class_name || 'Lokasi Kelas',
                latitude: lat,
                longitude: lng,
                radius_meters: radius
            });
        }
    );
});

module.exports = router;
