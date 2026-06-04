const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { requireAuth, requireAdmin, requireAdminOrKosma, isAdmin, isKosma } = require('../utils/access');
const { hashPassword, validatePasswordStrength } = require('../utils/password');

const router = express.Router();

function splitBuffer(buffer, separator) {
    const parts = [];
    let start = 0;
    let index = buffer.indexOf(separator, start);

    while (index !== -1) {
        parts.push(buffer.slice(start, index));
        start = index + separator.length;
        index = buffer.indexOf(separator, start);
    }

    parts.push(buffer.slice(start));
    return parts;
}

function parseMultipartForm(req, callback) {
    const contentType = req.headers['content-type'] || '';
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!match) return callback(new Error('Boundary upload tidak ditemukan.'));

    const boundary = Buffer.from(`--${match[1] || match[2]}`);
    const chunks = [];
    let size = 0;
    const maxSize = 6 * 1024 * 1024;

    req.on('data', chunk => {
        size += chunk.length;
        if (size > maxSize) {
            req.destroy(new Error('Ukuran upload maksimal 6MB.'));
            return;
        }
        chunks.push(chunk);
    });

    req.on('error', callback);
    req.on('end', () => {
        const body = Buffer.concat(chunks);
        const fields = {};
        const files = {};

        splitBuffer(body, boundary).forEach(part => {
            let item = part;
            if (item.slice(0, 2).toString() === '\r\n') item = item.slice(2);
            if (item.slice(-2).toString() === '\r\n') item = item.slice(0, -2);
            if (item.length === 0 || item.toString('latin1') === '--') return;
            if (item.slice(-2).toString() === '--') item = item.slice(0, -2);

            const headerEnd = item.indexOf(Buffer.from('\r\n\r\n'));
            if (headerEnd === -1) return;

            const rawHeaders = item.slice(0, headerEnd).toString('latin1');
            let value = item.slice(headerEnd + 4);
            if (value.slice(-2).toString() === '\r\n') value = value.slice(0, -2);

            const nameMatch = rawHeaders.match(/name="([^"]+)"/);
            if (!nameMatch) return;

            const filenameMatch = rawHeaders.match(/filename="([^"]*)"/);
            const typeMatch = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i);
            const name = nameMatch[1];

            if (filenameMatch && filenameMatch[1]) {
                files[name] = {
                    filename: filenameMatch[1],
                    contentType: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
                    data: value
                };
            } else {
                fields[name] = value.toString('utf8');
            }
        });

        callback(null, { fields, files });
    });
}

function saveGalleryImage(file) {
    if (!file || !file.data || file.data.length === 0) {
        throw new Error('Foto galeri wajib diupload.');
    }

    const allowedTypes = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif'
    };
    const ext = allowedTypes[file.contentType];
    if (!ext) throw new Error('Format foto harus JPG, PNG, WEBP, atau GIF.');

    const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'galleries');
    fs.mkdirSync(uploadDir, { recursive: true });

    const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), file.data);
    return `/uploads/galleries/${filename}`;
}

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
                error: req.query.error || null,
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

    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) return renderError(passwordCheck.message);

    try {
        const hashedPassword = await hashPassword(password);
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
    const passwordCheck = validatePasswordStrength(new_password);
    if (!passwordCheck.valid) return res.status(400).send(passwordCheck.message);

    db.get('SELECT role FROM users WHERE nim = ?', [req.params.nim], async (err, target) => {
        if (err || !target) return res.status(404).send('User tidak ditemukan.');
        if (!canManageTarget(req.session.user, target.role)) return res.status(403).send('Kosma hanya boleh reset password mahasiswa.');

        const hashedPassword = await hashPassword(new_password);
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

router.post('/users/:nim/delete', requireAdminOrKosma, (req, res) => {
    db.get('SELECT role FROM users WHERE nim = ?', [req.params.nim], (err, target) => {
        if (err || !target) return res.redirect('/users?error=User tidak ditemukan.');
        if (req.params.nim === req.session.user.nim) {
            return res.redirect('/users?error=Akun yang sedang login tidak bisa dihapus.');
        }
        if (!canManageTarget(req.session.user, target.role)) {
            return res.redirect('/users?error=Anda tidak punya akses menghapus user ini.');
        }

        db.run('DELETE FROM users WHERE nim = ?', [req.params.nim], (err) => {
            if (err) {
                console.error('Delete user error:', err);
                return res.redirect('/users?error=Gagal menghapus user.');
            }
            res.redirect('/users?success=User berhasil dihapus.');
        });
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

router.get('/galleries', requireAdminOrKosma, (req, res) => {
    db.all(
        `SELECT g.*, u.nama AS uploader_name
         FROM galleries g
         LEFT JOIN users u ON u.nim = g.uploaded_by
         ORDER BY g.created_at DESC, g.id DESC`,
        [],
        (err, galleries) => {
            if (err) return res.status(500).send('Gagal mengambil galeri.');
            res.render('galleries', {
                pageTitle: 'Kelola Galeri',
                pageSubtitle: 'Upload dan atur dokumentasi kegiatan kelas',
                galleries,
                error: req.query.error || null,
                success: req.query.success || null
            });
        }
    );
});

router.post('/galleries/create', requireAdminOrKosma, (req, res) => {
    parseMultipartForm(req, (err, result) => {
        if (err) return res.redirect(`/galleries?error=${encodeURIComponent(err.message)}`);
        const { fields, files } = result;

        if (fields._csrf !== req.session.csrfToken) {
            return res.status(403).send('Token keamanan tidak valid. Muat ulang halaman lalu coba lagi.');
        }

        if (!fields.title) {
            return res.redirect(`/galleries?error=${encodeURIComponent('Judul galeri wajib diisi.')}`);
        }

        let imageUrl;
        try {
            imageUrl = saveGalleryImage(files.image_file);
        } catch (error) {
            return res.redirect(`/galleries?error=${encodeURIComponent(error.message)}`);
        }

        db.run(
            `INSERT INTO galleries (title, image_url, description, visibility, uploaded_by, created_at)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
                fields.title.trim(),
                imageUrl,
                fields.description ? fields.description.trim() : null,
                fields.visibility || 'public',
                req.session.user.nim
            ],
            (err) => {
                if (err) {
                    console.error('Create gallery error:', err);
                    return res.redirect(`/galleries?error=${encodeURIComponent('Gagal menyimpan galeri.')}`);
                }
                res.redirect('/galleries?success=Foto galeri berhasil diupload.');
            }
        );
    });
});

router.post('/galleries/:id/delete', requireAdminOrKosma, (req, res) => {
    db.run('DELETE FROM galleries WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.redirect(`/galleries?error=${encodeURIComponent('Gagal menghapus galeri.')}`);
        res.redirect('/galleries?success=Foto galeri berhasil dihapus.');
    });
});

module.exports = router;
