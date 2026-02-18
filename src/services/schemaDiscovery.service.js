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

      const yearTables = [];

      for (const table of tables) {
        // Detectar si es una tabla de año (ej: "2023", "2024")
        if (/^20[2-9][0-9]$/.test(table.name)) {
          yearTables.push(table.name);
        }

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

      // LÓGICA ESPECIAL: Si hay tablas de años, crear una "vista virtual" para Gemini
      if (yearTables.length > 1) {
        const mainYearTable = schema.tables.find(t => t.name === yearTables[0]);
        if (mainYearTable) {
          const unionTable = {
            ...mainYearTable,
            name: 'ventas_union_anuales',
            description: `Vista virtual que une las tablas de los años: ${yearTables.join(', ')}`,
            is_virtual: true,
            virtual_sql: yearTables.map(t => `SELECT * FROM \`${t}\``).join(' UNION ALL ')
          };
          schema.tables.unshift(unionTable); // Ponerla al principio
          schema.main_table = unionTable.name;
        }
      } else {
        schema.main_table = tables[0]?.name || null;
      }

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
    if ((name.includes('venta') || name.includes('sale') || name.includes('precio') || name.includes('price') || name.includes('monto') || name.includes('amount') || name.includes('total') || name.includes('costo') || name.includes('cost') || name.includes('net') || name.includes('$')) && (type.includes('decimal') || type.includes('float') || type.includes('double'))) return 'metric_monetary';
    if ((name.includes('cantidad') || name.includes('quantity') || name.includes('qty') || name.includes('unidades') || name.includes('units') || name.includes('cajas') || name.includes('boxes')) && (type.includes('int') || type.includes('decimal'))) return 'metric_quantity';
    if (name.includes('nombre') || name.includes('name') || name.includes('tipo') || name.includes('type') || name.includes('categoria') || name.includes('category') || name.includes('marca') || name.includes('brand') || name.includes('estado') || name.includes('status') || name.includes('producto') || name.includes('cliente')) return 'category';
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

    // 1. Mejorar detección de VENTAS (Priorizar Venta Neta)
    const ventasCols = mainTable.metrics.filter(c =>
      (c.name.toLowerCase().includes('venta') || c.name.toLowerCase().includes('sale')) &&
      c.role === 'metric_monetary'
    );

    // Buscar "neto" explícitamente primero
    const ventaNeta = ventasCols.find(c => c.name.toLowerCase().includes('net'));
    if (ventaNeta) {
      terms.venta = ventaNeta.name;
    } else if (ventasCols.length > 0) {
      // Si no hay neto, usar el primero que encontró como fallback
      terms.venta = ventasCols[0].name;
    }

    // 2. Mejorar detección de PRODUCTO (Evitar IDs)
    const productoCols = mainTable.categories.filter(c =>
      (c.name.toLowerCase().includes('producto') || c.name.toLowerCase().includes('product')) &&
      !c.name.toLowerCase().includes('id') &&
      !c.name.toLowerCase().includes('cod')
    );

    const nombreProducto = productoCols.find(c => c.name.toLowerCase().includes('nombre') || c.name.toLowerCase().includes('name'));
    if (nombreProducto) {
      terms.producto = nombreProducto.name;
    } else if (productoCols.length > 0) {
      terms.producto = productoCols[0].name;
    }

    const clienteCol = mainTable.categories.find(c => c.name.toLowerCase().includes('cliente') || c.name.toLowerCase().includes('customer') || c.name.toLowerCase().includes('client'));
    if (clienteCol) terms.cliente = clienteCol.name;

    const marcaCol = mainTable.categories.find(c => c.name.toLowerCase().includes('marca') || c.name.toLowerCase().includes('brand'));
    if (marcaCol) terms.marca = marcaCol.name;

    // 3. Mejorar detección de FECJA (Priorizar Fecha completa sobre Año/Mes)
    const dateMock = mainTable.dates.find(c =>
      (c.name.toLowerCase().includes('fecha') || c.name.toLowerCase().includes('date')) &&
      !c.name.toLowerCase().includes('año') &&
      !c.name.toLowerCase().includes('year')
    );

    if (dateMock) {
      terms.fecha = dateMock.name;
    } else if (mainTable.dates.length > 0) {
      // Fallback: usar el primero que encuentre
      terms.fecha = mainTable.dates[0].name;
    }

    return terms;
  }
}

module.exports = new SchemaDiscoveryService();
