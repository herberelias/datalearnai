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
    console.log('\n📦 Indexando todo el catálogo de productos (con códigos completos)...');
    try {
        const [rows] = await pool.query(`
      SELECT DISTINCT 
        \`Codigo Producto\` AS codigo_producto,
        \`Nombre Producto\` AS nombre,
        \`Codigo Padre\` AS codigo_padre,
        \`Nombre Padre\` AS nombre_padre,
        \`Estado del Producto\` AS estado,
        \`Codigo Marca\` AS codigo_marca,
        \`Nombre Marca\` AS marca,
        \`Codigo Categoria Comercial\` AS codigo_categoria,
        \`Nombre Categoria Comercial\` AS categoria,
        \`Codigo Sub Categoria\` AS codigo_subcategoria,
        \`Nombre Sub Categoria\` AS subcategoria
      FROM producto
      WHERE \`Nombre Producto\` IS NOT NULL AND \`Nombre Producto\` != ''
    `);

        const docs = rows.map((row, i) => ({
            id: i + 1,
            codigo_producto: row.codigo_producto || '',
            nombre: row.nombre || '',
            codigo_padre: row.codigo_padre || '',
            nombre_padre: row.nombre_padre || '',
            estado: row.estado || '',
            codigo_marca: row.codigo_marca || '',
            marca: row.marca || '',
            codigo_categoria: row.codigo_categoria || '',
            categoria: row.categoria || '',
            codigo_subcategoria: row.codigo_subcategoria || '',
            subcategoria: row.subcategoria || ''
        }));

        console.log(`   → ${docs.length} productos encontrados con toda su línea jerárquica`);

        const BATCH = 1000;
        for (let i = 0; i < docs.length; i += BATCH) {
            const lote = docs.slice(i, i + BATCH);
            await axios.post(`${MEILI_URL}/indexes/productos/documents`, lote, { headers });
            console.log(`   → Lote ${Math.floor(i / BATCH) + 1} enviado (${lote.length} docs)`);
        }
        console.log(`✅ Productos y todos sus códigos indexados exitosamente`);
    } catch (err) {
        console.error('❌ Error indexando productos:', err.message);
    }
}

async function indexarClientes() {
    console.log('\n👥 Indexando todo el catálogo de clientes, vendedores, rutas y zonas...');
    try {
        const [rows] = await pool.query(`
      SELECT DISTINCT 
        \`Codigo de Cliente\` AS codigo_cliente,
        \`Nombre de Cliente Comercial\` AS nombre_comercial,
        \`Codigo Cliente Razon Social\` AS codigo_razon_social,
        \`Nombre Cliente Razon Social\` AS razon_social,
        \`Cod Tipo Negocio\` AS codigo_tipo_negocio,
        \`Tipo de Negocio\` AS tipo,
        \`Cod Canal Distribucion\` AS codigo_canal,
        \`Nombre Canal Distribucion\` AS canal,
        \`Codigo de Vendedor Transaccion\` AS codigo_vendedor_transaccion,
        \`Nombre de Vendedor Transaccion\` AS vendedor_transaccion,
        \`Codigo Vendedor Asignado\` AS codigo_vendedor,
        \`Nombre Vendedor Asignado\` AS vendedor,
        \`NombreDominioSupervisor\` AS supervisor_gerente,
        \`Pais\` AS pais,
        \`Nombre Departamento\` AS departamento,
        \`Codigo Municipio\` AS codigo_municipio,
        \`nombre Municipio\` AS municipio,
        \`Codigo Distrito\` AS codigo_distrito,
        \`Nombre Distrito\` AS distrito
      FROM producto
      WHERE \`Nombre de Cliente Comercial\` IS NOT NULL 
        AND \`Nombre de Cliente Comercial\` != ''
    `);

        const docs = rows.map((row, i) => ({
            id: i + 1,
            codigo_cliente: row.codigo_cliente || '',
            nombre: row.nombre_comercial || '',
            codigo_razon_social: row.codigo_razon_social || '',
            razon_social: row.razon_social || '',
            codigo_tipo_negocio: row.codigo_tipo_negocio || '',
            tipo: row.tipo || '',
            codigo_canal: row.codigo_canal || '',
            canal: row.canal || '',
            codigo_vendedor_transaccion: row.codigo_vendedor_transaccion || '',
            vendedor_transaccion: row.vendedor_transaccion || '',
            codigo_vendedor: row.codigo_vendedor || '',
            vendedor: row.vendedor || '',
            gerente: row.supervisor_gerente || '',
            pais: row.pais || '',
            departamento: row.departamento || '',
            codigo_municipio: row.codigo_municipio || '',
            municipio: row.municipio || '',
            codigo_distrito: row.codigo_distrito || '',
            distrito: row.distrito || ''
        }));

        console.log(`   → ${docs.length} clientes encontrados con su geografía y vendedores`);

        const BATCH = 1000;
        for (let i = 0; i < docs.length; i += BATCH) {
            const lote = docs.slice(i, i + BATCH);
            await axios.post(`${MEILI_URL}/indexes/clientes/documents`, lote, { headers });
            console.log(`   → Lote ${Math.floor(i / BATCH) + 1} enviado (${lote.length} docs)`);
        }
        console.log(`✅ Clientes, zonas, y vendedores completos indexados exitosamente`);
    } catch (err) {
        console.error('❌ Error indexando clientes:', err.message);
    }
}

async function configurarBusqueda() {
    console.log('\n⚙️  Configurando TODO el poder del buscador...');
    try {
        await axios.put(
            `${MEILI_URL}/indexes/productos/settings/searchable-attributes`,
            [
                'codigo_producto', 'nombre', 'codigo_padre', 'nombre_padre',
                'estado', 'codigo_marca', 'marca', 'codigo_categoria',
                'categoria', 'codigo_subcategoria', 'subcategoria'
            ],
            { headers }
        );

        await axios.put(
            `${MEILI_URL}/indexes/clientes/settings/searchable-attributes`,
            [
                'codigo_cliente', 'nombre', 'codigo_razon_social', 'razon_social',
                'codigo_tipo_negocio', 'tipo', 'codigo_canal', 'canal',
                'codigo_vendedor_transaccion', 'vendedor_transaccion',
                'codigo_vendedor', 'vendedor', 'gerente', 'pais', 'departamento',
                'codigo_municipio', 'municipio', 'codigo_distrito', 'distrito'
            ],
            { headers }
        );

        console.log('✅ Buscador Universal configurado para reconocer sin limitaciones nombres y códigos');
    } catch (err) {
        console.error('❌ Error configurando:', err.message);
    }
}

async function main() {
    console.log('🚀 Iniciando indexación Universal MySQL → Meilisearch');
    console.log(`   URL: ${MEILI_URL}`);
    console.log(`   DB:  ${process.env.DB_NAME}`);

    await crearIndice('productos');
    await crearIndice('clientes');
    await indexarProductos();
    await indexarClientes();
    await configurarBusqueda();

    console.log('\n🎉 ¡Indexación Universal completa!');
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});
