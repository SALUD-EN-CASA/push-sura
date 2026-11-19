// ========================================
// ARCHIVO DE INTEGRACIÓN COMPLETA
// Copia este código en tu admin.html existente
// ========================================

// VARIABLES GLOBALES (agregar al inicio del script existente)
let datosPersonal = [];
let datosEscaneos = [];
let datosForms = [];
let rankingActualInformes = [];
let tipoGraficoSeleccionado = 'doughnut';

// Instancias de gráficos
let chartDashP1 = null, chartDashP2 = null, chartDashP3 = null, chartDashP4 = null;
let chartDashLine = null, chartDashCargos = null, chartDashMeds = null;
let chartInfP1 = null, chartInfP2 = null, chartInfP3 = null, chartInfP4 = null;

// CONSTANTES
const URL_BASE_ESCANEO = "https://salud-en-casa.github.io/push-sura/?doc=";

const CARGOS_OFICIALES = [
  "AGUDOS RUTA",
  "CHER",
  "GESTOR",
  "GESTOR ENF VIRTUAL",
  "LABORATORIO",
  "TRACKING",
  "VIRTUAL"
];

// BASE DE DATOS MAESTRA (ya la tienes, mantener)
const LISTA_MAESTRA_DEFAULT = [
  // Tu lista completa de 219 profesionales aquí
  {"doc":"52871949","nombre":"ADRIANA PATRICIA SALAZAR URREGO","cargo":"LABORATORIO","activo":true},
  // ... resto de profesionales
];

// ========================================
// FUNCIÓN DE INICIALIZACIÓN MEJORADA
// ========================================

window.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('🚀 Iniciando sistema mejorado...');

    // 1. Inicializar IndexedDB
    await persistencia.inicializar();
    console.log('✓ IndexedDB inicializado');

    // 2. Cargar profesionales con persistencia
    datosPersonal = await gestorProfesionales.cargar();
    console.log(`✓ ${datosPersonal.length} profesionales cargados`);

    // 3. Recuperar última carga de Forms (si existe)
    const recuperado = await recuperarUltimaCarga();
    if (recuperado) {
      console.log('✓ Datos recuperados desde cache');
      mostrarNotificacion('📊 Datos recuperados desde cache local', 'success');
    }

    // 4. Inicializar selectores
    inicializarSelectoresCargos();
    await inicializarGestorQR();
    poblarSelectProfesionalesQr();

    // 5. Inicializar vista de informes
    cambiarTipoVistaInforme();

    // 6. Renderizar todo
    actualizarTodoElSistema();

    // 7. Listeners adicionales
    document.addEventListener('click', (e) => {
      const drop = document.getElementById('dropdownProfesionalesInforme');
      const inp = document.getElementById('infInputProfesional');
      if (drop && inp && !drop.contains(e.target) && e.target !== inp) {
        drop.classList.add('hidden');
      }
    });

    console.log('✅ Sistema completamente inicializado');

  } catch (error) {
    console.error('❌ Error inicializando sistema:', error);
    mostrarNotificacion('Error iniciando el sistema. Revisa la consola.', 'error');
  }
});

// ========================================
// FUNCIONES DE UTILIDAD
// ========================================

function formatearFechaLegible(val) {
  if (!val) return "";
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const dateUtc = new Date((num - 25569) * 86400 * 1000);
    const local = new Date(dateUtc.getTime() + (dateUtc.getTimezoneOffset() * 60000));
    return local.toLocaleString('es-CO', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
  }
  return String(val).trim();
}

function normalizarFechaISO(val) {
  if (!val) return "";
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const dateUtc = new Date((num - 25569) * 86400 * 1000);
    const local = new Date(dateUtc.getTime() + (dateUtc.getTimezoneOffset() * 60000));
    return local.toISOString().split('T')[0];
  }
  let str = String(val).trim();
  const matchIso = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (matchIso) {
    return `${matchIso[1]}-${matchIso[2].padStart(2, '0')}-${matchIso[3].padStart(2, '0')}`;
  }
  const matchLat = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (matchLat) {
    return `${matchLat[3]}-${matchLat[2].padStart(2, '0')}-${matchLat[1].padStart(2, '0')}`;
  }
  return "";
}

