const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkSchema() {
    console.log('🔍 Diagnostics: Checking Schema Cache...');

    // Connect to DB
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        // 1. Get Schema Cache
        const [rows] = await connection.execute('SELECT * FROM schema_cache LIMIT 1');
        if (rows.length === 0) {
            console.log('❌ Schema cache is empty!');
            return;
        }

        const schemaData = rows[0].schema_data;
        const schema = typeof schemaData === 'string' ? JSON.parse(schemaData) : schemaData;

        console.log(`✅ Schema found. Last updated: ${rows[0].updated_at}`);
        console.log(`Main Table: ${schema.main_table}`);

        // 2. Check Virtual Table
        const mainTable = schema.tables.find(t => t.name === schema.main_table);
        if (mainTable) {
            console.log('--- Main Table Details ---');
            console.log(`Name: ${mainTable.name}`);
            console.log(`Is Virtual: ${mainTable.is_virtual}`);
            if (mainTable.is_virtual) {
                console.log(`Virtual SQL: ${mainTable.virtual_sql}`);
            }
            console.log(`Metrics: ${JSON.stringify(mainTable.metrics.map(c => c.name))}`);
            console.log(`Dates: ${JSON.stringify(mainTable.dates.map(c => c.name))}`);
        } else {
            console.log('❌ Main table not found in schema definition!');
        }

        // 3. Check for year tables in schema
        const yearTables = schema.tables.filter(t => /^20[2-9][0-9]$/.test(t.name));
        console.log(`\n📅 Year Tables Found in Schema: ${yearTables.map(t => t.name).join(', ')}`);

        // 4. Test Query directly
        if (mainTable && mainTable.is_virtual) {
            console.log('\n🧪 Testing Union Query...');
            const sql = `SELECT COUNT(*) as count FROM (${mainTable.virtual_sql}) as v`;
            console.log(`Executing: ${sql}`);
            try {
                const [countRows] = await connection.execute(sql);
                console.log(`✅ Union query row count: ${countRows[0].count}`);
            } catch (e) {
                console.error(`❌ Union query failed: ${e.message}`);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await connection.end();
    }
}

checkSchema();
