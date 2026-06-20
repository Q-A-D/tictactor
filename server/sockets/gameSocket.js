const User = require('../models/User');

module.exports = (io, rooms) => {
  io.on('connection', (socket) => {
    socket.on('createRoom', ({ playerName, userId }, callback) => {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      rooms.set(roomId, {
        players: [{ id: socket.id, name: playerName, userId, symbol: 'X' }],
        board: Array(9).fill(null),
        currentPlayer: 'X',
        winner: null
      });
      socket.join(roomId);
      callback({ success: true, roomId });
    });

    socket.on('joinRoom', ({ roomId, playerName, userId }, callback) => {
      const room = rooms.get(roomId);
      if (!room) return callback({ error: 'Комната не найдена' });
      if (room.players.length >= 2) return callback({ error: 'Комната полная' });

      room.players.push({ id: socket.id, name: playerName, userId, symbol: 'O' });
      socket.join(roomId);
      io.to(roomId).emit('gameStart', { players: room.players, currentPlayer: room.currentPlayer });
      callback({ success: true });
    });

    socket.on('makeMove', ({ roomId, cellIndex }) => {
      const room = rooms.get(roomId);
      if (!room || room.board[cellIndex] || room.winner || room.players.length < 2) return;

      const player = room.players.find(p => p.id === socket.id);
      if (!player || player.symbol !== room.currentPlayer) return;

      room.board[cellIndex] = player.symbol;
      
      const winner = checkWinner(room.board);
      if (winner) {
        room.winner = winner;
        saveMatchResult(room, winner);
        io.to(roomId).emit('gameOver', { winner });
      } else if (room.board.every(c => c !== null)) {
        room.winner = 'draw';
        saveMatchResult(room, 'draw');
        io.to(roomId).emit('gameOver', { winner: 'draw' });
      } else {
        room.currentPlayer = room.currentPlayer === 'X' ? 'O' : 'X';
        io.to(roomId).emit('moveMade', { cellIndex, symbol: player.symbol, currentPlayer: room.currentPlayer });
      }
    });

    socket.on('disconnect', () => {
      rooms.forEach((room, roomId) => {
        const idx = room.players.findIndex(p => p.id === socket.id);
        if (idx !== -1) {
          room.players.splice(idx, 1);
          io.to(roomId).emit('playerLeft');
          if (room.players.length === 0) rooms.delete(roomId);
        }
      });
    });
  });
};

async function saveMatchResult(room, result) {
  try {
    if (result === 'draw') {
      for (const p of room.players) {
        if (p.userId) await User.findByIdAndUpdate(p.userId, { $inc: { losses: 0 } }); // Можно добавить draws позже
      }
    } else {
      const winner = room.players.find(p => p.symbol === result);
      const loser = room.players.find(p => p.symbol !== result);
      if (winner?.userId) await User.findByIdAndUpdate(winner.userId, { $inc: { wins: 1 } });
      if (loser?.userId) await User.findByIdAndUpdate(loser.userId, { $inc: { losses: 1 } });
    }
  } catch (err) {
    console.error('Ошибка сохранения матча:', err);
  }
}

function checkWinner(board) {
  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (let [a,b,c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}