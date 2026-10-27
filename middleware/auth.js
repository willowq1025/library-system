const jwt = require('jsonwebtoken');
require('dotenv').config();

function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ message: '未登录或 token 缺失' });
    }
    const token = header.slice(7);
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'token 无效或已过期' });
    }
}

function authorizeAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: '仅管理员可执行此操作' });
    }
    next();
}

module.exports = { authenticate, authorizeAdmin };