// ========================================
// MÓDULO GENERADOR QR CON GESTIÓN DE ESTADO
// ========================================

class GestorQRMejorado {
  constructor() {
    this.qrActual = null;
  }

  // Renderizar tabla de QRs con estado activo/inactivo
  async renderizarTablaCompleta() {
    const tbody = document.getElementById('cuerpoTablaQRs');
    const lblTotal = document.getElementById('lblTotalBaseQr');

    if (!tbody) return;

    const profesionales = await gestorProfesionales.cargar();
    const activos = profesionales.filter(p => p.activo !== false);
    const inactivos = profesionales.filter(p => p.activo === false);

    if (lblTotal) {
      lblTotal.textContent = `${activos.length} activos de ${profesionales.length} totales`;
    }

    // Ordenar: activos primero, luego por nombre
    const ordenados = [
      ...activos.sort((a, b) => a.nombre.localeCompare(b.nombre)),
      ...inactivos.sort((a, b) => a.nombre.localeCompare(b.nombre))
    ];

    tbody.innerHTML = ordenados.map(prof => {
      const esActivo = prof.activo !== false;
      const estadoClase = esActivo ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-200 text-slate-600 border-slate-300';
      const estadoTexto = esActivo ? 'ACTIVO' : 'INACTIVO';
      const estadoIcono = esActivo ? 'fa-check-circle' : 'fa-ban';

      return `
        <tr class="${esActivo ? '' : 'opacity-60'}">
          <td class="p-3 font-mono text-xs">${prof.doc}</td>
          <td class="p-3 text-xs font-semibold">${prof.nombre}</td>
          <td class="p-3">
            <select
              id="cargo-${prof.doc}"
              class="text-xs bg-slate-50 border border-slate-300 rounded px-2 py-1 outline-none"
              onchange="cambiarCargoProfesional('${prof.doc}', this.value)"
              ${!esActivo ? 'disabled' : ''}>
              ${CARGOS_OFICIALES.map(c => `
                <option value="${c}" ${prof.cargo === c ? 'selected' : ''}>${c}</option>
              `).join('')}
            </select>
          </td>
          <td class="p-3 text-center">
            <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${estadoClase} inline-flex items-center gap-1">
              <i class="fa-solid ${estadoIcono}"></i>
              ${estadoTexto}
            </span>
          </td>
          <td class="p-3 text-center">
            <div class="flex items-center justify-center gap-2">
              <button
                onclick="generarQRDesdeTabla('${prof.doc}')"
                class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2.5 py-1 rounded transition-all"
                title="Generar QR"
                ${!esActivo ? 'disabled opacity-50' : ''}>
                <i class="fa-solid fa-qrcode"></i>
              </button>
              <button
                onclick="descargarQRDirecto('${prof.doc}')"
                class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 py-1 rounded transition-all"
                title="Descargar QR"
                ${!esActivo ? 'disabled opacity-50' : ''}>
                <i class="fa-solid fa-download"></i>
              </button>
              <button
                onclick="toggleEstadoProfesional('${prof.doc}', ${!esActivo})"
                class="${esActivo ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white text-xs px-2.5 py-1 rounded transition-all"
                title="${esActivo ? 'Inactivar' : 'Activar'}">
                <i class="fa-solid ${esActivo ? 'fa-user-slash' : 'fa-user-check'}"></i>
              </button>
              <button
                onclick="eliminarProfesional('${prof.doc}')"
                class="bg-rose-600 hover:bg-rose-700 text-white text-xs px-2.5 py-1 rounded transition-all"
                title="Eliminar"
                ${!esActivo ? '' : 'disabled opacity-30'}>
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Cambiar estado activo/inactivo
  async toggleEstado(doc, nuevoEstado) {
    try {
      await gestorProfesionales.cambiarEstado(doc, nuevoEstado);
      await this.renderizarTablaCompleta();
      await this.actualizarSelectores();

      const texto = nuevoEstado ? 'activado' : 'inactivado';
      mostrarNotificacion(`✓ Profesional ${texto} correctamente`, 'success');

    } catch (error) {
      console.error('Error cambiando estado:', error);
      mostrarNotificacion('Error al cambiar el estado', 'error');
    }
  }

  // Cambiar cargo
  async cambiarCargo(doc, nuevoCargo) {
    try {
      await gestorProfesionales.cambiarCargo(doc, nuevoCargo);
      mostrarNotificacion('✓ Cargo actualizado correctamente', 'success');

    } catch (error) {
      console.error('Error cambiando cargo:', error);
      mostrarNotificacion('Error al cambiar el cargo', 'error');
    }
  }

  // Agregar nuevo profesional
  async agregarNuevo(doc, nombre, cargo) {
    try {
      const yaExiste = gestorProfesionales.obtenerPorDoc(doc);
      if (yaExiste) {
        mostrarNotificacion('Este documento ya está registrado', 'error');
        return false;
      }

      await gestorProfesionales.actualizarProfesional(doc, {
        nombre: nombre.toUpperCase().trim(),
        cargo: cargo,
        activo: true
      });

      await this.renderizarTablaCompleta();
      await this.actualizarSelectores();

      mostrarNotificacion('✓ Profesional agregado correctamente', 'success');
      return true;

    } catch (error) {
      console.error('Error agregando profesional:', error);
      mostrarNotificacion('Error al agregar el profesional', 'error');
      return false;
    }
  }

  // Eliminar profesional (solo inactivos)
  async eliminar(doc) {
    try {
      const prof = gestorProfesionales.obtenerPorDoc(doc);
      if (!prof) return;

      if (prof.activo !== false) {
        mostrarNotificacion('Primero debes inactivar al profesional', 'error');
        return;
      }

      const confirmar = confirm(`¿Estás seguro de eliminar a ${prof.nombre}?\n\nEsta acción no se puede deshacer.`);
      if (!confirmar) return;

      // Eliminar del array
      const index = gestorProfesionales.profesionales.findIndex(p => String(p.doc).trim() === String(doc).trim());
      if (index >= 0) {
        gestorProfesionales.profesionales.splice(index, 1);
        await gestorProfesionales.guardar();
        await this.renderizarTablaCompleta();
        await this.actualizarSelectores();

        mostrarNotificacion('✓ Profesional eliminado correctamente', 'success');
      }

    } catch (error) {
      console.error('Error eliminando profesional:', error);
      mostrarNotificacion('Error al eliminar el profesional', 'error');
    }
  }

  // Generar QR
  generarQR(doc, nombre, cargo) {
    const contenedor = document.getElementById('contenedorQrCanvas');
    if (!contenedor) return;

    contenedor.innerHTML = '';

    // Generar URL del QR
    const urlQR = `${URL_BASE_ESCANEO}${doc}`;

    // Crear QR
    const qr = new QRCode(contenedor, {
      text: urlQR,
      width: 200,
      height: 200,
      colorDark: '#0033a0',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });

    this.qrActual = { doc, nombre, cargo, url: urlQR };

    // Actualizar etiquetas
    document.getElementById('qrEtiquetaNombre').textContent = nombre;
    document.getElementById('qrEtiquetaCargo').textContent = cargo;
    document.getElementById('btnDescargarQr').classList.remove('hidden');

    return qr;
  }

  // Descargar QR como PNG
  async descargarQR(doc, nombre, cargo) {
    // Generar QR temporal si es necesario
    if (!this.qrActual || this.qrActual.doc !== doc) {
      this.generarQR(doc, nombre, cargo);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const contenedor = document.getElementById('contenedorQrCanvas');
    if (!contenedor) return;

    try {
      const canvas = contenedor.querySelector('canvas');
      if (!canvas) {
        mostrarNotificacion('Error: No se pudo generar el QR', 'error');
        return;
      }

      const link = document.createElement('a');
      link.download = `QR_${nombre.replace(/\s+/g, '_')}_${doc}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      mostrarNotificacion('✓ QR descargado correctamente', 'success');

    } catch (error) {
      console.error('Error descargando QR:', error);
      mostrarNotificacion('Error al descargar el QR', 'error');
    }
  }

  // Actualizar selectores en toda la aplicación
  async actualizarSelectores() {
    const profesionales = await gestorProfesionales.cargar();
    const activos = profesionales.filter(p => p.activo !== false);

    // Selector en generador de QR
    const selectQr = document.getElementById('selectProfesionalQr');
    if (selectQr) {
      selectQr.innerHTML = '<option value="">-- Seleccionar profesional existente --</option>' +
        activos.sort((a, b) => a.nombre.localeCompare(b.nombre)).map(p => `
          <option value="${p.doc}">${p.nombre} (${p.cargo})</option>
        `).join('');
    }

    // Actualizar otros selectores si es necesario
    inicializarSelectoresCargos();
  }
}

// ========================================
// FUNCIONES GLOBALES
// ========================================

const gestorQR = new GestorQRMejorado();

// Inicializar al cargar
async function inicializarGestorQR() {
  await gestorQR.renderizarTablaCompleta();
  await gestorQR.actualizarSelectores();
}

// Toggle estado
async function toggleEstadoProfesional(doc, nuevoEstado) {
  await gestorQR.toggleEstado(doc, nuevoEstado);
}

// Cambiar cargo
async function cambiarCargoProfesional(doc, nuevoCargo) {
  await gestorQR.cambiarCargo(doc, nuevoCargo);
}

// Generar QR desde tabla
function generarQRDesdeTabla(doc) {
  const prof = gestorProfesionales.obtenerPorDoc(doc);
  if (!prof) return;

  // Llenar formulario
  document.getElementById('qrDocumento').value = prof.doc;
  document.getElementById('qrNombre').value = prof.nombre;
  document.getElementById('qrCargo').value = prof.cargo;

  // Generar QR
  gestorQR.generarQR(prof.doc, prof.nombre, prof.cargo);

  // Scroll al generador
  document.getElementById('qrDocumento').scrollIntoView({ behavior: 'smooth' });
}

// Descargar QR directo
async function descargarQRDirecto(doc) {
  const prof = gestorProfesionales.obtenerPorDoc(doc);
  if (!prof) return;

  await gestorQR.descargarQR(prof.doc, prof.nombre, prof.cargo);
}

// Eliminar profesional
async function eliminarProfesional(doc) {
  await gestorQR.eliminar(doc);
}

// Generar código QR (desde formulario)
async function generarCodigoQR() {
  const doc = document.getElementById('qrDocumento').value.trim();
  const nombre = document.getElementById('qrNombre').value.trim().toUpperCase();
  const cargo = document.getElementById('qrCargo').value;

  if (!doc || !nombre || !cargo) {
    mostrarNotificacion('Por favor completa todos los campos obligatorios', 'error');
    return;
  }

  // Verificar si existe
  let prof = gestorProfesionales.obtenerPorDoc(doc);

  if (prof) {
    // Actualizar datos si cambió algo
    if (prof.nombre !== nombre || prof.cargo !== cargo) {
      await gestorProfesionales.actualizarProfesional(doc, { nombre, cargo });
      await gestorQR.renderizarTablaCompleta();
    }
  } else {
    // Agregar nuevo
    const agregado = await gestorQR.agregarNuevo(doc, nombre, cargo);
    if (!agregado) return;
  }

  // Generar QR
  gestorQR.generarQR(doc, nombre, cargo);
}

// Descargar QR actual
function descargarImagenQR() {
  if (!gestorQR.qrActual) {
    mostrarNotificacion('Primero debes generar un código QR', 'error');
    return;
  }

  gestorQR.descargarQR(
    gestorQR.qrActual.doc,
    gestorQR.qrActual.nombre,
    gestorQR.qrActual.cargo
  );
}

// Seleccionar profesional para QR
function seleccionarProfesionalParaQr() {
  const select = document.getElementById('selectProfesionalQr');
  const doc = select.value;

  if (!doc) {
    // Limpiar formulario
    document.getElementById('qrDocumento').value = '';
    document.getElementById('qrNombre').value = '';
    document.getElementById('qrCargo').value = '';
    document.getElementById('contenedorQrCanvas').innerHTML = '';
    document.getElementById('qrEtiquetaNombre').textContent = '';
    document.getElementById('qrEtiquetaCargo').textContent = '';
    document.getElementById('btnDescargarQr').classList.add('hidden');
    return;
  }

  const prof = gestorProfesionales.obtenerPorDoc(doc);
  if (!prof) return;

  // Llenar formulario
  document.getElementById('qrDocumento').value = prof.doc;
  document.getElementById('qrNombre').value = prof.nombre;
  document.getElementById('qrCargo').value = prof.cargo;

  // Generar QR automáticamente
  gestorQR.generarQR(prof.doc, prof.nombre, prof.cargo);
}

// Exportar
window.moduloQR = {
  gestorQR,
  inicializarGestorQR,
  toggleEstadoProfesional,
  cambiarCargoProfesional,
  generarQRDesdeTabla,
  descargarQRDirecto,
  eliminarProfesional,
  generarCodigoQR,
  descargarImagenQR,
  seleccionarProfesionalParaQr
};
