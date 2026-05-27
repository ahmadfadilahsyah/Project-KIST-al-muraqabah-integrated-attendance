const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database');

const router = express.Router();

function normalizeRole(role) {
    if (role === 'dosen' || role === 'teacher') return 'lecturer';
    if (role === 'mahasiswa') return 'student';
    return role || 'student';
}

function readUser(nim, callback) {
    db.get('SELECT nim, nama, email, role FROM users WHERE nim = ?', [nim], callback);
}

router.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.redirect('/login');
});

router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('login', { error: null });
});

router.post('/login', (req, res) => {
    const { nim, password } = req.body;

    if (!nim || !password) {
        return res.render('login', { error: 'NIM dan password wajib diisi.' });
    }

    db.get('SELECT * FROM users WHERE nim = ?', [nim], async (err, user) => {
        if (err) {
            console.error(err);
            return res.render('login', { error: 'Terjadi kesalahan server.' });
        }

        if (!user) {
            return res.render('login', { error: 'NIM atau password salah.' });
        }

        let match = false;

        try {
            match = await bcrypt.compare(password, user.password);
        } catch (error) {
            console.error(error);
        }

        if (!match) {
            return res.render('login', { error: 'NIM atau password salah.' });
        }

        const role = normalizeRole(user.role);

        req.session.user = {
            nim: user.nim,
            nama: user.nama,
            email: user.email,
            role
        };

        if ((role === 'student') && !user.email) {
            return res.redirect('/profile');
        }

        if (req.session.redirectAfterLogin) {
            const redirectUrl = req.session.redirectAfterLogin;
            delete req.session.redirectAfterLogin;
            return res.redirect(redirectUrl);
        }

        res.redirect('/dashboard');
    });
});

router.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('register', { error: null });
});

router.post('/register', (req, res) => {
    const { nim, nama, password, role } = req.body;
    const fixedRole = normalizeRole(role);

    if (!nim || !nama || !password || !fixedRole) {
        return res.render('register', { error: 'Semua field wajib diisi.' });
    }

    if (password.length < 6) {
        return res.render('register', { error: 'Password minimal 6 karakter.' });
    }

    db.get('SELECT nim FROM users WHERE nim = ?', [nim], (err, existing) => {
        if (err) {
            console.error(err);
            return res.render('register', { error: 'Terjadi kesalahan server.' });
        }

        if (existing) {
            return res.render('register', { error: 'NIM sudah terdaftar.' });
        }

        bcrypt.hash(password, 10, (err, hashedPassword) => {
            if (err) {
                console.error(err);
                return res.render('register', { error: 'Gagal membuat akun.' });
            }

            db.run(
                'INSERT INTO users (nim, nama, password, role) VALUES (?, ?, ?, ?)',
                [nim, nama, hashedPassword, fixedRole],
                (err) => {
                    if (err) {
                        console.error(err);
                        return res.render('register', { error: 'Gagal menyimpan akun.' });
                    }

                    req.session.user = { nim, nama, email: null, role: fixedRole };
                    res.redirect(fixedRole === 'student' ? '/profile' : '/dashboard');
                }
            );
        });
    });
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
            pageSubtitle: 'Kelola identitas dan amanah digital akun Anda',
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
                pageSubtitle: 'Kelola identitas dan amanah digital akun Anda',
                userData,
                error,
                success
            });
        });
    };

    if (!email) return renderProfile('Email wajib diisi.');

    db.run('UPDATE users SET email = ? WHERE nim = ?', [email, req.session.user.nim], (err) => {
        if (err) {
            console.error(err);
            return renderProfile('Gagal memperbarui email.');
        }

        req.session.user.email = email;

        if (req.session.redirectAfterProfile) {
            const redirectUrl = req.session.redirectAfterProfile;
            delete req.session.redirectAfterProfile;
            return res.redirect(redirectUrl);
        }

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
                pageSubtitle: 'Kelola identitas dan amanah digital akun Anda',
                userData,
                error,
                success
            });
        });
    };

    if (!old_password || !new_password || !confirm_password) {
        return renderProfile('Semua field password wajib diisi.');
    }

    if (new_password.length < 6) {
        return renderProfile('Password baru minimal 6 karakter.');
    }

    if (new_password !== confirm_password) {
        return renderProfile('Konfirmasi password tidak sama.');
    }

    db.get('SELECT password FROM users WHERE nim = ?', [req.session.user.nim], async (err, user) => {
        if (err || !user) {
            console.error(err);
            return renderProfile('User tidak ditemukan.');
        }

        const match = await bcrypt.compare(old_password, user.password);
        if (!match) return renderProfile('Password lama salah.');

        bcrypt.hash(new_password, 10, (err, hashedPassword) => {
            if (err) {
                console.error(err);
                return renderProfile('Gagal mengenkripsi password baru.');
            }

            db.run('UPDATE users SET password = ? WHERE nim = ?', [hashedPassword, req.session.user.nim], (err) => {
                if (err) {
                    console.error(err);
                    return renderProfile('Gagal mengganti password.');
                }

                renderProfile(null, 'Password berhasil diganti.');
            });
        });
    });
});

router.post('/profile', (req, res) => {
    req.url = '/profile/update-email';
    router.handle(req, res);
});

router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

module.exports = router;
