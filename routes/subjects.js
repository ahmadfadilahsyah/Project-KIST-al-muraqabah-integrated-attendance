const express = require('express');
const db = require('../database');
const { requireAuth, requireAdminOrKosma, isAdmin, isKosma } = require('../utils/access');

const router = express.Router();

async function getSubjectFormData(subjectId = null) {
    const lecturers = await db.allAsync(
        `SELECT nim, nama FROM users WHERE role = 'lecturer' AND status = 'active' ORDER BY nama`
    );

    const students = await db.allAsync(
        `SELECT nim, nama FROM users WHERE role = 'student' AND status = 'active' ORDER BY nama`
    );

    let selectedLecturer = null;
    let selectedPJ = null;
    let schedule = {};

    if (subjectId) {
        selectedLecturer = await db.getAsync(
            `SELECT lecturer_nim FROM subject_lecturers WHERE subject_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`,
            [subjectId]
        );

        selectedPJ = await db.getAsync(
            `SELECT student_nim FROM subject_pjs WHERE subject_id = ? ORDER BY id DESC LIMIT 1`,
            [subjectId]
        );

        schedule = await db.getAsync(
            `SELECT * FROM schedules WHERE subject_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`,
            [subjectId]
        ) || {};
    }

    return {
        lecturers,
        students,
        selectedLecturer: selectedLecturer ? selectedLecturer.lecturer_nim : '',
        selectedPJ: selectedPJ ? selectedPJ.student_nim : '',
        schedule
    };
}

