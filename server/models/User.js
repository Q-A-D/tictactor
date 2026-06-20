const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
  username: { 
    type: String, 
    unique: true, 
    required: [true, 'Имя обязательно'],
    trim: true 
  },
  password: { 
    type: String, 
    required: [true, 'Пароль обязателен'] 
  },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 }
});

// Асинхронный хук БЕЗ next() - Mongoose сам обрабатывает промис
UserSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

module.exports = mongoose.model('User', UserSchema);