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
        const data = await res.json();
        const tbody = document.getElementById('tabla-estaciones-body');

        tbody.innerHTML = data.map(est => `
            <tr onclick="showDetailView('${est._id}', '${est.ultimoRegistro.localizacion}')">
                <td><strong>${est.ultimoRegistro.localizacion}</strong></td>
                <td>${est.ultimoRegistro.temp} °C</td>
                <td>${est.ultimoRegistro.hum} %</td>
                <td>${est.ultimoRegistro.lluvia} mm</td>
                <td>${est.ultimoRegistro.vientoVel} km/h</td>
                <td>${formatMadridTime(est.ultimoRegistro.timestamp)}</td>
            </tr>
        `).join('');
    } catch (e) { console.error("Error cargando generales", e); }
}

async function loadDetail(tipo) {
    document.getElementById('custom-filters').classList.add('hidden');
    let url = `/api/estacion/${selectedEstacionId}/`;

    if (tipo === 'hoy') {
        url += 'resumen-hoy'; // Tu endpoint de medias de hoy
    } else {
        // Para 7d y 12m usamos el endpoint histórico con rangos calculados
        const fin = new Date().toISOString();
        let inicio = new Date();
        let agrupar = 'day';

        if (tipo === '7d') {
            inicio.setDate(inicio.getDate() - 7);
        } else if (tipo === '12m') {
            inicio.setFullYear(inicio.getFullYear() - 1);
            agrupar = 'month';
        }
        url = `/api/estacion/${selectedEstacionId}/historico?inicio=${inicio.toISOString()}&fin=${fin}&agrupar=${agrupar}`;
    }

    const res = await fetch(url);
    const data = await res.json();
    renderDetail(data);
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

function renderDetail(data) {
    const tbody = document.getElementById('detail-body');
    const thead = document.getElementById('detail-head');

    // Si la data es un objeto único (resumen-hoy), la metemos en un array
    const registros = Array.isArray(data) ? data : [data];

    // Actualizar Tabla
    thead.innerHTML = `<tr><th>Fecha/Periodo</th><th>Temp Media</th><th>Lluvia Acum.</th></tr>`;
    tbody.innerHTML = registros.map(r => `
        <tr>
            <td>${r.fechaReferencia ? formatMadridTime(r.fechaReferencia) : 'Hoy'}</td>
            <td>${r.tempPromedio?.toFixed(1) || r.tempMedia?.toFixed(1) || '--'} °C</td>
            <td>${r.lluviaAcumulada?.toFixed(1) || r.lluviaTotal?.toFixed(1) || '0'} mm</td>
        </tr>
    `).join('');

    // Actualizar Gráfico
    updateChart(registros);
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