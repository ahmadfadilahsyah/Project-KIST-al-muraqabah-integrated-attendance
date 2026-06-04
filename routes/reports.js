const express = require('express');
const db = require('../database');
const { requireAuth, isAdmin, isKosma, isLecturer, isStudent } = require('../utils/access');

const router = express.Router();

async function getReportSubjects(user) {
    if (isAdmin(user) || isKosma(user)) {
        return db.allAsync(
            `SELECT s.id, s.code, s.name, s.semester
             FROM subjects s
             WHERE s.status = 'active'
             ORDER BY s.name`
        );
    }

    if (isLecturer(user)) {
        return db.allAsync(
            `SELECT DISTINCT s.id, s.code, s.name, s.semester
             FROM subjects s
             JOIN subject_lecturers sl ON sl.subject_id = s.id
             WHERE sl.lecturer_nim = ? AND sl.status = 'active' AND s.status = 'active'
             ORDER BY s.name`,
            [user.nim]
        );
    }

    if (isStudent(user)) {
        return db.allAsync(
            `SELECT DISTINCT s.id, s.code, s.name, s.semester
             FROM subjects s
             JOIN subject_pjs sp ON sp.subject_id = s.id
             WHERE sp.student_nim = ? AND s.status = 'active'
             ORDER BY s.name`,
            [user.nim]
        );
    }

    return [];
}

async function getReportData(user, query) {
    const subjects = await getReportSubjects(user);

    if (!subjects || subjects.length === 0) {
        return { hasAccess: false };
    }

    const allowedSubjectIds = subjects.map(subject => String(subject.id));
    const selectedSubjectId = allowedSubjectIds.includes(String(query.subject_id || ''))
        ? String(query.subject_id)
        : String(subjects[0].id);

    const sessions = await db.allAsync(
        `SELECT se.id, se.judul, se.created_at, se.expires_at, se.active, se.subject_id, sub.name AS subject_name
         FROM sessions se
         LEFT JOIN subjects sub ON sub.id = se.subject_id
         WHERE se.subject_id = ?
         ORDER BY se.created_at DESC, se.id DESC`,
        [selectedSubjectId]
    );

    const allowedSessionIds = (sessions || []).map(session => String(session.id));
    const selectedSessionId = allowedSessionIds.includes(String(query.session_id || ''))
        ? String(query.session_id)
        : (allowedSessionIds[0] || null);

    const selectedSubject = subjects.find(subject => String(subject.id) === selectedSubjectId);

    if (!selectedSessionId) {
        return {
            hasAccess: true,
            user,
            subjects,
            sessions: sessions || [],
            selectedSubjectId,
            selectedSessionId: null,
            selectedSubject,
            selectedSession: null,
            rows: [],
            summary: { hadir: 0, izin: 0, sakit: 0, alpha: 0, total: 0 }
        };
    }

    const selectedSession = sessions.find(session => String(session.id) === selectedSessionId);
    const rows = await db.allAsync(
        `SELECT
            u.nim,
            u.nama,
            COALESCE(a.status, 'alpha') AS status,
            a.method,
            a.note,
            a.distance_meters,
            a.gps_accuracy,
            a.created_at
         FROM users u
         LEFT JOIN attendance a ON a.nim = u.nim AND a.session_id = ?
         WHERE u.role = 'student' AND u.status = 'active'
         ORDER BY u.nama ASC, u.nim ASC`,
        [selectedSessionId]
    );

    const normalizedRows = rows || [];
    const hadir = normalizedRows.filter(row => row.status === 'hadir').length;
    const izin = normalizedRows.filter(row => row.status === 'izin').length;
    const sakit = normalizedRows.filter(row => row.status === 'sakit').length;
    const total = normalizedRows.length;

    return {
        hasAccess: true,
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
            izin,
            sakit,
            alpha: normalizedRows.filter(row => row.status === 'alpha').length,
            total
        }
    };
}

function cleanPdfText(value) {
    return String(value ?? '-')
        .replace(/\r?\n/g, ' ')
        .normalize('NFKD')
        .replace(/[^\x20-\x7E]/g, '')
        .trim() || '-';
}

