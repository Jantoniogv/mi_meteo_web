const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const app = express();

const MONGO_URI = process.env.MONGO_URL;
const PORT = process.env.PORT || 3000;

// Configuración
app.use(cors());
app.use(express.json());

// --- CONEXIÓN A MONGODB ---
mongoose.connect(MONGO_URI)
    .then(() => console.log("Conectado a MongoDB mediante .env"))
    .catch(err => console.error("Error de conexión:", err));

// --- DEFINICIÓN DEL MODELO ---
const ClimaSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    temp: Number,
    prec: Number,
    wind: Number,
    hum: Number
});

const RegistroClima = mongoose.model('RegistroClima', ClimaSchema);

// --- ENDPOINT 1: Recibir datos de la estación (POST) ---
app.post('/api/estacion', async (req, res) => {
    try {
        const nuevoRegistro = new RegistroClima(req.body);
        await nuevoRegistro.save();
        console.log("Registro guardado en BD:", req.body);
        res.status(201).json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: "Error al guardar" });
    }
});

// --- ENDPOINT 2: Servir datos a la Web (GET) ---
app.get('/api/datos', async (req, res) => {
    try {
        // Obtenemos los últimos 24 registros ordenados por fecha
        const registros = await RegistroClima.find().sort({ timestamp: -1 }).limit(24);

        // Invertimos para que el gráfico se vea de izquierda (viejo) a derecha (nuevo)
        const registrosOrdenados = registros.reverse();

        // Formateamos los datos para que el script.js los entienda directamente
        const response = {
            labels: registrosOrdenados.map(r => r.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
            temp: registrosOrdenados.map(r => r.temp),
            prec: registrosOrdenados.map(r => r.prec),
            wind: registrosOrdenados.map(r => r.wind),
            hum: registrosOrdenados.map(r => r.hum)
        };

        res.json(response);
    } catch (err) {
        res.status(500).json({ error: "Error al recuperar datos" });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor con MongoDB en http://localhost:${PORT}`);
});