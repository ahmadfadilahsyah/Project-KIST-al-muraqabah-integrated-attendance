# Al-Muraqabah Portal Kelas Informatika A 2024

Al-Muraqabah adalah portal kelas dan sistem absensi terpadu berbasis QR dinamis, validasi GPS, role akses, dan manajemen mata kuliah.

## Stack

- Node.js 20
- Express 5
- EJS
- PostgreSQL
- bcrypt
- express-session
- qrcode

## Fitur Utama

- Dashboard publik sebelum login.
- Login role admin, lecturer/dosen, dan student/mahasiswa.
- Kosma sebagai jabatan tambahan mahasiswa melalui tabel `class_officers`.
- Admin dapat mengelola admin, dosen, mahasiswa, dan kosma.
- Admin dan kosma dapat mengelola mata kuliah, dosen pengampu, PJ, jadwal, dan profil kelas.
- Dosen dapat membuat sesi untuk mata kuliah yang diampu.
- PJ dapat membuat sesi untuk mata kuliah yang ditugaskan.
- QR absensi dinamis dengan token singkat.
- Validasi GPS radius tetap 500 meter.
- Tombol "Saya Hadir" untuk PJ pembuat sesi, tetap dengan validasi GPS.
- Proteksi CSRF untuk form dan request POST berbasis fetch.

## Konfigurasi Environment

Buat file `.env` dari `.env.example`:

```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=ganti_dengan_string_panjang_random
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
SEED_DEMO_USERS=true
```

Catatan:

- `DATABASE_URL` wajib ada. Project ini memakai PostgreSQL, bukan SQLite.
- `SESSION_SECRET` wajib bernilai kuat, terutama di production.
- `SEED_DEMO_USERS=true` hanya diperlukan jika ingin membuat akun demo otomatis.
- Saat `NODE_ENV=production`, akun demo tidak dibuat otomatis kecuali `SEED_DEMO_USERS=true`.

## Menjalankan Lokal

```bash
npm install
npm run init-db
npm start
```

Buka:

```text
http://localhost:3000
```

## Akun Demo Development

Jika `SEED_DEMO_USERS=true`, sistem membuat akun berikut saat database diinisialisasi:

```text
Admin     : A001 / admin123
Dosen     : D001 / dosen123
Mahasiswa : M001 / mahasiswa123
Kosma     : M002 / kosma123
```

## Skrip Operasional

```bash
npm start
npm run init-db
npm run import-students
npm run reset-lecturer
```

## Deploy Railway

Gunakan Variables berikut di Railway:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
NODE_ENV=production
SESSION_SECRET=string_rahasia_panjang_dan_random
```

Jangan commit file `.env` ke GitHub.

## Alur Setup Awal

1. Login sebagai admin.
2. Buka Manajemen User.
3. Tambah dosen dan mahasiswa.
4. Tetapkan salah satu mahasiswa sebagai kosma.
5. Buka Mata Kuliah.
6. Tambah mata kuliah, dosen pengampu, PJ, dan jadwal.
7. Buka Lokasi Kelas.
8. Simpan titik GPS kelas.
9. Buat Sesi.
10. Tampilkan QR untuk discan mahasiswa.
