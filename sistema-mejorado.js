// ========================================
// SISTEMA DE ALMACENAMIENTO PERSISTENTE
// ========================================

class SistemaPersistencia {
  constructor() {
    this.dbName = 'PUSH_SURA_DB';
    this.dbVersion = 1;
    this.db = null;
  }

  // Inicializar IndexedDB
  async inicializar() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store para datos de Forms
        if (!db.objectStoreNames.contains('forms')) {
          db.createObjectStore('forms', { keyPath: 'id', autoIncrement: true });
        }

        // Store para datos de Personal
        if (!db.objectStoreNames.contains('personal')) {
          db.createObjectStore('personal', { keyPath: 'doc' });
        }

        // Store para metadatos
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };
    });
  }

  // Guardar datos de Forms con cache automática
  async guardarForms(datos) {
    const transaction = this.db.transaction(['forms', 'metadata'], 'readwrite');
    const formsStore = transaction.objectStore('forms');
    const metaStore = transaction.objectStore('metadata');

    // Limpiar datos anteriores
    await formsStore.clear();

    // Guardar nuevos datos
    for (const dato of datos) {
      await formsStore.add(dato);
    }

    // Guardar metadata de última actualización
    await metaStore.put({
      key: 'ultimaActualizacionForms',
      fecha: new Date().toISOString(),
      totalRegistros: datos.length
    });

    // También guardar en localStorage como backup
    localStorage.setItem('PUSH_SURA_FORMS_DATA', JSON.stringify(datos));
    localStorage.setItem('PUSH_SURA_ULTIMA_SYNC', new Date().toISOString());

    return transaction.complete;
  }

  // Recuperar datos de Forms
  async obtenerForms() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['forms'], 'readonly');
      const store = transaction.objectStore('forms');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Guardar cambios en personal (persistente)
  async guardarPersonal(datosPersonal) {
    const transaction = this.db.transaction(['personal'], 'readwrite');
    const store = transaction.objectStore('personal');

    // Actualizar cada profesional
    for (const persona of datosPersonal) {
      await store.put(persona);
    }

    // También guardar en localStorage como backup
    localStorage.setItem('PUSH_SURA_PERSONAL_DATA', JSON.stringify(datosPersonal));

    return transaction.complete;
  }

  // Obtener personal
  async obtenerPersonal() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['personal'], 'readonly');
      const store = transaction.objectStore('personal');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Obtener metadata
  async obtenerMetadata(key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['metadata'], 'readonly');
      const store = transaction.objectStore('metadata');
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

// Instancia global
const persistencia = new SistemaPersistencia();

// ========================================
// GESTIÓN DE PROFESIONALES MEJORADA
// ========================================

class GestorProfesionales {
  constructor() {
    this.profesionales = [];
  }

  // Cargar profesionales con persistencia
  async cargar() {
    try {
      // Intentar desde IndexedDB
      const desde DB = await persistencia.obtenerPersonal();
      if (desdeDB && desdeDB.length > 0) {
        this.profesionales = desdeDB;
        return this.profesionales;
      }

      // Fallback a localStorage
      const desdeLocal = localStorage.getItem('PUSH_SURA_PERSONAL_DATA');
      if (desdeLocal) {
        this.profesionales = JSON.parse(desdeLocal);
        return this.profesionales;
      }

      // Si no hay datos, usar lista maestra por defecto
      this.profesionales = LISTA_MAESTRA_DEFAULT.map(p => ({
        ...p,
        activo: p.activo !== undefined ? p.activo : true
      }));

      await this.guardar();
      return this.profesionales;

    } catch (error) {
      console.error('Error cargando profesionales:', error);
      return LISTA_MAESTRA_DEFAULT;
    }
  }

  // Guardar cambios de forma persistente
  async guardar() {
    try {
      await persistencia.guardarPersonal(this.profesionales);
      console.log('✓ Cambios guardados correctamente');
      return true;
    } catch (error) {
      console.error('Error guardando profesionales:', error);
      return false;
    }
  }

