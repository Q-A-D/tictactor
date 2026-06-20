const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Заполните все поля' });
    }
    
    // Проверяем существование ДО сохранения (надежнее чем полагаться на индекс)
    const existing = await User.findOne({ username: username.trim() });
    if (existing) {
      console.log(`[WARN] Попытка регистрации существующего пользователя: ${username}`);
      return res.status(400).json({ error: 'Имя занято' });
    }
    
    const user = new User({ username: username.trim(), password });
    await user.save();
    console.log(`[OK] Зарегистрирован новый пользователь: ${username}`);
    res.json({ success: true });
  } catch (err) {
    // Детальная обработка ошибок Mongoose
    if (err.name === 'MongoServerError' && err.code === 11000) {
      console.error('[DB ERROR] Дубликат индекса:', err.keyValue);
      return res.status(400).json({ error: 'Имя занято (индекс)' });
    }
    if (err.name === 'ValidationError') {
      console.error('[VALIDATION ERROR]', err.message);
      return res.status(400).json({ error: Object.values(err.errors)[0].message });
    }
    console.error('[CRITICAL ERROR]', err);
    res.status(500).json({ error: 'Ошибка сервера: ' + err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: 'Неверные данные' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret');
    res.json({ 
      success: true, 
      token, 
      user: { id: user._id, username: user.username, wins: user.wins, losses: user.losses }
    });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Нет токена' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(404).json({ error: 'Не найден' });
    res.json(user);
  } catch (err) {
    res.status(401).json({ error: 'Невалидный токен' });
  }
});

module.exports = router;