const stats = require('simple-statistics');

class SegmentationService {
    constructor(mysqlPool) {
        this.pool = mysqlPool;
    }

    async segmentRFM(empresaId, schema) {
        try {
            const mainTableName = schema.main_table;
            const mainTableDef = schema.tables.find(t => t.name === mainTableName);

            // Determinar qué usar en el FROM: nombre de tabla o subquery virtual
            const tableSource = (mainTableDef && mainTableDef.is_virtual)
                ? `(${mainTableDef.virtual_sql}) AS \`${mainTableName}\``
                : `\`${mainTableName}\``;

            const ventaCol = schema.business_terms.venta || mainTableDef.metrics[0]?.name;
            const fechaCol = schema.business_terms.fecha || mainTableDef.dates[0]?.name;
            const clienteCol = schema.business_terms.cliente;

            if (!ventaCol || !fechaCol || !clienteCol) {
                return { success: false, error: 'Faltan columnas necesarias para RFM' };
            }

            const [clientes] = await this.pool.execute(`
        SELECT 
          \`${clienteCol}\` as cliente,
          DATEDIFF(CURDATE(), MAX(\`${fechaCol}\`)) as recency,
          COUNT(DISTINCT \`${fechaCol}\`) as frequency,
          SUM(\`${ventaCol}\`) as monetary
        FROM ${tableSource}
        WHERE \`${fechaCol}\` >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
        GROUP BY \`${clienteCol}\`
        HAVING monetary > 0
      `);

            if (clientes.length === 0) {
                return { success: false, error: 'No hay datos suficientes' };
            }

            const recencies = clientes.map(c => c.recency);
            const frequencies = clientes.map(c => c.frequency);
            const monetaries = clientes.map(c => c.monetary);

            const recencyPercentiles = [
                stats.quantile(recencies, 0.33),
                stats.quantile(recencies, 0.67)
            ];
            const frequencyPercentiles = [
                stats.quantile(frequencies, 0.33),
                stats.quantile(frequencies, 0.67)
            ];
            const monetaryPercentiles = [
                stats.quantile(monetaries, 0.33),
                stats.quantile(monetaries, 0.67)
            ];

            const segmented = clientes.map(c => {
                const rScore = c.recency <= recencyPercentiles[0] ? 3 : (c.recency <= recencyPercentiles[1] ? 2 : 1);
                const fScore = c.frequency >= frequencyPercentiles[1] ? 3 : (c.frequency >= frequencyPercentiles[0] ? 2 : 1);
                const mScore = c.monetary >= monetaryPercentiles[1] ? 3 : (c.monetary >= monetaryPercentiles[0] ? 2 : 1);

                let segmento = 'Otros';
                if (rScore === 3 && fScore === 3 && mScore === 3) segmento = 'Campeones';
                else if (rScore >= 2 && fScore >= 2 && mScore >= 2) segmento = 'Leales';
                else if (rScore >= 2 && fScore <= 2 && mScore >= 2) segmento = 'Potenciales';
                else if (rScore <= 2 && fScore >= 2) segmento = 'En Riesgo';
                else if (rScore === 1) segmento = 'Perdidos';

                return {
                    cliente: c.cliente,
                    recency: c.recency,
                    frequency: c.frequency,
                    monetary: Math.round(c.monetary),
                    r_score: rScore,
                    f_score: fScore,
                    m_score: mScore,
                    segmento: segmento
                };
            });

            const resumen = {};
            segmented.forEach(c => {
                if (!resumen[c.segmento]) resumen[c.segmento] = { count: 0, total_monetary: 0 };
                resumen[c.segmento].count++;
                resumen[c.segmento].total_monetary += c.monetary;
            });

            return {
                success: true,
                total_clientes: clientes.length,
                segmentos: resumen,
                clientes: segmented.slice(0, 50)
            };

        } catch (error) {
            console.error('Error en segmentación:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = SegmentationService;
