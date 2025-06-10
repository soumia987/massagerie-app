const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Le nom de la salle est requis'],
    trim: true,
    maxlength: [50, 'Le nom ne peut pas dépasser 50 caractères']
  },
  code: {
    type: String,
    required: [true, 'Le code de la salle est requis'],
    unique: true,
    uppercase: true,
    minlength: [4, 'Le code doit contenir au moins 4 caractères'],
    maxlength: [8, 'Le code ne peut pas dépasser 8 caractères']
  },
  description: {
    type: String,
    maxlength: [200, 'La description ne peut pas dépasser 200 caractères']
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member'
    }
  }],
  maxMembers: {
    type: Number,
    default: 50,
    min: 2,
    max: 100
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
roomSchema.index({ code: 1 });
roomSchema.index({ creator: 1 });
roomSchema.index({ 'members.user': 1 });

// Update last activity on save
roomSchema.pre('save', function(next) {
  this.lastActivity = new Date();
  next();
});

module.exports = mongoose.model('Room', roomSchema);