const express = require('express');
const db = require('../database');
const { requireAuth, isStudent } = require('../utils/access');
const { encryptNumber, decryptNumber } = require('../utils/crypto');

const router = express.Router();

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function requireStudent(req, res, next) {
    requireAuth(req, res, () => {
        if (!isStudent(req.session.user)) return res.status(403).send('Hanya mahasiswa yang dapat melakukan absensi.');
        next();
    });
}

function saveAttendanceWithGps(req, res, sessionId, method) {
    const { latitude, longitude, gps_accuracy } = req.body;
    const studentLat = parseFloat(latitude);
    const studentLng = parseFloat(longitude);
    const accuracy = gps_accuracy ? parseFloat(gps_accuracy) : null;

    if (Number.isNaN(studentLat) || Number.isNaN(studentLng)) {
        return res.status(400).json({ success: false, message: 'Koordinat lokasi tidak valid.' });
    }

    db.get('SELECT * FROM attendance WHERE nim = ? AND session_id = ?', [req.session.user.nim, sessionId], (err, existing) => {
        if (err) return res.status(500).json({ success: false, message: 'Gagal memeriksa absensi.' });
        if (existing) return res.status(400).json({ success: false, message: 'Anda sudah absen pada sesi ini.' });

        db.get('SELECT gps_radius_meters FROM sessions WHERE id = ?', [sessionId], (err, sessionSetting) => {
            if (err) return res.status(500).json({ success: false, message: 'Gagal mengambil pengaturan sesi.' });

            db.get('SELECT * FROM class_settings ORDER BY id DESC LIMIT 1', [], (err, setting) => {
            if (err) return res.status(500).json({ success: false, message: 'Gagal mengambil lokasi kelas.' });
            const classLat = setting ? decryptNumber(setting.latitude_encrypted, setting.latitude) : null;
            const classLng = setting ? decryptNumber(setting.longitude_encrypted, setting.longitude) : null;

            if (!setting || classLat === null || classLng === null) {
                return res.status(400).json({ success: false, message: 'Lokasi kelas belum diatur. Admin/Kosma/Dosen perlu menekan Set Lokasi Kelas terlebih dahulu.' });
            }

            const radius = parseInt(sessionSetting && sessionSetting.gps_radius_meters, 10) || 500;
            const distance = getDistance(studentLat, studentLng, classLat, classLng);

            if (distance > radius) {
                return res.status(400).json({
                    success: false,
                    message: `Anda berada di luar radius kelas. Jarak ${Math.round(distance)} meter, batas maksimal ${radius} meter.`
                });
            }

            db.run(
                `INSERT INTO attendance (nim, session_id, status, method, latitude, longitude, gps_accuracy, latitude_encrypted, longitude_encrypted, gps_accuracy_encrypted, distance_meters, created_at)
                 VALUES (?, ?, 'hadir', ?, NULL, NULL, NULL, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [req.session.user.nim, sessionId, method, encryptNumber(studentLat), encryptNumber(studentLng), encryptNumber(accuracy), distance],
                (err) => {
                    if (err) return res.status(500).json({ success: false, message: 'Gagal menyimpan absensi.' });
                    res.json({ success: true, message: `Absensi berhasil. Jarak Anda dari titik kelas ${Math.round(distance)} meter.` });
                }
            );
            });
        });
    });
}

router.get('/scan', requireStudent, (req, res) => {
    res.render('scan-camera', {
        pageTitle: 'Scan QR',
        pageSubtitle: 'Scan QR absensi yang ditampilkan pembuat sesi'
    });
});

router.get('/confirm/:token', requireStudent, (req, res) => {
    const { token } = req.params;

    db.get(
        `SELECT qt.*, s.judul, s.gps_radius_meters, sub.name AS subject_name
         FROM qr_tokens qt
         JOIN sessions s ON s.id = qt.session_id
         LEFT JOIN subjects sub ON sub.id = s.subject_id
         WHERE qt.token = ?
         AND qt.expires_at > CURRENT_TIMESTAMP
         AND s.active = 1
         AND s.expires_at > CURRENT_TIMESTAMP`,
        [token],
        (err, qrToken) => {
            if (err) return res.status(500).send('Terjadi kesalahan server.');
            if (!qrToken) {
                return res.render('scan-success', {
                    pageTitle: 'Status Absensi',
                    pageSubtitle: 'Informasi hasil validasi absensi',
                    success: false,
                    message: 'QR tidak valid atau sudah kadaluarsa.'
                });
            }

            db.get('SELECT * FROM attendance WHERE nim = ? AND session_id = ?', [req.session.user.nim, qrToken.session_id], (err, existing) => {
                if (err) return res.status(500).send('Gagal memeriksa absensi.');
                if (existing) {
                    return res.render('scan-success', {
                        pageTitle: 'Status Absensi',
                        pageSubtitle: 'Informasi hasil validasi absensi',
                        success: false,
                        message: 'Anda sudah absen pada sesi ini.'
                    });
                }

                res.render('scan-gps', {
                    pageTitle: 'Validasi GPS',
                    pageSubtitle: 'Validasi lokasi sebelum menyimpan absensi',
                    token,
                    session_id: qrToken.session_id,
                    sessionTitle: qrToken.judul,
                    subjectName: qrToken.subject_name,
                    gpsRadiusMeters: qrToken.gps_radius_meters || 500
                });
            });
        }
    );
});

router.post('/api/absen-gps', requireStudent, (req, res) => {
    const { token, latitude, longitude } = req.body;
    if (!token || !latitude || !longitude) return res.status(400).json({ success: false, message: 'Data lokasi tidak lengkap.' });

    db.get(
        `SELECT qt.*, s.judul
         FROM qr_tokens qt
         JOIN sessions s ON s.id = qt.session_id
         WHERE qt.token = ?
         AND qt.expires_at > CURRENT_TIMESTAMP
         AND s.active = 1
         AND s.expires_at > CURRENT_TIMESTAMP`,
        [token],
        (err, qrToken) => {
            if (err) return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
            if (!qrToken) return res.status(400).json({ success: false, message: 'QR tidak valid atau sudah kadaluarsa.' });
            saveAttendanceWithGps(req, res, qrToken.session_id, 'qr_scan');
        }
    );
});

router.post('/api/creator-present/:sessionId', requireStudent, (req, res) => {
    const sessionId = req.params.sessionId;
    db.get('SELECT * FROM sessions WHERE id = ? AND active = 1 AND expires_at > CURRENT_TIMESTAMP', [sessionId], (err, session) => {
        if (err) return res.status(500).json({ success: false, message: 'Gagal mengambil sesi.' });
        if (!session) return res.status(400).json({ success: false, message: 'Sesi sudah tidak aktif.' });
        if (session.created_by !== req.session.user.nim) return res.status(403).json({ success: false, message: 'Tombol Saya Hadir hanya untuk pembuat sesi.' });
        saveAttendanceWithGps(req, res, sessionId, 'creator_button');
    });
});

router.get('/scan-success', requireAuth, (req, res) => {
    res.render('scan-success', {
        pageTitle: 'Status Absensi',
        pageSubtitle: 'Informasi hasil validasi absensi',
        success: req.query.success,
        message: req.query.message
    });
});

module.exports = router;