  // Agregar o actualizar profesional
  async actualizarProfesional(doc, datos) {
    const index = this.profesionales.findIndex(p => String(p.doc).trim() === String(doc).trim());

    if (index >= 0) {
      // Actualizar existente
      this.profesionales[index] = { ...this.profesionales[index], ...datos };
    } else {
      // Agregar nuevo
      this.profesionales.push({
        doc: String(doc).trim(),
        nombre: datos.nombre || '',
        cargo: datos.cargo || '',
        activo: datos.activo !== undefined ? datos.activo : true
      });
    }

    await this.guardar();
    return this.profesionales[index >= 0 ? index : this.profesionales.length - 1];
  }

  // Activar/Inactivar profesional
  async cambiarEstado(doc, activo) {
    return await this.actualizarProfesional(doc, { activo });
  }

  // Cambiar cargo
  async cambiarCargo(doc, nuevoCargo) {
    return await this.actualizarProfesional(doc, { cargo: nuevoCargo });
  }

  // Obtener profesionales activos
  obtenerActivos() {
    return this.profesionales.filter(p => p.activo !== false);
  }

  // Obtener por documento
  obtenerPorDoc(doc) {
    return this.profesionales.find(p => String(p.doc).trim() === String(doc).trim());
  }
}

// Instancia global
const gestorProfesionales = new GestorProfesionales();

// ========================================
// CARGA DE ARCHIVOS FORMS CON CACHE
// ========================================

async function cargarArchivoFormsManual(event) {
  const archivo = event.target.files[0];
  if (!archivo) return;

  mostrarNotificacion('Procesando archivo...', 'info');

  try {
    const datos = await leerArchivoExcel(archivo);
    const formsNormalizados = procesarDatosFormsBruto(datos);

    // Guardar en sistema persistente
    await persistencia.guardarForms(formsNormalizados);
    datosForms = formsNormalizados;

    // Actualizar UI
    actualizarIndicadorSincronizacion(formsNormalizados.length);
    actualizarTodoElSistema();

    mostrarNotificacion(`✓ ${formsNormalizados.length} encuestas cargadas correctamente`, 'success');

  } catch (error) {
    console.error('Error cargando archivo:', error);
    mostrarNotificacion('Error procesando el archivo. Verifica el formato.', 'error');
  }
}

function leerArchivoExcel(archivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const primeraHoja = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(primeraHoja);
        resolve(json);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(archivo);
  });
}

function procesarDatosFormsBruto(datos) {
  return datos.map((fila, index) => {
    // Extraer datos según estructura del Forms
    const doc = extraerValor(fila, ['Documento', 'document', 'cedula', 'Doc']);
    const fechaHora = extraerValor(fila, ['Fecha', 'fecha', 'timestamp', 'Hora']);
    const medicamento = extraerValor(fila, ['Medicamento', 'medicamento', 'farmaco']);

    // Preguntas del formulario
    const p1 = extraerValor(fila, ['pregunta1', 'p1', 'tranquila']);
    const p2 = extraerValor(fila, ['pregunta2', 'p2', 'molestias']);
    const p3 = extraerValor(fila, ['pregunta3', 'p3', 'sintomas']);
    const p4 = extraerValor(fila, ['pregunta4', 'p4', 'conducta']);
    const p5 = extraerValor(fila, ['pregunta5', 'p5', 'comentario']);

    return {
      id: index,
      doc: String(doc || '').trim(),
      fechaHora: fechaHora || '',
      medicamento: String(medicamento || 'No especificado').trim(),
      p1Tranquila: normalizarRespuestaSiNo(p1),
      p2SinMolestia: !normalizarRespuestaSiNo(p2, true),
      p3SinSintomas: !normalizarRespuestaSiNo(p3, true),
      p4Conducta: String(p4 || 'Sin reporte').trim(),
      p5Comentario: String(p5 || '').trim()
    };
  }).filter(f => f.doc);
}

