function isAuth(req, res, next) {
    if (!req.session.user) {
        req.session.redirectAfterLogin = req.originalUrl;
        return res.redirect('/login');
    }

    const role = req.session.user.role;

    if (
        (role === 'student' || role === 'mahasiswa') &&
        !req.session.user.email &&
        req.originalUrl !== '/profile' &&
        !req.originalUrl.startsWith('/profile/')
    ) {
        req.session.redirectAfterProfile = req.originalUrl;
        return res.redirect('/profile');
    }

    next();
}

module.exports = isAuth;
