/**
 * Script de indexación MySQL → Meilisearch
 * Ejecutar: node src/scripts/indexar_meili.js
 */

require('dotenv').config();
const pool = require('../config/database');
const axios = require('axios');

const MEILI_URL = process.env.MEILI_URL || 'http://localhost:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || 'clave123';

const headers = {
    'Authorization': `Bearer ${MEILI_KEY}`,
    'Content-Type': 'application/json'
};

async function crearIndice(indexName) {
    try {
        await axios.post(`${MEILI_URL}/indexes`, { uid: indexName, primaryKey: 'id' }, { headers });
        console.log(`✅ Índice '${indexName}' creado`);
    } catch (err) {
        if (err.response?.data?.code === 'index_already_exists') {
            console.log(`ℹ️  Índice '${indexName}' ya existe`);
        } else {
            console.error(`❌ Error creando índice '${indexName}':`, err.response?.data || err.message);
        }
    }
}

async function indexarProductos() {
    console.log('\n📦 Indexando productos...');
    try {
        const [rows] = await pool.query(`
      SELECT DISTINCT 
        \`Nombre Producto\` AS nombre,
        \`Nombre Marca\`    AS marca,
        \`Nombre Categoria Comercial\` AS categoria,
        \`Nombre Padre\` AS padre,
        \`Estado del Producto\` AS estado
      FROM producto
      WHERE \`Nombre Producto\` IS NOT NULL AND \`Nombre Producto\` != ''
      ORDER BY \`Nombre Producto\`
    `);

        const docs = rows.map((row, i) => ({
            id: i + 1,
            nombre: row.nombre,
            marca: row.marca || '',
            categoria: row.categoria || '',
            padre: row.padre || '',
            estado: row.estado || ''
        }));

        console.log(`   → ${docs.length} productos encontrados`);

        // Enviar en lotes de 1000
        const BATCH = 1000;
        for (let i = 0; i < docs.length; i += BATCH) {
            const lote = docs.slice(i, i + BATCH);
            await axios.post(`${MEILI_URL}/indexes/productos/documents`, lote, { headers });
            console.log(`   → Lote ${Math.floor(i / BATCH) + 1} enviado (${lote.length} docs)`);
        }

        console.log(`✅ Productos indexados exitosamente`);
    } catch (err) {
        console.error('❌ Error indexando productos:', err.message);
    }
}

async function indexarClientes() {
    console.log('\n👥 Indexando clientes...');
    try {
        const [rows] = await pool.query(`
      SELECT DISTINCT 
        \`Nombre de Cliente Comercial\` AS nombre,
        \`Tipo de Negocio\`             AS tipo,
        \`Nombre Canal Distribucion\`   AS canal,
        \`Departamento\`                AS departamento,
        \`Municipio\`                   AS municipio,
        \`Encargado o Vendedor\`        AS vendedor,
        \`Gerente o Superior\`          AS gerente
      FROM producto
      WHERE \`Nombre de Cliente Comercial\` IS NOT NULL 
        AND \`Nombre de Cliente Comercial\` != ''
      ORDER BY \`Nombre de Cliente Comercial\`
    `);

        const docs = rows.map((row, i) => ({
            id: i + 1,
            nombre: row.nombre,
            tipo: row.tipo || '',
            canal: row.canal || '',
            departamento: row.departamento || '',
            municipio: row.municipio || '',
            vendedor: row.vendedor || '',
            gerente: row.gerente || ''
        }));

        console.log(`   → ${docs.length} clientes encontrados`);

        // Enviar en lotes de 1000
        const BATCH = 1000;
        for (let i = 0; i < docs.length; i += BATCH) {
            const lote = docs.slice(i, i + BATCH);
            await axios.post(`${MEILI_URL}/indexes/clientes/documents`, lote, { headers });
            console.log(`   → Lote ${Math.floor(i / BATCH) + 1} enviado (${lote.length} docs)`);
        }

        console.log(`✅ Clientes indexados exitosamente`);
    } catch (err) {
        console.error('❌ Error indexando clientes:', err.message);
    }
}

async function configurarBusqueda() {
    console.log('\n⚙️  Configurando atributos de búsqueda...');
    try {
        // Campos buscables en productos expandido
        await axios.put(
            `${MEILI_URL}/indexes/productos/settings/searchable-attributes`,
            ['nombre', 'marca', 'categoria', 'padre', 'estado'],
            { headers }
        );

        // Campos buscables en clientes, regiones y vendedores expandido
        await axios.put(
            `${MEILI_URL}/indexes/clientes/settings/searchable-attributes`,
            ['nombre', 'tipo', 'canal', 'departamento', 'municipio', 'vendedor', 'gerente'],
            { headers }
        );

        console.log('✅ Atributos de búsqueda configurados');
    } catch (err) {
        console.error('❌ Error configurando:', err.message);
    }
}

async function main() {
    console.log('🚀 Iniciando indexación MySQL → Meilisearch');
    console.log(`   URL: ${MEILI_URL}`);
    console.log(`   DB:  ${process.env.DB_NAME}`);

    await crearIndice('productos');
    await crearIndice('clientes');
    await indexarProductos();
    await indexarClientes();
    await configurarBusqueda();

    console.log('\n🎉 ¡Indexación completa!');
    console.log('   Verifica con: curl http://localhost:7700/indexes/productos/stats');
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});
