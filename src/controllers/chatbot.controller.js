/**
 * Controlador para el Chatbot con IA (Gemini Flash) - VERSIÓN MYSQL
 * Modo: Consultor de Negocios Interactivo PROACTIVO
 * v1.0 - Optimizado para MySQL con tabla producto
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

        // Detectar patrones sospechosos de inyección
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

        console.log(`🤖 [MySQL] Usuario (${req.ip}): "${pregunta}"`);
        console.time('ChatbotMySQLExecution');

        // ============================================
        // 🧠 CAPA 2: PREPARACIÓN DEL CONTEXTO
        // ============================================

        const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
        const model = genAI.getGenerativeModel({ model: modelName });

        console.time('ObtenerEsquema');
        const esquema = await obtenerEsquemaBD();
        console.timeEnd('ObtenerEsquema');

        const esquemaJSON = JSON.stringify(esquema, null, 2);

        const historialTexto = history
            .slice(-5)
            .map(h => `Usuario: ${h.pregunta}\nIA: ${h.respuesta}`)
            .join('\n---\n');

        // ============================================
        // 🎯 CAPA 3: GENERACIÓN SQL CON REINTENTOS
        // ============================================

        let datosFinales = [];
        let sqlEjecutado = null;
        let intentos = 0;
        const MAX_INTENTOS = 3;
        let sugerencias = [];

        // Sistema de reintentos inteligente
        while (intentos < MAX_INTENTOS) {
            intentos++;

            // ============================================
            // 📊 PROMPT SQL ULTRA-OPTIMIZADO
            // ============================================
            const sqlPrompt = generarPromptSQL(pregunta, esquemaJSON, intentos, sugerencias);

            console.time(`IntentoSQL_${intentos}`);
            const chatSQL = model.startChat();
            console.log(`⏳ Generando SQL MySQL (Intento ${intentos})...`);
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

            // Ejecutar SQL principal
            if (jsonSQL.sql) {
                try {
                    validarSQL(jsonSQL.sql);
                    console.log(`⚡ Ejecutando SQL MySQL (intento ${intentos}): ${jsonSQL.sql}`);

                    const [rows] = await pool.execute(jsonSQL.sql);

                    // 🔄 LÓGICA DE REINTENTO POR 0 RESULTADOS
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
        // 🔬 CAPA 4: ANÁLISIS MATEMÁTICO ENRIQUECIDO
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
        // 💬 CAPA 5: ANÁLISIS DE NEGOCIO PROACTIVO
        // ============================================

        const analisisPrompt = generarPromptAnalisis(pregunta, datosFinales, sugerencias, metricas);

        console.time('AnalisisNegocio');
        console.log('🧠 Generando análisis de negocio...');
        const resultAnalisis = await model.generateContent(analisisPrompt);
        console.timeEnd('AnalisisNegocio');

        const respuestaFinal = resultAnalisis.response.text();

        // ============================================
        // 📤 CAPA 6: RESPUESTA ENRIQUECIDA
        // ============================================

        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            ip: req.ip,
            pregunta: pregunta.substring(0, 100),
            sqlGenerado: sqlEjecutado,
            numResultados: Array.isArray(datosFinales) ? datosFinales.length : 0,
            intentos: intentos,
            db: 'MySQL'
        }));

        // ============================================
        // 💾 CAPA 7: PERSISTENCIA
        // ============================================
        try {
            if (req.user && req.user.id) {
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
            sql_ejecutado: sqlEjecutado,
            db_version: 'MySQL'
        });

        console.timeEnd('ChatbotMySQLExecution');

    } catch (error) {
        console.error('❌ Error general:', {
            timestamp: new Date().toISOString(),
            ip: req.ip,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            error: 'Ocurrió un error procesando tu consulta. Por favor intenta de nuevo.'
        });
    }
};

/**
 * 📊 GENERADOR DE PROMPT SQL PARA MYSQL
 */
