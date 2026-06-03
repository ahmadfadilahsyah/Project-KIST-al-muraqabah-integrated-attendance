const express = require('express');
const db = require('../database');
const { requireAuth, requireAdminOrKosma, isAdmin, isLecturer, isKosma, isStudent } = require('../utils/access');

const router = express.Router();

router.get('/dashboard', requireAuth, (req, res) => {
    const user = req.session.user;

    const statsSql = `
        SELECT
            (SELECT COUNT(*) FROM users WHERE role = 'student' AND status = 'active') AS "totalMahasiswa",
            (SELECT COUNT(*) FROM subjects WHERE status = 'active') AS "totalSubjects",
            (SELECT COUNT(*) FROM sessions WHERE active = 1 AND expires_at > datetime('now')) AS "activeSessions",
            (SELECT COUNT(*) FROM attendance WHERE status = 'hadir') AS "totalHadir"
    `;

    db.get(statsSql, [], (err, stats) => {
        if (err) return res.status(500).send('Database error saat mengambil statistik.');

        if (isAdmin(user) || isKosma(user) || isLecturer(user)) {
            let sessionsSql = `
                SELECT se.*, sub.name AS subject_name, COUNT(a.id) AS hadir
                FROM sessions se
                LEFT JOIN subjects sub ON sub.id = se.subject_id
                LEFT JOIN attendance a ON a.session_id = se.id AND a.status = 'hadir'
            `;
            const params = [];

            if (isLecturer(user)) {
                sessionsSql += ` JOIN subject_lecturers sl ON sl.subject_id = se.subject_id AND sl.lecturer_nim = ? AND sl.status = 'active' `;
                params.push(user.nim);
            }

            sessionsSql += ` GROUP BY se.id, sub.name ORDER BY se.created_at DESC, se.id DESC LIMIT 20`;

            db.all(sessionsSql, params, (err, sessions) => {
                if (err) {
                    console.error('Dashboard sessions error:', err);
                    return res.status(500).send('Database error saat mengambil sesi.');
                }
                if (!isAdmin(user) && !isKosma(user)) {
                    return res.render('dashboard', {
                        pageTitle: 'Dashboard Dosen',
                        pageSubtitle: 'Kelola sesi, mata kuliah, dan rekap kehadiran kelas',
                        user,
                        stats: stats || {},
                        sessions,
                        announcements: [],
                        attendanceHistory: [],
                        success: req.query.success || null,
                        error: req.query.error || null
                    });
                }

                db.all(
                    `SELECT a.*, u.nama AS author_name
                     FROM announcements a
                     LEFT JOIN users u ON u.nim = a.created_by
                     ORDER BY COALESCE(a.published_at, a.created_at) DESC, a.id DESC
                     LIMIT 5`,
                    [],
                    (err, announcements) => {
                        if (err) return res.status(500).send('Database error saat mengambil berita.');
                        res.render('dashboard', {
                            pageTitle: isAdmin(user) ? 'Dashboard Admin' : 'Dashboard Kosma',
                            pageSubtitle: 'Kelola sesi, berita kelas, mata kuliah, dan rekap kehadiran',
                            user,
                            stats: stats || {},
                            sessions,
                            announcements,
                            attendanceHistory: [],
                            success: req.query.success || null,
                            error: req.query.error || null
                        });
                    }
                );
            });
        } else {
            db.all(
                `SELECT a.*, se.judul, se.expires_at, sub.name AS subject_name
                 FROM attendance a
                 JOIN sessions se ON se.id = a.session_id
                 LEFT JOIN subjects sub ON sub.id = se.subject_id
                 WHERE a.nim = ?
                 ORDER BY a.created_at DESC, a.id DESC`,
                [user.nim],
                (err, attendanceHistory) => {
                    if (err) return res.status(500).send('Database error saat mengambil riwayat absensi.');

                    db.all(
                        `SELECT DISTINCT s.* FROM subjects s
                         JOIN subject_pjs sp ON sp.subject_id = s.id
                         WHERE sp.student_nim = ? AND s.status = 'active'
                         ORDER BY s.name`,
                        [user.nim],
                        (err, pjSubjects) => {
                            if (err) return res.status(500).send('Database error saat mengambil akses PJ.');
                            res.render('dashboard', {
                                pageTitle: pjSubjects.length ? 'Dashboard Mahasiswa & PJ' : 'Dashboard Mahasiswa',
                                pageSubtitle: 'Pantau kehadiran dan akses kelas Informatika A 2024',
                                user,
                                stats: stats || {},
                                sessions: [],
                                attendanceHistory,
                                pjSubjects,
                                success: req.query.success || null,
                                error: req.query.error || null
                            });
                        }
                    );
                }
            );
        }
    });
});

router.post('/announcements/create', requireAdminOrKosma, (req, res) => {
    const { title, content, image_url, published_at, visibility } = req.body;

    if (!title || !content) {
        return res.redirect('/dashboard?error=Judul dan narasi berita wajib diisi.');
    }

    db.run(
        `INSERT INTO announcements (title, content, image_url, published_at, visibility, created_by, created_at)
         VALUES (?, ?, ?, COALESCE(NULLIF(?, '')::timestamp, CURRENT_TIMESTAMP), ?, ?, CURRENT_TIMESTAMP)`,
        [
            title.trim(),
            content.trim(),
            image_url ? image_url.trim() : null,
            published_at || null,
            visibility || 'public',
            req.session.user.nim
        ],
        (err) => {
            if (err) {
                console.error('Create announcement error:', err);
                return res.redirect('/dashboard?error=Gagal membuat berita.');
            }
            res.redirect('/dashboard?success=Berita berhasil diterbitkan.');
        }
    );
});

router.post('/announcements/:id/delete', requireAdminOrKosma, (req, res) => {
    db.run('DELETE FROM announcements WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            console.error('Delete announcement error:', err);
            return res.redirect('/dashboard?error=Gagal menghapus berita.');
        }
        res.redirect('/dashboard?success=Berita berhasil dihapus.');
    });
});

module.exports = router;
