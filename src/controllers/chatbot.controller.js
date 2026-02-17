/**
 * Controlador para el Chatbot con IA (Gemini Flash) - VERSIÓN GENÉRICA + ML
 * v2.0 - Auto-discovery, ML y Caching
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const pool = require('../config/database');
const SchemaCacheService = require('../services/schemaCache.service');
const queryCache = require('../services/queryCache.service');
const mlDetector = require('../services/mlDetector.service');
const PredictionService = require('../services/prediction.service');
const SegmentationService = require('../services/segmentation.service');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Inicializar servicios
const schemaCache = new SchemaCacheService(pool);
const predictionService = new PredictionService(pool);
const segmentationService = new SegmentationService(pool);

const consultarBD = async (req, res) => {
    console.time('ChatbotExecution');
    try {
        const { pregunta, history = [] } = req.body;
        const empresaId = req.user ? req.user.id.toString() : 'default'; // Usar ID de usuario como empresa_id por ahora

        // ============================================
        // 🔒 CAPA 1: VALIDACIONES DE SEGURIDAD
        // ============================================

        if (!pregunta || typeof pregunta !== 'string') {
            return res.status(400).json({ success: false, error: 'Pregunta inválida' });
        }

        if (pregunta.length > 500) {
            return res.status(400).json({ success: false, error: 'Pregunta demasiado larga (máximo 500 caracteres)' });
        }

        const patronesSospechosos = [
            /;\s*drop/i, /;\s*delete/i, /;\s*truncate/i, /union\s+select/i,
            /into\s+outfile/i, /load_file/i, /information_schema/i
        ];

        if (patronesSospechosos.some(patron => patron.test(pregunta))) {
            console.warn('⚠️ Pregunta sospechosa detectada:', { ip: req.ip, pregunta });
            return res.status(400).json({ success: false, error: 'Consulta no permitida' });
        }

        console.log(`🤖 [Genérico] Usuario (${req.ip}): "${pregunta}"`);

        // ============================================
        // 🔍 CAPA 2: ESQUEMA DINÁMICO
        // ============================================

        const dbConfig = {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        };

        const schema = await schemaCache.getSchema(empresaId, dbConfig);

        // ============================================
        // 🧠 CAPA 3: DETECCIÓN DE INTENCIÓN ML
        // ============================================

        const intention = mlDetector.detectIntention(pregunta);
        console.log(`🎯 Intención detectada: ${intention}`);

        if (intention === 'prediction') {
            const params = mlDetector.extractParameters(pregunta, intention);
            const resultado = await predictionService.predictSales(empresaId, schema, params);

            if (!resultado.success) {
                return res.status(200).json({
                    success: true,
                    explicacion: `No pude generar una predicción: ${resultado.error}. ¿Te gustaría ver datos históricos en su lugar?`,
                    tipo: 'ml_error'
                });
            }

            const explicacion = `Según el análisis predictivo de los últimos ${resultado.datos_historicos} periodos, se estima que ${params.producto ? `para ${params.producto}` : 'en total'} venderás aproximadamente $${resultado.prediccion.toLocaleString()} en los próximos ${params.meses} mes(es). El rango de confianza está entre $${resultado.intervalo_confianza.min.toLocaleString()} y $${resultado.intervalo_confianza.max.toLocaleString()} (confianza del modelo: ${(resultado.confianza * 100).toFixed(1)}%).`;

            const responseML = {
                success: true,
                explicacion: explicacion,
                resultados: [resultado],
                tipo: 'prediction',
                modelo: resultado.modelo
            };

            await guardarHistorial(req.user.id, pregunta, explicacion);
            return res.status(200).json(responseML);
        }

        if (intention === 'segmentation') {
            const resultado = await segmentationService.segmentRFM(empresaId, schema);

            if (!resultado.success) {
                return res.status(200).json({
                    success: true,
                    explicacion: `No pude realizar la segmentación: ${resultado.error}`,
                    tipo: 'ml_error'
                });
            }

            const explicacion = `He segmentado ${resultado.total_clientes} clientes usando análisis RFM (Recencia, Frecuencia, Valor Monetario). Aquí están los segmentos identificados: ${Object.entries(resultado.segmentos).map(([seg, data]) => `${seg}: ${data.count} clientes ($${Math.round(data.total_monetary).toLocaleString()})`).join(', ')}.`;

            const responseSeg = {
                success: true,
                explicacion: explicacion,
                resultados: resultado.clientes,
                segmentos: resultado.segmentos,
                tipo: 'segmentation'
            };

            await guardarHistorial(req.user.id, pregunta, explicacion);
            return res.status(200).json(responseSeg);
        }

        // ============================================
        // 💾 CAPA 4: CACHÉ DE QUERIES (SQL)
        // ============================================

        const cachedResult = queryCache.get(empresaId, pregunta);
        if (cachedResult) {
            console.log('✅ Respuesta obtenida de query cache');
            return res.status(200).json({
                ...cachedResult,
                from_cache: true
            });
        }

        // ============================================
        // 📝 CAPA 5: GENERACIÓN SQL CON AUTO-CORRECCIÓN (RETRY LOOP)
        // ============================================

        const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
        const model = genAI.getGenerativeModel({ model: modelName });
        const esquemaDinamico = formatSchemaForGemini(schema);

        let attempt = 0;
        let maxAttempts = 3;
        let lastError = null;
        let rows = [];
        let jsonSQL = null;

        while (attempt < maxAttempts) {
            attempt++;
            console.log(`🔄 Intento ${attempt}/${maxAttempts} generando SQL...`);

            let promptSQL = `
# EXPERTO EN MYSQL - ANÁLISIS DE DATOS GENÉRICO
Eres un experto en MySQL. Convierte la pregunta del usuario en SQL válido para la base de datos descrita.

## ESQUEMA DE LA BASE DE DATOS
${esquemaDinamico}

## PREGUNTA DEL USUARIO
"${pregunta}"

## INSTRUCCIONES CRÍTICAS
1. Genera SOLO el SQL, sin explicaciones, ni markdown. Devuelve un JSON: { "sql": "..." }
2. Usa nombres EXACTOS de columnas (con backticks si tienen espacios)
3. Para sumas de dinero usa: ${schema.business_terms.venta ? '`' + schema.business_terms.venta + '`' : 'la columna métrica monetaria más probable'}
4. Para fechas usa: ${schema.business_terms.fecha ? '`' + schema.business_terms.fecha + '`' : 'la columna de fecha más probable'}
5. Si preguntan por totales/sumas: usa SUM() y GROUP BY apropiados
6. Si preguntan por listados/detalles: usa LIMIT 100
7. NO inventes columnas. Usa solo las del esquema.
`;

            if (lastError) {
                promptSQL += `
⚠️ EL INTENTO ANTERIOR FALLÓ
Error MySQL: "${lastError}"
Instrucción: CORRIGE el SQL anterior para solucionar este error. Verifica los nombres de columnas en el esquema y usa una alternativa válida.
`;
            }

            try {
                const resultSQL = await model.generateContent(promptSQL);
                const responseText = resultSQL.response.text().replace(/```json/g, '').replace(/```/g, '').trim();

                try {
                    jsonSQL = JSON.parse(responseText);
                } catch (e) {
                    // Si no es JSON válido pero parece SQL, lo intentamos usar
                    if (responseText.toUpperCase().startsWith('SELECT')) {
                        jsonSQL = { sql: responseText };
                    } else {
                        throw new Error("Respuesta del modelo no es un JSON válido ni SQL directo");
                    }
                }

                if (!jsonSQL || !jsonSQL.sql) throw new Error("No se generó SQL válido");

                // === LÓGICA DE TABLA VIRTUAL ===
                // Si la consulta usa la tabla virtual, reemplazamos con su definición SQL real
                const mainTableDefinition = schema.tables.find(t => t.name === schema.main_table);
                if (mainTableDefinition && mainTableDefinition.is_virtual && mainTableDefinition.virtual_sql) {
                    console.log(`🔄 Reemplazando tabla virtual '${mainTableDefinition.name}' con subquery...`);
                    // Reemplazo simple del nombre de la tabla con (SELECT ... UNION ...) AS nombre
                    // Usamos una regex que busque el nombre de la tabla (con o sin backticks)
                    const tableNameRegex = new RegExp(`\`?${mainTableDefinition.name}\`?`, 'g');
                    jsonSQL.sql = jsonSQL.sql.replace(tableNameRegex, `(${mainTableDefinition.virtual_sql}) AS \`${mainTableDefinition.name}\``);
                }
                // ===============================

                console.log(`⚡ Ejecutando SQL (Intento ${attempt}): ${jsonSQL.sql}`);
                [rows] = await pool.execute(jsonSQL.sql);

                // Si llegamos aquí, la ejecución fue exitosa
                break;

            } catch (err) {
                console.warn(`❌ Fallo intento ${attempt}: ${err.message}`);
                lastError = err.message;

                // Si es el último intento, lanzamos el error para que vaya al catch general
                if (attempt === maxAttempts) {
                    throw new Error(`No se pudo generar una consulta válida después de ${maxAttempts} intentos. Último error: ${lastError}`);
                }
                // Si no es el último, el loop continúa y re-intenta con el error en el prompt
            }
        }

        // ============================================
        // 🗣️ CAPA 7: EXPLICACIÓN DE RESULTADOS
        // ============================================

        let respuestaFinal = "";
        let metricas = {};

        if (rows.length > 0) {
            metricas = calcularMetricas(rows);

            const promptAnalisis = `
# ANALISTA DE NEGOCIOS
Analiza estos datos y responde la pregunta del usuario.

## PREGUNTA
"${pregunta}"

## DATOS (Muestra)
${JSON.stringify(rows.slice(0, 10), null, 2)}

## MÉTRICAS
${JSON.stringify(metricas, null, 2)}

## INSTRUCCIONES
- Responde de forma natural, amigable y profesional.
- Menciona los datos clave (totales, promedios, tops).
- No uses jerga técnica (SQL, query).
- Sé conciso.
`;
            const resultAnalisis = await model.generateContent(promptAnalisis);
            respuestaFinal = resultAnalisis.response.text();
        } else {
            respuestaFinal = "No encontré resultados para tu búsqueda. Intenta con otros términos.";
        }

        const resultadoFinal = {
            success: true,
            explicacion: respuestaFinal,
            resultados: rows,
            metricas: metricas,
            sql_ejecutado: jsonSQL?.sql,
            db_version: 'MySQL Generic',
            retries: attempt
        };

        // Guardar en caché sólo si hubo éxito
        if (rows.length > 0) {
            queryCache.set(empresaId, pregunta, resultadoFinal);
        }

        await guardarHistorial(req.user.id, pregunta, respuestaFinal);

        res.json(resultadoFinal);

    } catch (error) {
        console.error('❌ Error general:', error);
        res.status(500).json({
            success: false,
            // Mensaje genérico para el usuario
            error: 'Ocurrió un error procesando tu consulta. Por favor intenta reformular tu pregunta.'
        });
    } finally {
        console.timeEnd('ChatbotExecution');
    }
};

function formatSchemaForGemini(schema) {
    const mainTable = schema.tables.find(t => t.name === schema.main_table);
    if (!mainTable) return '';

    return `
**Tabla principal:** \`${mainTable.name}\` (${mainTable.row_count.toLocaleString()} registros)

**Columnas monetarias (usar con SUM, AVG):**
${mainTable.metrics.filter(m => m.role === 'metric_monetary').map(c => `- \`${c.name}\` (${c.full_type})`).join('\n') || '- Ninguna'}

**Columnas de cantidad (usar con SUM, COUNT):**
${mainTable.metrics.filter(m => m.role === 'metric_quantity').map(c => `- \`${c.name}\` (${c.full_type})`).join('\n') || '- Ninguna'}

**Categorías (usar con GROUP BY, filtros):**
${mainTable.categories.map(c => `- \`${c.name}\``).join('\n') || '- Ninguna'}

**Fechas (usar con WHERE):**
${mainTable.dates.map(c => `- \`${c.name}\` (${c.full_type})`).join('\n') || '- Ninguna'}

**Términos de negocio inferidos:**
${Object.entries(schema.business_terms).map(([term, col]) => `- "${term}" → \`${col}\``).join('\n')}
`;
}

function calcularMetricas(datos) {
    if (!Array.isArray(datos) || datos.length === 0) return {};
    const metricas = {};
    const primeraFila = datos[0];
    const columnasNumericas = Object.keys(primeraFila).filter(col => {
        const valor = primeraFila[col];
        return typeof valor === 'number' || (typeof valor === 'string' && !isNaN(parseFloat(valor)));
    });

    columnasNumericas.forEach(col => {
        const valores = datos.map(row => parseFloat(row[col]) || 0);
        const suma = valores.reduce((a, b) => a + b, 0);
        metricas[col] = {
            total: suma,
            promedio: suma / valores.length,
            maximo: Math.max(...valores),
            minimo: Math.min(...valores)
        };
    });
    return metricas;
}

const obtenerHistorial = async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.query(`
            SELECT pregunta, respuesta, fecha 
            FROM chatbot_history 
            WHERE user_id = ? 
            ORDER BY fecha ASC 
            LIMIT 50
        `, [userId]);

        res.json({ success: true, history: rows });
    } catch (error) {
        console.error('Error obteniendo historial:', error);
        res.status(500).json({ success: false, error: 'Error al cargar historial' });
    }
};

async function guardarHistorial(userId, pregunta, respuesta) {
    try {
        if (userId) {
            await pool.query(
                'INSERT INTO chatbot_history (user_id, pregunta, respuesta) VALUES (?, ?, ?)',
                [userId, pregunta, respuesta]
            );
        }
    } catch (dbError) {
        console.error('⚠️ Error guardando historial:', dbError.message);
    }
}

// Funciones administrativas
const refreshSchema = async (req, res, dbConfig) => {
    try {
        const empresaId = req.user.id.toString();
        await schemaCache.refreshSchema(empresaId, dbConfig);
        if (res) res.json({ success: true, message: 'Schema actualizado' });
    } catch (error) {
        if (res) res.status(500).json({ success: false, error: error.message });
    }
};

const getCacheStats = async (req, res) => {
    try {
        const stats = {
            schema_cache: await schemaCache.getCacheStats(),
            query_cache: queryCache.getStats()
        };
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const invalidateQueryCache = async (req, res) => {
    try {
        const empresaId = req.user.id.toString();
        queryCache.invalidate(empresaId);
        res.json({ success: true, message: 'Query cache invalidado' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    consultarBD,
    obtenerHistorial,
    refreshSchema,
    getCacheStats,
    invalidateQueryCache
};
