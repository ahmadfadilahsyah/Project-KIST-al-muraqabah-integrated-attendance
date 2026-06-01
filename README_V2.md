# Al-Muraqabah Portal Kelas Informatika A 2024 - V2

## Perubahan Struktur Folder

Struktur lama tetap dipertahankan agar project tidak perlu dibuat ulang dari nol. Perubahan utama:

```text
al_muraqabah/
├── app.js
├── database.js
├── middleware/
│   └── auth.js
├── utils/
│   └── access.js              # baru: helper role, kosma, permission
├── routes/
│   ├── admin.js               # baru: manajemen user, kosma, dosen
│   ├── subjects.js            # baru: mata kuliah, PJ, dosen pengampu
│   ├── auth.js
│   ├── index.js
│   ├── attendance.js
│   ├── gps.js
│   └── session.js
├── views/
│   ├── home.ejs               # baru: dashboard publik sebelum login
│   ├── users.ejs              # baru
│   ├── user-form.ejs          # baru
│   ├── subjects.ejs           # baru
│   ├── subject-form.ejs       # baru
│   ├── subject-manage.ejs     # baru
│   ├── dashboard.ejs
│   ├── create-session.ejs
│   ├── show-qr.ejs
│   ├── gps-settings.ejs
│   └── partials/navbar.ejs
└── public/css/style.css
```

## Akun Demo

Saat server pertama kali dijalankan, database akan membuat akun demo:

```text
Admin:
username/NIM: A001
password    : admin123

Dosen:
username/NIM: D001
password    : dosen123

Mahasiswa:
username/NIM: M001
password    : mahasiswa123

Kosma:
username/NIM: M002
password    : kosma123
```

## Aturan Final yang Sudah Diimplementasikan

- Dashboard publik bisa dilihat sebelum login.
- Login role utama: admin, student, lecturer.
- Kosma adalah mahasiswa dengan jabatan tambahan di tabel `class_officers`.
- Admin bisa membuat akun dosen dan mahasiswa.
- Admin bisa menetapkan/mencabut kosma.
- Admin dan Kosma bisa mengelola mata kuliah.
- Admin dan Kosma bisa menetapkan PJ mata kuliah.
- Admin dan Kosma bisa menghubungkan dosen ke mata kuliah.
- PJ bisa membuat sesi untuk mata kuliah yang ditugaskan.
- Kosma bisa membuat sesi untuk semua mata kuliah.
- Dosen bisa membuat sesi untuk mata kuliah yang diampu.
- Durasi sesi default 60 menit.
- Batas durasi sesi 15 sampai 120 menit.
- QR refresh 30 detik.
- Radius GPS tetap 75 meter.
- Tidak ada status terlambat.
- Status absensi: hadir, izin, sakit, alpa.
- PJ pembuat sesi punya tombol “Saya Hadir” dengan validasi GPS.

## Cara Menjalankan dari Awal

1. Pastikan Node.js sudah terpasang. Disarankan Node.js 20 LTS.

2. Masuk ke folder project:

```bash
cd al_muraqabah_v2
```

3. Install dependency:

```bash
npm install
```

4. Buat file `.env` jika belum ada:

```env
PORT=3000
SESSION_SECRET=al-muraqabah-secret-change-me
```

5. Jalankan server:

```bash
npm start
```

6. Buka website:

```text
http://localhost:3000
```

7. Login sebagai Admin:

```text
A001 / admin123
```

8. Alur setup awal:

```text
Login Admin
→ Manajemen User
→ Tambah Dosen / Mahasiswa
→ Jadikan salah satu mahasiswa sebagai Kosma
→ Mata Kuliah
→ Tambah Mata Kuliah
→ PJ/Dosen
→ Tambahkan PJ dan dosen pengampu
→ Lokasi Kelas
→ Ambil GPS / isi koordinat
→ Buat Sesi
→ Tampilkan QR
```

## Catatan Penting

Folder `node_modules` dan file database `absensi.db` tidak disertakan dalam paket ini. Jalankan `npm install` agar dependency dibuat ulang sesuai laptop kamu. Database akan dibuat otomatis saat `npm start`.
