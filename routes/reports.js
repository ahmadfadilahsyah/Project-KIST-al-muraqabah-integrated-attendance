const express = require('express');
const db = require('../database');
const { requireAuth, isAdmin, isKosma, isLecturer, isStudent } = require('../utils/access');

const router = express.Router();

function getReportSubjects(user, callback) {
    if (isAdmin(user) || isKosma(user)) {
        return db.all(
            `SELECT s.id, s.code, s.name, s.semester
             FROM subjects s
             WHERE s.status = 'active'
             ORDER BY s.name`,
            [],
            callback
        );
    }

    if (isLecturer(user)) {
        return db.all(
            `SELECT DISTINCT s.id, s.code, s.name, s.semester
             FROM subjects s
             JOIN subject_lecturers sl ON sl.subject_id = s.id
             WHERE sl.lecturer_nim = ? AND sl.status = 'active' AND s.status = 'active'
             ORDER BY s.name`,
            [user.nim],
            callback
        );
    }

    if (isStudent(user)) {
        return db.all(
            `SELECT DISTINCT s.id, s.code, s.name, s.semester
             FROM subjects s
             JOIN subject_pjs sp ON sp.subject_id = s.id
             WHERE sp.student_nim = ? AND s.status = 'active'
             ORDER BY s.name`,
            [user.nim],
            callback
        );
    }

    callback(null, []);
}

function renderReports(req, res, data) {
    res.render('attendance-reports', {
        pageTitle: 'Laporan Absensi',
        pageSubtitle: 'Cetak rekap kehadiran sesuai akses mata kuliah',
        ...data
    });
}

router.get('/attendance-reports', requireAuth, (req, res) => {
    const user = req.session.user;

    getReportSubjects(user, (err, subjects) => {
        if (err) {
            console.error('Report subjects error:', err);
            return res.status(500).send('Gagal mengambil akses laporan.');
        }

        if (!subjects || subjects.length === 0) {
            return res.status(403).render('access-denied', {
                pageTitle: 'Akses Laporan Belum Tersedia',
                pageSubtitle: 'Akun Anda belum terhubung ke mata kuliah untuk laporan.'
            });
        }

        const allowedSubjectIds = subjects.map(subject => String(subject.id));
        const selectedSubjectId = allowedSubjectIds.includes(String(req.query.subject_id || ''))
            ? String(req.query.subject_id)
            : String(subjects[0].id);

        db.all(
            `SELECT se.id, se.judul, se.created_at, se.expires_at, se.active, sub.name AS subject_name
             FROM sessions se
             LEFT JOIN subjects sub ON sub.id = se.subject_id
             WHERE se.subject_id = ?
             ORDER BY se.created_at DESC, se.id DESC`,
            [selectedSubjectId],
            (err, sessions) => {
                if (err) {
                    console.error('Report sessions error:', err);
                    return res.status(500).send('Gagal mengambil sesi laporan.');
                }

                const allowedSessionIds = (sessions || []).map(session => String(session.id));
                const selectedSessionId = allowedSessionIds.includes(String(req.query.session_id || ''))
                    ? String(req.query.session_id)
                    : (allowedSessionIds[0] || null);

                if (!selectedSessionId) {
                    return renderReports(req, res, {
                        user,
                        subjects,
                        sessions: sessions || [],
                        selectedSubjectId,
                        selectedSessionId: null,
                        selectedSubject: subjects.find(subject => String(subject.id) === selectedSubjectId),
                        selectedSession: null,
                        rows: [],
                        summary: { hadir: 0, alpha: 0, total: 0 }
                    });
                }

                const selectedSession = sessions.find(session => String(session.id) === selectedSessionId);
                const selectedSubject = subjects.find(subject => String(subject.id) === selectedSubjectId);

                db.all(
                    `SELECT
                        u.nim,
                        u.nama,
                        COALESCE(a.status, 'alpha') AS status,
                        a.method,
                        a.distance_meters,
                        a.gps_accuracy,
                        a.created_at
                     FROM users u
                     LEFT JOIN attendance a ON a.nim = u.nim AND a.session_id = ?
                     WHERE u.role = 'student' AND u.status = 'active'
                     ORDER BY u.nama ASC, u.nim ASC`,
                    [selectedSessionId],
                    (err, rows) => {
                        if (err) {
                            console.error('Report rows error:', err);
                            return res.status(500).send('Gagal mengambil data absensi.');
                        }

                        const normalizedRows = rows || [];
                        const hadir = normalizedRows.filter(row => row.status === 'hadir').length;
                        const total = normalizedRows.length;

                        renderReports(req, res, {
                            user,
                            subjects,
                            sessions: sessions || [],
                            selectedSubjectId,
                            selectedSessionId,
                            selectedSubject,
                            selectedSession,
                            rows: normalizedRows,
                            summary: {
                                hadir,
                                alpha: Math.max(total - hadir, 0),
                                total
                            }
                        });
                    }
                );
            }
        );
    });
});

module.exports = router;
