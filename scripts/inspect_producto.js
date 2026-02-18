const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectProductoTable() {
    console.log('🔍 Inspecting "producto" table...');

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
        `, [process.env.DB_NAME]);

        if (columns.length === 0) {
            console.log('❌ Table "producto" not found!');
        } else {
            console.log('✅ Table "producto" found with columns:');
            columns.forEach(c => console.log(` - ${c.COLUMN_NAME} (${c.DATA_TYPE})`));
        }

        // Count rows
        const [rows] = await connection.execute('SELECT COUNT(*) as count FROM producto');
        console.log(`📊 Total rows: ${rows[0].count}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await connection.end();
    }
}

inspectProductoTable();
