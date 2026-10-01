// ============================================================================
// src/app.js
// Lógica principal: navegación SPA, renderizado de vistas y gráficos Chart.js
// ============================================================================

import {
  obtenerEmpleados,
  obtenerAsistencias,
  obtenerAsistenciasPorFecha,
  guardarAsistencia,
  eliminarAsistencia,
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
  clasificarPuntualidad,
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
  fechaInicioHistorial: '',
  fechaFinHistorial: '',
  objetivoJornada: { horasDiarias: 8, diasLaborales: 5 },
  filtroEmpleadosGrafica: null,
  correoAuditoria: null,
  fechaAuditoria: hoyISO(),
  cargando: true,
  usandoDatosDemo: false
};

const MODO_PRUEBA_LOCAL = false;
const CLAVE_DATOS_LOCALES = 'mecanica-suelos-datos';

let charts = { tendencia: null, horasTrabajadas: null, porcentajeHorasEmpleado: null, eppItems: null, distribucionSitio: null };

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
  configurarConfirmacion();
  configurarFiltroPeriodo();
  configurarFiltroEmpleadosGrafica();
  configurarObjetivoJornada();

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

  renderizarResumenHorasDashboard();

  renderizarGraficaTendencia(asistenciasFiltradas, inicio, fin);
  renderizarGraficaHorasTrabajadas(asistenciasFiltradas, inicio, fin);
  renderizarGraficaPorcentajeHorasEmpleado(asistenciasFiltradas, inicio, fin);
  renderizarGraficaEppItems(asistenciasFiltradas);
  renderizarGraficaDistribucionSitio(asistenciasFiltradas);
}

function configurarObjetivoJornada() {
  try {
    const guardado = JSON.parse(localStorage.getItem('asistencia-objetivo-jornada'));
    if (guardado) {
      estado.objetivoJornada.horasDiarias = Number(guardado.horasDiarias) || 8;
      estado.objetivoJornada.diasLaborales = Number(guardado.diasLaborales) || 5;
    }
  } catch (err) {
    console.warn('No se pudo leer el objetivo de jornada guardado:', err);
  }

  const horasInput = document.getElementById('objetivo-horas-diarias');
  const diasInput = document.getElementById('objetivo-dias-semana');
  if (horasInput) horasInput.value = estado.objetivoJornada.horasDiarias;
  if (diasInput) diasInput.value = estado.objetivoJornada.diasLaborales;

  const guardarObjetivo = () => {
    estado.objetivoJornada.horasDiarias = Math.min(24, Math.max(1, Number(horasInput.value) || 8));
    estado.objetivoJornada.diasLaborales = Math.min(7, Math.max(1, Number(diasInput.value) || 5));
    localStorage.setItem('asistencia-objetivo-jornada', JSON.stringify(estado.objetivoJornada));
    renderizarDashboard();
    if (estado.vistaActual === 'historial') renderizarHistorialEmpleado();
  };
  horasInput?.addEventListener('change', guardarObjetivo);
  diasInput?.addEventListener('change', guardarObjetivo);
}