function generarPromptSQL(pregunta, esquemaJSON, intentos, sugerencias = []) {
    const MAX_INTENTOS = 3;

    return `
# 🎯 CONTEXTO Y ROL
Eres un experto en MySQL especializado en análisis de ventas de licores y productos en El Salvador.
Tu misión: convertir preguntas en español a consultas MySQL perfectas, tolerantes a errores y optimizadas.

---

## 📋 ESQUEMA DE BASE DE DATOS
${esquemaJSON}

---

## 🗄️ ESTRUCTURA REAL DE LA TABLA: **producto**

### 💰 DATOS COMERCIALES (COLUMNAS PRINCIPALES):
- **\`$ Venta Neta Con Impuestos\`**: Monto total venta en dólares (DECIMAL) ← **COLUMNA PRINCIPAL PARA SUMAS**
- **\`CJ Cajas Fisicas Netas Sin Bonificacion\`**: Cantidad cajas (DECIMAL)
- **\`CJ9 Cajas 9Litros Netas Sin Bonificacion\`**: Cajas 9L (DECIMAL)

### 🏷️ PRODUCTOS:
- **\`Nombre Producto\`**: Descripción completa (ej: "AG CAÑA RICA 24/450 ml PET", "RON VENADO LIGHT")
- **\`Nombre Marca\`**: Marcas principales → "CAÑA RICA", "RON VENADO", "TRENZUDA", "CERVEZA SUPREMA", "SMIRNOFF ICE", "RON FLOR DE CAÑA", "WHISKY OLD PARR", "TEQUILA JOSE CUERVO", "VODKA BOTRAN"
- **\`Nombre Categoria Comercial\`**: "AGUARDIENTE", "RONES", "CERVEZA", "RTDS", "VINOS Y ESPUMANTES", "WHISKY", "TEQUILA", "VODKA", "ALIMENTOS"

### 👥 CLIENTES:
- **\`Nombre de Cliente Comercial\`**: Punto de venta (ej: "CENTRO DE DISTRIBUCION APOPA (506)", "SUPER ANDROMEDA")
- **\`Tipo de Negocio\`**: "SUPERMERCADOS", "WALMART", "DRINKIT TIENDA", "TIENDAS DE CONVENIENCIA", "ABARROTERIA"

### 👨‍💼 VENDEDORES:
- **\`Nombre de Vendedor Transaccion\`**: Vendedor que procesó venta (ej: "ANDREA FUENTES", "BALMORE CABALLERO")
- **\`Nombre Vendedor Asignado\`**: Vendedor asignado
- **\`Nombre Grupo de Venta Asignado\`**: Equipo (ej: "AREA 4 (JS)", "KEY ACCOUNT", "DRINKIT")

### 🏪 CANALES:
- **\`Nombre Canal Distribucion\`**: "OFF-MODERNO", "OFF-TRADICIONAL", "ON-PREMISE", "DRINKIT"
- **\`Nombre Sub Canal Descuento\`**: "OFF-SUPERMERCADOS", "OFF-WALMART", "OFF-RUTA", "TIENDA DE CONVENIENCIA"

### 📍 UBICACIÓN GEOGRÁFICA (MUY IMPORTANTE):
- **\`Nombre Departamento\`**: CUSCATLAN, SAN SALVADOR, LA LIBERTAD, SANTA ANA, SONSONATE, CHALATENANGO, USULUTAN, SAN MIGUEL, LA UNION, AHUACHAPAN
- **\`nombre Municipio\`**: Formato "DEPARTAMENTO + ZONA" en MAYÚSCULAS
  * Ejemplos reales: "CUSCATLAN SUR", "SAN SALVADOR OESTE", "SAN SALVADOR CENTRO", "LA LIBERTAD SUR", "SANTA ANA CENTRO"
  * **CRÍTICO**: Todos tienen sufijos: SUR, NORTE, ESTE, OESTE, CENTRO
- **\`Nombre Distrito\`**: Distrito específico (ej: "COJUTEPEQUE", "NEJAPA", "SANTA TECLA", "AHUACHAPAN")

### 📅 FECHAS:
- **\`Año\`**: 2020-2025 (INT)
- **\`Mes\`**: 1-12 (INT) → 1=Enero, 2=Febrero... 12=Diciembre
- **\`Fecha de Documento\`**: Fecha exacta (DATE)

---

## ⚙️ REGLAS CRÍTICAS DE SQL MYSQL

### 1️⃣ SINTAXIS MYSQL OBLIGATORIA
✅ **Backticks**: \`nombre Municipio\`, \`$ Venta Neta Con Impuestos\`
✅ **LIMIT N**: \`SELECT ... LIMIT 500\` para limitar resultados
✅ **NO usar COLLATE** (MySQL es case-insensitive por defecto en español)
✅ **Conversión fechas**: \`CAST(Año AS CHAR)\`

### 2️⃣ DETECCIÓN DE INTENCIÓN (CRÍTICO)

#### 🔢 Si pide **TOTALES/SUMA/CUÁNTO/RESUMEN**:
**Señales**: "total", "suma", "cuánto vendimos", "ventas de", "consolidado", "cuánto", "monto"

**ACCIÓN:**
- **NO uses LIMIT** (necesitas TODOS los registros)
- **USA SUM() + GROUP BY**
- Agrupa por: municipio, departamento, mes, año, cliente, vendedor, marca

**Ejemplo:**
\`\`\`json
{
  "sql": "SELECT \`nombre Municipio\`, SUM(\`$ Venta Neta Con Impuestos\`) AS \`Total Ventas\` FROM producto WHERE \`nombre Municipio\` LIKE '%SAN SALVADOR%' AND \`Año\` = 2024 GROUP BY \`nombre Municipio\` ORDER BY \`Total Ventas\` DESC",
  "explicacion": "Suma total de ventas por municipio en San Salvador 2024"
}
\`\`\`

#### 📋 Si pide **DETALLES/LISTA/MUÉSTRAME**:
**Señales**: "muéstrame", "lista", "detalle", "facturas", "registros"

**ACCIÓN:**
- **USA LIMIT 500** para limitar
- Incluye columnas descriptivas

**Ejemplo:**
\`\`\`json
{
  "sql": "SELECT \`Fecha de Documento\`, \`Numero_Documento\`, \`Nombre de Cliente Comercial\`, \`Nombre Producto\`, \`$ Venta Neta Con Impuestos\` FROM producto WHERE \`Año\` = 2024 AND \`Mes\` = 2 ORDER BY \`Fecha de Documento\` DESC LIMIT 500",
  "explicacion": "Últimas 500 facturas de febrero 2024"
}
\`\`\`

### 3️⃣ MANEJO INTELIGENTE DE FECHAS

**Conversión de meses:**
- "enero" → \`Mes\` = 1
- "febrero" → \`Mes\` = 2
- "marzo" → \`Mes\` = 3
- ... "diciembre" → \`Mes\` = 12

**Rangos:**
\`\`\`sql
-- "entre enero y marzo 2024"
WHERE \`Año\` = 2024 AND \`Mes\` BETWEEN 1 AND 3

-- "primer trimestre"
WHERE \`Mes\` IN (1, 2, 3)

-- "último año"
WHERE \`Año\` = (SELECT MAX(\`Año\`) FROM producto)
\`\`\`

### 4️⃣ BÚSQUEDA FUZZY (TOLERANTE A ERRORES)

**Usuario escribe mal → Búsqueda flexible con LIKE**

**Estrategia:**
1. Divide en palabras clave
2. Usa múltiples LIKE con AND
3. MySQL es case-insensitive por defecto

**Ejemplos:**
\`\`\`sql
-- "san salbador" → Buscar SAN SALVADOR
WHERE \`nombre Municipio\` LIKE '%SAN%' 
  AND \`nombre Municipio\` LIKE '%SALVADOR%'

-- "vendedor juan lopez"
WHERE \`Nombre de Vendedor Transaccion\` LIKE '%JUAN%' 
  AND \`Nombre de Vendedor Transaccion\` LIKE '%LOPEZ%'
\`\`\`

### 5️⃣ MUNICIPIOS CON SUFIJOS (MUY IMPORTANTE)

**CRÍTICO**: Municipios tienen formato "DEPARTAMENTO + ZONA"

**Si usuario dice "San Salvador" SIN especificar zona:**
\`\`\`sql
-- Busca TODOS los municipios de San Salvador
WHERE \`nombre Municipio\` LIKE '%SAN SALVADOR%'
-- Trae: SAN SALVADOR CENTRO, SAN SALVADOR OESTE, SAN SALVADOR SUR, etc.
\`\`\`

**Si usuario especifica zona:**
\`\`\`sql
-- "San Salvador centro"
WHERE \`nombre Municipio\` LIKE '%SAN SALVADOR%CENTRO%'
\`\`\`

### 6️⃣ VALIDACIONES FINALES

✅ Sintaxis MySQL correcta
✅ Backticks en nombres con espacios
✅ LIMIT solo si es detalle (NO en sumas/totales)
✅ GROUP BY cuando usas SUM/COUNT/AVG
✅ ORDER BY para ordenar resultados
✅ NO usar corchetes [] (son de SQL Server)
✅ NO usar COLLATE (innecesario en MySQL)
✅ NO usar TOP (usar LIMIT)

---

## 🎯 PREGUNTA DEL USUARIO
"${pregunta}"

${intentos > 1 ? `
⚠️ **INTENTO ${intentos}/${MAX_INTENTOS}**
${sugerencias.length > 0 ? `
💡 **Lugares similares encontrados**: ${sugerencias.join(', ')}
**ACCIÓN**: Usa el primer lugar similar con LIKE '%${sugerencias[0].toUpperCase()}%'
` : '**Query anterior dio 0 resultados. AMPLÍA BÚSQUEDA**: usa LIKE más genérico, menos filtros.'}
` : ''}

---

## 📤 RESPUESTA REQUERIDA (JSON ESTRICTO)

\`\`\`json
{
  "sql": "SELECT ... (query MySQL aquí)",
  "explicacion": "Qué hace el query en 1 línea"
}
\`\`\`

**NO incluyas markdown, solo JSON puro.**
`;
}

