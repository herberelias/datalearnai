const schemaDiscovery = require('./schemaDiscovery.service');

class SchemaCacheService {
    constructor(mysqlPool) {
        this.pool = mysqlPool;
    }

    async getSchema(empresaId, dbConfig) {
        const cached = await this.getCached(empresaId);
        if (cached && !this.isExpired(cached)) {
            console.log(`✅ Schema de ${empresaId} desde caché`);
            return JSON.parse(cached.schema_data);
        }

        console.log(`🔍 Descubriendo schema de ${empresaId}...`);
        const startTime = Date.now();
        const schema = await schemaDiscovery.discoverDatabase(dbConfig);
        const duration = Date.now() - startTime;

        await this.saveToCache(empresaId, schema, duration);
        return schema;
    }

    async getCached(empresaId) {
        const [rows] = await this.pool.execute('SELECT * FROM schema_cache WHERE empresa_id = ?', [empresaId]);
        return rows[0] || null;
    }

    isExpired(cached) {
        if (!cached.expires_at) return false;
        return new Date(cached.expires_at) < new Date();
    }

    async saveToCache(empresaId, schema, duration) {
        const mainTable = schema.main_table;
        const mainTableInfo = schema.tables.find(t => t.name === mainTable);
        const totalColumnas = mainTableInfo ? mainTableInfo.columns.length : 0;
        const totalRegistros = mainTableInfo ? mainTableInfo.row_count : 0;

        await this.pool.execute(`
      INSERT INTO schema_cache 
        (empresa_id, schema_data, tabla_principal, total_columnas, total_registros, database_name, discovery_duration_ms, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))
      ON DUPLICATE KEY UPDATE
        schema_data = VALUES(schema_data),
        tabla_principal = VALUES(tabla_principal),
        total_columnas = VALUES(total_columnas),
        total_registros = VALUES(total_registros),
        discovery_duration_ms = VALUES(discovery_duration_ms),
        updated_at = NOW(),
        expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR)
    `, [empresaId, JSON.stringify(schema), mainTable, totalColumnas, totalRegistros, schema.database_name, duration]);
    }

    async refreshSchema(empresaId, dbConfig) {
        await this.pool.execute('DELETE FROM schema_cache WHERE empresa_id = ?', [empresaId]);
        return await this.getSchema(empresaId, dbConfig);
    }

    async getCacheStats() {
        const [rows] = await this.pool.execute(`
      SELECT COUNT(*) as total_empresas, AVG(total_columnas) as promedio_columnas,
             AVG(discovery_duration_ms) as promedio_discovery_ms,
             SUM(CASE WHEN expires_at < NOW() THEN 1 ELSE 0 END) as expirados
      FROM schema_cache
    `);
        return rows[0];
    }
}

module.exports = SchemaCacheService;
