// ============================================================================
// src/app.js
// Lógica principal: navegación SPA, renderizado de vistas y gráficos Chart.js
// ============================================================================

import {
  obtenerEmpleados,
  obtenerAsistencias,
  obtenerAsistenciasPorFecha,
  guardarAsistencia,
  guardarEmpleado,
  importarAsistenciasMasivo,
  eliminarTodosLosDatos,
  sincronizarRealtime,
  crearEppVacio,
  crearEquipoVacio,
  EPP_LABELS,
  EQUIPO_LABELS
} from './firebase-config.js';

import {
  hoyISO,
  formatearFechaCompleta,
  rangoPorPeriodo,
  calcularTotalAsistencias,
  calcularCumplimientoEppPromedio,
  calcularCumplimientoEppIndividual,
  calcularPresentesVsAusentes,
  calcularSitioMasActivo,
  calcularTendenciaDiaria,
  calcularCumplimientoPorItem,
  calcularDistribucionPorSitio,
  calcularValidacionDiaria,
  calcularMetricasEmpleado,
  ordenarPorFechaHoraDesc
} from './calculations.js';

// ----------------------------------------------------------------------------
// ESTADO GLOBAL DE LA APLICACIÓN
// ----------------------------------------------------------------------------
const estado = {
  empleados: [],
  asistencias: [],
  vistaActual: 'dashboard',
  filtroPeriodo: 'semana',
  filtroInicioPersonalizado: hoyISO(),
  filtroFinPersonalizado: hoyISO(),
  fechaValidacion: hoyISO(),
  correoEmpleadoHistorial: null,
  correoAuditoria: null,
  fechaAuditoria: hoyISO(),
  cargando: true,
  usandoDatosDemo: false
};

const MODO_PRUEBA_LOCAL = false;
const CLAVE_DATOS_LOCALES = 'mecanica-suelos-datos';

let charts = { tendencia: null, eppItems: null, distribucionSitio: null };

function cargarDatosLocales() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE_DATOS_LOCALES));
    if (datos && Array.isArray(datos.empleados) && Array.isArray(datos.asistencias)) return datos;
  } catch (err) {
    console.warn('No se pudieron leer los datos locales:', err);
  }
  return null;
}

function guardarDatosLocales() {
  localStorage.setItem(
    CLAVE_DATOS_LOCALES,
    JSON.stringify({ empleados: estado.empleados, asistencias: estado.asistencias })
  );
}

// ----------------------------------------------------------------------------
// DATOS DEMO (se usan solo si Firebase no está configurado o falla la carga)
// ----------------------------------------------------------------------------
function generarDatosDemo() {
  const sitios = ['Gabinete', 'El Pulte', 'Navani CAES', 'Puerto Quetzal'];
  const nombres = [
    ['Carlos', 'Ramírez'], ['María', 'López'], ['Juan', 'Pérez'],
    ['Ana', 'Gómez'], ['Luis', 'Hernández'], ['Sofía', 'Morales']
  ];
  const empleados = nombres.map(([nombre, apellido], i) => ({
    id: `demo-emp-${i}`,
    nombre,
    apellido,
    correo: `${nombre.toLowerCase()}.${apellido.toLowerCase()}@empresa.com`,
    puesto: i % 2 === 0 ? 'Técnico de Laboratorio' : 'Supervisor de Campo',
    seguroAccidente: 'Sí',
    celular: `5555-${1000 + i}`,
    direccion: 'Ciudad de Guatemala',
    estado: 'Activo'
  }));

  const asistencias = [];
  let contador = 0;
  for (let diasAtras = 13; diasAtras >= 0; diasAtras--) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - diasAtras);
    const fechaISO = fecha.toISOString().slice(0, 10);
    empleados.forEach((emp, idx) => {
      if ((idx + diasAtras) % 3 === 0) return; // simula ausencias
      const epp = crearEppVacio();
      Object.keys(epp).forEach((k) => {
        epp[k] = Math.random() > 0.22;
      });
      const equipo = crearEquipoVacio();
      Object.keys(equipo).forEach((k) => {
        equipo[k] = Math.random() > 0.5;
      });
      asistencias.push({
        id: `demo-asis-${contador++}`,
        correo: emp.correo,
        nombre: emp.nombre,
        apellido: emp.apellido,
        sitioCurso: sitios[(idx + diasAtras) % sitios.length],
        fecha: fechaISO,
        hora: `0${6 + (idx % 3)}:${String(10 + idx * 3).padStart(2, '0')}:00`,
        geolocalizacion: '14.585397, -90.585960',
        epp,
        equipo
      });
    });
  }
  return { empleados, asistencias };
}

