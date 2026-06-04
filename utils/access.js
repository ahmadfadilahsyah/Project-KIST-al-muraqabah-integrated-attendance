function normalizeRole(role) {
    if (role === 'dosen' || role === 'teacher') return 'lecturer';
    if (role === 'mahasiswa') return 'student';
    return role || 'student';
}

function isAdmin(user) {
    return user && normalizeRole(user.role) === 'admin';
}

function isLecturer(user) {
    return user && normalizeRole(user.role) === 'lecturer';
}

function isStudent(user) {
    return user && normalizeRole(user.role) === 'student';
}

function isKosma(user) {
    return user && Number(user.is_kosma || 0) === 1;
}

function canManageUsers(user) {
    return isAdmin(user) || isKosma(user);
}

function canManageSubjects(user) {
    return isAdmin(user) || isKosma(user);
}

function canManageGps(user) {
    return isAdmin(user) || isKosma(user) || isLecturer(user);
}

function canCreateAnySession(user) {
    return isAdmin(user) || isKosma(user) || isLecturer(user);
}

function canPrintAttendanceReports(user) {
    return isAdmin(user) || isKosma(user) || isLecturer(user);
}

function requireAuth(req, res, next) {
    if (!req.session.user) {
        req.session.redirectAfterLogin = req.originalUrl;
        return res.redirect('/login');
    }
    next();
}

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (!isAdmin(req.session.user)) return res.status(403).send('Hanya admin yang dapat mengakses halaman ini.');
        next();
    });
}

function requireAdminOrKosma(req, res, next) {
    requireAuth(req, res, () => {
        if (!isAdmin(req.session.user) && !isKosma(req.session.user)) {
            return res.status(403).send('Hanya admin atau kosma yang dapat mengakses halaman ini.');
        }
        next();
    });
}

module.exports = {
    normalizeRole,
    isAdmin,
    isLecturer,
    isStudent,
    isKosma,
    canManageUsers,
    canManageSubjects,
    canManageGps,
    canCreateAnySession,
    canPrintAttendanceReports,
    requireAuth,
    requireAdmin,
    requireAdminOrKosma
};
