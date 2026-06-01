# Al-Muraqabah PostgreSQL UI/UX Fix

Paket ini memperbaiki:

- Logout desktop dan mobile.
- Buat sesi untuk Admin, Kosma, Dosen, dan PJ.
- Set lokasi GPS kelas dari halaman Buat Sesi dan halaman Lokasi Kelas.
- QR dinamis PostgreSQL-ready.
- Scan QR mobile otomatis mengutamakan kamera belakang.
- Validasi GPS untuk mahasiswa dan tombol Saya Hadir PJ.
- Tampilan Mata Kuliah, Kelola PJ, dan Kelola Dosen dibuat lebih rapi.
- Tema UI diselaraskan dengan konsep mata kuliah: **Dari Iman ke Aksi**.

## Cara pakai lokal

1. Extract ZIP.
2. Pastikan file `.env` ada dan berisi:

```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=ganti_dengan_string_panjang_random
DATABASE_URL=postgresql://postgres:PASSWORD@HOST.proxy.rlwy.net:PORT/railway
```

3. Jalankan:

```cmd
npm install
npm start
```

## Login demo

```text
Admin  : A001 / admin123
Dosen  : D001 / dosen123
Mhs    : M001 / mahasiswa123
Kosma  : M002 / kosma123
```

## Catatan deploy Railway

Di Railway Web Service gunakan Variables:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
NODE_ENV=production
SESSION_SECRET=string_rahasia_panjang
```

Jangan commit `.env` ke GitHub.
