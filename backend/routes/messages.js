const express = require('express');
const Joi = require('joi');
const Message = require('../models/Message');
const Room = require('../models/Room');

const router = express.Router();

// Validation schema
const sendMessageSchema = Joi.object({
  content: Joi.string().min(1).max(1000).required(),
  roomId: Joi.string().required(),
  type: Joi.string().valid('text', 'image', 'file').optional(),
  replyTo: Joi.string().optional()
});

// Get messages for a room
router.get('/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Check if user is member of the room
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        message: 'Salle non trouvée'
      });
    }

    const isMember = room.members.some(member => 
      member.user.toString() === req.userId
    );

    if (!isMember) {
      return res.status(403).json({
        message: 'Accès refusé'
      });
    }

    // Get messages
    const messages = await Message.find({ room: roomId })
      .populate('sender', 'username avatar')
      .populate('replyTo')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const totalMessages = await Message.countDocuments({ room: roomId });

    res.json({
      messages: messages.reverse(), // Reverse to get chronological order
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalMessages / limit),
        totalMessages,
        hasMore: skip + messages.length < totalMessages
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des messages:', error);
    res.status(500).json({
      message: 'Erreur interne du serveur'
    });
  }
});

// Send message
router.post('/send', async (req, res) => {
  try {
    const { error } = sendMessageSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        message: 'Données invalides',
        details: error.details[0].message
      });
    }

    const { content, roomId, type, replyTo } = req.body;

    // Check if user is member of the room
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        message: 'Salle non trouvée'
      });
    }

    const isMember = room.members.some(member => 
      member.user.toString() === req.userId
    );

    if (!isMember) {
      return res.status(403).json({
        message: 'Accès refusé'
      });
    }

    // Create message
    const message = new Message({
      content,
      sender: req.userId,
      room: roomId,
      type: type || 'text',
      replyTo: replyTo || null
    });

    await message.save();

    // Populate sender info
    await message.populate('sender', 'username avatar');
    if (replyTo) {
      await message.populate('replyTo');
    }

    // Update room last activity
    room.lastActivity = new Date();
    await room.save();

    res.status(201).json({
      message: 'Message envoyé avec succès',
      data: message
    });

  } catch (error) {
    console.error('Erreur lors de l\'envoi du message:', error);
    res.status(500).json({
      message: 'Erreur interne du serveur'
    });
  }
});

// Mark message as read
router.post('/:messageId/read', async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({
        message: 'Message non trouvé'
      });
    }

    // Check if user already marked as read
    const alreadyRead = message.readBy.some(read => 
      read.user.toString() === req.userId
    );

    if (!alreadyRead) {
      message.readBy.push({
        user: req.userId,
        readAt: new Date()
      });

      await message.save();
    }

    res.json({
      message: 'Message marqué comme lu'
    });

  } catch (error) {
    console.error('Erreur lors du marquage du message:', error);
    res.status(500).json({
      message: 'Erreur interne du serveur'
    });
  }
});

// Edit message
router.put('/:messageId', async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        message: 'Le contenu du message est requis'
      });
    }

    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({
        message: 'Message non trouvé'
      });
    }

    // Check if user is the sender
    if (message.sender.toString() !== req.userId) {
      return res.status(403).json({
        message: 'Vous ne pouvez modifier que vos propres messages'
      });
    }

    // Update message
    message.content = content.trim();
    message.edited = true;
    message.editedAt = new Date();

    await message.save();
    await message.populate('sender', 'username avatar');

    res.json({
      message: 'Message modifié avec succès',
      data: message
    });

  } catch (error) {
    console.error('Erreur lors de la modification du message:', error);
    res.status(500).json({
      message: 'Erreur interne du serveur'
    });
  }
});

// Delete message
router.delete('/:messageId', async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({
        message: 'Message non trouvé'
      });
    }

    // Check if user is the sender
    if (message.sender.toString() !== req.userId) {
      return res.status(403).json({
        message: 'Vous ne pouvez supprimer que vos propres messages'
      });
    }

    await Message.findByIdAndDelete(req.params.messageId);

    res.json({
      message: 'Message supprimé avec succès'
    });

  } catch (error) {
    console.error('Erreur lors de la suppression du message:', error);
    res.status(500).json({
      message: 'Erreur interne du serveur'
    });
  }
});

module.exports = router;