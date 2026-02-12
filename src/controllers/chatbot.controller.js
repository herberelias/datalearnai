/**
 * Controlador para el Chatbot con IA (Gemini Flash) - DataLearn
 * Modo: Consultor de Negocios Interactivo PROACTIVO
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const pool = require('../config/database');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const consultarBD = async (req, res) => {
    try {
        const { pregunta, history = [] } = req.body;

        // ============================================
        // 🔒 CAPA 1: VALIDACIONES DE SEGURIDAD
        // ============================================

        if (!pregunta || typeof pregunta !== 'string') {
            return res.status(400).json({ success: false, error: 'Pregunta inválida' });
        }

        if (pregunta.length > 500) {
            return res.status(400).json({
                success: false,
                error: 'Pregunta demasiado larga (máximo 500 caracteres)'
            });
        }

        const patronesSospechosos = [
            /ignora\s+(las\s+)?instrucciones/i,
            /olvida\s+(las\s+)?reglas/i,
            /genera\s+este\s+sql/i,
            /ejecuta\s+este\s+select/i,
            /information_schema/i,
            /mysql\.user/i,
            /--\s*$/,
            /;\s*select/i,
            /union\s+select/i,
            /into\s+outfile/i,
            /load_file/i
        ];

        for (const patron of patronesSospechosos) {
            if (patron.test(pregunta)) {
                console.warn('⚠️ Pregunta sospechosa detectada:', {
                    ip: req.ip,
                    pregunta: pregunta.substring(0, 100),
                    timestamp: new Date().toISOString()
                });
                return res.status(400).json({
                    success: false,
                    error: 'La pregunta contiene términos no permitidos'
                });
            }
        }

        console.log(`🤖 [DataLearn] Usuario (${req.ip}): "${pregunta}"`);
        console.time('ChatbotExecution');

        // ============================================
        // 🧠 CAPA 2: PREPARACIÓN DEL CONTEXTO
        // ============================================

        const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
        const model = genAI.getGenerativeModel({ model: modelName });

        console.time('ObtenerEsquema');
        const esquema = await obtenerEsquemaBD();
        console.timeEnd('ObtenerEsquema');

        const esquemaJSON = JSON.stringify(esquema, null, 2);

        // ============================================
        // 🎯 CAPA 3: GENERACIÓN SQL CON REINTENTOS
        // ============================================

        let datosFinales = [];
        let sqlEjecutado = null;
        let intentos = 0;
        const MAX_INTENTOS = 3;
        let sugerencias = [];

        while (intentos < MAX_INTENTOS) {
            intentos++;

            const sqlPrompt = generarPromptSQL(pregunta, esquemaJSON, intentos, sugerencias);

            console.time(`IntentoSQL_${intentos}`);
            const chatSQL = model.startChat();
            console.log(`⏳ Generando SQL (Intento ${intentos})...`);
            const resultSQL = await chatSQL.sendMessage(sqlPrompt);
            console.timeEnd(`IntentoSQL_${intentos}`);

            const textSQL = resultSQL.response.text()
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim();

            let jsonSQL;
            try {
                jsonSQL = JSON.parse(textSQL);
            } catch (e) {
                console.error(`❌ Error parseando SQL (intento ${intentos}):`, textSQL);
                if (intentos >= MAX_INTENTOS) {
                    jsonSQL = { sql: null };
                    break;
                }
                continue;
            }

            if (jsonSQL.sql) {
                try {
                    validarSQL(jsonSQL.sql);
                    console.log(`⚡ Ejecutando SQL (intento ${intentos}): ${jsonSQL.sql}`);

                    const [rows] = await pool.execute(jsonSQL.sql);

                    if ((!rows || rows.length === 0) && intentos < MAX_INTENTOS) {
                        console.log(`⚠️ 0 resultados. Buscando lugares similares (intento ${intentos})...`);
                        sugerencias = await buscarLugaresSimilares(pregunta);

                        if (sugerencias.length > 0) {
                            console.log(`💡 Encontradas ${sugerencias.length} sugerencias:`, sugerencias);
                        }
                        continue;
                    }

                    datosFinales = rows;
                    sqlEjecutado = jsonSQL.sql;
                    break;

                } catch (err) {
                    console.error(`❌ Error SQL (intento ${intentos}): ${err.message}`);

                    if (intentos >= MAX_INTENTOS) {
                        if (jsonSQL.alternativa) {
                            try {
                                validarSQL(jsonSQL.alternativa);
                                console.log(`🔄 Usando SQL alternativo: ${jsonSQL.alternativa}`);
                                const [rows] = await pool.execute(jsonSQL.alternativa);
                                datosFinales = rows;
                                sqlEjecutado = jsonSQL.alternativa;
                            } catch (errAlt) {
                                console.error(`❌ SQL alternativo también falló: ${errAlt.message}`);
                                datosFinales = { error_sql: err.message };
                            }
                        } else {
                            datosFinales = { error_sql: err.message };
                        }
                        break;
                    }
                }
            } else {
                break;
            }
        }

        // ============================================
        // 🔬 CAPA 4: ANÁLISIS MATEMÁTICO
        // ============================================

        let metricas = {};

        if (Array.isArray(datosFinales) && datosFinales.length > 0) {
            metricas = calcularMetricas(datosFinales);
        } else if (intentos >= MAX_INTENTOS && (!datosFinales || datosFinales.length === 0)) {
            if (sugerencias.length === 0) {
                sugerencias = await buscarLugaresSimilares(pregunta);
            }
        }

        // ============================================
        // 💬 CAPA 5: ANÁLISIS DE NEGOCIO
        // ============================================

        const analisisPrompt = generarPromptAnalisis(pregunta, datosFinales, sugerencias, metricas);

        console.time('AnalisisNegocio');
        console.log('🧠 Generando análisis de negocio...');
        const resultAnalisis = await model.generateContent(analisisPrompt);
        console.timeEnd('AnalisisNegocio');

        const respuestaFinal = resultAnalisis.response.text();

        // ============================================
        // 💾 CAPA 7: PERSISTENCIA
        // ============================================
        try {
            if (req.user && req.user.id) {
                // Verificar si existe la tabla antes de insertar (o crearla si no existe en paso previo)
                // Asumimos que existe o fallará silenciosamente logueando el error
                await pool.query(
                    'INSERT INTO chatbot_history (user_id, pregunta, respuesta) VALUES (?, ?, ?)',
                    [req.user.id, pregunta, respuestaFinal]
                );
            }
        } catch (dbError) {
            console.error('⚠️ Error guardando historial:', dbError.message);
        }

        res.status(200).json({
            success: true,
            explicacion: respuestaFinal,
            resultados: Array.isArray(datosFinales) ? datosFinales : [],
            metricas: metricas,
            sugerencias: sugerencias,
            intentos: intentos,
            sql_ejecutado: sqlEjecutado
        });

        console.timeEnd('ChatbotExecution');

    } catch (error) {
        console.error('❌ Error general:', {
            timestamp: new Date().toISOString(),
            ip: req.ip,
            error: error.message
        });

        res.status(500).json({
            success: false,
            error: 'Ocurrió un error procesando tu consulta.'
        });
    }
};

// ... Funciones auxiliares (generarPromptSQL, generarPromptAnalisis, etc)
// Para mantener el archivo limpio, las incluiré compactas pero funcionales

function generarPromptSQL(pregunta, esquemaJSON, intentos, sugerencias = []) {
    return `
# 🎯 CONTEXTO Y ROL
Eres un experto en MySQL especializado en análisis de ventas.
Tu misión: convertir preguntas en español a consultas MySQL perfectas.

## 📋 ESQUEMA DE BASE DE DATOS
${esquemaJSON}

## ⚙️ REGLAS
1. Usa Backticks (\`) para nombres de tablas y columnas.
2. Usa LIMIT N para limitar resultados (no TOP).
3. MySQL es case-insensitive por defecto.
4. Para fechas: CAST(Año AS CHAR).

## 🎯 PREGUNTA DEL USUARIO
"${pregunta}"

${intentos > 1 && sugerencias.length > 0 ? `💡 Sugerencias: ${sugerencias.join(', ')}` : ''}

## 📤 RESPUESTA REQUERIDA (JSON)
{
  "sql": "SELECT ...",
  "explicacion": "..."
}
`;
}

function generarPromptAnalisis(pregunta, datosFinales, sugerencias, metricas) {
    return `
# 🎯 TU ROL
Eres un Asistente de Ventas profesional. Analiza los datos de licores y productos.

## 📋 CONTEXTO
PREGUNTA: "${pregunta}"
DATOS: ${JSON.stringify(datosFinales ? datosFinales.slice(0, 10) : [])}
METRICAS: ${JSON.stringify(metricas)}

## ✍️ INSTRUCCIONES
1. Tono amigable y profesional.
2. Resumen ejecutivo, análisis detallado e insights proactivos.
3. Si no hay datos, ofrece disculpas y alternativas.
4. NO uses jerga técnica (SQL, query).

Genera respuesta en texto natural.
`;
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
        console.error('Error historial:', error);
        res.status(500).json({ success: false, error: 'Error al cargar historial' });
    }
};

function validarSQL(sql) {
    if (!sql) return;
    const sqlUpper = sql.toUpperCase().trim();
    const prohibidos = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'EXEC', 'CREATE', 'GRANT'];
    for (const cmd of prohibidos) if (sqlUpper.includes(cmd)) throw new Error(`Prohibido: ${cmd}`);
    if (!sqlUpper.startsWith('SELECT') && !sqlUpper.startsWith('WITH')) throw new Error('Solo SELECT');
}

let cachedEsquema = null;
let lastSchemaUpdate = 0;

async function obtenerEsquemaBD() {
    try {
        const now = Date.now();
        if (cachedEsquema && (now - lastSchemaUpdate < 3600000)) return cachedEsquema;

        const [rows] = await pool.query(`
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_KEY
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'producto'
            ORDER BY TABLE_NAME, ORDINAL_POSITION
        `, [process.env.DB_NAME]);

        const esquema = {};
        rows.forEach(row => {
            if (!row.TABLE_NAME) return;
            const t = row.TABLE_NAME.toLowerCase();
            if (!esquema[t]) esquema[t] = [];
            esquema[t].push(`${row.COLUMN_NAME} (${row.DATA_TYPE})`);
        });

        cachedEsquema = esquema;
        lastSchemaUpdate = now;
        return esquema;
    } catch (error) {
        console.error('Error esquema:', error);
        return null;
    }
}

function calcularMetricas(datos) {
    if (!Array.isArray(datos) || datos.length === 0) return {};
    const metricas = {};
    const primeraFila = datos[0];
    const cols = Object.keys(primeraFila).filter(c => !isNaN(parseFloat(primeraFila[c])));

    cols.forEach(col => {
        const vals = datos.map(r => parseFloat(r[col]) || 0);
        const sum = vals.reduce((a, b) => a + b, 0);
        metricas[col] = {
            total: sum,
            promedio: sum / vals.length,
            max: Math.max(...vals),
            min: Math.min(...vals)
        };
    });
    return metricas;
}

async function buscarLugaresSimilares(pregunta) {
    try {
        const palabras = pregunta.toLowerCase().split(/\s+/).filter(p => p.length > 3);
        if (palabras.length === 0) return [];

        const condiciones = palabras.map(() => '`nombre Municipio` LIKE ? OR `Nombre Departamento` LIKE ?').join(' OR ');
        const params = palabras.flatMap(p => [`%${p}%`, `%${p}%`]);

        const [rows] = await pool.execute(`SELECT DISTINCT \`nombre Municipio\` as l FROM producto WHERE ${condiciones} LIMIT 8`, params);
        return rows.map(r => r.l).filter(Boolean);
    } catch (e) {
        return [];
    }
}

module.exports = { consultarBD, obtenerHistorial };
