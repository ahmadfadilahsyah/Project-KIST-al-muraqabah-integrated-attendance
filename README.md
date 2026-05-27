# Al-Muraqabah
## Sistem Absensi Terintegrasi
### Dari Iman ke Aksi melalui Shidiq & Amanah

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-Express-green?style=for-the-badge">
  <img src="https://img.shields.io/badge/SQLite-Database-blue?style=for-the-badge">
  <img src="https://img.shields.io/badge/Railway-Deployed-purple?style=for-the-badge">
  <img src="https://img.shields.io/badge/QR%20Code-GPS%20Validation-orange?style=for-the-badge">
</p>

---

# 📖 Tentang Proyek

**Al-Muraqabah** adalah sistem absensi berbasis teknologi yang mengintegrasikan nilai-nilai Islam, khususnya:

- **Shidiq (Kejujuran)**
- **Amanah (Tanggung Jawab)**

melalui implementasi:
- QR Code
- Validasi GPS
- Sistem sesi absensi
- Autentikasi pengguna
- Pemindaian QR melalui perangkat mobile

Nama **Al-Muraqabah** memiliki makna:

> *“Kesadaran bahwa Allah selalu mengawasi.”*

Sistem ini dikembangkan sebagai implementasi keterpaduan antara:
- Islam
- Sains
- Teknologi

dalam kehidupan akademik modern.

---

# ✨ Fitur Utama

## 👨‍🏫 Fitur Dosen
- Login autentikasi
- Membuat sesi absensi
- Generate QR Code dinamis
- Pengaturan lokasi GPS
- Monitoring sesi aktif
- Membuka kembali QR sesi aktif

---

## 👨‍🎓 Fitur Mahasiswa
- Login autentikasi
- Scan QR menggunakan kamera HP
- Validasi lokasi GPS
- Riwayat absensi
- Manajemen profil
- Ganti password

---

# 🕌 Konsep Integrasi Islam

| Nilai Islam | Implementasi Teknologi |
|---|---|
| **Shidiq** | Validasi QR & GPS untuk mencegah titip absen |
| **Amanah** | Kehadiran sebagai tanggung jawab akademik |
| **Muraqabah** | Kesadaran bahwa kejujuran bukan hanya terhadap sistem, tetapi juga kepada Allah SWT |

---

# 🛠️ Teknologi yang Digunakan

- Node.js
- Express.js
- SQLite3
- EJS Template Engine
- HTML5 QR Scanner
- Railway Deployment
- Responsive Mobile UI

---

# 📱 Alur Sistem

```text
Dosen Login
→ Membuat Sesi
→ Mengatur Lokasi GPS
→ Menampilkan QR Code

Mahasiswa Login
→ Scan QR
→ Validasi GPS
→ Absensi Tersimpan
