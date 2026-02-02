let map, myChart;
let selectedEstacionId = null;

// --- UTILIDADES ---

// Formatea fecha a hora local Madrid
const formatMadridTime = (dateStr) => {
    return new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        dateStyle: 'short',
        timeStyle: 'medium'
    }).format(new Date(dateStr));
};

// --- LÓGICA DE INTERFAZ (VISTAS Y MODAL) ---

const modal = document.getElementById("mapModal");
const btnMap = document.getElementById("openMap");
const spanClose = document.getElementsByClassName("close")[0];

btnMap.onclick = () => {
    modal.style.display = "block";
    initMap();
};

spanClose.onclick = () => modal.style.display = "none";

window.onclick = (event) => {
    if (event.target == modal) modal.style.display = "none";
};

function showGeneralView() {
    document.getElementById('general-view').classList.remove('hidden');
    document.getElementById('detail-view').classList.add('hidden');
    loadGeneralData();
}

async function showDetailView(id, nombre) {
    selectedEstacionId = id;
    document.getElementById('general-view').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');
    document.getElementById('detail-title').innerText = `Estación: ${nombre}`;
    modal.style.display = "none";

    // Al entrar, cargar por defecto la pestaña "Hoy"
    setActiveTab(document.querySelector('.tab-btn'));
    loadDetail('hoy');
}

function setActiveTab(element) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    element.classList.add('active');
}

function showCustomRange() {
    document.getElementById('custom-filters').classList.remove('hidden');
}

// --- LLAMADAS A LA API ---

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
                <td>${est.lluvia} mm</td>
                <td>${est.vientoVel} km/h</td>
                <td>${formatMadridTime(est.timestamp)}</td>
            </tr>
        `).join('');

        renderMarkers();
    } catch (e) { console.error("Error cargando estaciones:", e); }
}

function renderMarkers() {
    if (!map) return;

    estacionesData.forEach(est => {
        if (est.coordenadas?.lat && est.coordenadas?.lng) {
            const marker = L.marker([est.coordenadas.lat, est.coordenadas.lng]).addTo(map);

            // Aquí usamos est.estacionId para que el botón sepa a quién llamar
            marker.bindPopup(`
                <div style="text-align:center; font-family: sans-serif;">
                    <h3 style="margin:0 0 5px 0">${est.localizacion}</h3>
                    <p style="margin:0">${est.temp} °C | ${est.hum} % Hum.</p>
                    <button class="btn-map" style="margin-top:10px" 
                        onclick="showDetailView('${est.estacionId}', '${est.localizacion}')">
                        Ver Datos Detallados
                    </button>
                </div>
            `);
        }
    });
}

async function loadDetail(tipo) {
    // 1. Resetear UI
    document.getElementById('custom-filters').classList.add('hidden');
    if (myChart) myChart.destroy();

    let url = `/api/estacion/${selectedEstacionId}/historico`;
    const fin = new Date().toISOString();
    let inicio = new Date();
    let agrupar = 'hour'; // Por defecto para "Hoy"

    // 2. Definir rangos según la pestaña
    if (tipo === 'hoy') {
        inicio.setHours(0, 0, 0, 0); // Desde las 00:00 de hoy
        agrupar = 'hour';
    } else if (tipo === '7d') {
        inicio.setDate(inicio.getDate() - 7);
        agrupar = 'day';
    } else if (tipo === '12m') {
        inicio.setFullYear(inicio.getFullYear() - 1);
        agrupar = 'month';
    }

    // 3. Construir URL con parámetros
    const query = `?inicio=${inicio.toISOString()}&fin=${fin}&agrupar=${agrupar}`;

    try {
        const res = await fetch(url + query);
        const data = await res.json();

        if (!data || data.length === 0) {
            document.getElementById('detail-body').innerHTML = '<tr><td colspan="3">No hay datos en este periodo</td></tr>';
            return;
        }

        renderDetail(data, agrupar);
    } catch (e) {
        console.error("Error cargando detalles:", e);
    }
}

async function loadCustomData() {
    const inicio = document.getElementById('date-start').value;
    const fin = document.getElementById('date-end').value;
    const agrupar = document.getElementById('group-by').value;

    if (!inicio || !fin) return alert("Selecciona fechas");

    const url = `/api/estacion/${selectedEstacionId}/historico?inicio=${new Date(inicio).toISOString()}&fin=${new Date(fin).toISOString()}&agrupar=${agrupar}`;
    const res = await fetch(url);
    const data = await res.json();
    renderDetail(data);
}

// --- RENDERIZADO DE TABLA Y GRÁFICO ---

function renderDetail(registros, agrupar) {
    const tbody = document.getElementById('detail-body');
    const thead = document.getElementById('detail-head');

    // Encabezado dinámico según agrupación
    thead.innerHTML = `<tr>
        <th>${agrupar === 'hour' ? 'Hora' : 'Fecha'}</th>
        <th>Temp Media</th>
        <th>Lluvia Total</th>
    </tr>`;

    // Llenar tabla
    tbody.innerHTML = registros.map(r => {
        const fecha = new Date(r.fechaReferencia);
        let etiqueta = "";

        if (agrupar === 'hour') {
            etiqueta = fecha.getHours() + ":00";
        } else if (agrupar === 'day') {
            etiqueta = fecha.toLocaleDateString('es-ES');
        } else {
            etiqueta = fecha.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        }

        return `<tr>
            <td>${etiqueta}</td>
            <td>${r.tempPromedio.toFixed(1)} °C</td>
            <td>${r.lluviaAcumulada.toFixed(1)} mm</td>
        </tr>`;
    }).join('');

    // Actualizar Gráfico
    updateChart(registros, agrupar);
}

function updateChart(registros) {
    const ctx = document.getElementById('detailChart').getContext('2d');

    if (myChart) myChart.destroy();

    const labels = registros.map(r => r.fechaReferencia ? formatMadridTime(r.fechaReferencia).split(',')[0] : 'Hoy');
    const temps = registros.map(r => r.tempPromedio || r.tempMedia);
    const lluvias = registros.map(r => r.lluviaAcumulada || r.lluviaTotal);

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Temperatura (°C)',
                    data: temps,
                    borderColor: '#e74c3c',
                    yAxisID: 'y'
                },
                {
                    label: 'Lluvia (mm)',
                    data: lluvias,
                    backgroundColor: 'rgba(52, 152, 219, 0.5)',
                    type: 'bar',
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            scales: {
                y: { type: 'linear', position: 'left', title: { display: true, text: 'Temp °C' } },
                y1: { type: 'linear', position: 'right', title: { display: true, text: 'Lluvia mm' }, grid: { drawOnChartArea: false } }
            }
        }
    });
}

// --- MAPA ---
function initMap() {
    if (!map) {
        map = L.map('map').setView([40.41, -3.70], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    }
    // Aquí cargarías los marcadores desde la API igual que en el ejemplo anterior
}

// Inicio
loadGeneralData();