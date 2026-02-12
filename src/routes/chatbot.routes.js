const express = require('express');
const router = express.Router();
const chatbotController = require('../controllers/chatbot.controller');
const authMiddleware = require('../middleware/auth.middleware');

// POST /api/chatbot/consulta - Consulta a Gemini + MySQL
router.post('/consulta', authMiddleware, chatbotController.consultarBD);

// GET /api/chatbot/history - Historial de conversaciones
router.get('/history', authMiddleware, chatbotController.obtenerHistorial);

module.exports = router;
