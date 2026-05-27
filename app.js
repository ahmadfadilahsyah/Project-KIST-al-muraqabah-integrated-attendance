const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();

// ROUTES
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance');
const gpsRoutes = require('./routes/gps');
const sessionRoutes = require('./routes/session');

// VIEW ENGINE
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// BODY PARSER
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// STATIC FILES
app.use(express.static(path.join(__dirname, 'public')));

// SESSION
app.use(
    session({
        secret: 'al-muraqabah-secret-key',
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: false,
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);

// GLOBAL VARIABLE UNTUK SEMUA EJS
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// ROUTES
app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/', attendanceRoutes);
app.use('/', gpsRoutes);
app.use('/', sessionRoutes);

// 404
app.use((req, res) => {
    res.status(404).send('Halaman tidak ditemukan');
});

// ERROR HANDLER
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Terjadi kesalahan pada server');
});

// SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server berjalan di port ${PORT}`);
});