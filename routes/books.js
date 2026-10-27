const express = require('express');
const pool = require('../db');
const { authenticate, authorizeAdmin } = require('../middleware/auth');

const router = express.Router();

// 查询图书
router.get('/', authenticate, async (req, res) => {
    const { category_id, keyword, sort } = req.query;
    let sql = `
        SELECT b.*,
               GROUP_CONCAT(DISTINCT c.name SEPARATOR ' / ') AS category_names,
               (SELECT COUNT(*) FROM collections WHERE book_id = b.id) AS collect_count
        FROM books b
                 LEFT JOIN book_categories bc ON b.id = bc.book_id
                 LEFT JOIN categories c ON bc.category_id = c.id
        WHERE 1=1
    `;
    const params = [];
    if (category_id) { sql += ` AND b.id IN (SELECT book_id FROM book_categories WHERE category_id = ?)`; params.push(category_id); }
    if (keyword) { sql += ' AND (b.title LIKE ? OR b.author LIKE ? OR b.publisher LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }

    sql += ' GROUP BY b.id ';

    // 推荐排序：按收藏数降序
    if (sort === 'recommended') {
        sql += ' ORDER BY collect_count DESC, b.id DESC ';
    } else {
        sql += ' ORDER BY b.id DESC ';
    }

    const [rows] = await pool.query(sql, params);
    res.json(rows);
});

// 收藏/取消收藏
router.post('/:id/collect', authenticate, async (req, res) => {
    const bookId = req.params.id;
    const [exist] = await pool.query('SELECT * FROM collections WHERE user_id = ? AND book_id = ?', [req.user.id, bookId]);

    if (exist.length > 0) {
        await pool.query('DELETE FROM collections WHERE user_id = ? AND book_id = ?', [req.user.id, bookId]);
        res.json({ message: '已取消收藏', collected: false });
    } else {
        await pool.query('INSERT INTO collections (user_id, book_id) VALUES (?, ?)', [req.user.id, bookId]);
        res.json({ message: '收藏成功', collected: true });
    }
});

// 检查当前用户是否收藏了此书
router.get('/:id/collected', authenticate, async (req, res) => {
    const [rows] = await pool.query('SELECT 1 FROM collections WHERE user_id = ? AND book_id = ?', [req.user.id, req.params.id]);
    res.json({ collected: rows.length > 0 });
});

module.exports = router;