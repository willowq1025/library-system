const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRouter = require('./routes/auth');
const categoriesRouter = require('./routes/categories');
const booksRouter = require('./routes/books');
const reviewsRouter = require('./routes/reviews');
const doubanRouter = require('./routes/douban');
const usersRouter = require('./routes/users');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use('/api/auth', authRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/books', booksRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/douban', doubanRouter);
app.use('/api/users', usersRouter);

app.get('/', (req, res) => res.json({ message: 'Library API running' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});