/**
 * 💬 GENERADOR DE PROMPT DE ANÁLISIS
 */
function generarPromptAnalisis(pregunta, datosFinales, sugerencias, metricas) {
    return `
# 🎯 TU ROL
Eres un **Asistente de Ventas** profesional, amable y proactivo.
Ayudas a analizar datos de ventas de licores y productos en El Salvador.

---

## 📋 CONTEXTO

**Pregunta del usuario:**
"${pregunta}"

**Datos obtenidos:**
${Array.isArray(datosFinales) && datosFinales.length > 0 ? `
✅ **${datosFinales.length} registros encontrados**

Muestra de datos:
\`\`\`json
${JSON.stringify(datosFinales.slice(0, 20), null, 2)}
\`\`\`

${metricas && Object.keys(metricas).length > 0 ? `
**Métricas calculadas:**
${JSON.stringify(metricas, null, 2)}
` : ''}
` : `
⚠️ **Sin resultados**
${sugerencias.length > 0 ? `
**Lugares similares encontrados**: ${sugerencias.join(', ')}
` : 'No se encontraron coincidencias'}
`}

---

## ✍️ INSTRUCCIONES PARA TU RESPUESTA

### 1️⃣ TONO AMIGABLE Y PROFESIONAL

**SIEMPRE inicia con:**
- "¡Con gusto! Aquí están los datos que solicitaste 📊"
- "Por supuesto, te muestro la información 📈"
- "Claro que sí, estos son los resultados 💼"