// ----------------------------------------------------------------------------
// INICIALIZACIÓN
// ----------------------------------------------------------------------------
async function iniciar() {
  configurarNavegacion();
  configurarFormularioRegistro();
  configurarFormularioImportacion();
  configurarLimpiezaDatos();
  configurarValidacionDiaria();
  configurarHistorialEmpleado();
  configurarAuditoria();
  configurarFiltroPeriodo();

  if (MODO_PRUEBA_LOCAL) {
    const datosLocales = cargarDatosLocales();
    if (datosLocales) {
      estado.empleados = datosLocales.empleados;
      estado.asistencias = ordenarPorFechaHoraDesc(datosLocales.asistencias);
    } else {
      const demo = generarDatosDemo();
      estado.empleados = demo.empleados;
      estado.asistencias = ordenarPorFechaHoraDesc(demo.asistencias);
    }
    estado.usandoDatosDemo = true;
    mostrarBannerDemo();
  } else {
    try {
      const [empleados, asistencias] = await Promise.all([
        obtenerEmpleados(),
        obtenerAsistencias()
      ]);
      estado.empleados = empleados;
      estado.asistencias = ordenarPorFechaHoraDesc(asistencias);
      intentarSincronizacionRealtime();
    } catch (err) {
      console.warn('No se pudo conectar a Firebase o no hay datos aún. Usando datos de demostración.', err);
      if (MODO_PRUEBA_LOCAL) {
        const demo = generarDatosDemo();
        estado.empleados = demo.empleados;
        estado.asistencias = ordenarPorFechaHoraDesc(demo.asistencias);
        estado.usandoDatosDemo = true;
        mostrarBannerDemo();
      } else {
        estado.empleados = [];
        estado.asistencias = [];
        mostrarErrorFirebase(err);
      }
    }
  }

  estado.cargando = false;
  poblarSelectoresEmpleado();
  renderizarVistaActual();
}

function intentarSincronizacionRealtime() {
  try {
    sincronizarRealtime(
      (empleados) => {
        estado.empleados = empleados;
        poblarSelectoresEmpleado();
        if (estado.vistaActual === 'dashboard' || estado.vistaActual === 'validacion') {
          renderizarVistaActual();
        }
      },
      (asistencias) => {
        estado.asistencias = ordenarPorFechaHoraDesc(asistencias);
        renderizarVistaActual();
      }
    );
  } catch (err) {
    console.warn('Sincronización en tiempo real no disponible:', err);
  }
}

function mostrarBannerDemo() {
  const banner = document.getElementById('banner-demo');
  if (banner) banner.classList.remove('hidden');
}

function mostrarErrorFirebase(err) {
  const banner = document.getElementById('banner-demo');
  if (!banner) return;
  banner.textContent = `No se pudo conectar con Firebase. Revisa la configuración y las reglas. Detalle: ${err?.code || err?.message || 'error desconocido'}`;
  banner.classList.remove('hidden', 'border-amber-500/30', 'bg-amber-500/10', 'text-amber-400');
  banner.classList.add('border-red-500/30', 'bg-red-500/10', 'text-red-400');
}

// ----------------------------------------------------------------------------
// NAVEGACIÓN SPA
// ----------------------------------------------------------------------------
function configurarNavegacion() {
  document.querySelectorAll('[data-vista]').forEach((btn) => {
    btn.addEventListener('click', () => {
      cambiarVista(btn.dataset.vista);
    });
  });
  document.getElementById('menu-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('-translate-x-full');
  });
}

function cambiarVista(vista) {
  estado.vistaActual = vista;
  document.querySelectorAll('.vista-panel').forEach((panel) => {
    panel.classList.toggle('hidden', panel.id !== `vista-${vista}`);
  });
  document.querySelectorAll('[data-vista]').forEach((btn) => {
    const activo = btn.dataset.vista === vista;
    btn.classList.toggle('bg-blue-600/20', activo);
    btn.classList.toggle('text-blue-400', activo);
    btn.classList.toggle('text-slate-400', !activo);
  });
  document.getElementById('sidebar')?.classList.add('-translate-x-full');
  renderizarVistaActual();
}

function renderizarVistaActual() {
  if (estado.cargando) return;
  switch (estado.vistaActual) {
    case 'dashboard':
      renderizarDashboard();
      break;
    case 'registro':
      break; // formulario estático, no necesita re-render
    case 'validacion':
      renderizarValidacionDiaria();
      break;
    case 'historial':
      renderizarHistorialEmpleado();
      break;
    case 'auditoria':
      renderizarAuditoria();
      break;
  }
}

