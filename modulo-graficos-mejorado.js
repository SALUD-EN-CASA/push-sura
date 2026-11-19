// ========================================
// MÓDULO DE GRÁFICOS MEJORADOS
// ========================================

class SistemaGraficosMejorado {
  constructor() {
    this.chartInstances = {};
  }

  // Descargar gráfico con estadísticas completas
  async descargarGraficoCompleto(canvasId, nombreArchivo) {
    try {
      const canvas = document.getElementById(canvasId);
      if (!canvas) {
        console.error('Canvas no encontrado:', canvasId);
        return;
      }

      // Obtener el contenedor padre para incluir leyendas y títulos
      const contenedor = canvas.closest('.bg-slate-50, .bg-white');

      if (!contenedor) {
        // Fallback: solo el canvas
        await this.descargarCanvasSimple(canvas, nombreArchivo);
        return;
      }

      // Usar html2canvas para capturar todo el contenedor
      const opciones = {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        allowTaint: true
      };

      const canvasCaptura = await html2canvas(contenedor, opciones);

      // Descargar
      const link = document.createElement('a');
      link.download = nombreArchivo;
      link.href = canvasCaptura.toDataURL('image/png');
      link.click();

      mostrarNotificacion('✓ Gráfico descargado correctamente', 'success');

    } catch (error) {
      console.error('Error descargando gráfico:', error);
      mostrarNotificacion('Error al descargar el gráfico', 'error');
    }
  }

  // Descargar solo el canvas
  async descargarCanvasSimple(canvas, nombreArchivo) {
    const link = document.createElement('a');
    link.download = nombreArchivo;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  // Crear gráfico con porcentajes visibles
  crearGraficoConPorcentajes(canvasId, tipo, labels, data, colores, opciones = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    // Destruir gráfico anterior si existe
    if (this.chartInstances[canvasId]) {
      this.chartInstances[canvasId].destroy();
    }

    const total = data.reduce((a, b) => a + b, 0);

    const configuracion = {
      type: tipo,
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colores,
          borderWidth: 2,
          borderColor: '#FFFFFF'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: opciones.mostrarLeyenda !== false,
            position: opciones.posicionLeyenda || 'bottom',
            labels: {
              font: { size: 11 },
              padding: 10,
              generateLabels: (chart) => {
                const original = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                return original.map((label, i) => {
                  const valor = data[i];
                  const porcentaje = total > 0 ? ((valor / total) * 100).toFixed(1) : 0;
                  label.text = `${label.text}: ${valor} (${porcentaje}%)`;
                  return label;
                });
              }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const valor = context.parsed.y || context.parsed;
                const porcentaje = total > 0 ? ((valor / total) * 100).toFixed(1) : 0;
                return `${context.label}: ${valor} (${porcentaje}%)`;
              }
            }
          },
          datalabels: opciones.mostrarEtiquetas !== false ? {
            color: '#ffffff',
            font: { weight: 'bold', size: 12 },
            formatter: (value) => {
              const porcentaje = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return porcentaje > 5 ? `${porcentaje}%` : '';
            }
          } : false
        },
        scales: tipo === 'bar' || tipo === 'line' ? {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0,
              callback: function(value) {
                return value;
              }
            }
          }
        } : undefined
      }
    };

    // Crear gráfico
    this.chartInstances[canvasId] = new Chart(ctx, configuracion);
    return this.chartInstances[canvasId];
  }

  // Actualizar leyenda con porcentajes
  actualizarLeyenda(contenedorId, labels, data, colores) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    const total = data.reduce((a, b) => a + b, 0);

    contenedor.innerHTML = labels.map((label, i) => {
      const valor = data[i];
      const porcentaje = total > 0 ? ((valor / total) * 100).toFixed(1) : 0;
      return `
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${colores[i]}"></span>
            <span class="font-semibold">${label}</span>
          </div>
          <span class="font-mono text-slate-900">${valor} (${porcentaje}%)</span>
        </div>
      `;
    }).join('');
  }
}

// ========================================
// FILTROS TEMPORALES
// ========================================

class FiltrosTemporal {
  constructor() {
    this.periodoActual = 'todo'; // 'dia', 'semana', 'mes', 'año', 'todo'
  }

  // Agrupar datos por período
  agruparPorPeriodo(datos, periodo = 'todo') {
    if (periodo === 'todo') {
      return this.agruparPorDia(datos);
    }

    const ahora = new Date();
    let fechaInicio;

    switch (periodo) {
      case 'dia':
        fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
        break;
      case 'semana':
        fechaInicio = new Date(ahora);
        fechaInicio.setDate(ahora.getDate() - 7);
        break;
      case 'mes':
        fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        break;
      case 'año':
        fechaInicio = new Date(ahora.getFullYear(), 0, 1);
        break;
    }

    // Filtrar datos dentro del rango
    const datosFiltrados = datos.filter(d => {
      const fecha = parseTimestampUniversal(d.fechaHora);
      return fecha && fecha >= fechaInicio;
    });

    return this.agruparPorDia(datosFiltrados);
  }

