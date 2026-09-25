// ============================================================================
// src/calculations.js
// Motor de cálculos: KPIs, cumplimiento de EPP, tendencias, métricas por empleado
// ============================================================================

import { EPP_LABELS } from './firebase-config.js';

const ITEMS_EPP = Object.keys(EPP_LABELS);

// ----------------------------------------------------------------------------
// UTILIDADES DE FECHA
// ----------------------------------------------------------------------------
export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export function sumarDias(fechaISO, dias) {
  const d = new Date(fechaISO + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function inicioSemanaISO(fechaISO = hoyISO()) {
  const d = new Date(fechaISO + 'T00:00:00');
  const diaSemana = d.getDay(); // 0 = domingo
  const offset = diaSemana === 0 ? 6 : diaSemana - 1; // semana inicia lunes
  return sumarDias(fechaISO, -offset);
}

export function inicioMesISO(fechaISO = hoyISO()) {
  return fechaISO.slice(0, 8) + '01';
}

export function formatearFechaCorta(fechaISO) {
  const d = new Date(fechaISO + 'T00:00:00');
  return d.toLocaleDateString('es-GT', { day: '2-digit', month: 'short' });
}

export function formatearFechaCompleta(fechaISO) {
  if (!fechaISO) return 'Fecha no disponible';
  const d = new Date(fechaISO + 'T00:00:00');
  return d.toLocaleDateString('es-GT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

export function rangoPorPeriodo(periodo, inicioPersonalizado, finPersonalizado) {
  const hoy = hoyISO();
  switch (periodo) {
    case 'hoy':
      return { inicio: hoy, fin: hoy };
    case 'semana':
      return { inicio: inicioSemanaISO(hoy), fin: hoy };
    case 'mes':
      return { inicio: inicioMesISO(hoy), fin: hoy };
    case 'personalizado':
      return { inicio: inicioPersonalizado || hoy, fin: finPersonalizado || hoy };
    default:
      return { inicio: inicioSemanaISO(hoy), fin: hoy };
  }
}

// ----------------------------------------------------------------------------
// KPIs GENERALES
// ----------------------------------------------------------------------------
export function calcularTotalAsistencias(asistencias) {
  return asistencias.length;
}

export function calcularCumplimientoEppPromedio(asistencias) {
  if (asistencias.length === 0) return 0;
  let sumaPorcentajes = 0;
  asistencias.forEach((a) => {
    sumaPorcentajes += calcularCumplimientoEppIndividual(a.epp);
  });
  return Math.round(sumaPorcentajes / asistencias.length);
}

export function calcularCumplimientoEppIndividual(epp) {
  if (!epp) return 0;
  const total = ITEMS_EPP.length;
  const cumplidos = ITEMS_EPP.filter((item) => epp[item] === true).length;
  return Math.round((cumplidos / total) * 100);
}

export function calcularPresentesVsAusentes(empleadosActivos, asistenciasHoy) {
  const correosPresentes = new Set(
    asistenciasHoy.filter((a) => !a.ausencia).map((a) => a.correo)
  );
  const presentes = empleadosActivos.filter((e) => correosPresentes.has(e.correo)).length;
  const ausentes = empleadosActivos.length - presentes;
  return { presentes, ausentes, total: empleadosActivos.length };
}

export function calcularSitioMasActivo(asistencias) {
  if (asistencias.length === 0) return { sitio: 'N/A', total: 0 };
  const conteo = {};
  asistencias.forEach((a) => {
    const sitio = a.sitioCurso || 'Sin especificar';
    conteo[sitio] = (conteo[sitio] || 0) + 1;
  });
  const [sitio, total] = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0];
  return { sitio, total };
}

// ----------------------------------------------------------------------------
// GRÁFICA 1: TENDENCIA DE ASISTENCIA DIARIA
// ----------------------------------------------------------------------------
export function calcularTendenciaDiaria(asistencias, inicio, fin) {
  const conteoPorDia = {};
  let cursor = inicio;
  while (cursor <= fin) {
    conteoPorDia[cursor] = 0;
    cursor = sumarDias(cursor, 1);
  }
  asistencias.forEach((a) => {
    if (a.fecha >= inicio && a.fecha <= fin) {
      conteoPorDia[a.fecha] = (conteoPorDia[a.fecha] || 0) + 1;
    }
  });
  const fechas = Object.keys(conteoPorDia).sort();
  return {
    etiquetas: fechas.map(formatearFechaCorta),
    valores: fechas.map((f) => conteoPorDia[f])
  };
}

// ----------------------------------------------------------------------------
// GRÁFICA 2: CUMPLIMIENTO POR ÍTEM DE EPP
// ----------------------------------------------------------------------------
export function calcularCumplimientoPorItem(asistencias) {
  const total = asistencias.length;
  const conteo = {};
  ITEMS_EPP.forEach((item) => (conteo[item] = 0));

  asistencias.forEach((a) => {
    if (!a.epp) return;
    ITEMS_EPP.forEach((item) => {
      if (a.epp[item] === true) conteo[item] += 1;
    });
  });

  const etiquetas = ITEMS_EPP.map((item) => EPP_LABELS[item]);
  const valores = ITEMS_EPP.map((item) =>
    total > 0 ? Math.round((conteo[item] / total) * 100) : 0
  );

  return { etiquetas, valores, itemsOrdenados: ITEMS_EPP };
}

// ----------------------------------------------------------------------------
// GRÁFICA 3: DISTRIBUCIÓN POR SITIO
// ----------------------------------------------------------------------------
export function calcularDistribucionPorSitio(asistencias) {
  const conteo = {};
  asistencias.forEach((a) => {
    const sitio = a.sitioCurso || 'Sin especificar';
    conteo[sitio] = (conteo[sitio] || 0) + 1;
  });
  const entradas = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
  return {
    etiquetas: entradas.map((e) => e[0]),
    valores: entradas.map((e) => e[1])
  };
}

// ----------------------------------------------------------------------------
// VALIDACIÓN DIARIA: QUIÉN MARCÓ VS QUIÉN FALTÓ
// ----------------------------------------------------------------------------
export function calcularValidacionDiaria(empleadosActivos, asistenciasDelDia) {
  const mapaAsistencias = new Map();
  asistenciasDelDia.forEach((a) => {
    if (a.ausencia) {
      if (!mapaAsistencias.has(a.correo) || mapaAsistencias.get(a.correo).ausencia === false) {
        mapaAsistencias.set(a.correo, a);
      }
      return;
    }
    if (!mapaAsistencias.has(a.correo)) {
      mapaAsistencias.set(a.correo, a);
    }
  });

  return empleadosActivos
    .map((emp) => {
      const marca = mapaAsistencias.get(emp.correo);
      if (marca && marca.ausencia) {
        return {
          empleado: emp,
          marco: false,
          hora: null,
          sitio: 'No asistió',
          nota: marca.nota || 'No llegó a trabajar.',
          cumplimientoEpp: null
        };
      }
      return {
        empleado: emp,
        marco: Boolean(marca),
        hora: marca ? marca.hora : null,
        sitio: marca ? marca.sitioCurso : null,
        nota: marca ? marca.nota : null,
        cumplimientoEpp: marca ? calcularCumplimientoEppIndividual(marca.epp) : null
      };
    })
    .sort((a, b) => {
      if (a.marco === b.marco) {
        return a.empleado.nombre.localeCompare(b.empleado.nombre);
      }
      return a.marco ? -1 : 1;
    });
}

// ----------------------------------------------------------------------------
// HISTORIAL POR EMPLEADO
// ----------------------------------------------------------------------------
export function calcularMetricasEmpleado(asistenciasEmpleado) {
  const asistenciasValidas = asistenciasEmpleado.filter((a) => !a.ausencia);
  const totalDias = asistenciasValidas.length;
  const sumaCumplimiento = asistenciasValidas.reduce(
    (acc, a) => acc + calcularCumplimientoEppIndividual(a.epp),
    0
  );
  const cumplimientoPromedio = totalDias > 0 ? Math.round(sumaCumplimiento / totalDias) : 0;

  const horasValidas = asistenciasEmpleado
    .map((a) => a.hora)
    .filter(Boolean)
    .map(convertirHoraAMinutos)
    .filter((minutos) => minutos !== null);
  const promedioMinutos =
    horasValidas.length > 0
      ? Math.round(horasValidas.reduce((a, b) => a + b, 0) / horasValidas.length)
      : null;
  const horaPromedio =
    promedioMinutos !== null
      ? `${String(Math.floor(promedioMinutos / 60)).padStart(2, '0')}:${String(
          promedioMinutos % 60
        ).padStart(2, '0')}`
      : 'N/A';

  const antesDe720 = horasValidas.filter((min) => min <= 7 * 60 + 20).length;
  const puntualidad =
    horasValidas.length > 0 ? Math.round((antesDe720 / horasValidas.length) * 100) : 0;

  return { totalDias, cumplimientoPromedio, horaPromedio, puntualidad };
}

function convertirHoraAMinutos(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.getHours() * 60 + valor.getMinutes();
  }
  if (typeof valor === 'number' && valor >= 0 && valor < 1) {
    return Math.round(valor * 24 * 60);
  }
  const partes = String(valor).trim().split(':').map(Number);
  if (partes.length < 2 || !Number.isFinite(partes[0]) || !Number.isFinite(partes[1])) return null;
  if (partes[0] < 0 || partes[0] > 23 || partes[1] < 0 || partes[1] > 59) return null;
  return partes[0] * 60 + partes[1];
}

export function clasificarPuntualidad(hora) {
  const minutos = convertirHoraAMinutos(hora);
  if (minutos === null) return 'sin-hora';
  if (minutos < 7 * 60 + 10) return 'temprano';
  if (minutos <= 7 * 60 + 20) return 'en-rango';
  return 'tarde';
}

// ----------------------------------------------------------------------------
// ORDENAMIENTO CRONOLÓGICO
// ----------------------------------------------------------------------------
export function ordenarPorFechaHoraDesc(asistencias) {
  return [...asistencias].sort((a, b) => {
    const fechaHoraA = `${a.fecha}T${a.hora || '00:00:00'}`;
    const fechaHoraB = `${b.fecha}T${b.hora || '00:00:00'}`;
    return fechaHoraB.localeCompare(fechaHoraA);
  });
}

