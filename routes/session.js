const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('../database');
const { requireAuth, isAdmin, isKosma, isLecturer, isStudent } = require('../utils/access');

const router = express.Router();

function canCreateForSubject(user, subjectId, callback) {
    if (isAdmin(user) || isKosma(user)) return callback(null, true);

    if (isLecturer(user)) {
        return db.get(
            `SELECT id FROM subject_lecturers WHERE subject_id = ? AND lecturer_nim = ? AND status = 'active'`,
            [subjectId, user.nim],
            (err, row) => callback(err, !!row)
        );
    }

    if (isStudent(user)) {
        return db.get(
            `SELECT id FROM subject_pjs WHERE subject_id = ? AND student_nim = ?`,
            [subjectId, user.nim],
            (err, row) => callback(err, !!row)
        );
    }

    callback(null, false);
}

function getAllowedSubjects(user, callback) {
    if (isAdmin(user) || isKosma(user)) {
        return db.all(
            `SELECT s.*, COALESCE(l.nama, '-') AS lecturer_name, COALESCE(p.nama, '-') AS pj_name
             FROM subjects s
             LEFT JOIN subject_lecturers sl ON sl.subject_id = s.id AND sl.status = 'active'
             LEFT JOIN users l ON l.nim = sl.lecturer_nim
             LEFT JOIN subject_pjs sp ON sp.subject_id = s.id
             LEFT JOIN users p ON p.nim = sp.student_nim
             WHERE s.status = 'active'
             ORDER BY s.name`,
            [],
            callback
        );
    }

    if (isLecturer(user)) {
        return db.all(
            `SELECT DISTINCT s.* FROM subjects s
             JOIN subject_lecturers sl ON sl.subject_id = s.id
             WHERE sl.lecturer_nim = ? AND sl.status = 'active' AND s.status = 'active'
             ORDER BY s.name`,
            [user.nim],
            callback
        );
    }

    return db.all(
        `SELECT DISTINCT s.* FROM subjects s
         JOIN subject_pjs sp ON sp.subject_id = s.id
         WHERE sp.student_nim = ? AND s.status = 'active'
         ORDER BY s.name`,
        [user.nim],
        callback
    );
}

function requireSessionCreator(req, res, next) {
    requireAuth(req, res, () => {
        getAllowedSubjects(req.session.user, (err, subjects) => {
            if (err) {
                console.error('Allowed subjects error:', err);
                return res.status(500).send('Gagal memeriksa akses sesi.');
            }
            if (!subjects || subjects.length === 0) {
                return res.status(403).render('access-denied', {
                    pageTitle: 'Akses Belum Tersedia',
                    pageSubtitle: 'Akun Anda belum terhubung ke mata kuliah.'
                });
            }
            req.allowedSubjects = subjects;
            next();
        });
    });
}

router.get('/create-session', requireSessionCreator, (req, res) => {
    db.get('SELECT * FROM system_settings WHERE id = 1', [], (err, setting) => {
        if (err) return res.status(500).send('Gagal mengambil pengaturan sistem.');

        db.get('SELECT * FROM class_settings ORDER BY id DESC LIMIT 1', [], (err, classSetting) => {
            if (err) return res.status(500).send('Gagal mengambil lokasi kelas.');

            res.render('create-session', {
                pageTitle: 'Buat Sesi Absensi',
                pageSubtitle: 'Dari iman ke aksi: sesi jujur dengan QR dinamis dan validasi GPS',
                error: null,
                success: req.query.success || null,
                subjects: req.allowedSubjects,
                setting: setting || { default_session_minute: 60, min_session_minute: 15, max_session_minute: 120 },
                classSetting: classSetting || { radius_meters: 500 }
            });
        });
    });
});

router.post('/create-session', requireSessionCreator, (req, res) => {
    const { judul, subject_id, expires_minutes } = req.body;

    db.get('SELECT * FROM system_settings WHERE id = 1', [], (err, setting) => {
        if (err) return res.status(500).send('Gagal mengambil pengaturan sistem.');
        const sys = setting || { default_session_minute: 60, min_session_minute: 15, max_session_minute: 120 };

        const renderForm = (error) => {
            db.get('SELECT * FROM class_settings ORDER BY id DESC LIMIT 1', [], (gpsErr, classSetting) => {
                res.render('create-session', {
                    pageTitle: 'Buat Sesi Absensi',
                    pageSubtitle: 'Dari iman ke aksi: sesi jujur dengan QR dinamis dan validasi GPS',
                    error,
                    success: null,
                    subjects: req.allowedSubjects,
                    setting: sys,
                    classSetting: classSetting || { radius_meters: 500 }
                });
            });
        };

        if (!judul || !subject_id || !expires_minutes) return renderForm('Mata kuliah, judul, dan durasi wajib diisi.');

        const minutes = parseInt(expires_minutes, 10);
        const min = parseInt(sys.min_session_minute, 10) || 15;
        const max = parseInt(sys.max_session_minute, 10) || 120;
        if (Number.isNaN(minutes) || minutes < min || minutes > max) {
            return renderForm(`Durasi harus antara ${min} sampai ${max} menit.`);
        }

        canCreateForSubject(req.session.user, subject_id, async (err, allowed) => {
            if (err) return renderForm('Gagal memeriksa akses mata kuliah.');
            if (!allowed) return renderForm('Anda tidak punya akses membuat sesi untuk mata kuliah ini.');

            try {
                const result = await db.query(
                    `INSERT INTO sessions (judul, subject_id, created_by, expires_at, duration_minutes, active, created_at)
                     VALUES (?, ?, ?, CURRENT_TIMESTAMP + (?::int * INTERVAL '1 minute'), ?, 1, CURRENT_TIMESTAMP)
                     RETURNING id`,
                    [judul, subject_id, req.session.user.nim, minutes, minutes]
                );
                const sessionId = result.rows[0].id;
                res.redirect(`/show-qr/${sessionId}`);
            } catch (error) {
                console.error('Create session error:', error);
                return renderForm(`Gagal membuat sesi: ${error.message}`);
            }
        });
    });
});

