const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('../database');
const isAuth = require('../middleware/auth');

const router = express.Router();

function isLecturerPage(req, res, next) {
    isAuth(req, res, () => {
        const role = req.session.user.role;
        if (role !== 'lecturer' && role !== 'teacher' && role !== 'dosen') {
            return res.status(403).send('Hanya dosen yang dapat mengakses halaman ini.');
        }
        next();
    });
}

function isLecturerApi(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Anda harus login terlebih dahulu.' });
    }

    const role = req.session.user.role;
    if (role !== 'lecturer' && role !== 'teacher' && role !== 'dosen') {
        return res.status(403).json({ success: false, message: 'Hanya dosen yang dapat membuat QR.' });
    }

    next();
}

router.get('/create-session', isLecturerPage, (req, res) => {
    res.render('create-session', {
        pageTitle: 'Buat Sesi Amanah',
        pageSubtitle: 'Buat sesi pertemuan dan tampilkan QR absensi',
        error: null
    });
});

router.post('/create-session', isLecturerPage, (req, res) => {
    const { judul, expires_minutes } = req.body;

    const renderForm = (error) => {
        res.render('create-session', {
            pageTitle: 'Buat Sesi Amanah',
            pageSubtitle: 'Buat sesi pertemuan dan tampilkan QR absensi',
            error
        });
    };

    if (!judul || !expires_minutes) return renderForm('Judul dan durasi wajib diisi.');

    const minutes = parseInt(expires_minutes, 10);
    if (Number.isNaN(minutes) || minutes <= 0) return renderForm('Durasi tidak valid.');

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + minutes);
    const expiresAtSql = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

    db.run(
        `INSERT INTO sessions (judul, expires_at, active, created_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP)`,
        [judul, expiresAtSql],
        function (err) {
            if (err) {
                console.error('Gagal buat sesi:', err.message);
                return renderForm(`Gagal membuat sesi: ${err.message}`);
            }

            res.redirect(`/show-qr/${this.lastID}`);
        }
    );
});

router.get('/show-qr/:sessionId', isLecturerPage, (req, res) => {
    const sessionId = req.params.sessionId;

    db.get('SELECT * FROM sessions WHERE id = ? AND active = 1', [sessionId], (err, session) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Terjadi kesalahan saat mengambil sesi.');
        }

        if (!session) return res.status(404).send('Sesi tidak ditemukan atau sudah dinonaktifkan.');

        res.render('show-qr', {
            pageTitle: 'QR Absensi',
            pageSubtitle: 'Tampilkan QR kepada mahasiswa untuk absensi',
            session
        });
    });
});

router.get('/api/qr-token/:sessionId', isLecturerApi, (req, res) => {
    const sessionId = req.params.sessionId;

    db.get(
        `SELECT * FROM sessions WHERE id = ? AND active = 1 AND expires_at > datetime('now')`,
        [sessionId],
        (err, session) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: 'Terjadi kesalahan database.' });
            }

            if (!session) return res.status(404).json({ success: false, message: 'Sesi tidak valid atau sudah kadaluarsa.' });

            const token = crypto.randomBytes(32).toString('hex');
            const tokenExpiresAt = new Date();
            tokenExpiresAt.setMinutes(tokenExpiresAt.getMinutes() + 2);
            const tokenExpiresAtSql = tokenExpiresAt.toISOString().slice(0, 19).replace('T', ' ');

            db.run(
                `INSERT INTO qr_tokens (token, session_id, expires_at, used, created_at) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)`,
                [token, sessionId, tokenExpiresAtSql],
                async (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ success: false, message: 'Gagal menyimpan token QR.' });
                    }

                    try {
                        const baseUrl = `${req.protocol}://${req.get('host')}`;
                        const confirmUrl = `${baseUrl}/confirm/${token}`;
                        const qrCode = await QRCode.toDataURL(confirmUrl);

                        res.json({
                            success: true,
                            qrCode,
                            token,
                            confirmUrl,
                            expiresAt: tokenExpiresAt.toISOString()
                        });
                    } catch (error) {
                        console.error(error);
                        res.status(500).json({ success: false, message: 'Gagal membuat gambar QR Code.' });
                    }
                }
            );
        }
    );
});

router.post('/delete-session/:sessionId', isLecturerPage, (req, res) => {
    const sessionId = req.params.sessionId;

    db.run('UPDATE sessions SET active = 0 WHERE id = ?', [sessionId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Gagal menonaktifkan sesi.');
        }

        res.redirect('/dashboard');
    });
});

module.exports = router;
