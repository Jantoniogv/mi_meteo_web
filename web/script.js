const modal = document.getElementById("mapModal");
const map = L.map('map').setView([41.64, -0.88], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

document.getElementById('openMapBtn').onclick = () => {
    modal.style.display = "block";
    setTimeout(() => map.invalidateSize(), 200);
};
document.querySelector('.close').onclick = () => modal.style.display = "none";

let currentChart;
let lastData = { labels: [], temp: [], prec: [], wind: [] };
let activeVar = 'temp';

const stations = [
    { name: "Los Juncares", id: "local", lat: 0, lon: 0 },
    { name: "Zaragoza", lat: 41.6483, lon: -0.8891 },
    { name: "Madrid", lat: 40.4167, lon: -3.7033 },
    { name: "Barcelona", lat: 41.3887, lon: 2.1589 },
    { name: "Sevilla", lat: 37.3828, lon: -5.9731 }
];

let state = { station: stations[0], scale: 'hourly' };

stations.forEach(st => {
    L.marker([st.lat, st.lon]).addTo(map).on('click', () => {
        state.station = st;
        document.getElementById('stationName').innerText = st.name;
        modal.style.display = "none";
        fetchData();
    });
});

document.getElementById('timeScale').onchange = (e) => { state.scale = e.target.value; fetchData(); };
document.getElementById('exportBtn').onclick = exportToCSV;

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeVar = e.target.dataset.var;
        renderChart();
    };
});

async function fetchData() {
    if (state.station.id === "local") {
        try {
            const res = await fetch('/api/datos');
            const data = await res.json();

            // Adaptamos los datos locales al formato de la app
            lastData = data;
            updateTable();
            renderChart();
        } catch (err) {
            alert("No se pudo conectar con la estación casera. ¿Está el servidor Node encendido?");
        }
        return; // Salimos para no ejecutar la llamada a Open-Meteo
    }
    const { lat, lon } = state.station;
    let url = "";
    const now = new Date();
    const formatDate = (date) => date.toISOString().split('T')[0];

    if (state.scale === 'hourly') {
        url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,wind_speed_10m&forecast_days=1`;
    }
    else if (state.scale === 'daily') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${formatDate(sevenDaysAgo)}&end_date=${formatDate(now)}&daily=temperature_2m_mean,precipitation_sum,wind_speed_10m_max&timezone=auto`;
    }
    else if (state.scale === 'monthly') {
        url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2025-01-01&end_date=2025-12-31&daily=temperature_2m_mean,precipitation_sum,wind_speed_10m_max&timezone=auto`;
    }
    else {
        url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2020-01-01&end_date=2025-12-31&daily=temperature_2m_mean,precipitation_sum,wind_speed_10m_max&timezone=auto`;
    }

    const res = await fetch(url);
    const data = await res.json();
    processData(data);
}

function processData(data) {
    if (state.scale === 'hourly') {
        lastData.labels = data.hourly.time.map(t => t.split('T')[1]);
        lastData.temp = data.hourly.temperature_2m;
        lastData.prec = data.hourly.precipitation;
        lastData.wind = data.hourly.wind_speed_10m;
    } else {
        const isAgregated = (state.scale === 'monthly' || state.scale === 'yearly');
        const rawTime = data.daily.time;
        const rawTemp = data.daily.temperature_2m_mean;
        const rawPrec = data.daily.precipitation_sum;
        const rawWind = data.daily.wind_speed_10m_max;

        if (!isAgregated) {
            lastData.labels = rawTime; lastData.temp = rawTemp; lastData.prec = rawPrec; lastData.wind = rawWind;
        } else {
            const grouped = {};
            rawTime.forEach((t, i) => {
                const key = (state.scale === 'yearly') ? t.substring(0, 4) : t.substring(0, 7);
                if (!grouped[key]) grouped[key] = { t: [], p: [], w: [] };
                grouped[key].t.push(rawTemp[i]);
                grouped[key].p.push(rawPrec[i]);
                grouped[key].w.push(rawWind[i]);
            });
            lastData.labels = Object.keys(grouped);
            lastData.temp = lastData.labels.map(k => (grouped[k].t.reduce((a, b) => a + b, 0) / grouped[k].t.length).toFixed(1));
            lastData.prec = lastData.labels.map(k => (grouped[k].p.reduce((a, b) => a + b, 0)).toFixed(1));
            lastData.wind = lastData.labels.map(k => (grouped[k].w.reduce((a, b) => a + b, 0) / grouped[k].w.length).toFixed(1));
        }
    }
    updateTable();
    renderChart();
}

function updateTable() {
    document.getElementById('tableHeader').innerHTML = `<th>Periodo</th><th>Temp Med</th><th>Lluvia</th><th>Viento Med</th>`;
    document.getElementById('tableBody').innerHTML = lastData.labels.map((l, i) => `
        <tr><td>${l}</td><td>${lastData.temp[i]}°C</td><td>${lastData.prec[i]}mm</td><td>${lastData.wind[i]}km/h</td></tr>
    `).join('');
}

function renderChart() {
    const ctx = document.getElementById('weatherChart').getContext('2d');
    if (currentChart) currentChart.destroy();
    // Dentro de renderChart()
    const config = {
        temp: { label: 'Temp. Media (°C)', data: lastData.temp, color: '#e67e22', type: 'line' },
        prec: { label: 'Prec. Total (mm)', data: lastData.prec, color: '#3498db', type: 'bar' },
        wind: { label: 'Viento Medio (km/h)', data: lastData.wind, color: '#95a5a6', type: 'line' },
        hum: { label: 'Humedad (%)', data: lastData.hum, color: '#2ecc71', type: 'line' } // Añadido
    };
    const activeConfig = config[activeVar];
    currentChart = new Chart(ctx, {
        type: activeConfig.type,
        data: {
            labels: lastData.labels,
            datasets: [{ label: activeConfig.label, data: activeConfig.data, borderColor: activeConfig.color, backgroundColor: activeConfig.type === 'bar' ? activeConfig.color + '66' : 'transparent', fill: activeConfig.type === 'bar', tension: 0.3 }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function exportToCSV() {
    let csv = "Periodo,Temp_Media_C,Precip_mm,Viento_Med_kmh\n";
    lastData.labels.forEach((l, i) => { csv += `${l},${lastData.temp[i]},${lastData.prec[i]},${lastData.wind[i]}\n`; });
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `MiMeteoWeb_datos.csv`;
    link.click();
}

fetchData();