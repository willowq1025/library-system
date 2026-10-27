const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
require('dotenv').config();

const router = express.Router();

// 注册
router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: '用户名和密码不能为空' });
    }
    try {
        const [exists] = await pool.query(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );
        if (exists.length > 0) {
            return res.status(409).json({ message: '用户名已存在' });
        }
        const hash = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
            [username, hash, 'user']
        );
        res.status(201).json({ message: '注册成功' });
    } catch (err) {
        res.status(500).json({ message: '注册失败', error: err.message });
    }
});

// 登录
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: '用户名和密码不能为空' });
    }
    try {
        const [rows] = await pool.query(
            'SELECT id, username, password_hash, role, is_banned FROM users WHERE username = ?',
            [username]
        );
        if (rows.length === 0) {
            return res.status(401).json({ message: '用户名或密码错误' });
        }
        const user = rows[0];
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
            return res.status(401).json({ message: '用户名或密码错误' });
        }
        if (user.is_banned) {
            return res.status(403).json({ message: '账号已被封禁，请联系管理员' });
        }
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );
        res.json({
            message: '登录成功',
            token,
            user: { id: user.id, username: user.username, role: user.role }
        });
    } catch (err) {
        res.status(500).json({ message: '登录失败', error: err.message });
    }
});

module.exports = router;