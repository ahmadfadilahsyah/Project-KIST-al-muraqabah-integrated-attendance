const express = require('express');
const db = require('../database');
const router = express.Router();

function isLecturer(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'lecturer') return res.status(403).send('Hanya dosen');
  next();
}

router.get('/gps-settings', isLecturer, (req, res) => {
  db.get(`SELECT * FROM class_settings ORDER BY id DESC LIMIT 1`, (err, setting) => {
    if (err) return res.status(500).send('Error');
    res.render('gps-settings', { setting: setting || {}, error: null, success: null });
  });
});

router.post('/gps-settings', isLecturer, (req, res) => {
  const { latitude, longitude, radius_meters } = req.body;
  if (!latitude || !longitude || !radius_meters) {
    return res.render('gps-settings', { setting: req.body, error: 'Semua field harus diisi', success: null });
  }
  db.run(`INSERT OR REPLACE INTO class_settings (id, latitude, longitude, radius_meters, updated_at) 
          VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [parseFloat(latitude), parseFloat(longitude), parseInt(radius_meters)], (err) => {
      if (err) return res.render('gps-settings', { setting: req.body, error: 'Gagal menyimpan', success: null });
      res.render('gps-settings', { setting: { latitude, longitude, radius_meters }, error: null, success: 'Lokasi kelas berhasil diperbarui.' });
    });
});

module.exports = router;