const express = require('express');
const db = require('../database');
const isAuth = require('../middleware/auth');

const router = express.Router();

function isLecturerRole(role) {
    return role === 'lecturer' || role === 'teacher' || role === 'dosen';
}

router.get('/dashboard', isAuth, (req, res) => {
    const user = req.session.user;

    if (isLecturerRole(user.role)) {
        db.all(
            `SELECT s.*, COUNT(a.id) AS hadir
             FROM sessions s
             LEFT JOIN attendance a ON a.session_id = s.id
             WHERE s.active = 1
             GROUP BY s.id
             ORDER BY s.created_at DESC, s.id DESC`,
            [],
            (err, sessions) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Database error saat mengambil sesi.');
                }

                db.get(`SELECT COUNT(*) AS total FROM users WHERE role = 'student' OR role = 'mahasiswa'`, [], (err, countRow) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('Database error saat mengambil mahasiswa.');
                    }

                    const totalMahasiswa = countRow ? countRow.total : 0;
                    const totalHadir = sessions.reduce((sum, item) => sum + (item.hadir || 0), 0);
                    const avg = sessions.length && totalMahasiswa
                        ? Math.round((totalHadir / (sessions.length * totalMahasiswa)) * 100)
                        : 0;

                    res.render('dashboard', {
                        pageTitle: 'Dashboard Amanah',
                        pageSubtitle: 'Kelola sesi, QR, dan kehadiran berbasis shidiq dan amanah',
                        user,
                        sessions,
                        attendanceHistory: [],
                        totalMahasiswa,
                        avg
                    });
                });
            }
        );
    } else {
        db.all(
            `SELECT a.*, s.judul, s.expires_at
             FROM attendance a
             JOIN sessions s ON s.id = a.session_id
             WHERE a.nim = ?
             ORDER BY a.created_at DESC, a.id DESC`,
            [user.nim],
            (err, attendanceHistory) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Database error saat mengambil riwayat absensi.');
                }

                res.render('dashboard', {
                    pageTitle: 'Dashboard Mahasiswa',
                    pageSubtitle: 'Hadir dengan jujur sebagai bentuk amanah menuntut ilmu',
                    user,
                    sessions: [],
                    attendanceHistory,
                    totalMahasiswa: 0,
                    avg: 0
                });
            }
        );
    }
});

module.exports = router;
