const express = require('express');
const db = require('../database');
const isAuth = require('../middleware/auth');

const router = express.Router();

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

function isStudent(req, res, next) {
    if (!req.session.user) {
        req.session.redirectAfterLogin = req.originalUrl;
        return res.redirect('/login');
    }

    const role = req.session.user.role;

    if (role !== 'student' && role !== 'mahasiswa') {
        return res.status(403).send('Hanya mahasiswa yang dapat melakukan absensi.');
    }

    next();
}

router.get('/scan', isStudent, (req, res) => {
    res.render('scan-camera', {
        pageTitle: 'Scan QR',
        pageSubtitle: 'Scan QR absensi yang ditampilkan dosen'
    });
});

router.get('/confirm/:token', isStudent, (req, res) => {
    const { token } = req.params;

    db.get(
        `SELECT * FROM qr_tokens 
         WHERE token = ? 
         AND expires_at > datetime('now')`,
        [token],
        (err, qrToken) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Terjadi kesalahan server.');
            }

            if (!qrToken) {
                return res.render('scan-success', {
                    pageTitle: 'Status Absensi',
                    pageSubtitle: 'Informasi hasil validasi absensi',
                    success: false,
                    message: 'QR tidak valid atau sudah kadaluarsa.'
                });
            }

            db.get(
                `SELECT * FROM attendance 
                 WHERE nim = ? 
                 AND session_id = ?`,
                [req.session.user.nim, qrToken.session_id],
                (err, existing) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('Gagal memeriksa data absensi.');
                    }

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
                        session_id: qrToken.session_id
                    });
                }
            );
        }
    );
});

router.post('/api/absen-gps', isAuth, (req, res) => {
    const { token, latitude, longitude } = req.body;

    const role = req.session.user.role;

    if (role !== 'student' && role !== 'mahasiswa') {
        return res.status(403).json({
            success: false,
            message: 'Hanya mahasiswa yang dapat melakukan absensi.'
        });
    }

    if (!token || !latitude || !longitude) {
        return res.status(400).json({
            success: false,
            message: 'Data lokasi tidak lengkap.'
        });
    }

    const studentLat = parseFloat(latitude);
    const studentLng = parseFloat(longitude);

    if (isNaN(studentLat) || isNaN(studentLng)) {
        return res.status(400).json({
            success: false,
            message: 'Koordinat lokasi tidak valid.'
        });
    }

    db.get(
        `SELECT * FROM qr_tokens 
         WHERE token = ? 
         AND expires_at > datetime('now')`,
        [token],
        (err, qrToken) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    success: false,
                    message: 'Terjadi kesalahan server.'
                });
            }

            if (!qrToken) {
                return res.status(400).json({
                    success: false,
                    message: 'QR tidak valid atau sudah kadaluarsa.'
                });
            }

            db.get(
                `SELECT * FROM attendance 
                 WHERE nim = ? 
                 AND session_id = ?`,
                [req.session.user.nim, qrToken.session_id],
                (err, existing) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            success: false,
                            message: 'Gagal memeriksa data absensi.'
                        });
                    }

                    if (existing) {
                        return res.status(400).json({
                            success: false,
                            message: 'Anda sudah absen pada sesi ini.'
                        });
                    }

                    db.get(
                        `SELECT * FROM class_settings 
                         ORDER BY id DESC 
                         LIMIT 1`,
                        [],
                        (err, setting) => {
                            if (err) {
                                console.error(err);
                                return res.status(500).json({
                                    success: false,
                                    message: 'Gagal mengambil lokasi kelas.'
                                });
                            }

                            if (!setting) {
                                return res.status(400).json({
                                    success: false,
                                    message: 'Lokasi kelas belum diatur oleh dosen.'
                                });
                            }

                            const classLat = parseFloat(setting.latitude);
                            const classLng = parseFloat(setting.longitude);
                            const radius = parseInt(setting.radius_meters) || 50;

                            const distance = getDistance(
                                studentLat,
                                studentLng,
                                classLat,
                                classLng
                            );

                            if (distance > radius) {
                                return res.status(400).json({
                                    success: false,
                                    message: `Anda berada di luar radius kelas. Jarak Anda ${Math.round(distance)} meter, batas maksimal ${radius} meter.`
                                });
                            }

                            db.run(
                                `INSERT INTO attendance (nim, session_id) VALUES (?, ?)`,
                                [req.session.user.nim, qrToken.session_id],
                                (err) => {
                                    if (err) {
                                        console.error(err);
                                        return res.status(500).json({
                                            success: false,
                                            message: 'Gagal menyimpan absensi.'
                                        });
                                    }

                                    res.json({
                                        success: true,
                                        message: `Absensi berhasil. Jarak Anda dari kelas ${Math.round(distance)} meter.`
                                    });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

router.get('/scan-success', isAuth, (req, res) => {
    res.render('scan-success', {
        pageTitle: 'Status Absensi',
        pageSubtitle: 'Informasi hasil validasi absensi',
        success: req.query.success,
        message: req.query.message
    });
});

module.exports = router;