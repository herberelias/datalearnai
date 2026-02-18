const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectProductoCols() {
    console.log('🔍 Checking columns in "producto"...');

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        const [columns] = await connection.execute(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'producto'
            AND (COLUMN_NAME LIKE '%fecha%' OR COLUMN_NAME LIKE '%date%' OR COLUMN_NAME LIKE '%venta%' OR COLUMN_NAME LIKE '%net%')
        `, [process.env.DB_NAME]);

        if (columns.length === 0) {
            console.log('❌ No standardized Date/Sales columns found in "producto"!');
            // List all just in case
            const [allCols] = await connection.execute(`
                SELECT COLUMN_NAME FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'producto' LIMIT 10
            `, [process.env.DB_NAME]);
            console.log('First 10 columns:', allCols.map(c => c.COLUMN_NAME));
        } else {
            console.log('✅ Found likely relevant columns:', columns.map(c => c.COLUMN_NAME));
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await connection.end();
    }
}

inspectProductoCols();