function parseTimestampUniversal(val) {
  if (!val) return null;
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const dateUtc = new Date((num - 25569) * 86400 * 1000);
    return new Date(dateUtc.getTime() + (dateUtc.getTimezoneOffset() * 60000));
  }
  let str = String(val).trim();
  let d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function obtenerEstadoSemaforo(porcentaje) {
  const p = Math.min(100, Math.max(0, Number(porcentaje)));
  if (p >= 95) {
    return {
      clase: "bg-emerald-100 text-emerald-800 border-emerald-300",
      dot: "bg-emerald-500",
      texto: "CUMPLE",
      bordeCard: "border-l-emerald-500"
    };
  } else if (p >= 70) {
    return {
      clase: "bg-amber-100 text-amber-800 border-amber-300",
      dot: "bg-amber-500",
      texto: "Revisar",
      bordeCard: "border-l-amber-500"
    };
  } else {
    return {
      clase: "bg-rose-100 text-rose-800 border-rose-300",
      dot: "bg-rose-500 animate-pulse",
      texto: "Alarma",
      bordeCard: "border-l-rose-500"
    };
  }
}

function calcularMetricasEfectividad(escCount, listaForms) {
  const compCount = listaForms.length;
  if (compCount === 0) {
    return {
      efScan: 100.0,
      efForms: 100.0,
      efCombo: 100.0,
      p1Cumple: 100.0,
      p2Cumple: 100.0,
      p3Cumple: 100.0
    };
  }

  let p1Ok = 0, p2Ok = 0, p3Ok = 0;
  listaForms.forEach(f => {
    if (f.p1Tranquila === true) p1Ok++;
    if (f.p2SinMolestia === true) p2Ok++;
    if (f.p3SinSintomas === true) p3Ok++;
  });

  const p1Cumple = Number(((p1Ok / compCount) * 100).toFixed(1));
  const p2Cumple = Number(((p2Ok / compCount) * 100).toFixed(1));
  const p3Cumple = Number(((p3Ok / compCount) * 100).toFixed(1));

  const efForms = Number(((p1Cumple + p2Cumple + p3Cumple) / 3).toFixed(1));
  const efCombo = escCount > 0 ? Number(Math.min(100, (compCount / escCount) * 100).toFixed(1)) : 100.0;

  return { efScan: 100.0, efForms, efCombo, p1Cumple, p2Cumple, p3Cumple };
}

// ========================================
// INICIALIZACIÓN DE SELECTORES
// ========================================

