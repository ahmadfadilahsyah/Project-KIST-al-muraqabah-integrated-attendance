const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { requireAuth, requireAdminOrKosma, isAdmin, isLecturer, isKosma, isStudent } = require('../utils/access');

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

function saveAnnouncementImage(file) {
    if (!file || !file.data || file.data.length === 0) return null;

    const allowedTypes = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif'
    };
    const ext = allowedTypes[file.contentType];
    if (!ext) {
        throw new Error('Format foto harus JPG, PNG, WEBP, atau GIF.');
    }

    const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'announcements');
    fs.mkdirSync(uploadDir, { recursive: true });

    const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), file.data);
    return `/uploads/announcements/${filename}`;
}

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
    const handleCreate = (fields, files = {}) => {
        const { title, content, published_at, visibility } = fields;

        if (fields._csrf !== req.session.csrfToken) {
            return res.status(403).send('Token keamanan tidak valid. Muat ulang halaman lalu coba lagi.');
        }

        if (!title || !content) {
            return res.redirect('/dashboard?error=Judul dan narasi berita wajib diisi.');
        }

        let imageUrl = null;
        try {
            imageUrl = saveAnnouncementImage(files.image_file);
        } catch (error) {
            return res.redirect(`/dashboard?error=${encodeURIComponent(error.message)}`);
        }

        db.run(
            `INSERT INTO announcements (title, content, image_url, published_at, visibility, created_by, created_at)
             VALUES (?, ?, ?, COALESCE(NULLIF(?, '')::timestamp, CURRENT_TIMESTAMP), ?, ?, CURRENT_TIMESTAMP)`,
            [
                title.trim(),
                content.trim(),
                imageUrl,
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
    };

    if ((req.headers['content-type'] || '').includes('multipart/form-data')) {
        return parseMultipartForm(req, (err, result) => {
            if (err) return res.redirect(`/dashboard?error=${encodeURIComponent(err.message)}`);
            handleCreate(result.fields, result.files);
        });
    }

    handleCreate(req.body);
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