router.get('/show-qr/:sessionId', requireAuth, (req, res) => {
    const sessionId = req.params.sessionId;

    db.get(
        `SELECT se.*, sub.name AS subject_name, sub.code AS subject_code
         FROM sessions se
         LEFT JOIN subjects sub ON sub.id = se.subject_id
         WHERE se.id = ? AND se.active = 1`,
        [sessionId],
        (err, session) => {
            if (err) return res.status(500).send('Terjadi kesalahan saat mengambil sesi.');
            if (!session) return res.status(404).send('Sesi tidak ditemukan atau sudah dinonaktifkan.');

            canCreateForSubject(req.session.user, session.subject_id, (err, allowed) => {
                if (err || !allowed) return res.status(403).send('Anda tidak punya akses melihat QR sesi ini.');

                db.get('SELECT * FROM attendance WHERE nim = ? AND session_id = ?', [req.session.user.nim, sessionId], (err, ownAttendance) => {
                    db.get('SELECT * FROM class_settings ORDER BY id DESC LIMIT 1', [], (settingErr, classSetting) => {
                        res.render('show-qr', {
                            pageTitle: 'QR Absensi',
                            pageSubtitle: 'Tampilkan QR kepada mahasiswa untuk absensi',
                            session,
                            ownAttendance,
                            classSetting: classSetting || {},
                            canUseCreatorButton: isStudent(req.session.user) && session.created_by === req.session.user.nim
                        });
                    });
                });
            });
        }
    );
});

router.get('/api/qr-token/:sessionId', requireAuth, (req, res) => {
    const sessionId = req.params.sessionId;

    db.get(
        `SELECT * FROM sessions WHERE id = ? AND active = 1 AND expires_at > CURRENT_TIMESTAMP`,
        [sessionId],
        (err, session) => {
            if (err) return res.status(500).json({ success: false, message: 'Terjadi kesalahan database.' });
            if (!session) return res.status(404).json({ success: false, message: 'Sesi tidak valid atau sudah kadaluarsa.' });

            canCreateForSubject(req.session.user, session.subject_id, (err, allowed) => {
                if (err || !allowed) return res.status(403).json({ success: false, message: 'Tidak punya akses membuat QR.' });

                const token = crypto.randomBytes(32).toString('hex');

                db.run(
                    `INSERT INTO qr_tokens (token, session_id, expires_at, used, created_at)
                     VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL '90 seconds', 0, CURRENT_TIMESTAMP)`,
                    [token, sessionId],
                    async (err) => {
                        if (err) return res.status(500).json({ success: false, message: 'Gagal menyimpan token QR.' });

                        try {
                            const baseUrl = `${req.protocol}://${req.get('host')}`;
                            const confirmUrl = `${baseUrl}/confirm/${token}`;
                            const qrCode = await QRCode.toDataURL(confirmUrl, {
                                margin: 1,
                                width: 320,
                                color: { dark: '#14532d', light: '#ffffff' }
                            });
                            res.json({ success: true, qrCode, token, confirmUrl });
                        } catch (error) {
                            res.status(500).json({ success: false, message: 'Gagal membuat gambar QR Code.' });
                        }
                    }
                );
            });
        }
    );
});

router.post('/delete-session/:sessionId', requireAuth, (req, res) => {
    db.get('SELECT * FROM sessions WHERE id = ?', [req.params.sessionId], (err, session) => {
        if (err || !session) return res.status(404).send('Sesi tidak ditemukan.');

        canCreateForSubject(req.session.user, session.subject_id, (err, allowed) => {
            if (err || !allowed) return res.status(403).send('Anda tidak punya akses menonaktifkan sesi ini.');
            db.run('UPDATE sessions SET active = 0 WHERE id = ?', [req.params.sessionId], (err) => {
                if (err) return res.status(500).send('Gagal menonaktifkan sesi.');
                res.redirect('/dashboard');
            });
        });
    });
});

module.exports = router;
