const mysql = require('mysql2/promise');

class SchemaDiscoveryService {

  async discoverDatabase(dbConfig) {
    const connection = await mysql.createConnection(dbConfig);
    try {
      const schema = { database_name: dbConfig.database, discovered_at: new Date().toISOString(), tables: [] };

      const [tables] = await connection.execute(`
        SELECT TABLE_NAME as name, TABLE_ROWS as row_count, DATA_LENGTH as size_bytes
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? 
          AND TABLE_TYPE = 'BASE TABLE'
          AND TABLE_NAME NOT LIKE '%backup%'
          AND TABLE_NAME NOT LIKE '%old%'
          AND TABLE_NAME NOT LIKE '%_bak%'
          AND TABLE_NAME NOT LIKE '%_tmp%'
        ORDER BY TABLE_ROWS DESC
      `, [dbConfig.database]);

      for (const table of tables) {
        const [columns] = await connection.execute(`
          SELECT COLUMN_NAME as name, DATA_TYPE as type, COLUMN_TYPE as full_type,
                 IS_NULLABLE as nullable, COLUMN_KEY as key_type
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION
        `, [dbConfig.database, table.name]);

        const analyzedColumns = columns.map(col => ({
          name: col.name,
          type: col.type,
          full_type: col.full_type,
          nullable: col.nullable === 'YES',
          is_primary_key: col.key_type === 'PRI',
          role: this.inferColumnRole(col),
          aggregation: this.suggestAggregation(col)
        }));

        schema.tables.push({
          name: table.name,
          row_count: table.row_count,
          columns: analyzedColumns,
          metrics: analyzedColumns.filter(c => c.role.startsWith('metric_')),
          categories: analyzedColumns.filter(c => c.role === 'category'),
          dates: analyzedColumns.filter(c => c.role === 'date')
        });
      }

      schema.main_table = tables[0]?.name || null;
      schema.business_terms = this.extractBusinessTerms(schema);
      return schema;
    } finally {
      await connection.end();
    }
  }

  inferColumnRole(column) {
    const name = column.name.toLowerCase();
    const type = column.type.toLowerCase();

    if (name.includes('id') || name.includes('codigo') || name.includes('code') || column.key_type === 'PRI') return 'identifier';
    if (name.includes('fecha') || name.includes('date') || name.includes('año') || name.includes('mes') || name.includes('year') || name.includes('month') || type.includes('date') || type.includes('timestamp')) return 'date';
    if ((name.includes('venta') || name.includes('sale') || name.includes('precio') || name.includes('price') || name.includes('monto') || name.includes('amount') || name.includes('total') || name.includes('costo') || name.includes('cost') || name.includes('$')) && (type.includes('decimal') || type.includes('float') || type.includes('double'))) return 'metric_monetary';
    if ((name.includes('cantidad') || name.includes('quantity') || name.includes('qty') || name.includes('unidades') || name.includes('units') || name.includes('cajas') || name.includes('boxes')) && (type.includes('int') || type.includes('decimal'))) return 'metric_quantity';
    if (name.includes('nombre') || name.includes('name') || name.includes('tipo') || name.includes('type') || name.includes('categoria') || name.includes('category') || name.includes('marca') || name.includes('brand') || name.includes('estado') || name.includes('status')) return 'category';
    if (name.includes('latitud') || name.includes('latitude') || name.includes('longitud') || name.includes('longitude')) return 'coordinate';
    if (type === 'varchar' || type === 'text') return 'label';

    return 'unknown';
  }

  suggestAggregation(column) {
    const role = this.inferColumnRole(column);
    if (role === 'metric_monetary' || role === 'metric_quantity') return 'SUM';
    if (role === 'category' || role === 'label') return 'GROUP BY';
    if (role === 'date' || role === 'identifier') return 'WHERE';
    return null;
  }

  extractBusinessTerms(schema) {
    const mainTable = schema.tables.find(t => t.name === schema.main_table);
    if (!mainTable) return {};

    const terms = {};
    const ventaCol = mainTable.metrics.find(c => (c.name.toLowerCase().includes('venta') || c.name.toLowerCase().includes('sale')) && c.role === 'metric_monetary');
    if (ventaCol) terms.venta = ventaCol.name;

    const productoCol = mainTable.categories.find(c => c.name.toLowerCase().includes('producto') || c.name.toLowerCase().includes('product'));
    if (productoCol) terms.producto = productoCol.name;

    const clienteCol = mainTable.categories.find(c => c.name.toLowerCase().includes('cliente') || c.name.toLowerCase().includes('customer') || c.name.toLowerCase().includes('client'));
    if (clienteCol) terms.cliente = clienteCol.name;

    const marcaCol = mainTable.categories.find(c => c.name.toLowerCase().includes('marca') || c.name.toLowerCase().includes('brand'));
    if (marcaCol) terms.marca = marcaCol.name;

    const fechaCol = mainTable.dates[0];
    if (fechaCol) terms.fecha = fechaCol.name;

    return terms;
  }
}

module.exports = new SchemaDiscoveryService();
