const express = require('express');
const pool = require('../db');
const { authenticate, authorizeAdmin } = require('../middleware/auth');

const router = express.Router();

// 查询图书（支持搜索、分类过滤、推荐排序）
router.get('/', authenticate, async (req, res) => {
    const { category_id, keyword, sort } = req.query;
    let sql = `
        SELECT b.*,
               GROUP_CONCAT(DISTINCT c.id) AS category_ids,
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

    if (sort === 'recommended') {
        sql += ' ORDER BY collect_count DESC, b.id DESC ';
    } else {
        sql += ' ORDER BY b.id DESC ';
    }

    try {
        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 新增图书（管理员）
router.post('/', authenticate, authorizeAdmin, async (req, res) => {
    const { title, author, publisher, isbn, cover_url, rating, summary, category_ids } = req.body;
    if (!title) return res.status(400).json({ message: '书名不能为空' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [result] = await conn.query(
            `INSERT INTO books (title, author, publisher, isbn, cover_url, rating, summary, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`,
            [title, author || '', publisher || '', isbn || '', cover_url || '', rating || null, summary || '']
        );
        const bookId = result.insertId;
        if (Array.isArray(category_ids) && category_ids.length > 0) {
            const values = category_ids.map(cid => [bookId, cid]);
            await conn.query('INSERT INTO book_categories (book_id, category_id) VALUES ?', [values]);
        }
        await conn.commit();
        res.status(201).json({ id: bookId, title });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ message: err.message });
    } finally {
        conn.release();
    }
});

// 批量删除图书（管理员）
router.post('/batch-delete', authenticate, authorizeAdmin, async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: '未选择任何图书' });
    try {
        await pool.query('DELETE FROM books WHERE id IN (?)', [ids]);
        res.json({ message: `成功删除 ${ids.length} 本图书` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

//给某个分类批量分配图书（管理员）
router.post('/assign-category', authenticate, authorizeAdmin, async (req, res) => {
    const { category_id, book_ids } = req.body;
    if (!category_id) return res.status(400).json({ message: '分类 ID 缺失' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM book_categories WHERE category_id = ?', [category_id]);
        if (Array.isArray(book_ids) && book_ids.length > 0) {
            const values = book_ids.map(id => [id, category_id]);
            await conn.query('INSERT INTO book_categories (book_id, category_id) VALUES ?', [values]);
        }
        await conn.commit();
        res.json({ message: '分类分配更新成功' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ message: err.message });
    } finally {
        conn.release();
    }
});

// 批量导入 JSON（管理员）
router.post('/import', authenticate, authorizeAdmin, async (req, res) => {
    const { books } = req.body;
    if (!Array.isArray(books) || books.length === 0) return res.status(400).json({ message: '数组为空' });
    let inserted = 0, skipped = 0;
    for (const b of books) {
        if (!b.title) { skipped++; continue; }
        const [exist] = await pool.query('SELECT id FROM books WHERE title = ? AND author = ? LIMIT 1', [b.title, b.author || '']);
        if (exist.length > 0) { skipped++; continue; }
        await pool.query(
            `INSERT INTO books (title, author, publisher, isbn, cover_url, rating, summary, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`,
            [b.title, b.author || '', b.publisher || '', b.isbn || '', b.cover_url || '', b.rating || null, b.summary || '']
        );
        inserted++;
    }
    res.json({ message: '导入完成', total: books.length, inserted, skipped });
});

// 修改图书（管理员）
router.put('/:id', authenticate, authorizeAdmin, async (req, res) => {
    const bookId = req.params.id;
    const { title, author, publisher, isbn, cover_url, rating, summary, category_ids } = req.body;

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(
            `UPDATE books SET title = ?, author = ?, publisher = ?, isbn = ?, cover_url = ?, rating = ?, summary = ? WHERE id = ?`,
            [title, author || '', publisher || '', isbn || '', cover_url || '', rating || null, summary || '', bookId]
        );
        await conn.query('DELETE FROM book_categories WHERE book_id = ?', [bookId]);
        if (Array.isArray(category_ids) && category_ids.length > 0) {
            const values = category_ids.map(cid => [bookId, cid]);
            await conn.query('INSERT INTO book_categories (book_id, category_id) VALUES ?', [values]);
        }
        await conn.commit();
        res.json({ message: '修改成功' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ message: err.message });
    } finally {
        conn.release();
    }
});

// 删除单本图书（管理员）
router.delete('/:id', authenticate, authorizeAdmin, async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM books WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: '图书不存在' });
        res.json({ message: '删除成功' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
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