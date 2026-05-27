const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database');

const router = express.Router();

router.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.redirect('/login');
});

router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');

    res.render('login', {
        error: null
    });
});

router.post('/login', (req, res) => {
    const { nim, password } = req.body;

    db.get('SELECT * FROM users WHERE nim = ?', [nim], async (err, user) => {
        if (err || !user) {
            return res.render('login', {
                error: 'NIM atau password salah'
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.render('login', {
                error: 'NIM atau password salah'
            });
        }

        req.session.user = {
            nim: user.nim,
            nama: user.nama,
            email: user.email,
            role: user.role
        };

        if (!user.email && user.role === 'student') {
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

    res.render('register', {
        error: null
    });
});

router.post('/register', (req, res) => {
    const { nim, nama, password, role } = req.body;

    if (!nim || !nama || !password || !role) {
        return res.render('register', {
            error: 'Semua field wajib diisi'
        });
    }

    if (password.length < 6) {
        return res.render('register', {
            error: 'Password minimal 6 karakter'
        });
    }

    db.get('SELECT * FROM users WHERE nim = ?', [nim], (err, existingUser) => {
        if (err) {
            return res.render('register', {
                error: 'Terjadi kesalahan server'
            });
        }

        if (existingUser) {
            return res.render('register', {
                error: 'NIM sudah terdaftar'
            });
        }

        bcrypt.hash(password, 10, (err, hashedPassword) => {
            if (err) {
                return res.render('register', {
                    error: 'Gagal mengenkripsi password'
                });
            }

            db.run(
                'INSERT INTO users (nim, nama, password, role) VALUES (?, ?, ?, ?)',
                [nim, nama, hashedPassword, role],
                function (err) {
                    if (err) {
                        return res.render('register', {
                            error: 'Gagal membuat akun'
                        });
                    }

                    req.session.user = {
                        nim,
                        nama,
                        email: null,
                        role
                    };

                    if (role === 'student') {
                        return res.redirect('/profile');
                    }

                    res.redirect('/dashboard');
                }
            );
        });
    });
});

router.get('/profile', (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    db.get(
        'SELECT nim, nama, email, role FROM users WHERE nim = ?',
        [req.session.user.nim],
        (err, userData) => {
            if (err || !userData) {
                return res.redirect('/dashboard');
            }

            res.render('profile', {
                pageTitle: 'Profil',
                pageSubtitle: 'Kelola informasi akun dan keamanan password',
                userData,
                success: null,
                error: null
            });
        }
    );
});

router.post('/profile/update-email', (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    const { email } = req.body;

    if (!email) {
        return db.get(
            'SELECT nim, nama, email, role FROM users WHERE nim = ?',
            [req.session.user.nim],
            (err, userData) => {
                res.render('profile', {
                    pageTitle: 'Profil',
                    pageSubtitle: 'Kelola informasi akun dan keamanan password',
                    userData,
                    success: null,
                    error: 'Email tidak boleh kosong'
                });
            }
        );
    }

    db.run(
        'UPDATE users SET email = ? WHERE nim = ?',
        [email, req.session.user.nim],
        (err) => {
            if (err) {
                return db.get(
                    'SELECT nim, nama, email, role FROM users WHERE nim = ?',
                    [req.session.user.nim],
                    (err, userData) => {
                        res.render('profile', {
                            pageTitle: 'Profil',
                            pageSubtitle: 'Kelola informasi akun dan keamanan password',
                            userData,
                            success: null,
                            error: 'Gagal memperbarui email'
                        });
                    }
                );
            }

            req.session.user.email = email;

            if (req.session.redirectAfterProfile) {
                const redirectUrl = req.session.redirectAfterProfile;
                delete req.session.redirectAfterProfile;
                return res.redirect(redirectUrl);
            }

            db.get(
                'SELECT nim, nama, email, role FROM users WHERE nim = ?',
                [req.session.user.nim],
                (err, userData) => {
                    res.render('profile', {
                        pageTitle: 'Profil',
                        pageSubtitle: 'Kelola informasi akun dan keamanan password',
                        userData,
                        success: 'Email berhasil diperbarui',
                        error: null
                    });
                }
            );
        }
    );
});

router.post('/profile/change-password', (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    const { old_password, new_password, confirm_password } = req.body;

    const renderProfile = (error, success = null) => {
        db.get(
            'SELECT nim, nama, email, role FROM users WHERE nim = ?',
            [req.session.user.nim],
            (err, userData) => {
                res.render('profile', {
                    pageTitle: 'Profil',
                    pageSubtitle: 'Kelola informasi akun dan keamanan password',
                    userData,
                    success,
                    error
                });
            }
        );
    };

    if (!old_password || !new_password || !confirm_password) {
        return renderProfile('Semua field password wajib diisi');
    }

    if (new_password.length < 6) {
        return renderProfile('Password baru minimal 6 karakter');
    }

    if (new_password !== confirm_password) {
        return renderProfile('Konfirmasi password tidak sama');
    }

    db.get(
        'SELECT password FROM users WHERE nim = ?',
        [req.session.user.nim],
        async (err, user) => {
            if (err || !user) {
                return renderProfile('User tidak ditemukan');
            }

            const isOldPasswordCorrect = await bcrypt.compare(old_password, user.password);

            if (!isOldPasswordCorrect) {
                return renderProfile('Password lama salah');
            }

            bcrypt.hash(new_password, 10, (err, hashedPassword) => {
                if (err) {
                    return renderProfile('Gagal mengenkripsi password baru');
                }

                db.run(
                    'UPDATE users SET password = ? WHERE nim = ?',
                    [hashedPassword, req.session.user.nim],
                    (err) => {
                        if (err) {
                            return renderProfile('Gagal mengganti password');
                        }

                        renderProfile(null, 'Password berhasil diganti');
                    }
                );
            });
        }
    );
});

router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

module.exports = router;