async function saveSubjectRelations(subjectId, body, userNim) {
    const {
        lecturer_nim,
        pj_nim,
        academic_year,
        schedule_semester,
        day,
        start_time,
        end_time,
        room
    } = body;

    await db.runAsync(`UPDATE subject_lecturers SET status = 'inactive' WHERE subject_id = ?`, [subjectId]);

    if (lecturer_nim) {
        await db.runAsync(
            `INSERT INTO subject_lecturers (subject_id, lecturer_nim, academic_year, semester, status, created_at)
             VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
             ON CONFLICT (subject_id, lecturer_nim, academic_year, semester) DO NOTHING`,
            [subjectId, lecturer_nim, academic_year || '2024/2025', schedule_semester || null]
        );
    }

    await db.runAsync(`DELETE FROM subject_pjs WHERE subject_id = ?`, [subjectId]);

    if (pj_nim) {
        await db.runAsync(
            `INSERT INTO subject_pjs (subject_id, student_nim, assigned_by, created_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT (subject_id, student_nim) DO NOTHING`,
            [subjectId, pj_nim, userNim]
        );
    }

    await db.runAsync(`UPDATE schedules SET status = 'inactive' WHERE subject_id = ?`, [subjectId]);

    if (day || start_time || end_time || room) {
        await db.runAsync(
            `INSERT INTO schedules (subject_id, day, start_time, end_time, room, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
            [subjectId, day || '-', start_time || null, end_time || null, room || null]
        );
    }
}

function listSubjects(callback) {
    db.all(
        `SELECT 
            s.*,
            STRING_AGG(DISTINCT l.nama, ', ') AS lecturers,
            STRING_AGG(DISTINCT p.nama, ', ') AS pjs,
            STRING_AGG(
                DISTINCT CONCAT(sc.day, ' ', COALESCE(sc.start_time, ''), '-', COALESCE(sc.end_time, ''), ' ', COALESCE(sc.room, '')),
                ', '
            ) AS schedule_info
         FROM subjects s
         LEFT JOIN subject_lecturers sl ON sl.subject_id = s.id AND sl.status = 'active'
         LEFT JOIN users l ON l.nim = sl.lecturer_nim
         LEFT JOIN subject_pjs sp ON sp.subject_id = s.id
         LEFT JOIN users p ON p.nim = sp.student_nim
         LEFT JOIN schedules sc ON sc.subject_id = s.id AND sc.status = 'active'
         GROUP BY s.id
         ORDER BY COALESCE(s.semester, 0), s.name`,
        [],
        callback
    );
}

router.get('/subjects', requireAuth, (req, res) => {
    const user = req.session.user;
    const canManage = isAdmin(user) || isKosma(user);

    listSubjects((err, subjects) => {
        if (err) {
            console.error('Subjects list error:', err);
            return res.status(500).send('Gagal mengambil data mata kuliah.');
        }

        res.render('subjects', {
            pageTitle: 'Mata Kuliah',
            pageSubtitle: 'Daftar mata kuliah, dosen, PJ, dan jadwal Informatika A 2024',
            subjects,
            canManage,
            error: null,
            success: req.query.success || null
        });
    });
});

router.get('/subjects/create', requireAdminOrKosma, async (req, res) => {
    try {
        const formData = await getSubjectFormData();
        res.render('subject-form', {
            pageTitle: 'Tambah Mata Kuliah',
            pageSubtitle: 'Lengkapi mata kuliah, dosen, PJ, dan jadwal perkuliahan',
            subject: {},
            action: '/subjects/create',
            error: null,
            ...formData
        });
    } catch (err) {
        console.error('Subject create form error:', err);
        res.status(500).send('Gagal membuka form mata kuliah.');
    }
});

router.post('/subjects/create', requireAdminOrKosma, async (req, res) => {
    try {
        const { code, name, semester, status } = req.body;
        if (!name) {
            const formData = await getSubjectFormData();
            return res.render('subject-form', {
                pageTitle: 'Tambah Mata Kuliah',
                pageSubtitle: 'Lengkapi mata kuliah, dosen, PJ, dan jadwal perkuliahan',
                subject: req.body,
                action: '/subjects/create',
                error: 'Nama mata kuliah wajib diisi.',
                ...formData
            });
        }

        const result = await db.query(
            `INSERT INTO subjects (code, name, semester, status, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             RETURNING id`,
            [code || null, name, semester || null, status || 'active', req.session.user.nim]
        );

        await saveSubjectRelations(result.rows[0].id, req.body, req.session.user.nim);
        res.redirect('/subjects?success=Mata kuliah berhasil ditambahkan.');
    } catch (err) {
        console.error('Subject create error:', err);
        res.status(500).send('Gagal menambah mata kuliah.');
    }
});

router.get('/subjects/:id/edit', requireAdminOrKosma, async (req, res) => {
    try {
        const subject = await db.getAsync(`SELECT * FROM subjects WHERE id = ?`, [req.params.id]);
        if (!subject) return res.status(404).send('Mata kuliah tidak ditemukan.');
        const formData = await getSubjectFormData(subject.id);
        res.render('subject-form', {
            pageTitle: 'Edit Mata Kuliah',
            pageSubtitle: 'Perbarui mata kuliah, dosen, PJ, dan jadwal',
            subject,
            action: `/subjects/${subject.id}/edit`,
            error: null,
            ...formData
        });
    } catch (err) {
        console.error('Subject edit form error:', err);
        res.status(500).send('Gagal membuka form edit mata kuliah.');
    }
});

router.post('/subjects/:id/edit', requireAdminOrKosma, async (req, res) => {
    try {
        const { code, name, semester, status } = req.body;
        if (!name) return res.status(400).send('Nama mata kuliah wajib diisi.');

        await db.runAsync(
            `UPDATE subjects SET code = ?, name = ?, semester = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [code || null, name, semester || null, status || 'active', req.params.id]
        );

        await saveSubjectRelations(req.params.id, req.body, req.session.user.nim);
        res.redirect('/subjects?success=Mata kuliah berhasil diperbarui.');
    } catch (err) {
        console.error('Subject update error:', err);
        res.status(500).send('Gagal mengubah mata kuliah.');
    }
});

router.post('/subjects/:id/delete', requireAdminOrKosma, async (req, res) => {
    try {
        const subject = await db.getAsync(`SELECT id FROM subjects WHERE id = ?`, [req.params.id]);
        if (!subject) return res.redirect('/subjects?error=Mata kuliah tidak ditemukan.');

        await db.runAsync(`DELETE FROM subjects WHERE id = ?`, [req.params.id]);
        res.redirect('/subjects?success=Mata kuliah berhasil dihapus.');
    } catch (err) {
        console.error('Subject delete error:', err);
        res.redirect('/subjects?error=Gagal menghapus mata kuliah.');
    }
});

