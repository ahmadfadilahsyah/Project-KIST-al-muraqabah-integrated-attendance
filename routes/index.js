const express = require('express');
const db = require('../database');

const router = express.Router();

function isAuth(req, res, next) {
    if (!req.session.user) {
        req.session.redirectAfterLogin = req.originalUrl;
        return res.redirect('/login');
    }

    next();
}

router.get('/dashboard', isAuth, (req, res) => {
    const user = req.session.user;

    if (user.role === 'lecturer' || user.role === 'teacher' || user.role === 'dosen') {
        db.all(
            `SELECT * FROM sessions 
             WHERE active = 1 
             ORDER BY id DESC`,
            [],
            (err, sessions) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Gagal mengambil data sesi.');
                }

                res.render('dashboard', {
                    pageTitle: 'Dashboard',
                    pageSubtitle: 'Kelola sesi dan QR absensi',
                    sessions,
                    user
                });
            }
        );
    } else {
        db.all(
            `SELECT attendance.*, sessions.judul, sessions.expires_at
             FROM attendance
             JOIN sessions ON attendance.session_id = sessions.id
             WHERE attendance.nim = ?
             ORDER BY attendance.id DESC`,
            [user.nim],
            (err, attendanceHistory) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Gagal mengambil riwayat absensi.');
                }

                res.render('dashboard', {
                    pageTitle: 'Dashboard',
                    pageSubtitle: 'Riwayat absensi mahasiswa',
                    attendanceHistory,
                    user
                });
            }
        );
    }
});

module.exports = router;