class MLDetectorService {

    detectIntention(pregunta) {
        const preguntaLower = pregunta.toLowerCase();

        const keywordsPrediction = [
            'venderemos', 'venderé', 'proyecta', 'proyección', 'predice', 'predicción',
            'estima', 'estimación', 'próximo', 'futuro', 'será', 'pasará',
            'will sell', 'forecast', 'predict', 'estimate', 'next month', 'next year'
        ];

        const keywordsSegmentation = [
            'segmenta', 'segmentación', 'rfm', 'clientes frecuentes', 'mejores clientes',
            'segment', 'segmentation', 'best customers', 'top customers'
        ];

        const keywordsChurn = [
            'churn', 'abandonar', 'dejarán', 'riesgo', 'inactivos',
            'will leave', 'at risk', 'inactive'
        ];

        if (keywordsPrediction.some(kw => preguntaLower.includes(kw))) return 'prediction';
        if (keywordsSegmentation.some(kw => preguntaLower.includes(kw))) return 'segmentation';
        if (keywordsChurn.some(kw => preguntaLower.includes(kw))) return 'churn';

        return 'sql';
    }

    extractParameters(pregunta, intention) {
        const params = {};

        if (intention === 'prediction') {
            const mesesMatch = pregunta.match(/(\d+)\s*(mes|meses|month|months)/i);
            params.meses = mesesMatch ? parseInt(mesesMatch[1]) : 1;

            const productoMatch = pregunta.match(/de\s+([a-záéíóúñ\s]+?)(?:\s+en|\s+para|$)/i);
            if (productoMatch) params.producto = productoMatch[1].trim();
        }

        return params;
    }
}

module.exports = new MLDetectorService();
