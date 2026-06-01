const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database');
const { normalizeRole } = require('../utils/access');

const router = express.Router();

function enrichUserSession(user, callback) {
    db.get(
        `SELECT COUNT(*) AS total FROM class_officers
         WHERE user_nim = ? AND position = 'kosma' AND status = 'active'`,
        [user.nim],
        (err, row) => {
            if (err) return callback(err);
            callback(null, {
                nim: user.nim,
                nama: user.nama,
                email: user.email,
                role: normalizeRole(user.role),
                status: user.status || 'active',
                must_change_password: Number(user.must_change_password || 0),
                is_kosma: row && row.total > 0 ? 1 : 0
            });
        }
    );
}

function readUser(nim, callback) {
    db.get('SELECT nim, nama, email, role, status, must_change_password FROM users WHERE nim = ?', [nim], callback);
}

router.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');

    const statsSql = `
        SELECT
            (SELECT COUNT(*) FROM users WHERE role = 'student' AND status = 'active') AS "totalMahasiswa",
            (SELECT COUNT(*) FROM users WHERE role = 'lecturer' AND status = 'active') AS "totalDosen",
            (SELECT COUNT(*) FROM subjects WHERE status = 'active') AS "totalMatkul",
            (SELECT COUNT(*) FROM announcements WHERE visibility = 'public') AS "totalPengumuman"
    `;

    db.get('SELECT * FROM class_profile WHERE id = 1', [], (err, profile) => {
        if (err) return res.status(500).send('Gagal memuat profil kelas.');

        db.get(statsSql, [], (err, stats) => {
            if (err) return res.status(500).send('Gagal memuat statistik publik.');

            db.all(
                `SELECT a.*, u.nama AS author_name
                 FROM announcements a
                 LEFT JOIN users u ON u.nim = a.created_by
                 WHERE a.visibility = 'public'
                 ORDER BY a.created_at DESC, a.id DESC
                 LIMIT 3`,
                [],
                (err, announcements) => {
                    if (err) return res.status(500).send('Gagal memuat pengumuman.');

                    db.all(
                        `SELECT sc.*, s.name AS subject_name, s.code AS subject_code
                         FROM schedules sc
                         LEFT JOIN subjects s ON s.id = sc.subject_id
                         WHERE sc.status = 'active'
                         ORDER BY
                            CASE sc.day
                                WHEN 'Senin' THEN 1
                                WHEN 'Selasa' THEN 2
                                WHEN 'Rabu' THEN 3
                                WHEN 'Kamis' THEN 4
                                WHEN 'Jumat' THEN 5
                                WHEN 'Sabtu' THEN 6
                                ELSE 7
                            END,
                            sc.start_time
                         LIMIT 6`,
                        [],
                        (err, schedules) => {
                            if (err) return res.status(500).send('Gagal memuat jadwal.');

                            db.all(
                                `SELECT * FROM galleries
                                 WHERE visibility = 'public'
                                 ORDER BY created_at DESC, id DESC
                                 LIMIT 6`,
                                [],
                                (err, galleries) => {
                                    if (err) return res.status(500).send('Gagal memuat galeri.');

                                    res.render('home', {
                                        pageTitle: 'Informatika A 2024',
                                        profile: profile || {},
                                        stats: stats || {},
                                        announcements,
                                        schedules,
                                        galleries
                                    });
                                }
                            );
                        }
                    );
                }
            );
        });
    });
});

router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('login', { error: null });
});

router.post('/login', (req, res) => {
    const { nim, password } = req.body;

    if (!nim || !password) return res.render('login', { error: 'Username/NIM dan password wajib diisi.' });

    db.get('SELECT * FROM users WHERE nim = ?', [nim], async (err, user) => {
        if (err) {
            console.error(err);
            return res.render('login', { error: 'Terjadi kesalahan server.' });
        }
        if (!user) return res.render('login', { error: 'Username/NIM atau password salah.' });
        if (user.status === 'inactive') return res.render('login', { error: 'Akun Anda sedang nonaktif.' });

        let match = false;
        try { match = await bcrypt.compare(password, user.password); } catch (error) { console.error(error); }
        if (!match) return res.render('login', { error: 'Username/NIM atau password salah.' });

        enrichUserSession(user, (err, sessionUser) => {
            if (err) {
                console.error(err);
                return res.render('login', { error: 'Gagal memuat akses user.' });
            }

            req.session.user = sessionUser;

            if (sessionUser.must_change_password === 1) return res.redirect('/profile');

            if (req.session.redirectAfterLogin) {
                const redirectUrl = req.session.redirectAfterLogin;
                delete req.session.redirectAfterLogin;
                return res.redirect(redirectUrl);
            }

            res.redirect('/dashboard');
        });
    });
});

router.get('/register', (req, res) => {
    res.redirect('/login');
});

router.post('/register', (req, res) => {
    res.redirect('/login');
});

router.get('/profile', (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    readUser(req.session.user.nim, (err, userData) => {
        if (err || !userData) {
            console.error(err);
            return res.redirect('/dashboard');
        }

        res.render('profile', {
            pageTitle: 'Profil',
            pageSubtitle: 'Kelola identitas dan keamanan akun Anda',
            userData,
            error: null,
            success: null
        });
    });
});

router.post('/profile/update-email', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { email } = req.body;

    const renderProfile = (error, success = null) => {
        readUser(req.session.user.nim, (err, userData) => {
            res.render('profile', {
                pageTitle: 'Profil',
                pageSubtitle: 'Kelola identitas dan keamanan akun Anda',
                userData,
                error,
                success
            });
        });
    };

    if (!email) return renderProfile('Email wajib diisi.');

    db.run('UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE nim = ?', [email, req.session.user.nim], (err) => {
        if (err) {
            console.error(err);
            return renderProfile('Gagal memperbarui email.');
        }
        req.session.user.email = email;
        renderProfile(null, 'Email berhasil diperbarui.');
    });
});

router.post('/profile/change-password', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { old_password, new_password, confirm_password } = req.body;

    const renderProfile = (error, success = null) => {
        readUser(req.session.user.nim, (err, userData) => {
            res.render('profile', {
                pageTitle: 'Profil',
                pageSubtitle: 'Kelola identitas dan keamanan akun Anda',
                userData,
                error,
                success
            });
        });
    };

    if (!old_password || !new_password || !confirm_password) return renderProfile('Semua field password wajib diisi.');
    if (new_password.length < 6) return renderProfile('Password baru minimal 6 karakter.');
    if (new_password !== confirm_password) return renderProfile('Konfirmasi password tidak sama.');

    db.get('SELECT password FROM users WHERE nim = ?', [req.session.user.nim], async (err, user) => {
        if (err || !user) return renderProfile('User tidak ditemukan.');
        const match = await bcrypt.compare(old_password, user.password);
        if (!match) return renderProfile('Password lama salah.');

        const hashedPassword = await bcrypt.hash(new_password, 10);
        db.run(
            'UPDATE users SET password = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE nim = ?',
            [hashedPassword, req.session.user.nim],
            (err) => {
                if (err) return renderProfile('Gagal mengganti password.');
                req.session.user.must_change_password = 0;
                renderProfile(null, 'Password berhasil diganti.');
            }
        );
    });
});

router.post('/profile', (req, res) => {
    req.url = '/profile/update-email';
    router.handle(req, res);
});

router.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
