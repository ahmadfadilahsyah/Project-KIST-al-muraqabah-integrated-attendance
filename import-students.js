const db = require('./database');
const bcrypt = require('bcrypt');

// Data mahasiswa dari daftar Anda
const students = [
  { nim: "2488010069", nama: "AHMAD ALY" },
  { nim: "2488010070", nama: "ASHFAHANI HASYIM" },
  { nim: "2488010071", nama: "MUHAMMAD RIZKY SAPUTRA" },
  { nim: "2488010072", nama: "MIFA MIFTAHUL FALAAH" },
  { nim: "2488010073", nama: "FARHAN MOHAMAD YOUSEF" },
  { nim: "2488010076", nama: "ABDULLAH ASSEGAF" },
  { nim: "2488010001", nama: "NAJWA RAMADHAN" },
  { nim: "2488010011", nama: "TANU HASYIM" },
  { nim: "2488010012", nama: "FAIZ ALFARESI" },
  { nim: "2488010019", nama: "ALVIN PERDIANSYAH DWI PUTRA" },
  { nim: "2488010024", nama: "NISA NAILA" },
  { nim: "2488010029", nama: "AHMAD FADILAH SYAH" },
  { nim: "2488010031", nama: "MOHAMMAD SOFYAN NURSEHA" },
  { nim: "2488010038", nama: "HAIKAL AZKAL AZKIYA" },
  { nim: "2488010039", nama: "NAZWA HUMMAIMAH SHIDDQIN" },
  { nim: "2488010040", nama: "RIZKY FADILAH" },
  { nim: "2488010042", nama: "SALWA AYUDIA PUTRI" },
  { nim: "2488010047", nama: "FAIZ MUZAKI IRSYAD" },
  { nim: "2488010048", nama: "DZAKY MUHAMMAD NAFIS" },
  { nim: "2488010060", nama: "HANIFA EKA FAUZIAH" },
  { nim: "2488010064", nama: "MOHAMMAD SATRIA DINILHAQ" },
  { nim: "2488010067", nama: "ABDULLAH FATTAH" },
  { nim: "2488010068", nama: "SALLAM" }
];

const DEFAULT_PASSWORD = 'mahasiswa123';
const hashedPassword = bcrypt.hashSync(DEFAULT_PASSWORD, 10);

let success = 0;
let failed = 0;

db.serialize(() => {
  students.forEach(student => {
    db.run(`INSERT OR IGNORE INTO users (nim, nama, email, password, role) VALUES (?, ?, ?, ?, ?)`,
      [student.nim, student.nama, null, hashedPassword, 'student'],
      function(err) {
        if (err) {
          console.error(`Gagal menambah ${student.nim}:`, err.message);
          failed++;
        } else {
          if (this.changes > 0) {
            console.log(`✅ ${student.nim} - ${student.nama} berhasil ditambahkan`);
            success++;
          } else {
            console.log(`⚠️ ${student.nim} - ${student.nama} sudah ada, dilewati`);
          }
        }
      }
    );
  });
});

db.close(() => {
  console.log(`\n======= Selesai =======`);
  console.log(`Berhasil: ${success} akun`);
  console.log(`Gagal/duplikat: ${failed}`);
  console.log(`Password default untuk semua mahasiswa: ${DEFAULT_PASSWORD}`);
  console.log(`Email masih kosong. Mahasiswa bisa login lalu mengisi email di halaman Profil.`);
});