function fechaISOConDias(fechaISO, dias) {
  const fecha = new Date(`${fechaISO}T00:00:00`);
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function contarDiasLaborales(inicio, fin, diasLaborales) {
  let total = 0;
  for (let fecha = inicio; fecha <= fin; fecha = fechaISOConDias(fecha, 1)) {
    const diaSemana = (new Date(`${fecha}T00:00:00`).getDay() + 6) % 7;
    if (diaSemana < diasLaborales) total++;
  }
  return total;
}

function resumirHoras(asistencias) {
  return asistencias.reduce((resumen, asistencia) => {
    if (asistencia.ausencia) return resumen;
    const horas = calcularResumenHoras(asistencia);
    if (horas.total !== null) resumen.total += horas.total;
    if (horas.ordinarias !== null) resumen.ordinarias += horas.ordinarias;
    if (horas.extras !== null) resumen.extras += horas.extras;
    return resumen;
  }, { ordinarias: 0, extras: 0, total: 0 });
}

function renderizarResumenHorasDashboard() {
  const contenedor = document.getElementById('resumen-horas-dashboard');
  if (!contenedor) return;

  const empleadosActivos = estado.empleados.filter((empleado) => empleado.estado !== 'Inactivo').length;
  contenedor.innerHTML = obtenerPeriodosJornada().map((periodo) => {
    const registros = estado.asistencias.filter((asistencia) =>
      asistencia.fecha >= periodo.inicio && asistencia.fecha <= periodo.fin
    );
    return construirTarjetaResumenHoras(registros, periodo, empleadosActivos);
  }).join('');
}

function renderizarResumenHorasEmpleado(asistenciasEmpleado) {
  const contenedor = document.getElementById('historial-resumen-horas');
  if (!contenedor) return;
  contenedor.innerHTML = obtenerPeriodosJornada().map((periodo) => {
    const registros = asistenciasEmpleado.filter((asistencia) =>
      asistencia.fecha >= periodo.inicio && asistencia.fecha <= periodo.fin
    );
    return construirTarjetaResumenHoras(registros, periodo, 1);
  }).join('');
}

function obtenerPeriodosJornada() {
  const hoy = hoyISO();
  const lunes = fechaISOConDias(hoy, -((new Date(`${hoy}T00:00:00`).getDay() + 6) % 7));
  return [
    { etiqueta: 'Hoy', inicio: hoy, fin: hoy },
    { etiqueta: 'Esta semana', inicio: lunes, fin: hoy },
    { etiqueta: 'Este mes', inicio: `${hoy.slice(0, 7)}-01`, fin: hoy }
  ];
}

function construirTarjetaResumenHoras(registros, periodo, empleados) {
  const resumen = resumirHoras(registros);
  const { horasDiarias, diasLaborales } = estado.objetivoJornada;
  const diasObjetivo = contarDiasLaborales(periodo.inicio, periodo.fin, diasLaborales);
  const objetivo = horasDiarias * diasObjetivo * empleados;
  const porcentaje = objetivo > 0 ? Math.round((resumen.ordinarias / objetivo) * 100) : 0;
  const anchoBarra = Math.min(100, porcentaje);

  return `<article class="rounded-lg border border-slate-700/70 bg-slate-950/40 p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h4 class="text-sm font-semibold text-slate-100">${periodo.etiqueta}</h4>
          <p class="mt-1 text-xs text-slate-500">${horasDiarias} h × ${diasObjetivo} días × ${empleados} ${empleados === 1 ? 'persona' : 'personas'}</p>
        </div>
        <p class="text-xl font-bold text-teal-400">${objetivo ? `${porcentaje}%` : '—'}</p>
      </div>
      <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div class="h-full rounded-full bg-teal-400" style="width:${anchoBarra}%"></div>
      </div>
      <dl class="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div><dt class="text-slate-500">Ordinarias</dt><dd class="mt-1 font-semibold text-slate-200">${formatearDuracion(resumen.ordinarias)}</dd></div>
        <div><dt class="text-slate-500">Extras</dt><dd class="mt-1 font-semibold text-amber-400">${formatearDuracion(resumen.extras)}</dd></div>
        <div><dt class="text-slate-500">Total</dt><dd class="mt-1 font-semibold text-slate-100">${formatearDuracion(resumen.total)}</dd></div>
      </dl>
      <p class="mt-2 text-[11px] text-slate-500">Cumplimiento de jornada ordinaria</p>
    </article>`;
}

function calcularResumenHoras(asistencia) {
  const jornada = asistencia.jornada || {};
  const ordinarias = convertirDuracionHoras(jornada.horasOrdinarias) ?? calcularDuracionEntreMarcas(
    asistencia.fecha,
    asistencia.hora,
    jornada.fechaSalida || asistencia.fecha,
    jornada.horaSalida
  );
  const extrasCalculadas = calcularDuracionEntreMarcas(
    jornada.fechaEntradaExtra || asistencia.fecha,
    jornada.horaEntradaExtra,
    jornada.fechaSalidaExtra || jornada.fechaEntradaExtra || asistencia.fecha,
    jornada.horaSalidaExtra
  );
  const extras = convertirDuracionHoras(jornada.horasExtras) ?? extrasCalculadas ?? 0;
  const totalInformado = convertirDuracionHoras(jornada.horasTotales);
  const total = totalInformado ?? (ordinarias !== null || extrasCalculadas !== null || jornada.horasExtras != null
    ? (ordinarias || 0) + extras
    : null);
  return { ordinarias, extras, total };
}

function calcularDuracionEntreMarcas(fechaInicio, horaInicio, fechaFin, horaFin) {
  if (!fechaInicio || !horaInicio || !fechaFin || !horaFin) return null;
  const inicio = new Date(`${fechaInicio}T${horaInicio}`);
  let fin = new Date(`${fechaFin}T${horaFin}`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return null;
  if (fin < inicio) fin = new Date(fin.getTime() + 24 * 60 * 60 * 1000);
  return (fin - inicio) / (60 * 60 * 1000);
}

function convertirDuracionHoras(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number') return valor >= 0 && valor < 1 ? valor * 24 : valor;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.getHours() + valor.getMinutes() / 60 + valor.getSeconds() / 3600;
  }
  const texto = String(valor).trim();
  const duracion = texto.match(/^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (duracion) return Number(duracion[1]) + Number(duracion[2]) / 60 + Number(duracion[3] || 0) / 3600;
  const decimal = Number(texto.replace(',', '.'));
  return Number.isFinite(decimal) && decimal >= 0 ? decimal : null;
}

function formatearDuracion(horas) {
  if (horas == null || !Number.isFinite(horas)) return '—';
  const minutosTotales = Math.round(horas * 60);
  return `${Math.floor(minutosTotales / 60)} h ${String(minutosTotales % 60).padStart(2, '0')} min`;
}

function renderizarResumenJornada(asistencia) {
  const jornada = asistencia.jornada || {};
  const resumen = calcularResumenHoras(asistencia);
  const entrada = asistencia.hora || '—';
  const salida = jornada.horaSalida || '—';
  const entradaExtra = jornada.horaEntradaExtra;
  const salidaExtra = jornada.horaSalidaExtra;

  return `<div class="min-w-52 space-y-1.5 text-xs">
    <p><span class="text-slate-500">Entrada:</span> <strong class="text-slate-200">${escaparHTML(entrada)}</strong>
      <span class="ml-2 text-slate-500">Salida:</span> <strong class="text-slate-200">${escaparHTML(salida)}</strong></p>
    ${jornada.estado ? `<p><span class="text-slate-500">Estado:</span> ${escaparHTML(jornada.estado)}</p>` : ''}
    ${entradaExtra || salidaExtra ? `<p><span class="text-amber-400">Extra:</span> ${escaparHTML(jornada.fechaEntradaExtra || '')} ${escaparHTML(entradaExtra || '—')} a ${escaparHTML(jornada.fechaSalidaExtra || '')} ${escaparHTML(salidaExtra || '—')}</p>` : ''}
    <p class="text-slate-400">Ordinarias ${formatearDuracion(resumen.ordinarias)} · Extras ${formatearDuracion(resumen.extras)}</p>
    <p class="font-semibold text-teal-400">Total del día ${formatearDuracion(resumen.total)}</p>
    ${jornada.geolocalizacionSalida ? `<p><span class="text-slate-500">Ubicación salida:</span> ${construirEnlaceGoogleMaps(jornada.geolocalizacionSalida, 'No disponible')}</p>` : ''}
    ${jornada.geolocalizacionEntradaExtra || jornada.geolocalizacionSalidaExtra ? `<p><span class="text-slate-500">Ubicación extra:</span> ${construirEnlaceGoogleMaps(jornada.geolocalizacionEntradaExtra || jornada.geolocalizacionSalidaExtra, 'No disponible')}</p>` : ''}
  </div>`;
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
      datasets: [{
        label: 'Asistencias',
        data: valores,
        borderColor: c.azul,
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: c.azul
      }]
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

function renderizarGraficaHorasTrabajadas(asistencias, inicio, fin) {
  const { etiquetas } = calcularTendenciaDiaria(asistencias, inicio, fin);
  const horasPorDia = calcularHorasPorDia(asistencias, inicio, fin);
  const c = coloresPalette();
  const ctx = document.getElementById('grafica-horas-trabajadas').getContext('2d');

  if (charts.horasTrabajadas) charts.horasTrabajadas.destroy();
  charts.horasTrabajadas = new Chart(ctx, {
    type: 'line',
    data: {
      labels: etiquetas,
      datasets: [{
        label: 'Horas trabajadas',
        data: horasPorDia,
        borderColor: c.cian,
        backgroundColor: 'rgba(6, 182, 212, 0.16)',
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: c.cian
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (context) => `Horas trabajadas: ${formatearDuracion(context.raw)}` } }
      },
      scales: {
        x: { grid: { color: c.grid }, ticks: { color: c.texto } },
        y: {
          title: { display: true, text: 'Horas', color: c.texto },
          grid: { color: c.grid },
          ticks: { color: c.texto, callback: (valor) => `${valor} h` },
          beginAtZero: true
        }
      }
    }
  });
}

function calcularHorasPorDia(asistencias, inicio, fin) {
  const horasPorDia = new Map();
  for (let fecha = inicio; fecha <= fin; fecha = fechaISOConDias(fecha, 1)) {
    horasPorDia.set(fecha, 0);
  }
  asistencias.forEach((asistencia) => {
    const total = calcularResumenHoras(asistencia).total;
    if (total !== null) horasPorDia.set(asistencia.fecha, (horasPorDia.get(asistencia.fecha) || 0) + total);
  });
  return [...horasPorDia.values()];
}

function renderizarGraficaPorcentajeHorasEmpleado(asistencias, inicio, fin) {
  const empleadosGrafica = [...estado.empleados]
    .filter((empleado) => estado.filtroEmpleadosGrafica === null || estado.filtroEmpleadosGrafica.has(empleado.correo))
    .sort((a, b) => `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`));
  const diasObjetivo = contarDiasLaborales(inicio, fin, estado.objetivoJornada.diasLaborales);
  const horasObjetivo = estado.objetivoJornada.horasDiarias * diasObjetivo;
  const metricas = empleadosGrafica.map((empleado) => {
    const registros = asistencias.filter((asistencia) => asistencia.correo === empleado.correo);
    const resumen = resumirHoras(registros);
    return {
      nombre: `${empleado.nombre} ${empleado.apellido}`,
      ...resumen,
      objetivo: horasObjetivo,
      porcentaje: horasObjetivo > 0 ? Math.round((resumen.ordinarias / horasObjetivo) * 100) : 0
    };
  });
  const maximoPorcentaje = Math.max(100, ...metricas.map((metrica) => metrica.porcentaje));
  const maximoEje = Math.ceil((maximoPorcentaje + 15) / 20) * 20;
  const c = coloresPalette();
  const canvas = document.getElementById('grafica-porcentaje-horas-empleado');
  const contenedorGrafica = canvas.parentElement;
  const mensajeVacio = document.getElementById('grafica-empleados-vacia');
  if (charts.porcentajeHorasEmpleado) charts.porcentajeHorasEmpleado.destroy();
  charts.porcentajeHorasEmpleado = null;
  if (metricas.length === 0) {
    contenedorGrafica.classList.add('hidden');
    mensajeVacio?.classList.remove('hidden');
    return;
  }
  contenedorGrafica.classList.remove('hidden');
  mensajeVacio?.classList.add('hidden');
  contenedorGrafica.style.height = `${Math.max(384, metricas.length * 38 + 80)}px`;
  const ctx = canvas.getContext('2d');

  charts.porcentajeHorasEmpleado = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: metricas.map((metrica) => metrica.nombre),
      datasets: [{
        label: 'Cumplimiento de jornada',
        data: metricas.map((metrica) => metrica.porcentaje),
        backgroundColor: metricas.map((metrica) =>
          metrica.porcentaje >= 100 ? 'rgba(57, 214, 194, 0.7)' : metrica.porcentaje >= 75 ? 'rgba(245, 184, 75, 0.7)' : 'rgba(242, 124, 140, 0.7)'
        ),
        borderRadius: 3,
        barPercentage: 0.72,
        categoryPercentage: 0.82
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const metrica = metricas[context.dataIndex];
              return [
                `Cumplimiento: ${metrica.porcentaje}%`,
                `Ordinarias: ${formatearDuracion(metrica.ordinarias)}`,
                `Horas extras: ${formatearDuracion(metrica.extras)}`,
                `Total trabajado: ${formatearDuracion(metrica.total)}`,
                `Objetivo del período: ${formatearDuracion(metrica.objetivo)}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          max: maximoEje,
          title: { display: true, text: '% de jornada ordinaria', color: c.texto },
          grid: { color: c.grid },
          ticks: { color: c.texto, callback: (valor) => `${valor}%` }
        },
        y: { grid: { display: false }, ticks: { color: c.texto, autoSkip: false } }
      }
    },
    plugins: [{
      id: 'etiquetas-porcentaje-horas',
      afterDatasetsDraw(chart) {
        const { ctx: contexto } = chart;
        const meta = chart.getDatasetMeta(0);
        contexto.save();
        contexto.fillStyle = '#e7edf6';
        contexto.font = '12px Manrope, sans-serif';
        contexto.textBaseline = 'middle';
        meta.data.forEach((barra, indice) => {
          contexto.fillText(`${metricas[indice].porcentaje}%`, barra.x + 6, barra.y);
        });
        contexto.restore();
      }
    }]
  });
}

function configurarFiltroEmpleadosGrafica() {
  const filtro = document.getElementById('filtro-empleados-grafica');
  if (!filtro) return;

  filtro.querySelector('[data-seleccionar-todos]')?.addEventListener('click', () => {
    estado.filtroEmpleadosGrafica = null;
    actualizarFiltroEmpleadosGrafica();
  });
  filtro.querySelector('[data-limpiar-seleccion]')?.addEventListener('click', () => {
    estado.filtroEmpleadosGrafica = new Set();
    actualizarFiltroEmpleadosGrafica();
  });
  filtro.querySelector('#lista-empleados-grafica')?.addEventListener('change', (event) => {
    const casilla = event.target.closest('[data-grafica-empleado]');
    if (!casilla) return;
    if (estado.filtroEmpleadosGrafica === null) {
      estado.filtroEmpleadosGrafica = new Set(estado.empleados.map((empleado) => empleado.correo));
    }
    if (casilla.checked) estado.filtroEmpleadosGrafica.add(casilla.value);
    else estado.filtroEmpleadosGrafica.delete(casilla.value);
    actualizarFiltroEmpleadosGrafica();
  });
}

function actualizarFiltroEmpleadosGrafica() {
  poblarFiltroEmpleadosGrafica();
  const { inicio, fin } = rangoPorPeriodo(
    estado.filtroPeriodo,
    estado.filtroInicioPersonalizado,
    estado.filtroFinPersonalizado
  );
  const asistencias = estado.asistencias.filter((asistencia) =>
    asistencia.fecha >= inicio && asistencia.fecha <= fin
  );
  renderizarGraficaPorcentajeHorasEmpleado(asistencias, inicio, fin);
}

function poblarFiltroEmpleadosGrafica() {
  const lista = document.getElementById('lista-empleados-grafica');
  const resumen = document.getElementById('resumen-filtro-empleados');
  if (!lista || !resumen) return;

  const empleados = [...estado.empleados].sort((a, b) =>
    `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`)
  );
  if (estado.filtroEmpleadosGrafica instanceof Set) {
    const correosValidos = new Set(empleados.map((empleado) => empleado.correo));
    estado.filtroEmpleadosGrafica = new Set(
      [...estado.filtroEmpleadosGrafica].filter((correo) => correosValidos.has(correo))
    );
  }
  lista.innerHTML = empleados.map((empleado) => `
    <label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
      <input type="checkbox" data-grafica-empleado value="${escaparHTML(empleado.correo)}"
        ${estado.filtroEmpleadosGrafica === null || estado.filtroEmpleadosGrafica.has(empleado.correo) ? 'checked' : ''}
        class="h-4 w-4 rounded border-slate-600 bg-slate-900 text-teal-500 focus:ring-teal-500" />
      <span>${escaparHTML(`${empleado.nombre} ${empleado.apellido}`)}</span>
    </label>`).join('');

  resumen.textContent = estado.filtroEmpleadosGrafica === null
    ? `Todos (${empleados.length})`
    : `${estado.filtroEmpleadosGrafica.size} de ${empleados.length} seleccionados`;
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

  poblarFiltroEmpleadosGrafica();
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
      nota: document.getElementById('registro-nota').value.trim(),
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
      document.getElementById('registro-fecha').value = nuevaAsistencia.fecha || hoyISO();
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

function clasesHora(hora) {
  const clases = {
    temprano: 'text-emerald-400',
    'en-rango': 'text-amber-400',
    tarde: 'text-red-400',
    'sin-hora': 'text-slate-400'
  };
  return clases[clasificarPuntualidad(hora)] || clases['sin-hora'];
}

// ----------------------------------------------------------------------------
// IMPORTACIÓN MASIVA (JSON / CSV)
// ----------------------------------------------------------------------------
function configurarFormularioImportacion() {
  document.getElementById('input-importar')?.addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const estadoImport = document.getElementById('estado-importacion');
    const progresoImport = document.getElementById('progreso-importacion');
    progresoImport?.classList.remove('hidden');
    document.getElementById('porcentaje-importacion')?.classList.remove('hidden');
    document.getElementById('barra-progreso-importacion')?.parentElement.classList.remove('hidden');
    estadoImport.textContent = 'Leyendo archivo...';
    estadoImport.classList.remove('hidden', 'text-red-400', 'text-emerald-400');
    estadoImport.classList.add('text-slate-400');
    actualizarProgresoImportacion(0, 0, 'Preparando archivo...');

    try {
      let registros;
      const nombreArchivo = archivo.name.toLowerCase();
      if (nombreArchivo.endsWith('.xlsx') || nombreArchivo.endsWith('.xls')) {
        estadoImport.textContent = 'Procesando Excel en segundo plano...';
        registros = await leerExcelEnSegundoPlano(archivo);
      } else if (nombreArchivo.endsWith('.json')) {
        registros = JSON.parse(await archivo.text());
      } else {
        registros = parsearCSV(await archivo.text());
      }
      if (!Array.isArray(registros) || registros.length === 0) {
        throw new Error('El archivo no contiene registros válidos.');
      }

      const totalFilasArchivo = registros.length;
      estadoImport.textContent = `Preparando ${totalFilasArchivo} filas...`;
      registros = registros.map(normalizarRegistroImportado);
      const cambios = clasificarCambiosAsistencia(registros);
      const registrosNuevos = cambios.nuevos;
      const totalEscrituras = cambios.nuevos.length + cambios.actualizaciones.length;
      const resumenCambios = `${cambios.nuevos.length} nuevos detectados · ${cambios.actualizaciones.length} cambios · ${cambios.sinCambios} sin cambios`;
      actualizarProgresoImportacion(0, totalEscrituras, 'Subiendo archivo', totalFilasArchivo, resumenCambios);

      if (estado.usandoDatosDemo) {
        const registrosParaGuardar = [
          ...registrosNuevos,
          ...cambios.actualizaciones.map(({ asistencia }) => asistencia)
        ];
        agregarEmpleadosDesdeRegistros(registrosParaGuardar);
        cambios.actualizaciones.forEach(({ asistencia, existente }) => {
          Object.assign(existente, asistencia, { id: existente.id });
        });
        registrosNuevos.forEach((registro, indice) => {
          const asistenciaNueva = { id: registro.id || `demo-import-${Date.now()}-${indice}`, ...registro };
          estado.asistencias.push(asistenciaNueva);
        });
        estado.asistencias = ordenarPorFechaHoraDesc(estado.asistencias);
        guardarDatosLocales();
        poblarSelectoresEmpleado();
        actualizarProgresoImportacion(totalEscrituras, totalEscrituras, 'Archivo subido completo', totalFilasArchivo);
      } else {
        estadoImport.textContent = 'Subiendo archivo: registrando empleados...';
        const registrosParaGuardar = [
          ...registrosNuevos,
          ...cambios.actualizaciones.map(({ asistencia }) => asistencia)
        ];
        if (totalEscrituras > 0) await agregarEmpleadosEnFirebase(registrosParaGuardar);
        let completados = 0;
        const TAMANO_LOTE_ACTUALIZACION = 40;
        for (let i = 0; i < cambios.actualizaciones.length; i += TAMANO_LOTE_ACTUALIZACION) {
          const lote = cambios.actualizaciones.slice(i, i + TAMANO_LOTE_ACTUALIZACION);
          await Promise.all(lote.map(({ asistencia, existente }) =>
            guardarAsistencia(asistencia, existente.id)
          ));
          completados += lote.length;
          actualizarProgresoImportacion(completados, totalEscrituras, 'Subiendo archivo', totalFilasArchivo, resumenCambios);
        }

        const total = await importarAsistenciasMasivo(registrosNuevos, (importados) => {
          actualizarProgresoImportacion(completados + importados, totalEscrituras, 'Subiendo archivo', totalFilasArchivo, resumenCambios);
        });
        actualizarProgresoImportacion(completados + total, totalEscrituras, 'Archivo subido completo', totalFilasArchivo);
      }
      document.getElementById('detalle-progreso-importacion').textContent =
        `${cambios.nuevos.length} datos nuevos · ${cambios.actualizaciones.length} actualizados · ${cambios.sinCambios} sin cambios · ${cambios.repetidos} repetidos omitidos · ${totalFilasArchivo} filas en el archivo.`;
      poblarSelectoresEmpleado();
      estadoImport.classList.remove('hidden', 'text-red-400', 'text-slate-400');
      estadoImport.classList.add('text-emerald-400');
      renderizarVistaActual();
    } catch (err) {
      console.error(err);
      estadoImport.textContent = `Error al importar: ${err.message}`;
      estadoImport.classList.remove('hidden', 'text-emerald-400', 'text-slate-400');
      estadoImport.classList.add('text-red-400');
      const detalleProgreso = document.getElementById('detalle-progreso-importacion');
      detalleProgreso.textContent = detalleProgreso.textContent
        ? `${detalleProgreso.textContent} · Subida no completada.`
        : 'No se pudo procesar el archivo. Revisa el error e inténtalo de nuevo.';
    }
    e.target.value = '';
  });
}

function clasificarCambiosAsistencia(registros) {
  const existentes = new Map(estado.asistencias.map((asistencia) => [claveAsistencia(asistencia), asistencia]));
  const clavesArchivo = new Set();
  const nuevos = [];
  const actualizaciones = [];
  let sinCambios = 0;
  let repetidos = 0;
  registros.forEach((registro) => {
    const clave = claveAsistencia(registro);
    if (clavesArchivo.has(clave)) {
      repetidos++;
      return;
    }
    clavesArchivo.add(clave);

    const existente = existentes.get(clave);
    if (!existente) {
      nuevos.push(registro);
      return;
    }

    const asistencia = { ...combinarNotaImportada(registro, existente), id: existente.id };
    if (asistenciasImportadasIguales(asistencia, existente)) {
      sinCambios++;
    } else {
      actualizaciones.push({ asistencia, existente });
    }
  });

  return { nuevos, actualizaciones, sinCambios, repetidos };
}

function asistenciasImportadasIguales(propuesta, existente) {
  const campos = Object.keys(propuesta).filter((campo) => campo !== 'id' && campo !== 'creadoEn');
  return campos.every((campo) =>
    JSON.stringify(normalizarValorComparacion(propuesta[campo])) ===
    JSON.stringify(normalizarValorComparacion(existente[campo]))
  );
}

function normalizarValorComparacion(valor) {
  if (valor == null || valor === '') return null;
  if (Array.isArray(valor)) {
    const elementos = valor.map(normalizarValorComparacion);
    if (elementos.length > 0 && elementos.every((elemento) => elemento && typeof elemento === 'object' && 'campo' in elemento)) {
      elementos.sort((a, b) => String(a.campo).localeCompare(String(b.campo)));
    }
    return elementos.length > 0 ? elementos : null;
  }
  if (typeof valor === 'object') {
    const normalizado = Object.fromEntries(
      Object.entries(valor)
        .filter(([clave, contenido]) => clave !== 'creadoEn' && contenido != null && contenido !== '')
        .sort(([claveA], [claveB]) => claveA.localeCompare(claveB))
        .map(([clave, contenido]) => [clave, normalizarValorComparacion(contenido)])
    );
    return Object.keys(normalizado).length > 0 ? normalizado : null;
  }
  return valor;
}

function actualizarProgresoImportacion(completados, total, mensaje = 'Subiendo archivo', totalFilasArchivo = total, resumenCambios = '') {
  const estadoImport = document.getElementById('estado-importacion');
  const barra = document.getElementById('barra-progreso-importacion');
  const porcentaje = document.getElementById('porcentaje-importacion');
  const progressbar = barra?.parentElement;
  const esCompleto = mensaje === 'Archivo subido completo';
  const avance = total > 0 ? Math.min(100, Math.round((completados / total) * 100)) : esCompleto ? 100 : 0;

  if (estadoImport) estadoImport.textContent = esCompleto
    ? mensaje
    : `${mensaje}: ${avance}%`;
  if (barra) barra.style.width = `${avance}%`;
  if (porcentaje) porcentaje.textContent = `${avance}%`;
  if (progressbar) progressbar.setAttribute('aria-valuenow', String(avance));
  if (!esCompleto) {
    const detalle = document.getElementById('detalle-progreso-importacion');
    if (detalle) detalle.textContent = `${completados} de ${total} escrituras confirmadas · ${totalFilasArchivo} filas en el archivo${resumenCambios ? ` · ${resumenCambios}` : ''}`;
  }
}

function leerExcelEnSegundoPlano(archivo) {
  if (typeof Worker === 'undefined') {
    return Promise.reject(new Error('Este navegador no permite procesar Excel en segundo plano.'));
  }

  return archivo.arrayBuffer().then((contenido) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./excel-import-worker.js', import.meta.url));
    worker.addEventListener('message', (event) => {
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.registros);
    }, { once: true });
    worker.addEventListener('error', (event) => {
      worker.terminate();
      reject(new Error(event.message || 'No se pudo procesar el archivo Excel.'));
    }, { once: true });
    worker.postMessage(contenido, [contenido]);
  }));
}

function claveAsistencia(asistencia) {
  return `${String(asistencia.correo || '').trim().toLowerCase()}|${asistencia.fecha}`;
}

function combinarNotaImportada(registro, existente) {
  const notaImportada = String(registro.nota || '').trim();
  const jornadaExistente = existente.jornada || {};
  const jornadaImportada = registro.jornada || {};
  const jornada = { ...jornadaExistente };
  Object.entries(jornadaImportada).forEach(([campo, valor]) => {
    if (valor !== '' && valor != null) jornada[campo] = valor;
  });
  const datosExistentes = Array.isArray(existente.datosAdicionales) ? existente.datosAdicionales : [];
  const datosImportados = Array.isArray(registro.datosAdicionales) ? registro.datosAdicionales : [];
  const datosAnteriores = new Map(datosExistentes.map((dato) => [dato.campo, dato.valor]));
  datosImportados.forEach((dato) => {
    const valor = dato.valor === '' || dato.valor == null ? datosAnteriores.get(dato.campo) ?? dato.valor : dato.valor;
    datosAnteriores.set(dato.campo, valor);
  });
  return {
    ...registro,
    nota: notaImportada || existente.nota || '',
    jornada,
    datosAdicionales: [...datosAnteriores].map(([campo, valor]) => ({ campo, valor }))
  };
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
      const estadoImport = document.getElementById('estado-importacion');
      estadoImport.textContent = 'Todos los datos fueron eliminados. Puedes cargar un archivo nuevo.';
      estadoImport.classList.remove('hidden', 'text-red-400', 'text-slate-400');
      estadoImport.classList.add('text-emerald-400');
      document.getElementById('progreso-importacion')?.classList.remove('hidden');
      document.getElementById('porcentaje-importacion')?.classList.add('hidden');
      document.getElementById('barra-progreso-importacion')?.parentElement.classList.add('hidden');
      document.getElementById('detalle-progreso-importacion').textContent = '';
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
    const nombresCampo =
      campo === 'conoAsentamiento'
        ? [campo, EQUIPO_LABELS[campo], 'Cono de Asentamiento']
        : campo === 'conoPrecaucion'
          ? [campo, EQUIPO_LABELS[campo], 'Cono de Precaucion']
          : campo === 'brochaDensidad'
            ? [campo, EQUIPO_LABELS[campo], 'Brocha dens']
          : [campo, EQUIPO_LABELS[campo]];
    const valor = buscarValor(registro, nombresCampo);
    if (valor !== undefined) equipo[campo] = convertirBooleano(valor);
  });

  const valorConoPrecaucion = buscarValor(registro, [
    'cono precaucion',
    'cono de precaucion',
    'conoPrecaucion'
  ]);
  if (valorConoPrecaucion !== undefined) {
    equipo.conoPrecaucion = convertirBooleano(valorConoPrecaucion);
  }

  const camposConocidos = new Set(
    [
      'id', 'correo', 'email', 'nombre', 'apellido', 'sitioCurso', 'sitio', 'sitio/curso',
      'obra/curso', 'fecha', 'fechaEntrada', 'fechaIngreso', 'hora', 'horaEntrada', 'horaIngreso',
      'geolocalizacion', 'geolocalizacionEntrada', 'coordenadas', 'nota', 'observacion',
      'justificacion', 'motivo', 'comentario', 'notas', 'epp', 'equipo',
      'fechaSalida', 'horaSalida', 'geolocalizacionSalida', 'horasOrdinarias', 'estado',
      'fechaEntradaExtra', 'horaEntradaExtra', 'geolocalizacionEntradaExtra',
      'fechaSalidaExtra', 'horaSalidaExtra', 'geolocalizacionSalidaExtra', 'horasExtras', 'horasTotales',
      ...Object.keys(EPP_LABELS), ...Object.values(EPP_LABELS),
      ...Object.keys(EQUIPO_LABELS), ...Object.values(EQUIPO_LABELS),
      'Cono de Asentamiento', 'Cono Precaucion', 'Cono de Precaucion'
    ].map(normalizarEncabezado)
  );
  const obtenerCampo = (nombres) => buscarValor(registro, nombres);
  const fechaSalida = obtenerCampo(['fechaSalida']);
  const fechaEntradaExtra = obtenerCampo(['fechaEntradaExtra']);
  const fechaSalidaExtra = obtenerCampo(['fechaSalidaExtra']);
  const horaSalida = obtenerCampo(['horaSalida']);
  const horaEntradaExtra = obtenerCampo(['horaEntradaExtra']);
  const horaSalidaExtra = obtenerCampo(['horaSalidaExtra']);
  const jornada = {
    fechaSalida: fechaSalida ? convertirFechaImportada(fechaSalida) : '',
    horaSalida: horaSalida ? convertirHoraImportada(horaSalida) : '',
    geolocalizacionSalida: obtenerCampo(['geolocalizacionSalida']) || '',
    horasOrdinarias: convertirDuracionHoras(obtenerCampo(['horasOrdinarias'])),
    estado: obtenerCampo(['estado']) == null ? '' : String(obtenerCampo(['estado'])),
    fechaEntradaExtra: fechaEntradaExtra ? convertirFechaImportada(fechaEntradaExtra) : '',
    horaEntradaExtra: horaEntradaExtra ? convertirHoraImportada(horaEntradaExtra) : '',
    geolocalizacionEntradaExtra: obtenerCampo(['geolocalizacionEntradaExtra']) || '',
    fechaSalidaExtra: fechaSalidaExtra ? convertirFechaImportada(fechaSalidaExtra) : '',
    horaSalidaExtra: horaSalidaExtra ? convertirHoraImportada(horaSalidaExtra) : '',
    geolocalizacionSalidaExtra: obtenerCampo(['geolocalizacionSalidaExtra']) || '',
    horasExtras: convertirDuracionHoras(obtenerCampo(['horasExtras'])),
    horasTotales: convertirDuracionHoras(obtenerCampo(['horasTotales']))
  };
  const datosAdicionales = Object.entries(registro)
    .filter(([campo]) => !camposConocidos.has(normalizarEncabezado(campo)))
    .map(([campo, valor]) => ({
      campo,
      valor: valor instanceof Date && !Number.isNaN(valor.getTime()) ? valor.toISOString() : valor
    }));

  return {
    id: buscarValor(registro, ['id']) || '',
    correo: buscarValor(registro, ['correo', 'email']) || '',
    nombre: buscarValor(registro, ['nombre']) || '',
    apellido: buscarValor(registro, ['apellido']) || '',
    sitioCurso: buscarValor(registro, ['sitioCurso', 'sitio', 'sitio/curso', 'obra/curso']) || '',
    fecha: convertirFechaImportada(buscarValor(registro, ['fecha', 'fechaEntrada', 'fechaIngreso'])),
    hora: convertirHoraImportada(buscarValor(registro, ['hora', 'horaEntrada', 'horaIngreso'])),
    geolocalizacion: buscarValor(registro, ['geolocalizacion', 'geolocalizacionEntrada', 'coordenadas']) || '',
    nota: buscarValor(registro, ['nota', 'observacion', 'justificacion', 'motivo', 'comentario', 'notas']) || '',
    epp,
    equipo,
    jornada,
    datosAdicionales
  };
}

function escaparHTML(valor) {
  return String(valor).replace(/[&<>"']/g, (caracter) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[caracter]);
}

function renderizarDatosAdicionales(datos) {
  const entradas = Array.isArray(datos)
    ? datos.map(({ campo, valor }) => [campo, valor])
    : Object.entries(datos || {});
  if (entradas.length === 0) return '<span class="text-slate-500">—</span>';

  return `<details class="min-w-40">
    <summary class="cursor-pointer text-xs font-medium text-blue-400">Ver ${entradas.length} campos</summary>
    <dl class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
      ${entradas.map(([campo, valor]) => {
        const texto = valor instanceof Date
          ? valor.toLocaleString('es-GT')
          : valor == null || valor === ''
            ? '—'
            : typeof valor === 'object'
              ? JSON.stringify(valor)
              : String(valor);
        return `<div class="rounded border border-slate-700/70 bg-slate-950/40 px-2 py-1.5">
          <dt class="text-[11px] text-slate-500">${escaparHTML(campo)}</dt>
          <dd class="mt-0.5 break-words text-xs text-slate-200">${escaparHTML(texto)}</dd>
        </div>`;
      }).join('')}
    </dl>
  </details>`;
}

function renderizarJornadaYDatosExcel(jornada = {}, datosAdicionales = []) {
  const camposJornada = [
    ['Fecha salida', jornada.fechaSalida],
    ['Hora salida', jornada.horaSalida],
    ['Geolocalización salida', jornada.geolocalizacionSalida],
    ['Horas ordinarias', jornada.horasOrdinarias == null ? '' : formatearDuracion(jornada.horasOrdinarias)],
    ['Estado', jornada.estado],
    ['Fecha entrada extra', jornada.fechaEntradaExtra],
    ['Hora entrada extra', jornada.horaEntradaExtra],
    ['Geolocalización entrada extra', jornada.geolocalizacionEntradaExtra],
    ['Fecha salida extra', jornada.fechaSalidaExtra],
    ['Hora salida extra', jornada.horaSalidaExtra],
    ['Geolocalización salida extra', jornada.geolocalizacionSalidaExtra],
    ['Horas extras', jornada.horasExtras == null ? '' : formatearDuracion(jornada.horasExtras)],
    ['Horas totales', jornada.horasTotales == null ? '' : formatearDuracion(jornada.horasTotales)]
  ];
  const camposExtras = Array.isArray(datosAdicionales)
    ? datosAdicionales.map(({ campo, valor }) => [campo, valor])
    : Object.entries(datosAdicionales || {});
  const campos = [...camposJornada, ...camposExtras];

  return campos.map(([etiqueta, valor]) => {
    const tieneValor = valor !== '' && valor != null;
    const texto = valor && typeof valor === 'object' ? JSON.stringify(valor) : String(valor ?? '');
    return `<div class="flex min-w-0 items-center justify-between gap-2 rounded-lg border ${
      tieneValor ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/40'
    } px-3 py-2 text-sm">
      <span class="min-w-0 text-slate-300">${escaparHTML(etiqueta)}</span>
      <span class="max-w-[60%] shrink-0 break-words text-right text-xs ${tieneValor ? 'text-emerald-400' : 'text-slate-600'}">${
        tieneValor ? `✓ ${escaparHTML(texto)}` : '—'
      }</span>
    </div>`;
  }).join('');
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
  return [
    'true',
    'si',
    'sí',
    'yes',
    '1',
    'x',
    'cumple',
    'ok',
    'confirmado',
    'confirmada',
    'marcado',
    'marcada',
    'presente',
    'checked'
  ].includes(
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
    tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-500">No hay empleados activos registrados.</td></tr>`;
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
        <td class="py-3 px-4 ${clasesHora(f.hora)}">${f.hora || '—'}</td>
        <td class="py-3 px-4 text-slate-400">${f.sitio || '—'}</td>
        <td class="py-3 px-4 text-slate-400">${f.cumplimientoEpp !== null ? f.cumplimientoEpp + '%' : '—'}</td>
        <td class="py-3 px-4 text-slate-400 text-xs">${f.nota ? f.nota : '—'}</td>
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
  document.getElementById('historial-fecha-inicio')?.addEventListener('change', (e) => {
    estado.fechaInicioHistorial = e.target.value;
    renderizarHistorialEmpleado();
  });
  document.getElementById('historial-fecha-fin')?.addEventListener('change', (e) => {
    estado.fechaFinHistorial = e.target.value;
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
  const registrosHistorial = estado.asistencias.filter((a) => {
    if (a.correo !== estado.correoEmpleadoHistorial) return false;
    if (estado.fechaInicioHistorial && a.fecha < estado.fechaInicioHistorial) return false;
    if (estado.fechaFinHistorial && a.fecha > estado.fechaFinHistorial) return false;
    return true;
  });
  const asistenciasEmpleado = registrosHistorial.filter((a) => !a.ausencia);
  const metricas = calcularMetricasEmpleado(asistenciasEmpleado);

  document.getElementById('historial-nombre').textContent = `${emp.nombre} ${emp.apellido}`;
  document.getElementById('historial-puesto').textContent = emp.puesto || 'Sin puesto asignado';
  document.getElementById('historial-correo').textContent = emp.correo;
  document.getElementById('historial-celular').textContent = emp.celular || 'N/A';
  document.getElementById('historial-dias').textContent = metricas.totalDias;
  document.getElementById('historial-puntualidad').textContent = `${metricas.puntualidad}%`;
  document.getElementById('historial-cumplimiento').textContent = `${metricas.cumplimientoPromedio}%`;
  renderizarResumenHorasEmpleado(estado.asistencias.filter((asistencia) => asistencia.correo === emp.correo));

  const tbody = document.getElementById('tabla-historial');
  if (registrosHistorial.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-500">Sin registros de asistencia.</td></tr>`;
    return;
  }
  tbody.innerHTML = registrosHistorial
    .map(
      (a) => `
      <tr class="border-b border-slate-800 hover:bg-slate-800/40 ${a.ausencia ? 'bg-red-500/5' : ''}">
        <td class="py-3 px-4 text-slate-300">${formatearFechaCompleta(a.fecha)}</td>
        <td class="py-3 px-4 ${a.ausencia ? 'text-red-400 font-medium' : clasesHora(a.hora)}">${a.ausencia ? 'FALTÓ' : a.hora || '—'}</td>
        <td class="py-3 px-4 text-slate-400">${a.ausencia ? 'No asistió' : a.sitioCurso || '—'}</td>
        <td class="py-3 px-4 text-slate-500 text-xs">${construirEnlaceGoogleMaps(a.geolocalizacion, '—')}</td>
        <td class="py-3 px-4">
          ${a.ausencia ? '—' : `<span class="rounded-full px-2.5 py-1 text-xs font-medium ${
            calcularCumplimientoEppIndividual(a.epp) >= 80
              ? 'bg-emerald-500/15 text-emerald-400'
              : calcularCumplimientoEppIndividual(a.epp) >= 50
              ? 'bg-amber-500/15 text-amber-400'
              : 'bg-red-500/15 text-red-400'
          }">${calcularCumplimientoEppIndividual(a.epp)}%</span>`}
        </td>
        <td class="py-3 px-4 text-slate-400 text-xs">${a.nota ? a.nota : '—'}</td>
        <td class="py-3 px-4"><div class="mb-3">${renderizarResumenJornada(a)}</div>${renderizarDatosAdicionales(a.datosAdicionales)}</td>
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

function eliminarRegistroAuditoria(id) {
  if (!id) return;

  mostrarConfirmacion('¿Deseas eliminar este registro de asistencia? Esta acción no se puede deshacer.', async () => {
    try {
      if (estado.usandoDatosDemo) {
        estado.asistencias = estado.asistencias.filter((asistencia) => asistencia.id !== id);
        guardarDatosLocales();
      } else {
        await eliminarAsistencia(id);
        estado.asistencias = estado.asistencias.filter((asistencia) => asistencia.id !== id);
      }
      mostrarToast('Registro eliminado correctamente.', 'exito');
      renderizarAuditoria();
    } catch (err) {
      console.error(err);
      mostrarToast('No se pudo eliminar el registro.', 'error');
    }
  });
}

function renderizarAuditoria() {
  let registros = estado.asistencias.filter((a) => a.fecha === estado.fechaAuditoria && !a.ausencia);
  if (estado.correoAuditoria) {
    registros = registros.filter((a) => a.correo === estado.correoAuditoria);
  }

  const contenedor = document.getElementById('auditoria-contenido');
  const empleadoSeleccionado = estado.correoAuditoria
    ? estado.empleados.find((emp) => emp.correo === estado.correoAuditoria)
    : null;

  if (estado.correoAuditoria && empleadoSeleccionado && registros.length === 0) {
    const ausencia = estado.asistencias.find(
      (a) => a.fecha === estado.fechaAuditoria && a.correo === estado.correoAuditoria && a.ausencia
    );
    const notaActual = ausencia?.nota || 'No llegó a trabajar.';

    contenedor.innerHTML = `
      <div class="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-5">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <h4 class="font-semibold text-slate-100">${empleadoSeleccionado.nombre} ${empleadoSeleccionado.apellido}</h4>
            <p class="text-xs text-slate-500">Sin registro de asistencia para ${formatearFechaCompleta(estado.fechaAuditoria)}.</p>
          </div>
          <span class="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-400">No asistió</span>
        </div>
        <label class="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">Nota por ausencia</label>
        <textarea id="auditoria-nota-ausencia" rows="3" class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none">${notaActual}</textarea>
        <div class="mt-3 flex justify-end">
          <button type="button" id="btn-auditoria-ausencia" class="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors">Guardar nota de ausencia</button>
        </div>
        ${ausencia?.id ? `<div class="mt-2 flex justify-end"><button type="button" data-auditoria-delete="${ausencia.id}" class="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors">Eliminar registro</button></div>` : ''}
      </div>`;

    contenedor.querySelector('[data-auditoria-delete]')?.addEventListener('click', (e) => {
      eliminarRegistroAuditoria(e.currentTarget.dataset.auditoriaDelete);
    });

    document.getElementById('btn-auditoria-ausencia')?.addEventListener('click', async () => {
      const textarea = document.getElementById('auditoria-nota-ausencia');
      const nota = textarea?.value.trim() || 'No llegó a trabajar.';
      const ausenciaExistente = estado.asistencias.find(
        (a) => a.fecha === estado.fechaAuditoria && a.correo === estado.correoAuditoria && a.ausencia
      );

      const entradaAusencia = {
        correo: estado.correoAuditoria,
        nombre: empleadoSeleccionado.nombre,
        apellido: empleadoSeleccionado.apellido,
        sitioCurso: 'No asistió',
        fecha: estado.fechaAuditoria,
        hora: '',
        geolocalizacion: '',
        nota,
        ausencia: true,
        epp: null,
        equipo: null
      };

      try {
        if (estado.usandoDatosDemo) {
          if (ausenciaExistente) {
            Object.assign(ausenciaExistente, entradaAusencia);
          } else {
            entradaAusencia.id = `demo-ausencia-${Date.now()}`;
            estado.asistencias.push(entradaAusencia);
          }
          estado.asistencias = ordenarPorFechaHoraDesc(estado.asistencias);
          guardarDatosLocales();
        } else {
          if (ausenciaExistente) {
            await guardarAsistencia({ ...ausenciaExistente, ...entradaAusencia }, ausenciaExistente.id);
          } else {
            await guardarAsistencia(entradaAusencia);
          }
        }
        mostrarToast('Nota de ausencia guardada.', 'exito');
        renderizarAuditoria();
      } catch (err) {
        console.error(err);
        mostrarToast('No se pudo guardar la nota de ausencia.', 'error');
      }
    });
    return;
  }

  if (registros.length === 0) {
    contenedor.innerHTML = `<div class="py-10 text-center text-slate-500">No hay registros para los filtros seleccionados.</div>`;
    return;
  }

  contenedor.innerHTML = registros
    .map((a) => {
      const filasChecklist = (labels, datos, tipo) =>
        Object.entries(labels)
          .map(([clave, etiqueta]) => {
            const valor = datos && datos[clave];
            const activo = typeof valor === 'boolean' ? valor : convertirBooleano(valor);
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
          <div class="flex items-center gap-3">
            <span class="text-xs text-slate-500">${construirEnlaceGoogleMaps(a.geolocalizacion)}</span>
            ${a.id ? `<button type="button" data-auditoria-delete="${a.id}" class="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors">Eliminar registro</button>` : ''}
          </div>
        </div>
        <div class="mb-4 rounded-lg border border-slate-700 bg-slate-800/40 p-3">
          <p class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Resumen de jornada</p>
          ${renderizarResumenJornada(a)}
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Equipo de Protección Personal</p>
            <div class="grid grid-cols-2 gap-2">${filasChecklist(EPP_LABELS, a.epp, 'epp')}</div>
          </div>
          <div>
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Equipo y Herramientas</p>
            <div class="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">${filasChecklist(
              EQUIPO_LABELS,
              a.equipo,
              'equipo'
            )}</div>
          </div>
        </div>
        <div class="mt-4 rounded-lg border border-slate-700 bg-slate-800/40 p-3">
          <label class="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">Nota de justificación</label>
          <textarea data-nota-input="${a.id || ''}" rows="2" class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none">${a.nota || ''}</textarea>
          <div class="mt-2 flex justify-end gap-2">
            <button type="button" data-nota-clear="${a.id || ''}" class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors">Quitar nota</button>
            <button type="button" data-nota-btn="${a.id || ''}" class="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors">Guardar nota</button>
          </div>
        </div>
      </div>`;
    })
    .join('');

  contenedor.querySelectorAll('[data-auditoria-delete]').forEach((boton) => {
    boton.addEventListener('click', () => eliminarRegistroAuditoria(boton.dataset.auditoriaDelete));
  });

  contenedor.querySelectorAll('[data-nota-btn]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const id = boton.dataset.notaBtn;
      const textarea = contenedor.querySelector(`[data-nota-input="${id}"]`);
      if (!id || !textarea) return;

      const nota = textarea.value.trim();
      const asistencia = estado.asistencias.find((item) => item.id === id);
      if (!asistencia) return;

      const actualizada = { ...asistencia, nota };
      try {
        if (estado.usandoDatosDemo) {
          Object.assign(asistencia, actualizada);
          guardarDatosLocales();
        } else {
          await guardarAsistencia(actualizada, id);
        }
        mostrarToast(nota ? 'Nota guardada correctamente.' : 'Nota eliminada correctamente.', 'exito');
        renderizarAuditoria();
      } catch (err) {
        console.error(err);
        mostrarToast('No se pudo guardar la nota.', 'error');
      }
    });
  });

  contenedor.querySelectorAll('[data-nota-clear]').forEach((boton) => {
    boton.addEventListener('click', () => {
      const id = boton.dataset.notaClear;
      const textarea = contenedor.querySelector(`[data-nota-input="${id}"]`);
      if (!id || !textarea) return;

      const asistencia = estado.asistencias.find((item) => item.id === id);
      if (!asistencia) return;

      mostrarConfirmacion('¿Deseas quitar esta nota de justificación guardada?', async () => {
        const actualizada = { ...asistencia, nota: '' };
        try {
          if (estado.usandoDatosDemo) {
            Object.assign(asistencia, actualizada);
            guardarDatosLocales();
          } else {
            await guardarAsistencia(actualizada, id);
          }
          textarea.value = '';
          mostrarToast('Nota eliminada correctamente.', 'exito');
          renderizarAuditoria();
        } catch (err) {
          console.error(err);
          mostrarToast('No se pudo eliminar la nota.', 'error');
        }
      });
    });
  });
}

function configurarConfirmacion() {
  const modal = document.getElementById('confirm-modal');
  if (!modal) return;

  document.getElementById('confirm-cancel')?.addEventListener('click', ocultarConfirmacion);
  document.getElementById('confirm-accept')?.addEventListener('click', () => {
    const callback = confirmacionCallback;
    const accion = modal.dataset.accion;
    ocultarConfirmacion();
    if (typeof callback === 'function') {
      callback();
    } else if (accion && typeof window[accion] === 'function') {
      window[accion]();
    }
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) ocultarConfirmacion();
  });
}

let confirmacionCallback = null;

function mostrarConfirmacion(mensaje, callback) {
  const modal = document.getElementById('confirm-modal');
  const texto = document.getElementById('confirm-modal-text');
  if (!modal || !texto) {
    if (window.confirm(mensaje)) callback();
    return;
  }

  texto.textContent = mensaje;
  confirmacionCallback = callback;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function ocultarConfirmacion() {
  const modal = document.getElementById('confirm-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  confirmacionCallback = null;
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
