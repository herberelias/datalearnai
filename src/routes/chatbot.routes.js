const express = require('express');
const router = express.Router();
const chatbotController = require('../controllers/chatbot.controller');
const authMiddleware = require('../middleware/auth.middleware');

// POST /api/chatbot/consulta - Consulta a Gemini + MySQL
router.post('/consulta', authMiddleware, chatbotController.consultarBD);

// GET /api/chatbot/history - Historial de conversaciones
router.get('/history', authMiddleware, chatbotController.obtenerHistorial);

// Refresh manual de schema
router.post('/admin/refresh-schema', authMiddleware, async (req, res) => {
    try {
        const empresaId = req.user.id; // Asumiendo que el ID de usuario es suficiente por ahora, o ajustar según auth
        const dbConfig = {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME // Usando DB_NAME del .env original
        };

        // Necesitamos importar schemaCache aquí o exponerlo desde el controlador
        // Para simplificar, delegaremos al controlador
        await chatbotController.refreshSchema(req, res, dbConfig);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Estadísticas de caché
router.get('/admin/cache-stats', authMiddleware, chatbotController.getCacheStats);

// Invalidar caché de queries
router.post('/admin/invalidate-query-cache', authMiddleware, chatbotController.invalidateQueryCache);

module.exports = router;