function escapePdfText(value) {
    return cleanPdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function fitText(value, maxLength) {
    const text = cleanPdfText(value);
    return text.length > maxLength ? `${text.slice(0, Math.max(maxLength - 3, 1))}...` : text;
}

function buildAttendancePdf(report) {
    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 40;
    const rowHeight = 20;
    const headerHeight = 22;
    const rowsPerPage = 24;
    const pages = Math.max(Math.ceil(report.rows.length / rowsPerPage), 1);
    const generatedAt = new Date().toLocaleString('id-ID');
    const subjectName = report.selectedSubject ? report.selectedSubject.name : '-';
    const subjectCode = report.selectedSubject && report.selectedSubject.code ? report.selectedSubject.code : '-';
    const sessionTitle = report.selectedSession ? report.selectedSession.judul || 'Tanpa Judul' : '-';
    const printerRole = report.user.is_kosma
        ? 'Kosma'
        : (report.user.role === 'admin' ? 'Admin' : (report.user.role === 'lecturer' ? 'Dosen' : 'PJ'));
    const tableWidth = pageWidth - (margin * 2);

    const drawText = (x, y, size, text, bold = false) =>
        `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET\n`;
    const drawLine = (x1, y1, x2, y2) => `${x1} ${y1} m ${x2} ${y2} l S\n`;
    const drawRect = (x, y, width, height, fill = false) => `${x} ${y} ${width} ${height} re ${fill ? 'f' : 'S'}\n`;

    const pageStreams = [];
    for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
        const start = pageIndex * rowsPerPage;
        const pageRows = report.rows.slice(start, start + rowsPerPage);
        let y = pageHeight - margin;
        let stream = '0.2 w\n';

        stream += drawText(margin, y, 15, 'INFORMATIKA A 2024', true);
        stream += drawText(pageWidth - 192, y, 9, 'Al-Muraqabah Integrated Attendance', false);
        y -= 15;
        stream += drawText(margin, y, 9, 'Laporan kehadiran perkuliahan berbasis QR dan validasi GPS');
        stream += drawText(pageWidth - 132, y, 8, `Halaman ${pageIndex + 1}/${pages}`);
        y -= 12;
        stream += drawLine(margin, y, pageWidth - margin, y);
        y -= 5;
        stream += drawLine(margin, y, pageWidth - margin, y);
        y -= 20;

        stream += drawText(168, y, 13, 'LAPORAN ABSENSI PERKULIAHAN', true);
        y -= 15;
        stream += drawText(184, y, 9, 'Dokumen Administrasi Kehadiran Mahasiswa');
        y -= 22;

        const labelX = margin;
        const valueX = 128;
        const rightLabelX = 342;
        const rightValueX = 430;
        stream += drawText(labelX, y, 9, 'Mata Kuliah');
        stream += drawText(valueX, y, 9, `: ${fitText(subjectName, 35)}`, true);
        stream += drawText(rightLabelX, y, 9, 'Kode');
        stream += drawText(rightValueX, y, 9, `: ${subjectCode}`);
        y -= 14;
        stream += drawText(labelX, y, 9, 'Sesi');
        stream += drawText(valueX, y, 9, `: ${fitText(sessionTitle, 35)}`, true);
        stream += drawText(rightLabelX, y, 9, 'Dicetak');
        stream += drawText(rightValueX, y, 9, `: ${fitText(generatedAt, 17)}`);
        y -= 14;
        stream += drawText(labelX, y, 9, 'Waktu Sesi');
        stream += drawText(valueX, y, 9, `: ${fitText(report.selectedSession ? report.selectedSession.created_at || '-' : '-', 35)}`);
        stream += drawText(rightLabelX, y, 9, 'Pencetak');
        stream += drawText(rightValueX, y, 9, `: ${fitText(report.user.nama || report.user.nim, 17)}`);
        y -= 14;
        stream += drawText(margin, y, 10, `Total: ${report.summary.total}   Hadir: ${report.summary.hadir}   Izin: ${report.summary.izin}   Sakit: ${report.summary.sakit}   Alpha: ${report.summary.alpha}`, true);
        y -= 20;

        const columns = [
            { title: 'No', width: 30, max: 4, align: 'center' },
            { title: 'NIM', width: 78, max: 13 },
            { title: 'Nama', width: 158, max: 25 },
            { title: 'Status', width: 62, max: 11 },
            { title: 'Waktu', width: 92, max: 15 },
            { title: 'Keterangan', width: 95, max: 15 }
        ];
        let x = margin;

        stream += '0.93 g\n';
        stream += drawRect(margin, y - headerHeight, tableWidth, headerHeight, true);
        stream += '0 g\n';
        stream += drawRect(margin, y - headerHeight, tableWidth, headerHeight);
        columns.forEach(column => {
            stream += drawText(x + 4, y - 14, 8.5, column.title, true);
            stream += drawLine(x, y, x, y - headerHeight);
            x += column.width;
        });
        stream += drawLine(margin + tableWidth, y, margin + tableWidth, y - headerHeight);
        y -= headerHeight;

        if (pageRows.length === 0) {
            stream += drawRect(margin, y - rowHeight, tableWidth, rowHeight);
            stream += drawText(margin + 6, y - 13, 9, 'Belum ada data absensi untuk sesi ini.');
            y -= rowHeight;
        } else {
            pageRows.forEach((row, index) => {
                const number = start + index + 1;
                const statusLabels = { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpha: 'Alpha' };
                const status = statusLabels[row.status] || row.status || 'Alpha';
                const values = [
                    number,
                    row.nim,
                    fitText(row.nama, 25),
                    status,
                    fitText(row.created_at || '-', 15),
                    fitText(row.note || '-', 15)
                ];

                let rowX = margin;
                stream += drawRect(margin, y - rowHeight, tableWidth, rowHeight);
                columns.forEach((column, columnIndex) => {
                    stream += drawLine(rowX, y, rowX, y - rowHeight);
                    const value = fitText(values[columnIndex], column.max);
                    const textX = column.align === 'center' ? rowX + 10 : rowX + 4;
                    stream += drawText(textX, y - 13, 8, value);
                    rowX += column.width;
                });
                stream += drawLine(margin + tableWidth, y, margin + tableWidth, y - rowHeight);
                y -= rowHeight;
            });
        }

        if (pageIndex === pages - 1) {
            stream += drawText(360, 94, 9, `${printerRole} yang mencetak,`);
            stream += drawText(360, 42, 9, fitText(report.user.nama || report.user.nim, 28), true);
        }

        stream += drawLine(margin, 24, pageWidth - margin, 24);
        stream += drawText(margin, 12, 7, 'Dokumen ini dicetak dari Al-Muraqabah Integrated Attendance System.');
        stream += drawText(pageWidth - 100, 12, 7, `Hal. ${pageIndex + 1}/${pages}`);
        pageStreams.push(stream);
    }

    const objects = new Map();
    const pageIds = [];
    let nextId = 5;

    pageStreams.forEach(stream => {
        const contentId = nextId;
        const pageId = nextId + 1;
        nextId += 2;
        pageIds.push(pageId);
        objects.set(contentId, `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}endstream`);
        objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    });

    objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
    objects.set(2, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
    objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    objects.set(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    const sortedIds = Array.from(objects.keys()).sort((a, b) => a - b);

    sortedIds.forEach(id => {
        offsets[id] = Buffer.byteLength(pdf, 'ascii');
        pdf += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(pdf, 'ascii');
    const maxId = Math.max(...sortedIds);
    pdf += `xref\n0 ${maxId + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let id = 1; id <= maxId; id += 1) {
        pdf += `${String(offsets[id] || 0).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'ascii');
}

function renderAccessDenied(res) {
    return res.status(403).render('access-denied', {
        pageTitle: 'Akses Laporan Belum Tersedia',
        pageSubtitle: 'Akun Anda belum terhubung ke mata kuliah untuk laporan.'
    });
}

router.get('/attendance-reports', requireAuth, async (req, res) => {
    try {
        const report = await getReportData(req.session.user, req.query);
        if (!report.hasAccess) return renderAccessDenied(res);

        res.render('attendance-reports', {
            pageTitle: 'Laporan Absensi',
            pageSubtitle: 'Cetak rekap kehadiran sesuai akses mata kuliah',
            success: req.query.success || null,
            error: req.query.error || null,
            ...report
        });
    } catch (err) {
        console.error('Attendance report error:', err);
        res.status(500).send('Gagal mengambil laporan absensi.');
    }
});

router.post('/attendance-reports/status', requireAuth, async (req, res) => {
    const user = req.session.user;
    const { subject_id, session_id, nim, status, note } = req.body;
    const allowedStatuses = ['hadir', 'izin', 'sakit', 'alpha'];

    try {
        if (!subject_id || !session_id || !nim || !allowedStatuses.includes(status)) {
            return res.redirect(`/attendance-reports?error=${encodeURIComponent('Data perubahan status tidak lengkap.')}`);
        }

        const report = await getReportData(user, { subject_id, session_id });
        if (!report.hasAccess || !report.selectedSession) {
            return renderAccessDenied(res);
        }

        const student = report.rows.find(row => String(row.nim) === String(nim));
        if (!student) {
            return res.redirect(`/attendance-reports?subject_id=${encodeURIComponent(subject_id)}&session_id=${encodeURIComponent(session_id)}&error=${encodeURIComponent('Mahasiswa tidak ditemukan.')}`);
        }

        const oldAttendance = await db.getAsync(
            'SELECT id, status FROM attendance WHERE nim = ? AND session_id = ?',
            [nim, session_id]
        );
        const oldStatus = oldAttendance ? oldAttendance.status : 'alpha';
        const cleanNote = note ? String(note).trim().slice(0, 250) : null;

        const result = await db.query(
            `INSERT INTO attendance (nim, session_id, status, method, note, updated_by, created_at, updated_at)
             VALUES (?, ?, ?, 'manual_update', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT (nim, session_id)
             DO UPDATE SET status = EXCLUDED.status,
                           note = EXCLUDED.note,
                           method = CASE WHEN attendance.method = 'qr_scan' AND EXCLUDED.status = 'hadir' THEN attendance.method ELSE EXCLUDED.method END,
                           updated_by = EXCLUDED.updated_by,
                           updated_at = CURRENT_TIMESTAMP
             RETURNING id`,
            [nim, session_id, status, cleanNote, user.nim]
        );
        const attendanceId = result.rows && result.rows[0] ? result.rows[0].id : (oldAttendance && oldAttendance.id);

        if (attendanceId && oldStatus !== status) {
            await db.runAsync(
                `INSERT INTO attendance_logs (attendance_id, old_status, new_status, reason, changed_by, created_at)
                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [attendanceId, oldStatus, status, cleanNote || 'Perubahan keterangan absensi', user.nim]
            );
        }

        res.redirect(`/attendance-reports?subject_id=${encodeURIComponent(subject_id)}&session_id=${encodeURIComponent(session_id)}&success=${encodeURIComponent('Status absensi berhasil diperbarui.')}`);
    } catch (err) {
        console.error('Update attendance status error:', err);
        res.redirect(`/attendance-reports?subject_id=${encodeURIComponent(subject_id || '')}&session_id=${encodeURIComponent(session_id || '')}&error=${encodeURIComponent('Gagal memperbarui status absensi.')}`);
    }
});

router.get('/attendance-reports.pdf', requireAuth, async (req, res) => {
    try {
        const report = await getReportData(req.session.user, req.query);
        if (!report.hasAccess) return renderAccessDenied(res);
        if (!report.selectedSession) return res.status(404).send('Belum ada sesi yang dapat dibuat menjadi PDF.');

        const subject = cleanPdfText(report.selectedSubject ? report.selectedSubject.code || report.selectedSubject.name : 'laporan');
        const session = cleanPdfText(report.selectedSession.judul || 'sesi').replace(/\s+/g, '-').toLowerCase();
        const pdf = buildAttendancePdf(report);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="laporan-absensi-${subject}-${session}.pdf"`);
        res.send(pdf);
    } catch (err) {
        console.error('Attendance report PDF error:', err);
        res.status(500).send('Gagal membuat PDF laporan absensi.');
    }
});

module.exports = router;