function inicializarSelectoresCargos() {
  const cargosUnicos = [...new Set([...CARGOS_OFICIALES, ...datosPersonal.map(p => p.cargo)])].filter(Boolean).sort();

  const selCargoInf = document.getElementById('infSelectorCargo');
  if (selCargoInf) {
    selCargoInf.innerHTML = cargosUnicos.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  const selColCargo = document.getElementById('fColCargo');
  if (selColCargo) {
    selColCargo.innerHTML = '<option value="">Todos</option>' +
      cargosUnicos.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  const selQrCargo = document.getElementById('qrCargo');
  if (selQrCargo) {
    selQrCargo.innerHTML = '<option value="">-- Seleccionar Cargo / Programa --</option>' +
      cargosUnicos.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  const selComProg = document.getElementById('filtroComentariosPrograma');
  if (selComProg) {
    selComProg.innerHTML = '<option value="">Todos los programas</option>' +
      cargosUnicos.map(c => `<option value="${c}">${c}</option>`).join('');
  }
}

function poblarSelectProfesionalesQr() {
  const select = document.getElementById('selectProfesionalQr');
  if (!select) return;

  const activos = datosPersonal.filter(p => p.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));

  select.innerHTML = '<option value="">-- Seleccionar profesional existente --</option>' +
    activos.map(p => `<option value="${p.doc}">${p.nombre} (${p.cargo})</option>`).join('');
}

// ========================================
// NAVEGACIÓN DE PESTAÑAS
// ========================================

function cambiarPestana(pestana) {
  // Ocultar todas
  document.getElementById('vistaDashboard').classList.add('hidden');
  document.getElementById('vistaInformes').classList.add('hidden');
  document.getElementById('vistaQr').classList.add('hidden');

  const vistaEjec = document.getElementById('vistaEjecutivo');
  if (vistaEjec) vistaEjec.classList.add('hidden');

  const clsInactivo = "px-4 py-2 rounded-lg text-xs font-bold transition-all text-slate-600 hover:text-blue-900";
  const clsActivo = "px-4 py-2 rounded-lg text-xs font-bold transition-all bg-blue-900 text-white shadow";

  // Resetear todos los botones
  document.getElementById('btnTabDashboard').className = clsInactivo;
  document.getElementById('btnTabInformes').className = clsInactivo;
  document.getElementById('btnTabQr').className = clsInactivo;

  const btnEjec = document.getElementById('btnTabInformeEjecutivo');
  if (btnEjec) btnEjec.className = clsInactivo;

  // Activar la pestaña seleccionada
  if (pestana === 'dashboard') {
    document.getElementById('vistaDashboard').classList.remove('hidden');
    document.getElementById('btnTabDashboard').className = clsActivo;
    renderizarDashboard();
  } else if (pestana === 'informes') {
    document.getElementById('vistaInformes').classList.remove('hidden');
    document.getElementById('btnTabInformes').className = clsActivo;
    consultarInformes();
  } else if (pestana === 'qr') {
    document.getElementById('vistaQr').classList.remove('hidden');
    document.getElementById('btnTabQr').className = clsActivo;
    inicializarGestorQR();
  } else if (pestana === 'ejecutivo') {
    if (vistaEjec) {
      vistaEjec.classList.remove('hidden');
      if (btnEjec) btnEjec.className = clsActivo;
      generarYMostrarInformeEjecutivo();
    }
  }
}

// ========================================
// ACTUALIZACIÓN GLOBAL
// ========================================

function obtenerEscaneosOficiales() {
  return datosEscaneos.filter(e =>
    datosPersonal.some(p => String(p.doc).trim() === String(e.doc).trim())
  );
}

function obtenerFormsOficiales() {
  return datosForms.filter(f =>
    datosPersonal.some(p => String(p.doc).trim() === String(f.doc).trim())
  );
}

function actualizarTodoElSistema() {
  actualizarBarraGlobal();
  renderizarDashboard();
}

function actualizarBarraGlobal() {
  const escValidos = obtenerEscaneosOficiales();
  const formsValidos = obtenerFormsOficiales();
  const esc = escValidos.length;
  const comp = formsValidos.length;
  const soloScan = Math.max(0, esc - comp);
  const totalPacientes = Math.max(esc, comp);

  document.getElementById('contTotalPacientes').innerText = totalPacientes;
  document.getElementById('contEscaneadosTotales').innerText = esc;
  document.getElementById('contSoloEscaneados').innerText = soloScan;
  document.getElementById('contCompletados').innerText = comp;

  const metricas = calcularMetricasEfectividad(esc, formsValidos);
  const sem = obtenerEstadoSemaforo(metricas.efForms);

  const badge = document.getElementById('badgeCumplimientoGeneral');
  badge.className = `px-3.5 py-2 rounded-xl text-xs font-extrabold border flex items-center gap-1.5 ${sem.clase}`;
  document.getElementById('dotCumplimiento').className = `w-2.5 h-2.5 rounded-full ${sem.dot}`;
  document.getElementById('txtCumplimiento').innerText = `Calidad Asistencial (Forms): ${metricas.efForms.toFixed(1)}% (${sem.texto})`;
}

// ========================================
// MODALES
// ========================================

function abrirModalGlosario() {
  const modal = document.getElementById('modalGlosario');
  if (modal) modal.classList.remove('hidden');
}

function cerrarModalGlosario() {
  const modal = document.getElementById('modalGlosario');
  if (modal) modal.classList.add('hidden');
}

function mostrarExplicacion(titulo, cuerpo) {
  document.getElementById('expTitulo').textContent = titulo;
  document.getElementById('expCuerpo').textContent = cuerpo;
  document.getElementById('modalExplicacion').classList.remove('hidden');
}

function cerrarModalExplicacion() {
  document.getElementById('modalExplicacion').classList.add('hidden');
}

// ========================================
// EXPORTAR FUNCIONES GLOBALES
// ========================================

window.cambiarPestana = cambiarPestana;
window.abrirModalGlosario = abrirModalGlosario;
window.cerrarModalGlosario = cerrarModalGlosario;
window.mostrarExplicacion = mostrarExplicacion;
window.cerrarModalExplicacion = cerrarModalExplicacion;
