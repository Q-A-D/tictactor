const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('client'));

const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

// Подключение к MongoDB с принудительной синхронизацией индексов
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tictactoe')
  .then(async () => {
    console.log('✅ MongoDB подключена');
    
    // Принудительная синхронизация индексов после подключения
    const User = require('./models/User');
    await User.syncIndexes();
    console.log('✅ Индексы User синхронизированы');
  })
  .catch(err => console.error('❌ MongoDB ошибка:', err));

// Игровые комнаты
const rooms = new Map();

// Подключение сокетов
require('./sockets/gameSocket')(io, rooms);

// API маршруты
app.use('/api/auth', require('./routes/auth'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Сервер запущен на http://localhost:${PORT}`);
});