// ----------------------------------------------------------------------------
// FILTRO TEMPORAL DEL DASHBOARD
// ----------------------------------------------------------------------------
function configurarFiltroPeriodo() {
  document.querySelectorAll('[data-periodo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      estado.filtroPeriodo = btn.dataset.periodo;
      document.querySelectorAll('[data-periodo]').forEach((b) => {
        b.classList.toggle('bg-blue-600', b === btn);
        b.classList.toggle('text-white', b === btn);
        b.classList.toggle('bg-slate-800', b !== btn);
        b.classList.toggle('text-slate-400', b !== btn);
      });
      const rangoPersonalizado = document.getElementById('rango-personalizado');
      rangoPersonalizado.classList.toggle('hidden', btn.dataset.periodo !== 'personalizado');
      renderizarDashboard();
    });
  });

  document.getElementById('filtro-fecha-inicio')?.addEventListener('change', (e) => {
    estado.filtroInicioPersonalizado = e.target.value;
    renderizarDashboard();
  });
  document.getElementById('filtro-fecha-fin')?.addEventListener('change', (e) => {
    estado.filtroFinPersonalizado = e.target.value;
    renderizarDashboard();
  });
}

// ----------------------------------------------------------------------------
// 1. DASHBOARD GENERAL
// ----------------------------------------------------------------------------
function renderizarDashboard() {
  const { inicio, fin } = rangoPorPeriodo(
    estado.filtroPeriodo,
    estado.filtroInicioPersonalizado,
    estado.filtroFinPersonalizado
  );

  const asistenciasFiltradas = estado.asistencias.filter(
    (a) => a.fecha >= inicio && a.fecha <= fin
  );
  const asistenciasHoy = estado.asistencias.filter((a) => a.fecha === hoyISO());
  const empleadosActivos = estado.empleados.filter((e) => e.estado !== 'Inactivo');

  // KPIs
  document.getElementById('kpi-total-asistencias').textContent =
    calcularTotalAsistencias(asistenciasFiltradas);
  document.getElementById('kpi-cumplimiento-epp').textContent =
    `${calcularCumplimientoEppPromedio(asistenciasFiltradas)}%`;

  const { presentes, ausentes, total } = calcularPresentesVsAusentes(
    empleadosActivos,
    asistenciasHoy
  );
  document.getElementById('kpi-presentes').textContent = `${presentes} / ${total}`;
  document.getElementById('kpi-ausentes').textContent = `${ausentes} ausentes hoy`;

  const sitioTop = calcularSitioMasActivo(asistenciasFiltradas);
  document.getElementById('kpi-sitio-top').textContent = sitioTop.sitio;
  document.getElementById('kpi-sitio-top-detalle').textContent = `${sitioTop.total} marcas registradas`;

  renderizarGraficaTendencia(asistenciasFiltradas, inicio, fin);
  renderizarGraficaEppItems(asistenciasFiltradas);
  renderizarGraficaDistribucionSitio(asistenciasFiltradas);
}

function coloresPalette() {
  return {
    azul: '#3b82f6',
    esmeralda: '#10b981',
    ambar: '#f59e0b',
    rojo: '#ef4444',
    violeta: '#8b5cf6',
    cian: '#06b6d4',
    grid: 'rgba(148, 163, 184, 0.1)',
    texto: '#94a3b8'
  };
}

function renderizarGraficaTendencia(asistencias, inicio, fin) {
  const { etiquetas, valores } = calcularTendenciaDiaria(asistencias, inicio, fin);
  const c = coloresPalette();
  const ctx = document.getElementById('grafica-tendencia').getContext('2d');

  if (charts.tendencia) charts.tendencia.destroy();
  charts.tendencia = new Chart(ctx, {
    type: 'line',
    data: {
      labels: etiquetas,
      datasets: [
        {
          label: 'Asistencias',
          data: valores,
          borderColor: c.azul,
          backgroundColor: 'rgba(59, 130, 246, 0.15)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: c.azul
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: c.grid }, ticks: { color: c.texto } },
        y: { grid: { color: c.grid }, ticks: { color: c.texto, precision: 0 }, beginAtZero: true }
      }
    }
  });
}

function renderizarGraficaEppItems(asistencias) {
  const { etiquetas, valores } = calcularCumplimientoPorItem(asistencias);
  const c = coloresPalette();
  const ctx = document.getElementById('grafica-epp-items').getContext('2d');

  const colores = valores.map((v) => (v >= 80 ? c.esmeralda : v >= 50 ? c.ambar : c.rojo));

  if (charts.eppItems) charts.eppItems.destroy();
  charts.eppItems = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: etiquetas,
      datasets: [{ label: '% Cumplimiento', data: valores, backgroundColor: colores, borderRadius: 4 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: c.grid }, ticks: { color: c.texto }, min: 0, max: 100 },
        y: { grid: { display: false }, ticks: { color: c.texto } }
      }
    }
  });
}