  // Agrupar por día
  agruparPorDia(datos) {
    const mapa = {};

    datos.forEach(d => {
      const fecha = normalizarFechaISO(d.fechaHora);
      if (!fecha) return;

      if (!mapa[fecha]) {
        mapa[fecha] = { fecha, count: 0 };
      }
      mapa[fecha].count++;
    });

    const fechas = Object.keys(mapa).sort();
    return {
      labels: fechas,
      data: fechas.map(f => mapa[f].count)
    };
  }

  // Agrupar por semana
  agruparPorSemana(datos) {
    const mapa = {};

    datos.forEach(d => {
      const fecha = parseTimestampUniversal(d.fechaHora);
      if (!fecha) return;

      const semana = this.obtenerNumeroSemana(fecha);
      const año = fecha.getFullYear();
      const key = `${año}-S${semana}`;

      if (!mapa[key]) {
        mapa[key] = { semana: key, count: 0 };
      }
      mapa[key].count++;
    });

    const semanas = Object.keys(mapa).sort();
    return {
      labels: semanas,
      data: semanas.map(s => mapa[s].count)
    };
  }

  // Agrupar por mes
  agruparPorMes(datos) {
    const mapa = {};

    datos.forEach(d => {
      const fecha = parseTimestampUniversal(d.fechaHora);
      if (!fecha) return;

      const mes = fecha.toLocaleDateString('es-CO', { year: 'numeric', month: 'short' });

      if (!mapa[mes]) {
        mapa[mes] = { mes, count: 0 };
      }
      mapa[mes].count++;
    });

    const meses = Object.keys(mapa).sort((a, b) => {
      const [añoA, mesA] = a.split(' ');
      const [añoB, mesB] = b.split(' ');
      return new Date(añoA, this.mesANumero(mesA)) - new Date(añoB, this.mesANumero(mesB));
    });

    return {
      labels: meses,
      data: meses.map(m => mapa[m].count)
    };
  }

  // Obtener número de semana
  obtenerNumeroSemana(fecha) {
    const primerDia = new Date(fecha.getFullYear(), 0, 1);
    const dias = Math.floor((fecha - primerDia) / (24 * 60 * 60 * 1000));
    return Math.ceil((dias + primerDia.getDay() + 1) / 7);
  }

  // Convertir nombre de mes a número
  mesANumero(mes) {
    const meses = {
      'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
    };
    return meses[mes.toLowerCase()] || 0;
  }

  // Crear selector de período
  crearSelectorPeriodo(contenedorId, callbackCambio) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    const selector = document.createElement('div');
    selector.className = 'flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200';
    selector.innerHTML = `
      <button data-periodo="dia" class="px-2.5 py-1 text-xs font-bold rounded text-slate-600 hover:bg-white transition-all">Día</button>
      <button data-periodo="semana" class="px-2.5 py-1 text-xs font-bold rounded text-slate-600 hover:bg-white transition-all">Semana</button>
      <button data-periodo="mes" class="px-2.5 py-1 text-xs font-bold rounded text-slate-600 hover:bg-white transition-all">Mes</button>
      <button data-periodo="año" class="px-2.5 py-1 text-xs font-bold rounded text-slate-600 hover:bg-white transition-all">Año</button>
      <button data-periodo="todo" class="px-2.5 py-1 text-xs font-bold rounded bg-white text-blue-900 shadow">Todo</button>
    `;

    // Event listeners
    selector.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const periodo = btn.dataset.periodo;
        this.periodoActual = periodo;

        // Actualizar estilos
        selector.querySelectorAll('button').forEach(b => {
          b.className = 'px-2.5 py-1 text-xs font-bold rounded text-slate-600 hover:bg-white transition-all';
        });
        btn.className = 'px-2.5 py-1 text-xs font-bold rounded bg-white text-blue-900 shadow';

        // Callback
        if (callbackCambio) callbackCambio(periodo);
      });
    });

    contenedor.appendChild(selector);
  }
}

// ========================================
// FUNCIONES GLOBALES
// ========================================

const sistemaGraficos = new SistemaGraficosMejorado();
const filtrosTemporal = new FiltrosTemporal();

// Función mejorada para descargar gráficos
async function descargarImagenCanvas(canvasId, nombreArchivo) {
  await sistemaGraficos.descargarGraficoCompleto(canvasId, nombreArchivo);
}

// Función para crear gráfico con estadísticas
function crearGraficoConEstadisticas(canvasId, legId, tipo, labels, data, colores) {
  const chart = sistemaGraficos.crearGraficoConPorcentajes(canvasId, tipo, labels, data, colores);
  sistemaGraficos.actualizarLeyenda(legId, labels, data, colores);
  return chart;
}

// Exportar para uso global
window.moduloGraficos = {
  sistemaGraficos,
  filtrosTemporal,
  descargarImagenCanvas,
  crearGraficoConEstadisticas
};
