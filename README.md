# Al-Muraqabah Integrated Attendance

Sistem absensi perkuliahan berbasis QR Code Dinamis dan Validasi GPS yang dikembangkan untuk mendukung transparansi, kedisiplinan, dan integritas kehadiran mahasiswa.

## 📖 Tentang Project

Al-Muraqabah Integrated Attendance merupakan platform absensi digital yang mengintegrasikan:

- Dynamic QR Code Attendance
- GPS Location Verification
- Role Based Access Control (RBAC)
- Session Management
- Subject Management
- Attendance Reporting
- Academic Class Portal

Nama **Al-Muraqabah** diambil dari konsep dalam Islam yang berarti kesadaran bahwa setiap tindakan selalu diawasi oleh Allah SWT, sehingga mendorong kejujuran dan tanggung jawab dalam proses absensi.

---

## 🚀 Fitur Utama

### Authentication & Security

- Login menggunakan NIM
- Password Hashing (bcrypt)
- Session Authentication
- CSRF Protection
- Secure Headers
- Role-Based Authorization

### Attendance System

- Dynamic QR Code
- QR Token Validation
- GPS Verification
- Creator Presence Verification
- Real-Time Attendance Recording

### Academic Management

- Manajemen Mata Kuliah
- Manajemen Dosen Pengampu
- Penjadwalan Perkuliahan
- Pengelolaan PJ Mata Kuliah

### User Management

- Admin Management
- Lecturer Management
- Student Management
- Kosma Management

### GPS Verification

- Penentuan Titik Lokasi Kelas
- Radius Validasi Kehadiran
- Anti-Absen Jarak Jauh

---

## 👥 Role System

### Admin

- Mengelola seluruh sistem
- CRUD User
- CRUD Mata Kuliah
- Pengaturan GPS
- Monitoring Absensi

### Lecturer

- Membuat sesi perkuliahan
- Menampilkan QR Code
- Monitoring kehadiran mahasiswa

### Kosma

- Membantu pengelolaan kelas
- Mengatur mata kuliah tertentu
- Mengelola data kelas

### Student

- Melakukan absensi
- Melihat riwayat kehadiran

---

## 🏗️ Tech Stack

### Backend

- Node.js
- Express.js

### Frontend

- EJS
- Bootstrap
- JavaScript

### Database

- PostgreSQL

### Authentication & Security

- bcrypt
- express-session
- CSRF Protection

### Deployment

- Railway

---

## 📂 Struktur Project

```text
.
├── routes/
│   ├── auth.js
│   ├── attendance.js
│   ├── session.js
│   ├── subjects.js
│   ├── admin.js
│   └── gps.js
│
├── views/
│   ├── auth/
│   ├── attendance/
│   ├── subjects/
│   ├── admin/
│   └── partials/
│
├── public/
│   ├── css/
│   ├── js/
│   └── images/
│
├── database.js
├── app.js
├── package.json
└── README.md
```

---

## ⚙️ Instalasi Lokal

### 1. Clone Repository

```bash
git clone https://github.com/ahmadfadilahsyah/Project-KIST-al-muraqabah-integrated-attendance.git

cd Project-KIST-al-muraqabah-integrated-attendance
```

### 2. Install Dependency

```bash
npm install
```

### 3. Konfigurasi Environment

Buat file `.env`

```env
DATABASE_URL=postgresql://username:password@host:5432/database

SESSION_SECRET=your-secret-key

NODE_ENV=development
```

### 4. Jalankan Server

```bash
npm start
```

atau

```bash
node app.js
```

---

## ☁️ Deploy ke Railway

### Hubungkan Repository

1. Login Railway
2. New Project
3. Deploy from GitHub Repo
4. Pilih repository project

### Tambahkan PostgreSQL

1. New Service
2. PostgreSQL
3. Railway akan membuat DATABASE_URL otomatis

### Environment Variables

```env
SESSION_SECRET=your-secret-key
NODE_ENV=production
```

### Generate Domain

```text
Settings
→ Networking
→ Generate Domain
```

---

## 🔒 Keamanan

Project ini mengimplementasikan:

- Password Hashing menggunakan bcrypt
- Session Authentication
- CSRF Protection
- Role-Based Access Control
- Secure HTTP Headers
- GPS Validation
- Dynamic QR Validation

---

## 🎯 Tujuan Pengembangan

Project ini dikembangkan sebagai:

- Sistem Absensi Informatika A 2024
- Digitalisasi Presensi Perkuliahan
- Implementasi QR Code Attendance
- Implementasi GPS Verification
- Media Pembelajaran Fullstack Development

---

## 📌 Roadmap

- [ ] Export Excel Absensi
- [ ] Export PDF Laporan
- [ ] Dashboard Statistik Kehadiran
- [ ] Multi Kelas
- [ ] Multi Program Studi
- [ ] Progressive Web App (PWA)
- [ ] Notifikasi Telegram
- [ ] Face Verification

---

## 👨‍💻 Developer

**Ahmad Fadilah Syah**

Program Studi Informatika

UIN Siber Syekh Nurjati Cirebon

---

## 📄 License

Project ini dikembangkan untuk kebutuhan akademik dan pengembangan sistem informasi pendidikan.