function renderizarGraficaDistribucionSitio(asistencias) {
  const { etiquetas, valores } = calcularDistribucionPorSitio(asistencias);
  const c = coloresPalette();
  const ctx = document.getElementById('grafica-distribucion-sitio').getContext('2d');
  const paletaDona = [c.azul, c.esmeralda, c.ambar, c.violeta, c.cian, c.rojo];

  if (charts.distribucionSitio) charts.distribucionSitio.destroy();
  charts.distribucionSitio = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: etiquetas,
      datasets: [
        {
          data: valores,
          backgroundColor: etiquetas.map((_, i) => paletaDona[i % paletaDona.length]),
          borderColor: '#0f172a',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: c.texto, boxWidth: 12, padding: 12 } } }
    }
  });
}

// ----------------------------------------------------------------------------
// 2. REGISTRO Y ACTUALIZACIÓN DE DATOS
// ----------------------------------------------------------------------------
function poblarSelectoresEmpleado() {
  const activos = estado.empleados.filter((e) => e.estado !== 'Inactivo');
  const opciones = activos
    .map((e) => `<option value="${e.correo}">${e.nombre} ${e.apellido} — ${e.correo}</option>`)
    .join('');

  const selectRegistro = document.getElementById('registro-empleado');
  if (selectRegistro) selectRegistro.innerHTML = `<option value="">Selecciona un empleado…</option>${opciones}`;

  const selectHistorial = document.getElementById('historial-empleado');
  if (selectHistorial) selectHistorial.innerHTML = `<option value="">Selecciona un empleado…</option>${opciones}`;

  const selectAuditoria = document.getElementById('auditoria-empleado');
  if (selectAuditoria)
    selectAuditoria.innerHTML = `<option value="">Todos los empleados</option>${opciones}`;
}

function construirChecklist(contenedorId, labels, prefijo) {
  const contenedor = document.getElementById(contenedorId);
  if (!contenedor) return;
  contenedor.innerHTML = Object.entries(labels)
    .map(
      ([clave, etiqueta]) => `
      <label class="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-300 hover:border-blue-500/50 cursor-pointer transition-colors">
        <input type="checkbox" data-${prefijo}="${clave}" class="h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900">
        <span>${etiqueta}</span>
      </label>`
    )
    .join('');
}

