function isAuth(req, res, next) {
    if (!req.session.user) {
        req.session.redirectAfterLogin = req.originalUrl;
        return res.redirect('/login');
    }

    if (
        req.session.user.role === 'student' &&
        !req.session.user.email &&
        req.originalUrl !== '/profile'
    ) {
        req.session.redirectAfterProfile = req.originalUrl;
        return res.redirect('/profile');
    }

    next();
}

module.exports = isAuth;