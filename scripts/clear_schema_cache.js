
require('dotenv').config();
const mysql = require('mysql2/promise');

async function clearCache() {
    console.log('⏳ Connecting to database...');
    const dbConfig = {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    };

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected.');

        // 1. Limpiar caché de esquemas
        console.log('🧹 Limpiando tabla schema_cache...');
        await connection.execute('TRUNCATE TABLE schema_cache');
        console.log('✅ Tabla schema_cache truncada.');

        // 2. Opcional: Limpiar predicciones antiguas si fuera necesario, pero mejor no tocar datos de usuario.
        // Solo limpiamos caché técnica.

    } catch (error) {
        console.error('❌ Error limpiando caché:', error);
    } finally {
        if (connection) await connection.end();
        console.log('👋 Desconectado.');
    }
}

clearCache();