function configurarFormularioRegistro() {
  construirChecklist('checklist-epp', EPP_LABELS, 'epp');
  construirChecklist('checklist-equipo', EQUIPO_LABELS, 'equipo');

  const fechaInput = document.getElementById('registro-fecha');
  if (fechaInput) fechaInput.value = hoyISO();
  const horaInput = document.getElementById('registro-hora');
  if (horaInput) horaInput.value = new Date().toTimeString().slice(0, 8);

  document.getElementById('registro-empleado')?.addEventListener('change', (e) => {
    const emp = estado.empleados.find((x) => x.correo === e.target.value);
    document.getElementById('registro-nombre-preview').textContent = emp
      ? `${emp.nombre} ${emp.apellido} — ${emp.puesto || ''}`
      : '';
  });

  document.getElementById('btn-geolocalizacion')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      mostrarToast('Geolocalización no disponible en este navegador.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        document.getElementById('registro-geo').value = `${pos.coords.latitude.toFixed(
          6
        )}, ${pos.coords.longitude.toFixed(6)}`;
      },
      () => mostrarToast('No se pudo obtener la ubicación.', 'error')
    );
  });

  document.getElementById('form-registro')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const correo = document.getElementById('registro-empleado').value;
    if (!correo) {
      mostrarToast('Selecciona un empleado.', 'error');
      return;
    }
    const emp = estado.empleados.find((x) => x.correo === correo);

    const epp = crearEppVacio();
    document.querySelectorAll('[data-epp]').forEach((cb) => {
      epp[cb.dataset.epp] = cb.checked;
    });
    const equipo = crearEquipoVacio();
    document.querySelectorAll('[data-equipo]').forEach((cb) => {
      equipo[cb.dataset.equipo] = cb.checked;
    });

    const nuevaAsistencia = {
      correo,
      nombre: emp?.nombre || '',
      apellido: emp?.apellido || '',
      sitioCurso: document.getElementById('registro-sitio').value,
      fecha: document.getElementById('registro-fecha').value,
      hora: document.getElementById('registro-hora').value,
      geolocalizacion: document.getElementById('registro-geo').value,
      epp,
      equipo
    };

    const btn = document.getElementById('btn-guardar-registro');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      if (estado.usandoDatosDemo) {
        nuevaAsistencia.id = `demo-asis-${Date.now()}`;
        estado.asistencias.unshift(nuevaAsistencia);
        estado.asistencias = ordenarPorFechaHoraDesc(estado.asistencias);
        guardarDatosLocales();
      } else {
        await guardarAsistencia(nuevaAsistencia);
      }
      mostrarToast('Asistencia guardada correctamente.', 'exito');
      document.getElementById('form-registro').reset();
      document.getElementById('registro-fecha').value = hoyISO();
      document.getElementById('registro-hora').value = new Date().toTimeString().slice(0, 8);
      document.getElementById('registro-nombre-preview').textContent = '';
      renderizarVistaActual();
    } catch (err) {
      console.error(err);
      mostrarToast('Error al guardar en Firebase. Revisa tu configuración.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar en Firebase';
    }
  });
}

// ----------------------------------------------------------------------------
// IMPORTACIÓN MASIVA (JSON / CSV)
// ----------------------------------------------------------------------------
function configurarFormularioImportacion() {
  document.getElementById('input-importar')?.addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const texto = await archivo.text();
    const estadoImport = document.getElementById('estado-importacion');

    try {
      let registros;
      const nombreArchivo = archivo.name.toLowerCase();
      if (nombreArchivo.endsWith('.xlsx') || nombreArchivo.endsWith('.xls')) {
        if (!window.XLSX) throw new Error('No se pudo cargar el lector de archivos Excel.');
        const libro = window.XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: true });
        registros = libro.SheetNames.flatMap((nombreHoja) =>
          window.XLSX.utils.sheet_to_json(libro.Sheets[nombreHoja], { defval: '' })
        );
      } else if (nombreArchivo.endsWith('.json')) {
        registros = JSON.parse(texto);
      } else {
        registros = parsearCSV(texto);
      }
      if (!Array.isArray(registros) || registros.length === 0) {
        throw new Error('El archivo no contiene registros válidos.');
      }

      registros = registros.map(normalizarRegistroImportado);

      if (estado.usandoDatosDemo) {
        agregarEmpleadosDesdeRegistros(registros);
        const existentes = new Set(
          estado.asistencias.map((asistencia) => asistencia.id || `${asistencia.correo}|${asistencia.fecha}|${asistencia.hora}`)
        );
        const nuevosRegistros = registros.filter((registro) => {
          const clave = registro.id || `${registro.correo}|${registro.fecha}|${registro.hora}`;
          if (existentes.has(clave)) return false;
          existentes.add(clave);
          return true;
        });
        nuevosRegistros.forEach((registro, i) => {
          estado.asistencias.push({ id: registro.id || `demo-import-${Date.now()}-${i}`, ...registro });
        });
        estado.asistencias = ordenarPorFechaHoraDesc(estado.asistencias);
        guardarDatosLocales();
        poblarSelectoresEmpleado();
        estadoImport.textContent = `${nuevosRegistros.length} registros nuevos importados y guardados en este navegador.`;
      } else {
        await agregarEmpleadosEnFirebase(registros);
        const existentes = new Set(
          estado.asistencias.map((asistencia) => asistencia.id || `${asistencia.correo}|${asistencia.fecha}|${asistencia.hora}`)
        );
        const nuevosRegistros = registros.filter((registro) => {
          const clave = registro.id || `${registro.correo}|${registro.fecha}|${registro.hora}`;
          if (existentes.has(clave)) return false;
          existentes.add(clave);
          return true;
        });
        const total = await importarAsistenciasMasivo(nuevosRegistros);
        estadoImport.textContent = `${total} registros nuevos importados correctamente a Firebase.`;
      }
      poblarSelectoresEmpleado();
      estadoImport.classList.remove('hidden', 'text-red-400');
      estadoImport.classList.add('text-emerald-400');
      renderizarVistaActual();
    } catch (err) {
      console.error(err);
      estadoImport.textContent = `Error al importar: ${err.message}`;
      estadoImport.classList.remove('hidden', 'text-emerald-400');
      estadoImport.classList.add('text-red-400');
    }
    e.target.value = '';
  });
}

async function agregarEmpleadosEnFirebase(registros) {
  const correosExistentes = new Set(estado.empleados.map((empleado) => empleado.correo));
  const empleadosNuevos = [];
  registros.forEach((registro) => {
    if (!registro.correo || correosExistentes.has(registro.correo)) return;
    correosExistentes.add(registro.correo);
    empleadosNuevos.push({
      nombre: registro.nombre,
      apellido: registro.apellido,
      correo: registro.correo,
      puesto: '',
      celular: '',
      estado: 'Activo'
    });
  });
  for (const empleado of empleadosNuevos) {
    const id = await guardarEmpleado(empleado);
    estado.empleados.push({ id, ...empleado });
  }
}

function configurarLimpiezaDatos() {
  document.getElementById('btn-limpiar-datos')?.addEventListener('click', async () => {
    if (!confirm('¿Seguro que deseas borrar todos los empleados y asistencias? Esta acción no se puede deshacer.')) return;

    const boton = document.getElementById('btn-limpiar-datos');
    boton.disabled = true;
    try {
      if (MODO_PRUEBA_LOCAL) {
        guardarDatosLocales();
      } else {
        await eliminarTodosLosDatos();
      }
      estado.empleados = [];
      estado.asistencias = [];
      estado.correoEmpleadoHistorial = null;
      estado.correoAuditoria = null;
      if (MODO_PRUEBA_LOCAL) guardarDatosLocales();
      poblarSelectoresEmpleado();
      renderizarVistaActual();
      document.getElementById('estado-importacion').textContent = 'Todos los datos fueron eliminados. Puedes cargar un archivo nuevo.';
      document.getElementById('estado-importacion').classList.remove('hidden', 'text-red-400');
      document.getElementById('estado-importacion').classList.add('text-emerald-400');
      mostrarToast('Todos los datos fueron eliminados.', 'exito');
    } catch (err) {
      console.error(err);
      mostrarToast('No se pudieron eliminar los datos. Revisa las reglas de Firebase.', 'error');
    } finally {
      boton.disabled = false;
    }
  });
}

function agregarEmpleadosDesdeRegistros(registros) {
  const correosExistentes = new Set(estado.empleados.map((empleado) => empleado.correo));
  registros.forEach((registro) => {
    if (!registro.correo || correosExistentes.has(registro.correo)) return;
    estado.empleados.push({
      id: `demo-emp-${Date.now()}-${estado.empleados.length}`,
      nombre: registro.nombre,
      apellido: registro.apellido,
      correo: registro.correo,
      puesto: '',
      celular: '',
      estado: 'Activo'
    });
    correosExistentes.add(registro.correo);
  });
}

function normalizarRegistroImportado(registro) {
  const epp = registro.epp && typeof registro.epp === 'object' ? registro.epp : crearEppVacio();
  Object.keys(epp).forEach((campo) => {
    const valor = buscarValor(registro, [campo, EPP_LABELS[campo]]);
    if (valor !== undefined) epp[campo] = convertirBooleano(valor);
  });

  const equipo = registro.equipo && typeof registro.equipo === 'object' ? registro.equipo : crearEquipoVacio();
  Object.keys(equipo).forEach((campo) => {
    const valor = buscarValor(registro, [campo, EQUIPO_LABELS[campo]]);
    if (valor !== undefined) equipo[campo] = convertirBooleano(valor);
  });

  return {
    id: buscarValor(registro, ['id']) || '',
    correo: buscarValor(registro, ['correo', 'email']) || '',
    nombre: buscarValor(registro, ['nombre']) || '',
    apellido: buscarValor(registro, ['apellido']) || '',
    sitioCurso: buscarValor(registro, ['sitioCurso', 'sitio', 'sitio/curso', 'obra/curso']) || '',
    fecha: convertirFechaImportada(buscarValor(registro, ['fecha'])),
    hora: convertirHoraImportada(buscarValor(registro, ['hora'])),
    geolocalizacion: buscarValor(registro, ['geolocalizacion', 'coordenadas']) || '',
    epp,
    equipo
  };
}

function buscarValor(registro, nombres) {
  const claves = Object.keys(registro);
  for (const nombre of nombres) {
    const clave = claves.find((actual) => normalizarEncabezado(actual) === normalizarEncabezado(nombre));
    if (clave !== undefined) return registro[clave];
  }
  return undefined;
}

function normalizarEncabezado(valor) {
  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function convertirBooleano(valor) {
  if (typeof valor === 'boolean') return valor;
  return ['true', 'si', 'sí', '1', 'x', 'cumple', 'ok', 'confirmado', 'confirmada'].includes(
    String(valor).trim().toLowerCase()
  );
}

function convertirFechaImportada(valor) {
  if (!valor) return hoyISO();
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, '0')}-${String(valor.getDate()).padStart(2, '0')}`;
  }
  const texto = String(valor).trim().replace(/\s+/g, ' ');
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;

  const meses = {
    ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3,
    abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6,
    jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, septiembre: 9,
    oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12
  };
  const partes = texto.toLowerCase().replace('.', '').split(/[-/ ]/).filter(Boolean);
  if (partes.length >= 2) {
    const dia = Number(partes[0]);
    const mes = Number(partes[1]) || meses[partes[1]];
    const anio = Number(partes[2]) || new Date().getFullYear();
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }
  }
  return texto;
}