**Sé natural y cercano:**
- Habla como consultor de negocios experto
- Evita jerga técnica (NO menciones: SQL, query, tabla, JOIN, SELECT, WHERE, columna, registro, base de datos)
- Máximo 2-3 emojis por respuesta

### 2️⃣ ESTRUCTURA SI HAY DATOS

**A. Saludo + Confirmación (1 línea)**
"¡Con gusto! Aquí están las ventas que solicitaste 📊"

**B. Resumen Ejecutivo (2-3 líneas)**
- Total general si aplica
- Período de tiempo
- Dato más relevante

Ejemplo:
"Durante el año 2024, encontré **$1,234,567.89** en ventas netas distribuidas en **3,456 facturas**. El ticket promedio fue de **$357.23**."

**C. Análisis Detallado (3-5 líneas)**
- Desglose por categoría principal
- Comparaciones automáticas
- Tendencias identificadas

**D. Insights Proactivos (2-3 líneas) - SIN QUE LO PIDAN**
- Porcentajes de participación
- Rankings (Top 3, Top 5)
- Datos destacados

**E. Cierre (1 línea)**
"¿Te gustaría profundizar enalgún aspecto específico?"

### 3️⃣ SI NO HAY DATOS

**A. Disculpa amable (1 línea)**
"Lamento informarte que no encontré resultados exactos para tu búsqueda 🔍"

