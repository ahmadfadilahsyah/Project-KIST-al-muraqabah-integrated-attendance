const db = require('./database');
const bcrypt = require('bcrypt');

const NIM = 'D001';
const PASSWORD = 'dosen123';
const NAMA = 'Dosen Al Muraqabah';
const EMAIL = 'dosen@example.com';

const hashedPassword = bcrypt.hashSync(PASSWORD, 10);

db.get(`SELECT * FROM users WHERE nim = ?`, [NIM], (err, user) => {
  if (err) {
    console.error('Error query:', err.message);
    db.close();
    return;
  }
  
  if (user) {
    console.log('Akun dosen ditemukan:');
    console.log(`NIM: ${user.nim}`);
    console.log(`Nama: ${user.nama}`);
    console.log(`Email: ${user.email || '-'}`);
    console.log(`Role: ${user.role}`);
    
    // Update password dan email jika diperlukan
    db.run(`UPDATE users SET password = ?, email = ? WHERE nim = ?`, [hashedPassword, EMAIL, NIM], (err) => {
      if (err) {
        console.error('Gagal update:', err.message);
      } else {
        console.log('✅ Password dan email telah direset.');
        console.log(`Silakan login dengan NIM: ${NIM}, Password: ${PASSWORD}`);
      }
      db.close();
    });
  } else {
    console.log('Akun dosen tidak ditemukan. Membuat baru...');
    db.run(`INSERT INTO users (nim, nama, email, password, role) VALUES (?, ?, ?, ?, ?)`,
      [NIM, NAMA, EMAIL, hashedPassword, 'lecturer'],
      (err) => {
        if (err) {
          console.error('Gagal membuat akun:', err.message);
        } else {
          console.log('✅ Akun dosen berhasil dibuat.');
          console.log(`NIM: ${NIM}, Password: ${PASSWORD}`);
        }
        db.close();
      });
  }
});