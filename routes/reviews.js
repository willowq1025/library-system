const express = require('express');
const pool = require('../db');
const { authenticate, authorizeAdmin } = require('../middleware/auth');

const router = express.Router();

// 管理员获取全部评论
router.get('/all', authenticate, authorizeAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT r.id, r.rating, r.content, r.created_at,
              u.username, b.title AS book_title
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN books b ON r.book_id = b.id
       ORDER BY r.created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 获取某本书的讨论
router.get('/book/:bookId', authenticate, async (req, res) => {
    const [rows] = await pool.query(
        `SELECT r.*, u.username, u.avatar_url 
     FROM reviews r JOIN users u ON r.user_id = u.id
     WHERE r.book_id = ? ORDER BY r.created_at ASC`,
        [req.params.bookId]
    );

    const mainReviews = [];
    const replyMap = new Map();

    rows.forEach(r => {
        if (!r.parent_id) {
            r.replies = [];
            mainReviews.push(r);
            replyMap.set(r.id, r);
        }
    });

    rows.forEach(r => {
        if (r.parent_id && replyMap.has(r.parent_id)) {
            replyMap.get(r.parent_id).replies.push(r);
        }
    });

    res.json(mainReviews.reverse());
});

// 发表评价
router.post('/', authenticate, async (req, res) => {
    const { book_id, rating, content, parent_id } = req.body;

    if (!parent_id && (!rating || rating < 1 || rating > 5)) {
        return res.status(400).json({ message: '作为楼主发表评价必须打分 (1-5)' });
    }
    if (!content || !content.trim()) return res.status(400).json({ message: '内容不能为空' });

    if (!parent_id) {
        const [exist] = await pool.query('SELECT id FROM reviews WHERE book_id = ? AND user_id = ? AND parent_id IS NULL', [book_id, req.user.id]);
        if (exist.length > 0) {
            await pool.query('UPDATE reviews SET rating = ?, content = ?, created_at = NOW() WHERE id = ?', [rating, content, exist[0].id]);
            return res.json({ message: '评价已更新' });
        }
    }

    await pool.query(
        'INSERT INTO reviews (book_id, user_id, rating, content, parent_id) VALUES (?, ?, ?, ?, ?)',
        [book_id, req.user.id, parent_id ? null : rating, content, parent_id || null]
    );
    res.status(201).json({ message: '发表成功' });
});

// 删除评价
router.delete('/:id', authenticate, async (req, res) => {
    const [rows] = await pool.query('SELECT user_id FROM reviews WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: '不存在' });
    if (req.user.role !== 'admin' && rows[0].user_id !== req.user.id) {
        return res.status(403).json({ message: '只能删除自己的内容' });
    }

    await pool.query('DELETE FROM reviews WHERE id = ?', [req.params.id]);
    res.json({ message: '删除成功' });
});

module.exports = router;