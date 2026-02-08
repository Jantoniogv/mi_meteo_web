const express = require('express');
const mongoose = require('mongoose');
const app = express();

// Middleware para que Express entienda los JSON que envían las estaciones
app.use(express.json());

// 1. CONEXIÓN A LA BASE DE DATOS
// Usamos variables de entorno para la seguridad (se definen en el docker-compose)
const MONGO_URI = process.env.MONGO_URL || 'mongodb://admin:password@mongodb:27017/meteoDB?authSource=admin';

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Conectado a MongoDB"))
    .catch(err => console.error("❌ Error de conexión:", err));

// 2. DEFINICIÓN DEL MODELO (Esquema de los datos)
const registroSchema = new mongoose.Schema({
    estacionId: { type: String, required: true, index: true }, // ID único de la estación
    localizacion: String,
    coordenadas: { lat: Number, lng: Number },
    temp: Number,
    hum: Number,
    lluvia: Number,
    vientoVel: Number,
    vientoDir: Number,
    presion: Number,
    voltaje_bat: Number,
    timestamp: { type: Date, default: Date.now, index: true } // Fecha y hora automática
});

const Registro = mongoose.model('Registro', registroSchema);

// 3. RUTAS (ENDPOINTS)

/**
 * POST /api/ingesta
 * Recibe los datos de las estaciones DIY cada 10 minutos
 */
app.post('/api/ingesta', async (req, res) => {
    try {
        const nuevoDato = new Registro(req.body);
        await nuevoDato.save();
        res.status(201).json({ status: "ok", mensaje: "Dato guardado" });
    } catch (error) {
        res.status(400).json({ status: "error", detalle: error.message });
    }
});

/**
 * GET /api/estaciones/estado-actual
 * Devuelve el registro más reciente de todas las estaciones
 */
app.get('/api/estaciones/estado-actual', async (req, res) => {
    try {
        const estadoActual = await Registro.aggregate([
            { $sort: { timestamp: -1 } },
            {
                $group: {
                    _id: "$estacionId", // El ID único de la estación es la clave del grupo
                    ultimoRegistro: { $first: "$$ROOT" }
                }
            },
            {
                $project: {
                    // Mantenemos el ID de la estación y extraemos los datos
                    estacionId: "$_id",
                    _id: 0, // Ocultamos el _id interno de Mongo para no confundir
                    localizacion: "$ultimoRegistro.localizacion",
                    coordenadas: "$ultimoRegistro.coordenadas",
                    temp: "$ultimoRegistro.temp",
                    hum: "$ultimoRegistro.hum",
                    lluvia: "$ultimoRegistro.lluvia",
                    vientoVel: "$ultimoRegistro.vientoVel",
                    vientoDir: "$ultimoRegistro.vientoDir",
                    presion: "$ultimoRegistro.presion",
                    voltaje_bat: "$ultimoRegistro.voltaje_bat",
                    timestamp: "$ultimoRegistro.timestamp"
                }
            }
        ]);
        res.json(estadoActual);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/estacion/:id/ultimo
 * Devuelve el registro más reciente de una estación específica
 */
app.get('/api/estacion/:id/ultimo', async (req, res) => {
    try {
        // Buscamos por ID y ordenamos por tiempo descendente (-1) para sacar el último
        const ultimo = await Registro.findOne({ estacionId: req.params.id }).sort({ timestamp: -1 });
        res.json(ultimo || { mensaje: "Estación no encontrada" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/estacion/:id/resumen-hoy
 * Calcula medias y acumulados desde las 00:00 hasta ahora
 */
app.get('/api/estacion/:id/resumen-hoy', async (req, res) => {
    try {
        const inicioDia = new Date();
        inicioDia.setHours(0, 0, 0, 0); // Forzamos las 00:00:00 del día actual

        // Usamos el Aggregation Framework de MongoDB (como una tubería de procesado)
        const resumen = await Registro.aggregate([
            {
                $match: {
                    estacionId: req.params.id,
                    timestamp: { $gte: inicioDia }
                }
            },
            {
                $group: {
                    _id: "$estacionId",
                    tempMedia: { $avg: "$temp" },      // Calcula el promedio
                    humMedia: { $avg: "$hum" },         // Promedio de humedad
                    presionMedia: { $avg: "$presion" }, // Promedio de presión
                    lluviaTotal: { $sum: "$lluvia" },  // Suma los mm acumulados
                    vientoMax: { $avg: "$vientoVel" }, // Promedio medido del día
                    registrosContados: { $sum: 1 }     // Cuántos paquetes han llegado
                }
            }
        ]);

        res.json(resumen[0] || { mensaje: "Sin datos hoy" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/estacion/:id/historico
 * Permite filtrar por rango y elegir cómo agrupar los datos (hora, día, mes)
 * Query params: ?inicio=ISO-DATE&fin=ISO-DATE&agrupar=hour|day|month
 */
app.get('/api/estacion/:id/historico', async (req, res) => {
    try {
        const { id } = req.params;
        const { inicio, fin, agrupar } = req.query;

        // Construimos el objeto de agrupación dinámico según la petición
        let idAgrupacion = { year: { $year: "$timestamp" } };
        if (agrupar === 'month' || agrupar === 'day' || agrupar === 'hour') {
            idAgrupacion.month = { $month: "$timestamp" };
        }
        if (agrupar === 'day' || agrupar === 'hour') {
            idAgrupacion.day = { $dayOfMonth: "$timestamp" };
        }
        if (agrupar === 'hour') {
            idAgrupacion.hour = { $hour: "$timestamp" };
        }

        const datos = await Registro.aggregate([
            {
                $match: {
                    estacionId: id,
                    timestamp: { $gte: new Date(inicio), $lte: new Date(fin) }
                }
            },
            {
                $group: {
                    _id: idAgrupacion,
                    tempMedia: { $avg: "$temp" },       // Promedio de temperatura
                    humMedia: { $avg: "$hum" },         // Promedio de humedad
                    presionMedia: { $avg: "$presion" }, // Promedio de presión
                    lluviaTotal: { $sum: "$lluvia" },   // Suma los mm acumulados
                    vientoMedio: { $avg: "$vientoVel" },  // Promedio de velocidad del viento
                    fechaReferencia: { $first: "$timestamp" } // Para facilitar el ordenado
                }
            },
            { $sort: { fechaReferencia: 1 } } // Orden cronológico
        ]);

        res.json(datos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Meteorológica corriendo en puerto ${PORT}`);
});