function convertirHoraImportada(valor) {
  if (!valor) return '00:00:00';
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${String(valor.getHours()).padStart(2, '0')}:${String(valor.getMinutes()).padStart(2, '0')}:${String(valor.getSeconds()).padStart(2, '0')}`;
  }
  if (typeof valor === 'number' && valor >= 0 && valor < 1) {
    const totalSegundos = Math.round(valor * 24 * 60 * 60);
    const horas = Math.floor(totalSegundos / 3600) % 24;
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;
    return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
  }
  const texto = String(valor).trim();
  return /^\d{1,2}:\d{2}$/.test(texto) ? `${texto}:00` : texto;
}

function parsearCSV(texto) {
  const lineas = texto.trim().split(/\r?\n/);
  const encabezados = lineas[0].split(',').map((h) => h.trim());
  return lineas.slice(1).map((linea) => {
    const valores = linea.split(',').map((v) => v.trim());
    const registro = {};
    encabezados.forEach((h, i) => {
      registro[h] = valores[i];
    });
    return registro;
  });
}

function construirEnlaceGoogleMaps(geolocalizacion, textoAlternativo = 'Sin geolocalización') {
  const coordenadas = String(geolocalizacion || '').trim();
  const [latitud, longitud] = coordenadas.split(',').map((valor) => Number(valor.trim()));
  const coordenadasValidas =
    coordenadas &&
    Number.isFinite(latitud) &&
    Number.isFinite(longitud) &&
    latitud >= -90 &&
    latitud <= 90 &&
    longitud >= -180 &&
    longitud <= 180;

  if (!coordenadasValidas) return textoAlternativo;

  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${latitud},${longitud}`
  )}`;
  return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline decoration-blue-400/40 underline-offset-2 hover:text-teal-400">${coordenadas}</a>`;
}

