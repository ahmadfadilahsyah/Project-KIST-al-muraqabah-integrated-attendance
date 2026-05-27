require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();

const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance');
const gpsRoutes = require('./routes/gps');
const sessionRoutes = require('./routes/session');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET || 'al-muraqabah-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24
    }
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/', attendanceRoutes);
app.use('/', gpsRoutes);
app.use('/', sessionRoutes);

app.use((req, res) => {
    res.status(404).send('Halaman tidak ditemukan');
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Terjadi kesalahan pada server');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server berjalan di port ${PORT}`);
});
