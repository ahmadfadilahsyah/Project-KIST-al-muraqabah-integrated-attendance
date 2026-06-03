const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database');
const { requireAuth, requireAdmin, requireAdminOrKosma, isAdmin, isKosma } = require('../utils/access');

const router = express.Router();

function canManageTarget(currentUser, targetRole) {
    if (isAdmin(currentUser)) return true;
    if (isKosma(currentUser)) return targetRole === 'student';
    return false;
}

router.get('/users', requireAdminOrKosma, (req, res) => {
    const currentUser = req.session.user;
    const where = isAdmin(currentUser) ? '' : "WHERE u.role = 'student'";

    db.all(
        `SELECT u.*,
                CASE WHEN co.id IS NULL THEN 0 ELSE 1 END AS is_kosma
         FROM users u
         LEFT JOIN class_officers co ON co.user_nim = u.nim AND co.position = 'kosma' AND co.status = 'active'
         ${where}
         ORDER BY u.role, u.nama`,
        [],
        (err, users) => {
            if (err) return res.status(500).send('Gagal mengambil user.');
            res.render('users', {
                pageTitle: 'Manajemen User',
                pageSubtitle: isAdmin(currentUser) ? 'Kelola admin, dosen, dan mahasiswa' : 'Kelola mahasiswa dan akses kelas',
                users,
                currentUser,
                error: null,
                success: req.query.success || null
            });
        }
    );
});

router.get('/users/create', requireAdminOrKosma, (req, res) => {
    res.render('user-form', {
        pageTitle: 'Tambah User',
        pageSubtitle: isAdmin(req.session.user) ? 'Admin dapat menambah mahasiswa dan dosen' : 'Kosma dapat menambah mahasiswa',
        target: {},
        action: '/users/create',
        currentUser: req.session.user,
        error: null
    });
});

