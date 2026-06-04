require('./utils/secrets').loadSecrets();

const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

const app = express();

const db = require('./database');

const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance');
const gpsRoutes = require('./routes/gps');
const sessionRoutes = require('./routes/session');
const adminRoutes = require('./routes/admin');
const subjectRoutes = require('./routes/subjects');
const reportRoutes = require('./routes/reports');
const access = require('./utils/access');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self)');
    next();
});

app.set('trust proxy', 1);

const fallbackSecret = 'al-muraqabah-secret-change-me';
const sessionSecret = process.env.SESSION_SECRET || fallbackSecret;
if (process.env.NODE_ENV === 'production' && (sessionSecret === fallbackSecret || sessionSecret.length < 32)) {
    console.error('SESSION_SECRET wajib diatur minimal 32 karakter saat NODE_ENV=production.');
    process.exit(1);
}

app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24
    }
}));

app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }

    res.locals.csrfToken = req.session.csrfToken;

    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.path === '/announcements/create' && (req.headers['content-type'] || '').includes('multipart/form-data')) {
        return next();
    }

    const submittedToken = req.body && (req.body._csrf || req.body.csrfToken)
        || req.get('csrf-token')
        || req.get('x-csrf-token');

    if (submittedToken !== req.session.csrfToken) {
        return res.status(403).send('Token keamanan tidak valid. Muat ulang halaman lalu coba lagi.');
    }

    next();
});

// Mencegah halaman dashboard tersimpan di cache browser setelah logout
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.access = access;
    res.locals.canUseReports = false;

    const user = req.session.user;
    if (!user) return next();
    if (access.isAdmin(user) || access.isKosma(user) || access.isLecturer(user)) {
        res.locals.canUseReports = true;
        return next();
    }
    if (!access.isStudent(user)) return next();

    db.get('SELECT id FROM subject_pjs WHERE student_nim = ? LIMIT 1', [user.nim], (err, pjAccess) => {
        if (err) {
            console.error('Report access check error:', err);
            return next();
        }
        res.locals.canUseReports = !!pjAccess;
        next();
    });
});

app.use('/', authRoutes);
app.use('/', indexRoutes);
app.use('/', attendanceRoutes);
app.use('/', gpsRoutes);
app.use('/', sessionRoutes);
app.use('/', adminRoutes);
app.use('/', subjectRoutes);
app.use('/', reportRoutes);

app.use((req, res) => res.status(404).send('Halaman tidak ditemukan'));

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Terjadi kesalahan pada server');
});

const PORT = process.env.PORT || 3000;
db.ready
    .then(() => {
        app.listen(PORT, '0.0.0.0', () => console.log(`Server berjalan di port ${PORT}`));
    })
    .catch((err) => {
        console.error('Server tidak dijalankan karena database belum siap:', err.message);
        process.exit(1);
    });
