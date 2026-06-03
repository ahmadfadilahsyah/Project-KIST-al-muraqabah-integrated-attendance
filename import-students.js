const db = require('./database');
const { hashPassword } = require('./utils/password');

const students = [
    { nim: '2488010069', nama: 'AHMAD ALY' },
    { nim: '2488010070', nama: 'ASHFAHANI HASYIM' },
    { nim: '2488010071', nama: 'MUHAMMAD RIZKY SAPUTRA' },
    { nim: '2488010072', nama: 'MIFA MIFTAHUL FALAAH' },
    { nim: '2488010073', nama: 'FARHAN MOHAMAD YOUSEF' },
    { nim: '2488010076', nama: 'ABDULLAH ASSEGAF' },
    { nim: '2488010001', nama: 'NAJWA RAMADHAN' },
    { nim: '2488010011', nama: 'TANU HASYIM' },
    { nim: '2488010012', nama: 'FAIZ ALFARESI' },
    { nim: '2488010019', nama: 'ALVIN PERDIANSYAH DWI PUTRA' },
    { nim: '2488010024', nama: 'NISA NAILA' },
    { nim: '2488010029', nama: 'AHMAD FADILAH SYAH' },
    { nim: '2488010031', nama: 'MOHAMMAD SOFYAN NURSEHA' },
    { nim: '2488010038', nama: 'HAIKAL AZKAL AZKIYA' },
    { nim: '2488010039', nama: 'NAZWA HUMMAIMAH SHIDDQIN' },
    { nim: '2488010040', nama: 'RIZKY FADILAH' },
    { nim: '2488010042', nama: 'SALWA AYUDIA PUTRI' },
    { nim: '2488010047', nama: 'FAIZ MUZAKI IRSYAD' },
    { nim: '2488010048', nama: 'DZAKY MUHAMMAD NAFIS' },
    { nim: '2488010060', nama: 'HANIFA EKA FAUZIAH' },
    { nim: '2488010064', nama: 'MOHAMMAD SATRIA DINILHAQ' },
    { nim: '2488010067', nama: 'ABDULLAH FATTAH' },
    { nim: '2488010068', nama: 'SALLAM' }
];

const DEFAULT_PASSWORD = 'Mahasiswa123!';

async function main() {
    await db.ready;

    const hashedPassword = await hashPassword(DEFAULT_PASSWORD);
    let inserted = 0;
    let skipped = 0;

    for (const student of students) {
        const result = await db.runAsync(
            `INSERT INTO users (nim, nama, email, password, role, status, must_change_password, created_at)
             VALUES (?, ?, ?, ?, 'student', 'active', 1, CURRENT_TIMESTAMP)
             ON CONFLICT (nim) DO NOTHING`,
            [student.nim, student.nama, null, hashedPassword]
        );

        if (result.rowCount > 0) {
            inserted += 1;
            console.log(`Ditambahkan: ${student.nim} - ${student.nama}`);
        } else {
            skipped += 1;
            console.log(`Dilewati: ${student.nim} - ${student.nama} sudah ada`);
        }
    }

    console.log('\n======= Selesai =======');
    console.log(`Berhasil ditambahkan: ${inserted} akun`);
    console.log(`Dilewati karena sudah ada: ${skipped} akun`);
    console.log(`Password default: ${DEFAULT_PASSWORD}`);
}

main()
    .catch((err) => {
        console.error('Import mahasiswa gagal:', err.message);
        process.exitCode = 1;
    })
    .finally(() => db.close());