**B. Ofrece alternativas (3-4 líneas)**
${sugerencias.length > 0 ? `
"Sin embargo, encontré estos lugares similares:
${sugerencias.slice(0, 5).map(s => `• ${s}`).join('\n')}

¿Te gustaría que busque con alguno de estos nombres?"
` : `
"Para ayudarte mejor:
- ¿Te refieres a un municipio o departamento específico?
- ¿Qué período necesitas? (mes, año, rango)
- ¿Buscas información de cliente o vendedor?"`}

### 4️⃣ CÁLCULOS AUTOMÁTICOS OBLIGATORIOS

**SIEMPRE calcula cuando hay datos numéricos:**

📊 **Totales**: "El total de ventas fue **$1,234,567.89**"
📈 **Promedios**: "En promedio, cada factura fue de **$XXX**"
📉 **Porcentajes**: "San Salvador Centro representa el **45%** del total"
🏆 **Rankings**: "Los **Top 3 municipios** fueron..."

### 5️⃣ FORMATO DE NÚMEROS

✅ **Correcto:**
- $1,234,567.89 (separadores de miles)
- 45.3% (1 decimal)
- 3,456 facturas

❌ **Incorrecto:**
- $1234567 (sin separadores)
- 45.333333% (demasiados decimales)

### 6️⃣ FECHAS AMIGABLES

✅ "enero de 2024" (NO "2024-01")
✅ "del 1 al 15 de marzo" (NO "2024-03-01 to 2024-03-15")
✅ "primer trimestre de 2024"

### 7️⃣ LO QUE NUNCA DEBES HACER

❌ NO menciones: SQL, query, tabla, JOIN, SELECT, WHERE, columna, registro, base de datos
❌ NO digas: "Los datos muestran..." (sé natural)
❌ NO uses jerga técnica
❌ NO inventes datos
❌ NO seas repetitivo
❌ NO copies datos del JSON tal cual, transfórmalos en lenguaje natural

---

## 🎯 TU RESPUESTA AHORA