// ----------------------------------------------------------------------------
// 3. VALIDACIÓN DIARIA
// ----------------------------------------------------------------------------
function configurarValidacionDiaria() {
  const input = document.getElementById('validacion-fecha');
  if (input) {
    input.value = hoyISO();
    input.addEventListener('change', (e) => {
      estado.fechaValidacion = e.target.value;
      renderizarValidacionDiaria();
    });
  }
}

function renderizarValidacionDiaria() {
  const empleadosActivos = estado.empleados.filter((e) => e.estado !== 'Inactivo');
  const asistenciasDelDia = estado.asistencias.filter((a) => a.fecha === estado.fechaValidacion);
  const filas = calcularValidacionDiaria(empleadosActivos, asistenciasDelDia);

  const marcaron = filas.filter((f) => f.marco).length;
  document.getElementById('validacion-resumen').textContent = `${marcaron} de ${filas.length} empleados marcaron asistencia el ${formatearFechaCompleta(estado.fechaValidacion)}.`;

  const tbody = document.getElementById('tabla-validacion');
  if (!tbody) return;

  if (filas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-500">No hay empleados activos registrados.</td></tr>`;
    return;
  }

  tbody.innerHTML = filas
    .map(
      (f) => `
      <tr class="border-b border-slate-800 hover:bg-slate-800/40">
        <td class="py-3 px-4">
          <div class="font-medium text-slate-200">${f.empleado.nombre} ${f.empleado.apellido}</div>
          <div class="text-xs text-slate-500">${f.empleado.correo}</div>
        </td>
        <td class="py-3 px-4">
          ${
            f.marco
              ? '<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400"><span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>MARCÓ</span>'
              : '<span class="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-400"><span class="h-1.5 w-1.5 rounded-full bg-red-400"></span>FALTÓ</span>'
          }
        </td>
        <td class="py-3 px-4 text-slate-400">${f.hora || '—'}</td>
        <td class="py-3 px-4 text-slate-400">${f.sitio || '—'}</td>
        <td class="py-3 px-4 text-slate-400">${f.cumplimientoEpp !== null ? f.cumplimientoEpp + '%' : '—'}</td>
      </tr>`
    )
    .join('');
}

// ----------------------------------------------------------------------------
// 4. HISTORIAL POR EMPLEADO
// ----------------------------------------------------------------------------
function configurarHistorialEmpleado() {
  document.getElementById('historial-empleado')?.addEventListener('change', (e) => {
    estado.correoEmpleadoHistorial = e.target.value;
    renderizarHistorialEmpleado();
  });
}

