const db = require('./database');
const bcrypt = require('bcrypt');

const NIM = 'D001';
const PASSWORD = 'dosen123';
const NAMA = 'Dosen Al Muraqabah';
const EMAIL = 'dosen@example.com';

async function main() {
    await db.ready;

    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    const user = await db.getAsync('SELECT nim, nama, email, role FROM users WHERE nim = ?', [NIM]);

    if (user) {
        console.log('Akun dosen ditemukan:');
        console.log(`NIM: ${user.nim}`);
        console.log(`Nama: ${user.nama}`);
        console.log(`Email: ${user.email || '-'}`);
        console.log(`Role: ${user.role}`);

        await db.runAsync(
            `UPDATE users
             SET password = ?, nama = ?, email = ?, role = 'lecturer', status = 'active',
                 must_change_password = 1, updated_at = CURRENT_TIMESTAMP
             WHERE nim = ?`,
            [hashedPassword, NAMA, EMAIL, NIM]
        );
        console.log('Password dan email dosen telah direset.');
        return;
    }

    await db.runAsync(
        `INSERT INTO users (nim, nama, email, password, role, status, must_change_password, created_at)
         VALUES (?, ?, ?, ?, 'lecturer', 'active', 1, CURRENT_TIMESTAMP)`,
        [NIM, NAMA, EMAIL, hashedPassword]
    );
    console.log('Akun dosen berhasil dibuat.');
}

main()
    .then(() => {
        console.log(`Silakan login dengan NIM: ${NIM}, Password: ${PASSWORD}`);
    })
    .catch((err) => {
        console.error('Reset akun dosen gagal:', err.message);
        process.exitCode = 1;
    })
    .finally(() => db.close());
