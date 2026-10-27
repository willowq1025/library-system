const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const pool = require('../db');
const { authenticate, authorizeAdmin } = require('../middleware/auth');

const router = express.Router();

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Referer': 'https://book.douban.com/'
    // 'Cookie': 'bid=xxx; dbcl2=xxx; ...'
};

router.post('/import-top100', authenticate, authorizeAdmin, async (req, res) => {
    try {
        let allBooks = [];

        for (const start of [0, 25, 50, 75]) {
            const url = `https://book.douban.com/top250?start=${start}`;
            console.log(`正在抓取: ${url}`);

            const { data } = await axios.get(url, { headers: HEADERS, timeout: 10000 });
            const $ = cheerio.load(data);

            const items = $('.item');
            console.log(`第 ${start/25 + 1} 页解析到 ${items.length} 本书`);

            items.each((index, element) => {
                const title = $(element).find('.pl2 a').attr('title')?.trim() || '';
                const ratingText = $(element).find('.star .rating_nums').text().trim();
                const coverUrl = $(element).find('.nbg img').attr('src') || '';

                let summary = $(element).find('p.quote').text().trim();
                if (!summary) summary = $(element).find('.inq').text().trim();
                summary = summary.replace(/\s+/g, ' ');

                //作者/出版社信息
                let infoText = $(element).find('p.pl').first().text().trim();
                infoText = infoText.replace(/\s+/g, ' ');

                const parts = infoText.split('/').map(s => s.trim()).filter(s => s !== '');
                let author = parts.length >= 1 ? parts[0] : '';
                let publisher = '';
                if (parts.length >= 2) {
                    let pubCandidate = parts.find(p => p.includes('出版社') || p.includes('出版') || p.includes('书局') || p.includes('公司'));
                    if (!pubCandidate) pubCandidate = parts.length >= 3 ? parts[2] : parts[1];
                    publisher = pubCandidate;
                }

                if (title) {
                    allBooks.push({
                        title,
                        author: author.substring(0, 100),
                        publisher: publisher.substring(0, 100),
                        rating: ratingText ? parseFloat(ratingText) : null,
                        cover_url: coverUrl,
                        summary
                    });
                }
            });

            await new Promise(r => setTimeout(r, Math.random() * 1000 + 1000));
        }

        if (allBooks.length === 0) {
            return res.status(500).json({ message: '解析出 0 本书，可能是被豆瓣反爬拦截，请检查网络或添加 Cookie。' });
        }

        let inserted = 0, skipped = 0, updated = 0;

        for (const book of allBooks) {
            const [existing] = await pool.query(
                'SELECT id, author, publisher, summary FROM books WHERE title = ? LIMIT 1',
                [book.title]
            );

            if (existing.length > 0) {
                const oldBook = existing[0];
                let updateFields = [];
                let updateParams = [];

                if ((!oldBook.author || oldBook.author === '') && book.author) {
                    updateFields.push('author = ?'); updateParams.push(book.author);
                }
                if ((!oldBook.publisher || oldBook.publisher === '') && book.publisher) {
                    updateFields.push('publisher = ?'); updateParams.push(book.publisher);
                }
                if ((!oldBook.summary || oldBook.summary === '') && book.summary) {
                    updateFields.push('summary = ?'); updateParams.push(book.summary);
                }

                if (updateFields.length > 0) {
                    updateParams.push(oldBook.id);
                    await pool.query(`UPDATE books SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);
                    updated++;
                } else {
                    skipped++;
                }
                continue;
            }

            await pool.query(
                `INSERT INTO books (title, author, publisher, cover_url, rating, summary, source)
                 VALUES (?, ?, ?, ?, ?, ?, 'douban')`,
                [book.title, book.author, book.publisher, book.cover_url, book.rating, book.summary]
            );
            inserted++;
        }

        res.json({
            message: '导入完成',
            total: allBooks.length,
            inserted,
            updated,
            skipped
        });
    } catch (err) {
        console.error('报错:', err.message);
        res.status(500).json({ message: '请求失败: ' + err.message });
    }
});

module.exports = router;