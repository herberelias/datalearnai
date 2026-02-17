const regression = require('ml-regression');
const stats = require('simple-statistics');

class PredictionService {
    constructor(mysqlPool) {
        this.pool = mysqlPool;
    }

    async predictSales(empresaId, schema, options = {}) {
        const { producto = null, meses = 1 } = options;

        try {
            const historico = await this.getHistoricalData(empresaId, schema, producto);

            if (historico.length < 3) {
                return {
                    success: false,
                    error: 'Datos históricos insuficientes (mínimo 3 meses)'
                };
            }

            const X = historico.map((_, idx) => [idx]);
            const y = historico.map(item => item.value);

            const SLR = regression.SLR;
            const model = new SLR(X, y);

            const proximoIndice = historico.length + meses - 1;
            const prediccion = model.predict([proximoIndice]);

            const desviacion = stats.standardDeviation(y);
            const intervaloMin = Math.max(0, prediccion - 1.96 * desviacion);
            const intervaloMax = prediccion + 1.96 * desviacion;

            const r2 = model.score(X, y);

            await this.savePrediction(empresaId, {
                type: 'sales_forecast',
                params: options,
                result: { prediccion, intervaloMin, intervaloMax, r2 },
                model: 'linear_regression'
            });

            return {
                success: true,
                prediccion: Math.round(prediccion),
                intervalo_confianza: {
                    min: Math.round(intervaloMin),
                    max: Math.round(intervaloMax)
                },
                confianza: r2,
                datos_historicos: historico.length,
                modelo: 'Regresión Lineal'
            };

        } catch (error) {
            console.error('Error en predicción:', error);
            return { success: false, error: error.message };
        }
    }

    async getHistoricalData(empresaId, schema, producto = null) {
        const mainTableName = schema.main_table;
        const mainTableDef = schema.tables.find(t => t.name === mainTableName);

        // Determinar qué usar en el FROM: nombre de tabla o subquery virtual
        const tableSource = (mainTableDef && mainTableDef.is_virtual)
            ? `(${mainTableDef.virtual_sql}) AS \`${mainTableName}\``
            : `\`${mainTableName}\``;

        const ventaCol = schema.business_terms.venta || mainTableDef.metrics[0]?.name;
        const fechaCol = schema.business_terms.fecha || mainTableDef.dates[0]?.name;

        if (!ventaCol || !fechaCol) {
            throw new Error('No se encontraron columnas de venta o fecha');
        }

        let sql = `
      SELECT 
        DATE_FORMAT(\`${fechaCol}\`, '%Y-%m') as periodo,
        SUM(\`${ventaCol}\`) as value
      FROM ${tableSource}
      WHERE \`${fechaCol}\` >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
    `;

        if (producto && schema.business_terms.producto) {
            sql += ` AND \`${schema.business_terms.producto}\` LIKE '%${producto}%'`;
        }

        sql += ` GROUP BY periodo ORDER BY periodo ASC`;

        const [rows] = await this.pool.execute(sql);
        return rows;
    }

    async savePrediction(empresaId, data) {
        await this.pool.execute(`
      INSERT INTO ml_predictions (empresa_id, prediction_type, input_params, prediction_result, confidence_score, model_used)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
            empresaId,
            data.type,
            JSON.stringify(data.params),
            JSON.stringify(data.result),
            data.result.r2 || 0,
            data.model
        ]);
    }
}

module.exports = PredictionService;
