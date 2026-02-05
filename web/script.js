let map, myChart;
let estacionesData = [];
let currentDetailData = []; // Cache de datos de la estación seleccionada
let selectedEstacionId = null;
let currentVar = 'temp';

// 1. INICIO Y CARGA GENERAL
async function loadGeneralData() {
    try {
        const res = await fetch('/api/estaciones/estado-actual');
        estacionesData = await res.json();

        const tbody = document.getElementById('tabla-estaciones-body');
        tbody.innerHTML = estacionesData.map(est => `
            <tr onclick="showDetailView('${est.estacionId}', '${est.localizacion}')">
                <td><strong>${est.localizacion}</strong></td>
                <td>${est.temp} °C</td>
                <td>${est.hum} %</td>
                <td>${est.presion || '--'} hPa</td>
                <td>${est.lluvia} mm</td>
                <td>${est.vientoVel} km/h</td>
                <td>${formatMadridTime(est.timestamp)}</td>
            </tr>
        `).join('');
    } catch (e) { console.error("Error cargando estaciones:", e); }
}

// 2. NAVEGACIÓN Y PESTAÑAS
function showGeneralView() {
    document.getElementById('general-view').classList.remove('hidden');
    document.getElementById('detail-view').classList.add('hidden');
    loadGeneralData();
}

function showDetailView(id, nombre) {
    selectedEstacionId = id;
    document.getElementById('general-view').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');
    document.getElementById('detail-title').innerText = `Estación: ${nombre}`;

    // Activar pestaña "Hoy" por defecto
    const hoyBtn = document.querySelector('.tab-btn');
    handlePeriodChange(hoyBtn, 'hoy');
}

function handlePeriodChange(btn, tipo) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('custom-filters').classList.add('hidden');
    loadDetail(tipo);
}

function toggleCustomRange(btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('custom-filters').classList.remove('hidden');
}

function changeVariable(btn, variable) {
    document.querySelectorAll('.var-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentVar = variable;
    updateChart(); // Redibuja sin descargar datos
}

// 3. DATOS DE DETALLE
async function loadDetail(tipo) {
    let agrupar = 'hour';
    const fin = new Date().toISOString();
    let inicio = new Date();

    if (tipo === 'hoy') {
        inicio.setHours(0, 0, 0, 0);
    } else if (tipo === '7d') {
        inicio.setDate(inicio.getDate() - 7);
        agrupar = 'day';
    } else if (tipo === '12m') {
        inicio.setFullYear(inicio.getFullYear() - 1);
        agrupar = 'month';
    }

    fetchHistorico(inicio.toISOString(), fin, agrupar);
}

async function loadCustomData() {
    const inicio = document.getElementById('date-start').value;
    const fin = document.getElementById('date-end').value;
    const agrupar = document.getElementById('group-by').value;
    if (!inicio || !fin) return alert("Selecciona rango");
    fetchHistorico(new Date(inicio).toISOString(), new Date(fin).toISOString(), agrupar);
}

async function fetchHistorico(inicio, fin, agrupar) {
    const url = `/api/estacion/${selectedEstacionId}/historico?inicio=${inicio}&fin=${fin}&agrupar=${agrupar}`;
    const res = await fetch(url);
    currentDetailData = await res.json();
    renderDetailTable(agrupar);
    updateChart();
}

// 4. TABLA Y GRÁFICO
function renderDetailTable(agrupar) {
    const thead = document.getElementById('detail-head');
    const tbody = document.getElementById('detail-body');

    thead.innerHTML = `<tr><th>Fecha</th><th>Temp</th><th>Hum</th><th>Presión</th><th>Lluvia</th><th>Viento</th></tr>`;
    tbody.innerHTML = currentDetailData.map(r => `
        <tr>
            <td>${formatDateLabel(r.fechaReferencia, agrupar)}</td>
            <td>${(r.tempMedia || 0).toFixed(1)}°C</td>
            <td>${(r.humMedia || 0).toFixed(1)}%</td>
            <td>${(r.presionMedia || 0).toFixed(1)} hPa</td>
            <td>${(r.lluviaTotal || 0).toFixed(1)} mm</td>
            <td>${(r.vientoMedio || 0).toFixed(1)} km/h</td>
        </tr>
    `).join('');
}

function updateChart() {
    const ctx = document.getElementById('detailChart').getContext('2d');
    if (myChart) myChart.destroy();

    const configMap = {
        temp: { label: 'Temperatura (°C)', color: '#e74c3c', key: 'tempMedia' },
        hum: { label: 'Humedad (%)', color: '#9b59b6', key: 'humMedia' },
        presion: { label: 'Presión (hPa)', color: '#f1c40f', key: 'presionMedia' },
        lluvia: { label: 'Lluvia (mm)', color: '#3498db', key: 'lluviaTotal', type: 'bar' },
        vientoVel: { label: 'Viento (km/h)', color: '#95a5a6', key: 'vientoMedio' }
    };

    const c = configMap[currentVar];

    myChart = new Chart(ctx, {
        type: c.type || 'line',
        data: {
            labels: currentDetailData.map(r => formatDateLabel(r.fechaReferencia)),
            datasets: [{
                label: c.label,
                data: currentDetailData.map(r => r[c.key]),
                borderColor: c.color,
                backgroundColor: c.color + '40',
                fill: true,
                tension: 0.3
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// 5. MAPA Y ÚTILES
const modal = document.getElementById("mapModal");
document.getElementById("openMap").onclick = () => { modal.style.display = "block"; initMap(); };
document.querySelector(".close-modal").onclick = () => modal.style.display = "none";

function initMap() {
    if (!map) {
        map = L.map('map').setView([40.41, -3.70], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    }
    setTimeout(() => {
        map.invalidateSize();
        estacionesData.forEach(est => {
            if (est.coordenadas) {
                L.marker([est.coordenadas.lat, est.coordenadas.lng]).addTo(map)
                    .bindPopup(`<b>${est.localizacion}</b><br><button onclick="showDetailView('${est.estacionId}','${est.localizacion}')">Ver Datos</button>`);
            }
        });
    }, 200);
}

function formatMadridTime(d) { return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', timeStyle: 'short', dateStyle: 'short' }).format(new Date(d)); }
function formatDateLabel(d, ag) {
    const date = new Date(d);
    if (ag === 'hour') return date.getHours() + ':00';
    if (ag === 'month') return date.toLocaleString('es-ES', { month: 'short', year: 'numeric' });
    if (ag === 'year') return date.getFullYear();
    return date.toLocaleDateString('es-ES');
}

window.onload = loadGeneralData;