function renderizarHistorialEmpleado() {
  const contenedor = document.getElementById('historial-contenido');
  const vacio = document.getElementById('historial-vacio');
  if (!estado.correoEmpleadoHistorial) {
    contenedor.classList.add('hidden');
    vacio.classList.remove('hidden');
    return;
  }
  contenedor.classList.remove('hidden');
  vacio.classList.add('hidden');

  const emp = estado.empleados.find((e) => e.correo === estado.correoEmpleadoHistorial);
  const asistenciasEmpleado = estado.asistencias.filter(
    (a) => a.correo === estado.correoEmpleadoHistorial
  );
  const metricas = calcularMetricasEmpleado(asistenciasEmpleado);

  document.getElementById('historial-nombre').textContent = `${emp.nombre} ${emp.apellido}`;
  document.getElementById('historial-puesto').textContent = emp.puesto || 'Sin puesto asignado';
  document.getElementById('historial-correo').textContent = emp.correo;
  document.getElementById('historial-celular').textContent = emp.celular || 'N/A';
  document.getElementById('historial-dias').textContent = metricas.totalDias;
  document.getElementById('historial-puntualidad').textContent = `${metricas.puntualidad}%`;
  document.getElementById('historial-cumplimiento').textContent = `${metricas.cumplimientoPromedio}%`;

  const tbody = document.getElementById('tabla-historial');
  if (asistenciasEmpleado.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-500">Sin registros de asistencia.</td></tr>`;
    return;
  }
  tbody.innerHTML = asistenciasEmpleado
    .map(
      (a) => `
      <tr class="border-b border-slate-800 hover:bg-slate-800/40">
        <td class="py-3 px-4 text-slate-300">${formatearFechaCompleta(a.fecha)}</td>
        <td class="py-3 px-4 text-slate-400">${a.hora || '—'}</td>
        <td class="py-3 px-4 text-slate-400">${a.sitioCurso || '—'}</td>
        <td class="py-3 px-4 text-slate-500 text-xs">${construirEnlaceGoogleMaps(a.geolocalizacion, '—')}</td>
        <td class="py-3 px-4">
          <span class="rounded-full px-2.5 py-1 text-xs font-medium ${
            calcularCumplimientoEppIndividual(a.epp) >= 80
              ? 'bg-emerald-500/15 text-emerald-400'
              : calcularCumplimientoEppIndividual(a.epp) >= 50
              ? 'bg-amber-500/15 text-amber-400'
              : 'bg-red-500/15 text-red-400'
          }">${calcularCumplimientoEppIndividual(a.epp)}%</span>
        </td>
      </tr>`
    )
    .join('');
}

// ----------------------------------------------------------------------------
// 5. DETALLE DE EQUIPO Y AUDITORÍA
// ----------------------------------------------------------------------------
function configurarAuditoria() {
  const inputFecha = document.getElementById('auditoria-fecha');
  if (inputFecha) {
    inputFecha.value = hoyISO();
    inputFecha.addEventListener('change', (e) => {
      estado.fechaAuditoria = e.target.value;
      renderizarAuditoria();
    });
  }
  document.getElementById('auditoria-empleado')?.addEventListener('change', (e) => {
    estado.correoAuditoria = e.target.value || null;
    renderizarAuditoria();
  });
}

function renderizarAuditoria() {
  let registros = estado.asistencias.filter((a) => a.fecha === estado.fechaAuditoria);
  if (estado.correoAuditoria) {
    registros = registros.filter((a) => a.correo === estado.correoAuditoria);
  }

  const contenedor = document.getElementById('auditoria-contenido');
  if (registros.length === 0) {
    contenedor.innerHTML = `<div class="py-10 text-center text-slate-500">No hay registros para los filtros seleccionados.</div>`;
    return;
  }

  contenedor.innerHTML = registros
    .map((a) => {
      const filasChecklist = (labels, datos, tipo) =>
        Object.entries(labels)
          .map(([clave, etiqueta]) => {
            const activo = datos && datos[clave];
            return `<div class="flex items-center justify-between rounded-lg border ${
              activo ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/40'
            } px-3 py-2 text-sm">
              <span class="text-slate-300">${etiqueta}</span>
              <span class="${activo ? 'text-emerald-400' : 'text-slate-600'}">${activo ? '✓' : '—'}</span>
            </div>`;
          })
          .join('');

      return `
      <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-5 mb-4">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h4 class="font-semibold text-slate-100">${a.nombre} ${a.apellido}</h4>
            <p class="text-xs text-slate-500">${a.correo} · ${a.sitioCurso || 'Sin sitio'} · ${a.hora || '—'}</p>
          </div>
          <span class="text-xs text-slate-500">${construirEnlaceGoogleMaps(a.geolocalizacion)}</span>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Equipo de Protección Personal</p>
            <div class="grid grid-cols-2 gap-2">${filasChecklist(EPP_LABELS, a.epp, 'epp')}</div>
          </div>
          <div>
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Equipo y Herramientas</p>
            <div class="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">${filasChecklist(
              EQUIPO_LABELS,
              a.equipo,
              'equipo'
            )}</div>
          </div>
        </div>
      </div>`;
    })
    .join('');
}

// ----------------------------------------------------------------------------
// TOAST DE NOTIFICACIONES
// ----------------------------------------------------------------------------
function mostrarToast(mensaje, tipo = 'exito') {
  const contenedor = document.getElementById('toast-contenedor');
  if (!contenedor) return;
  const toast = document.createElement('div');
  toast.className = `rounded-lg border px-4 py-3 text-sm shadow-lg transition-opacity ${
    tipo === 'exito'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
      : 'border-red-500/30 bg-red-500/10 text-red-400'
  }`;
  toast.textContent = mensaje;
  contenedor.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ----------------------------------------------------------------------------
// ARRANQUE
// ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', iniciar);