router.get('/subjects/:id/manage', requireAdminOrKosma, async (req, res) => {
    try {
        const subject = await db.getAsync(`SELECT * FROM subjects WHERE id = ?`, [req.params.id]);
        if (!subject) return res.status(404).send('Mata kuliah tidak ditemukan.');

        const [students, lecturers, pjs, subjectLecturers] = await Promise.all([
            db.allAsync(`SELECT nim, nama FROM users WHERE role = 'student' AND status = 'active' ORDER BY nama`),
            db.allAsync(`SELECT nim, nama FROM users WHERE role = 'lecturer' AND status = 'active' ORDER BY nama`),
            db.allAsync(`SELECT sp.*, u.nama FROM subject_pjs sp JOIN users u ON u.nim = sp.student_nim WHERE sp.subject_id = ? ORDER BY u.nama`, [subject.id]),
            db.allAsync(`SELECT sl.*, u.nama FROM subject_lecturers sl JOIN users u ON u.nim = sl.lecturer_nim WHERE sl.subject_id = ? AND sl.status = 'active' ORDER BY u.nama`, [subject.id])
        ]);

        res.render('subject-manage', {
            pageTitle: 'Kelola PJ & Dosen',
            pageSubtitle: subject.name,
            subject,
            students,
            lecturers,
            pjs,
            subjectLecturers,
            error: null,
            success: req.query.success || null,
            canManageLecturer: isAdmin(req.session.user) || isKosma(req.session.user)
        });
    } catch (err) {
        console.error('Subject manage error:', err);
        res.status(500).send('Gagal membuka halaman kelola mata kuliah.');
    }
});

router.post('/subjects/:id/pj/add', requireAdminOrKosma, async (req, res) => {
    try {
        const { student_nim } = req.body;
        if (!student_nim) return res.redirect(`/subjects/${req.params.id}/manage`);
        await db.runAsync(
            `INSERT INTO subject_pjs (subject_id, student_nim, assigned_by, created_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT (subject_id, student_nim) DO NOTHING`,
            [req.params.id, student_nim, req.session.user.nim]
        );
        res.redirect(`/subjects/${req.params.id}/manage?success=PJ berhasil ditambahkan.`);
    } catch (err) {
        console.error('Add PJ error:', err);
        res.status(500).send('Gagal menambah PJ.');
    }
});

router.post('/subjects/:id/pj/:pjId/delete', requireAdminOrKosma, async (req, res) => {
    try {
        await db.runAsync(`DELETE FROM subject_pjs WHERE id = ? AND subject_id = ?`, [req.params.pjId, req.params.id]);
        res.redirect(`/subjects/${req.params.id}/manage?success=PJ berhasil dicabut.`);
    } catch (err) {
        console.error('Delete PJ error:', err);
        res.status(500).send('Gagal menghapus PJ.');
    }
});

router.post('/subjects/:id/lecturer/add', requireAdminOrKosma, async (req, res) => {
    try {
        const { lecturer_nim, academic_year, semester } = req.body;
        if (!lecturer_nim) return res.redirect(`/subjects/${req.params.id}/manage`);
        await db.runAsync(
            `INSERT INTO subject_lecturers (subject_id, lecturer_nim, academic_year, semester, status, created_at)
             VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
             ON CONFLICT (subject_id, lecturer_nim, academic_year, semester) DO NOTHING`,
            [req.params.id, lecturer_nim, academic_year || '2024/2025', semester || null]
        );
        res.redirect(`/subjects/${req.params.id}/manage?success=Dosen pengampu berhasil ditambahkan.`);
    } catch (err) {
        console.error('Add lecturer error:', err);
        res.status(500).send('Gagal menambah dosen pengampu.');
    }
});

router.post('/subjects/:id/lecturer/:lecturerId/delete', requireAdminOrKosma, async (req, res) => {
    try {
        await db.runAsync(`UPDATE subject_lecturers SET status = 'inactive' WHERE id = ? AND subject_id = ?`, [req.params.lecturerId, req.params.id]);
        res.redirect(`/subjects/${req.params.id}/manage?success=Dosen pengampu berhasil dicabut.`);
    } catch (err) {
        console.error('Delete lecturer error:', err);
        res.status(500).send('Gagal mencabut dosen pengampu.');
    }
});

module.exports = router;
