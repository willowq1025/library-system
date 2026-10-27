const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { authenticate, authorizeAdmin } = require('../middleware/auth');

const router = express.Router();

// 管理员：获取用户列表
router.get('/', authenticate, authorizeAdmin, async (req, res) => {
    const [rows] = await pool.query('SELECT id, username, role, is_banned, created_at FROM users ORDER BY id DESC');
    res.json(rows);
});

// 更新个人资料（头像链接和签名）
router.put('/profile', authenticate, async (req, res) => {
    const { avatar_url, bio } = req.body;
    await pool.query('UPDATE users SET avatar_url = ?, bio = ? WHERE id = ?', [avatar_url || '', bio || '', req.user.id]);
    res.json({ message: '资料更新成功' });
});

// 修改密码
router.put('/password', authenticate, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const ok = await bcrypt.compare(oldPassword, rows[0].password_hash);
    if (!ok) return res.status(400).json({ message: '旧密码错误' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    res.json({ message: '密码修改成功' });
});

// 获取我的收藏
router.get('/me/collections', authenticate, async (req, res) => {
    const [rows] = await pool.query(
        `SELECT b.* FROM collections c JOIN books b ON c.book_id = b.id WHERE c.user_id = ? ORDER BY c.created_at DESC`,
        [req.user.id]
    );
    res.json(rows);
});

// 获取我的所有评价
router.get('/me/reviews', authenticate, async (req, res) => {
    const [rows] = await pool.query(
        `SELECT r.*, b.title AS book_title
         FROM reviews r JOIN books b ON r.book_id = b.id
         WHERE r.user_id = ? ORDER BY r.created_at DESC`,
        [req.user.id]
    );
    res.json(rows);
});

// 获取指定用户的公开信息及书评
router.get('/:id/public', authenticate, async (req, res) => {
    const [users] = await pool.query('SELECT id, username, avatar_url, bio, created_at FROM users WHERE id = ?', [req.params.id]);
    if (users.length === 0) return res.status(404).json({ message: '用户不存在' });

    const [reviews] = await pool.query(
        `SELECT r.id, r.rating, r.content, r.created_at, b.title AS book_title, b.id AS book_id
         FROM reviews r JOIN books b ON r.book_id = b.id
         WHERE r.user_id = ? AND r.parent_id IS NULL
         ORDER BY r.created_at DESC`,
        [req.params.id]
    );

    res.json({ user: users[0], reviews });
});

// 管理员：封禁、解封
router.put('/:id/ban', authenticate, authorizeAdmin, async (req, res) => {
    const { banned } = req.body;
    await pool.query('UPDATE users SET is_banned = ? WHERE id = ?', [banned ? 1 : 0, req.params.id]);
    res.json({ message: banned ? '已封禁' : '已解封' });
});

module.exports = router;