function extraerValor(obj, posiblesKeys) {
  for (const key of posiblesKeys) {
    const keyLower = key.toLowerCase();
    const encontrada = Object.keys(obj).find(k => k.toLowerCase().includes(keyLower));
    if (encontrada && obj[encontrada]) {
      return obj[encontrada];
    }
  }
  return '';
}

function normalizarRespuestaSiNo(valor, invertir = false) {
  const str = String(valor || '').toLowerCase().trim();
  const esSi = str.includes('sí') || str.includes('si') || str === 'yes' || str === 'true';
  return invertir ? !esSi : esSi;
}

// ========================================
// ACTUALIZAR INDICADOR DE SINCRONIZACIÓN
// ========================================

function actualizarIndicadorSincronizacion(totalEncuestas) {
  const lblUltima = document.getElementById('lblUltimaSincronizacion');
  const lblTotal = document.getElementById('lblTotalEncuestas');

  const ahora = new Date();
  const fechaFormato = ahora.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  if (lblUltima) lblUltima.textContent = fechaFormato;
  if (lblTotal) lblTotal.textContent = totalEncuestas || 0;
}

// ========================================
// RECUPERAR ÚLTIMA CARGA AL INICIAR
// ========================================

async function recuperarUltimaCarga() {
  try {
    // Intentar desde IndexedDB
    const forms = await persistencia.obtenerForms();
    if (forms && forms.length > 0) {
      datosForms = forms;

      const metadata = await persistencia.obtenerMetadata('ultimaActualizacionForms');
      if (metadata) {
        actualizarIndicadorSincronizacion(metadata.totalRegistros);
      }

      console.log(`✓ Recuperados ${forms.length} registros desde cache`);
      return true;
    }

    // Fallback a localStorage
    const desdeLocal = localStorage.getItem('PUSH_SURA_FORMS_DATA');
    if (desdeLocal) {
      datosForms = JSON.parse(desdeLocal);
      const ultimaSync = localStorage.getItem('PUSH_SURA_ULTIMA_SYNC');

      if (ultimaSync) {
        const fecha = new Date(ultimaSync);
        const lblUltima = document.getElementById('lblUltimaSincronizacion');
        if (lblUltima) {
          lblUltima.textContent = fecha.toLocaleDateString('es-CO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      }

      console.log(`✓ Recuperados ${datosForms.length} registros desde localStorage`);
      return true;
    }

    return false;

  } catch (error) {
    console.error('Error recuperando última carga:', error);
    return false;
  }
}

// ========================================
// NOTIFICACIONES
// ========================================

function mostrarNotificacion(mensaje, tipo = 'info') {
  // Crear elemento de notificación
  const notif = document.createElement('div');
  notif.className = `fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg transform transition-all duration-300 ${
    tipo === 'success' ? 'bg-emerald-500' :
    tipo === 'error' ? 'bg-rose-500' :
    'bg-blue-500'
  } text-white font-bold text-sm flex items-center gap-2`;

  notif.innerHTML = `
    <i class="fa-solid ${
      tipo === 'success' ? 'fa-check-circle' :
      tipo === 'error' ? 'fa-exclamation-circle' :
      'fa-info-circle'
    }"></i>
    <span>${mensaje}</span>
  `;

  document.body.appendChild(notif);

  // Animación de entrada
  setTimeout(() => notif.style.transform = 'translateX(0)', 10);

  // Auto-remover
  setTimeout(() => {
    notif.style.transform = 'translateX(400px)';
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

// Exportar para uso global
window.sistemaStorage = {
  persistencia,
  gestorProfesionales,
  cargarArchivoFormsManual,
  recuperarUltimaCarga,
  actualizarIndicadorSincronizacion,
  mostrarNotificacion
};