router.post('/users/create', requireAdminOrKosma, async (req, res) => {
    const { nim, nama, email, password, role, status, must_change_password } = req.body;
    const fixedRole = role || 'student';

    const renderError = (error) => res.render('user-form', {
        pageTitle: 'Tambah User',
        pageSubtitle: isAdmin(req.session.user) ? 'Admin dapat menambah mahasiswa dan dosen' : 'Kosma dapat menambah mahasiswa',
        target: req.body,
        action: '/users/create',
        currentUser: req.session.user,
        error
    });

    if (!canManageTarget(req.session.user, fixedRole)) return renderError('Kosma hanya boleh menambah akun mahasiswa.');
    if (!nim || !nama || !password) return renderError('Username/NIM, nama, dan password wajib diisi.');
    if (password.length < 6) return renderError('Password minimal 6 karakter.');

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(
            `INSERT INTO users (nim, nama, email, password, role, status, must_change_password, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [nim, nama, email || null, hashedPassword, fixedRole, status || 'active', must_change_password ? 1 : 0],
            (err) => {
                if (err) {
                    console.error(err);
                    return renderError('Gagal membuat user. Username/NIM mungkin sudah digunakan.');
                }
                res.redirect('/users?success=User berhasil dibuat.');
            }
        );
    } catch (err) {
        renderError('Gagal mengenkripsi password.');
    }
});

router.get('/users/:nim/edit', requireAdminOrKosma, (req, res) => {
    db.get('SELECT * FROM users WHERE nim = ?', [req.params.nim], (err, target) => {
        if (err || !target) return res.status(404).send('User tidak ditemukan.');
        if (!canManageTarget(req.session.user, target.role)) return res.status(403).send('Kosma hanya boleh mengelola mahasiswa.');

        res.render('user-form', {
            pageTitle: 'Edit User',
            pageSubtitle: target.nama,
            target,
            action: `/users/${target.nim}/edit`,
            currentUser: req.session.user,
            error: null
        });
    });
});

router.post('/users/:nim/edit', requireAdminOrKosma, (req, res) => {
    const { nama, email, role, status, must_change_password } = req.body;
    const fixedRole = role || 'student';

    db.get('SELECT * FROM users WHERE nim = ?', [req.params.nim], (err, target) => {
        if (err || !target) return res.status(404).send('User tidak ditemukan.');
        if (!canManageTarget(req.session.user, target.role) || !canManageTarget(req.session.user, fixedRole)) {
            return res.status(403).send('Kosma hanya boleh mengelola mahasiswa.');
        }

        db.run(
            `UPDATE users SET nama = ?, email = ?, role = ?, status = ?, must_change_password = ?, updated_at = CURRENT_TIMESTAMP WHERE nim = ?`,
            [nama, email || null, fixedRole, status || 'active', must_change_password ? 1 : 0, req.params.nim],
            (err) => {
                if (err) return res.status(500).send('Gagal mengubah user.');
                res.redirect('/users?success=User berhasil diperbarui.');
            }
        );
    });
});

router.post('/users/:nim/reset-password', requireAdminOrKosma, async (req, res) => {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) return res.status(400).send('Password baru minimal 6 karakter.');

    db.get('SELECT role FROM users WHERE nim = ?', [req.params.nim], async (err, target) => {
        if (err || !target) return res.status(404).send('User tidak ditemukan.');
        if (!canManageTarget(req.session.user, target.role)) return res.status(403).send('Kosma hanya boleh reset password mahasiswa.');

        const hashedPassword = await bcrypt.hash(new_password, 10);
        db.run(
            `UPDATE users SET password = ?, must_change_password = 1, updated_at = CURRENT_TIMESTAMP WHERE nim = ?`,
            [hashedPassword, req.params.nim],
            (err) => {
                if (err) return res.status(500).send('Gagal reset password.');
                res.redirect('/users?success=Password berhasil direset.');
            }
        );
    });
});

router.post('/users/:nim/kosma', requireAdmin, (req, res) => {
    db.run(
        `INSERT INTO class_officers (user_nim, position, period, status, created_by, created_at)
         VALUES (?, 'kosma', ?, 'active', ?, CURRENT_TIMESTAMP)
         ON CONFLICT (user_nim, position, status) DO NOTHING`,
        [req.params.nim, req.body.period || '2024/2025', req.session.user.nim],
        (err) => {
            if (err) return res.status(500).send('Gagal menetapkan kosma.');
            res.redirect('/users?success=Kosma berhasil ditetapkan.');
        }
    );
});

router.post('/users/:nim/kosma/remove', requireAdmin, (req, res) => {
    db.run(
        `UPDATE class_officers SET status = 'inactive' WHERE user_nim = ? AND position = 'kosma' AND status = 'active'`,
        [req.params.nim],
        (err) => {
            if (err) return res.status(500).send('Gagal mencabut kosma.');
            res.redirect('/users?success=Status kosma berhasil dicabut.');
        }
    );
});


router.get('/class-profile', requireAdminOrKosma, (req, res) => {
    db.get('SELECT * FROM class_profile WHERE id = 1', [], (err, profile) => {
        if (err) return res.status(500).send('Gagal mengambil profil kelas.');
        res.render('class-profile', {
            pageTitle: 'Profil Kelas',
            pageSubtitle: 'Kelola identitas publik Informatika A 2024',
            profile: profile || {},
            error: null,
            success: req.query.success || null
        });
    });
});

router.post('/class-profile', requireAdminOrKosma, (req, res) => {
    const {
        class_name,
        generation,
        description,
        instagram_url,
        email,
        logo_url,
        hero_image_url
    } = req.body;

    const renderError = (message) => {
        res.render('class-profile', {
            pageTitle: 'Profil Kelas',
            pageSubtitle: 'Kelola identitas publik Informatika A 2024',
            profile: req.body,
            error: message,
            success: null
        });
    };

    if (!class_name || !generation) return renderError('Nama kelas dan angkatan wajib diisi.');

    db.run(
        `UPDATE class_profile
         SET class_name = ?, generation = ?, description = ?, instagram_url = ?, email = ?, logo_url = ?, hero_image_url = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
        [
            class_name,
            generation,
            description || null,
            instagram_url || null,
            email || null,
            logo_url || null,
            hero_image_url || null,
            req.session.user.nim
        ],
        (err) => {
            if (err) {
                console.error(err);
                return renderError('Gagal menyimpan profil kelas.');
            }
            res.redirect('/class-profile?success=Profil kelas berhasil diperbarui.');
        }
    );
});

module.exports = router;