Genera respuesta en **texto natural** siguiendo TODAS las instrucciones.
**NO uses formato markdown para la respuesta, solo texto plano con formato básico (negritas, listas si es necesario).**
`;
}

/**
 * Obtiene el historial de chat del usuario
 */
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

        res.json({
            success: true,
            history: rows
        });
    } catch (error) {
        console.error('Error obteniendo historial:', error);
        res.status(500).json({ success: false, error: 'Error al cargar historial' });
    }
};

/**
 * Validación estricta de SQL
 */
function validarSQL(sql) {
    if (!sql) return;

    const sqlUpper = sql.toUpperCase().trim();

    // Lista negra expandida
    const prohibidos = [
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE',
        'EXEC', 'EXECUTE', 'CREATE', 'GRANT', 'REVOKE',
        'INTO OUTFILE', 'LOAD_FILE', 'SLEEP', 'BENCHMARK',
        'XP_CMDSHELL', 'SP_EXECUTESQL', 'WAITFOR', 'SHUTDOWN'
    ];

    for (const comando of prohibidos) {
        if (sqlUpper.includes(comando)) {
            throw new Error(`Comando SQL prohibido: ${comando}`);
        }
    }

    // Solo permitir SELECT y WITH (para CTEs)
    if (!sqlUpper.startsWith('SELECT') && !sqlUpper.startsWith('WITH')) {
        throw new Error('Solo se permiten consultas SELECT');
    }
}

// Cache para el esquema
let cachedEsquema = null;
let lastSchemaUpdate = 0;
const SCHEMA_CACHE_TTL = 1000 * 60 * 60; // 1 hora

/**
 * Obtiene esquema de BD MySQL con cache
 */
async function obtenerEsquemaBD() {
    try {
        const now = Date.now();
        if (cachedEsquema && (now - lastSchemaUpdate < SCHEMA_CACHE_TTL)) {
            console.log('📦 Usando esquema MySQL cacheado');
            return cachedEsquema;
        }

        console.log('🔄 Actualizando esquema MySQL...');

        const [rows] = await pool.query(`
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_KEY
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = ?
                AND TABLE_NAME = 'producto'
            ORDER BY TABLE_NAME, ORDINAL_POSITION
        `, [process.env.DB_NAME]);

        const esquema = {};
        rows.forEach(row => {
            if (!row.TABLE_NAME) return;
            const tableName = row.TABLE_NAME.toLowerCase();
            if (!esquema[tableName]) {
                esquema[tableName] = [];
            }
            esquema[tableName].push(`${row.COLUMN_NAME} (${row.DATA_TYPE}${row.COLUMN_KEY ? ', ' + row.COLUMN_KEY : ''})`);
        });

        cachedEsquema = esquema;
        lastSchemaUpdate = now;
        console.log('✅ Esquema MySQL actualizado y cacheado');

        return esquema;
    } catch (error) {
        console.error('Error obteniendo esquema MySQL:', error);
        return null;
    }
}

/**
 * Calcula métricas automáticas de los datos
 */
function calcularMetricas(datos) {
    if (!Array.isArray(datos) || datos.length === 0) return {};

    const metricas = {};

    // Detectar columnas numéricas automáticamente
    const primeraFila = datos[0];
    const columnasNumericas = Object.keys(primeraFila).filter(col => {
        const valor = primeraFila[col];
        return typeof valor === 'number' ||
            (typeof valor === 'string' && !isNaN(parseFloat(valor)));
    });

    // Calcular métricas para cada columna numérica
    columnasNumericas.forEach(col => {
        const valores = datos.map(row => parseFloat(row[col]) || 0);
        const suma = valores.reduce((a, b) => a + b, 0);
        const promedio = suma / valores.length;
        const maximo = Math.max(...valores);
        const minimo = Math.min(...valores);

        metricas[col] = {
            total: suma,
            promedio: promedio,
            maximo: maximo,
            minimo: minimo,
            cantidad: valores.length
        };
    });

    return metricas;
}

/**
 * Busca lugares similares usando fuzzy search en MySQL
 */
async function buscarLugaresSimilares(pregunta) {
    try {
        // Palabras comunes a filtrar
        const palabrasComunes = [
            'de', 'del', 'las', 'los', 'dame', 'ventas', 'totales', 'total',
            'suma', 'año', 'con', 'si', 'puedes', 'mas', 'detalles',
            'centro', 'sur', 'norte', 'este', 'oeste', 'todos', 'todas',
            'el', 'la', 'en', 'por', 'para', 'que', 'mes', 'año', 'como'
        ];

        const palabras = pregunta.toLowerCase()
            .split(/\s+/)
            .filter(p => p.length > 3 && !palabrasComunes.includes(p));

        if (palabras.length === 0) return [];

        // Construir condiciones OR para búsqueda flexible
        const condiciones = palabras.map(() =>
            '`nombre Municipio` LIKE ? OR `Nombre Departamento` LIKE ?'
        ).join(' OR ');

        const parametros = palabras.flatMap(p => [`%${p}%`, `%${p}%`]);

        const sql = `
            SELECT DISTINCT \`nombre Municipio\` as lugar
            FROM producto 
            WHERE ${condiciones}
            LIMIT 8
        `;

        const [rows] = await pool.execute(sql, parametros);

        return rows.map(r => r.lugar).filter(Boolean).slice(0, 8);

    } catch (error) {
        console.error('Error buscando lugares similares:', error.message);
        return [];
    }
}

module.exports = { consultarBD, obtenerHistorial };
