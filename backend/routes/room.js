const express = require('express');
const Joi = require('joi');
const Room = require('../models/Room');
const User = require('../models/User');

const router = express.Router();

// Validation schemas
const createRoomSchema = Joi.object({
  name: Joi.string().min(1).max(50).required(),
  code: Joi.string().min(4).max(8).required(),
  description: Joi.string().max(200).optional(),
  maxMembers: Joi.number().min(2).max(100).optional(),
  isPrivate: Joi.boolean().optional()
});

const joinRoomSchema = Joi.object({
  code: Joi.string().min(4).max(8).required()
});

// Generate random room code
const generateRoomCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Create room
router.post('/create', async (req, res) => {
  try {
    const { error } = createRoomSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        message: 'Données invalides',
        details: error.details[0].message
      });
    }

    let { name, code, description, maxMembers, isPrivate } = req.body;

    // Generate code if not provided
    if (!code) {
      code = generateRoomCode();
      
      // Ensure code is unique
      while (await Room.findOne({ code })) {
        code = generateRoomCode();
      }
    }

    // Check if code already exists
    const existingRoom = await Room.findOne({ code: code.toUpperCase() });
    if (existingRoom) {
      return res.status(409).json({
        message: 'Ce code de salle existe déjà'
      });
    }

    // Create room
    const room = new Room({
      name,
      code: code.toUpperCase(),
      description,
      creator: req.userId,
      maxMembers: maxMembers || 50,
      isPrivate: isPrivate || false,
      members: [{
        user: req.userId,
        role: 'admin'
      }]
    });

    await room.save();

    // Add room to user's rooms
    await User.findByIdAndUpdate(req.userId, {
      $push: { rooms: room._id }
    });

    // Populate creator and members
    await room.populate('creator', 'username email avatar');
    await room.populate('members.user', 'username email avatar');

    res.status(201).json({
      message: 'Salle créée avec succès',
      room
    });

  } catch (error) {
    console.error('Erreur lors de la création de la salle:', error);
    res.status(500).json({
      message: 'Erreur interne du serveur'
    });
  }
});

// Join room
router.post('/join', async (req, res) => {
  try {
    const { error } = joinRoomSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        message: 'Données invalides',
        details: error.details[0].message
      });
    }

    const { code } = req.body;

    // Find room
    const room = await Room.findOne({ code: code.toUpperCase() })
      .populate('creator', 'username email avatar')
      .populate('members.user', 'username email avatar');

    if (!room) {
      return res.status(404).json({
        message: 'Salle non trouvée'
      });
    }

    // Check if user is already a member
    const isMember = room.members.some(member => 
      member.user._id.toString() === req.userId
    );

    if (isMember) {
      return res.status(409).json({
        message: 'Vous êtes déjà membre de cette salle'
      });
    }

    // Check room capacity
    if (room.members.length >= room.maxMembers) {
      return res.status(409).json({
        message: 'La salle est pleine'
      });
    }

    // Add user to room
    room.members.push({
      user: req.userId,
      role: 'member'
    });

    await room.save();

    // Add room to user's rooms
    await User.findByIdAndUpdate(req.userId, {
      $push: { rooms: room._id }
    });

    // Populate the new member
    await room.populate('members.user', 'username email avatar');

    res.json({
      message: 'Vous avez rejoint la salle avec succès',
      room
    });

  } catch (error) {
    console.error('Erreur lors de l\'adhésion à la salle:', error);
    res.status(500).json({
      message: 'Erreur interne du serveur'
    });
  }
});

// Get user's rooms
router.get('/my-rooms', async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate({
      path: 'rooms',
      populate: {
        path: 'members.user creator',
        select: 'username email avatar isOnline'
      }
    });

    if (!user) {
      return res.status(404).json({
        message: 'Utilisateur non trouvé'
      });
    }

    res.json({
      rooms: user.rooms
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des salles:', error);
    res.status(500).json({
      message: 'Erreur interne du serveur'
    });
  }
});

// Get room details
router.get('/:roomId', async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId)
      .populate('creator', 'username email avatar')
      .populate('members.user', 'username email avatar isOnline');

    if (!room) {
      return res.status(404).json({
        message: 'Salle non trouvée'
      });
    }

    // Check if user is a member
    const isMember = room.members.some(member => 
      member.user._id.toString() === req.userId
    );

    if (!isMember) {
      return res.status(403).json({
        message: 'Accès refusé'
      });
    }

    res.json({ room });

  } catch (error) {
    console.error('Erreur lors de la récupération de la salle:', error);
    res.status(500).json({
      message: 'Erreur interne du serveur'
    });
  }
});

// Leave room
router.post('/:roomId/leave', async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);

    if (!room) {
      return res.status(404).json({
        message: 'Salle non trouvée'
      });
    }

    // Remove user from room members
    room.members = room.members.filter(member => 
      member.user.toString() !== req.userId
    );

    await room.save();

    // Remove room from user's rooms
    await User.findByIdAndUpdate(req.userId, {
      $pull: { rooms: room._id }
    });

    res.json({
      message: 'Vous avez quitté la salle avec succès'
    });

  } catch (error) {
    console.error('Erreur lors de la sortie de la salle:', error);
    res.status(500).json({
      message: 'Erreur interne du serveur'
    });
  }
});

module.exports = router;