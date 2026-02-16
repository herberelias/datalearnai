const NodeCache = require('node-cache');
const crypto = require('crypto');

class QueryCacheService {
    constructor() {
        this.cache = new NodeCache({ stdTTL: 3600, checkperiod: 600, useClones: false, maxKeys: 10000 });
        console.log('✅ Query cache iniciado');
    }

    generateKey(empresaId, sql) {
        const normalized = sql.trim().toLowerCase();
        const hash = crypto.createHash('md5').update(normalized).digest('hex').substring(0, 12);
        return `${empresaId}_${hash}`;
    }

    get(empresaId, sql) {
        const key = this.generateKey(empresaId, sql);
        return this.cache.get(key);
    }

    set(empresaId, sql, resultado, ttl = null) {
        const key = this.generateKey(empresaId, sql);
        if (!ttl) {
            if (sql.includes('SUM(') || sql.includes('COUNT(') || sql.includes('AVG(')) ttl = 21600;
            else if (sql.includes('CURDATE()') || sql.includes('NOW()')) ttl = 1800;
            else ttl = 3600;
        }
        this.cache.set(key, resultado, ttl);
    }

    invalidate(empresaId) {
        const keys = this.cache.keys().filter(k => k.startsWith(`${empresaId}_`));
        keys.forEach(key => this.cache.del(key));
    }

    getStats() {
        const stats = this.cache.getStats();
        return {
            hits: stats.hits,
            misses: stats.misses,
            keys: stats.keys,
            hit_rate: stats.hits / (stats.hits + stats.misses) || 0
        };
    }
}

module.exports = new QueryCacheService();
