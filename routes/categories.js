const express = require('express');
const pool = require('../db');
const { authenticate, authorizeAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY id DESC');
    res.json(rows);
});

router.post('/', authenticate, authorizeAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: '分类名不能为空' });
    try {
        const [result] = await pool.query(
            'INSERT INTO categories (name) VALUES (?)',
            [name]
        );
        res.status(201).json({ id: result.insertId, name });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: '分类已存在' });
        }
        res.status(500).json({ message: err.message });
    }
});

router.put('/:id', authenticate, authorizeAdmin, async (req, res) => {
    const { name } = req.body;
    const [result] = await pool.query(
        'UPDATE categories SET name = ? WHERE id = ?',
        [name, req.params.id]
    );
    if (result.affectedRows === 0) {
        return res.status(404).json({ message: '分类不存在' });
    }
    res.json({ message: '修改成功' });
});

router.delete('/:id', authenticate, authorizeAdmin, async (req, res) => {
    const [result] = await pool.query('DELETE FROM categories WHERE id = ?', [
        req.params.id
    ]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ message: '分类不存在' });
    }
    res.json({ message: '删除成功' });
});

module.exports = router;