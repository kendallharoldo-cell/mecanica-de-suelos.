// ============================================================================
// src/firebase-config.js
// Configuración e inicialización de Firebase (SDK modular v10) + CRUD
// ============================================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// ----------------------------------------------------------------------------
// 1. CONFIGURACIÓN DE FIREBASE
// ----------------------------------------------------------------------------
// Reemplaza estos valores con los de tu propio proyecto de Firebase.
// Consulta el README.md sección "Configuración de Firebase" para el paso a
// paso de cómo obtener estos valores desde la Consola de Firebase.
const firebaseConfig = {
  apiKey: "AIzaSyCtOVOvwHO_CaaamGcrTEcxBl5DIQhgfp0",
  authDomain: "mecanica-de-suelos-30056.firebaseapp.com",
  projectId: "mecanica-de-suelos-30056",
  storageBucket: "mecanica-de-suelos-30056.firebasestorage.app",
  messagingSenderId: "306112794982",
  appId: "1:306112794982:web:8775bee417cb895ebe38a7",
  measurementId: "G-G116C5GQD8"
};

// ----------------------------------------------------------------------------
// 2. INICIALIZACIÓN
// ----------------------------------------------------------------------------
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

const EMPLEADOS_COL = 'empleados';
const ASISTENCIAS_COL = 'asistencias';

// ----------------------------------------------------------------------------
// 3. HELPERS
// ----------------------------------------------------------------------------
function mapDocs(snapshot) {
  return snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
}

export function crearEppVacio() {
  return {
    casco: false,
    lentesSeguridad: false,
    mascarilla: false,
    taponesAuditivos: false,
    chalecoReflectivo: false,
    guantes: false,
    botasPuntaAcero: false,
    barbiquejo: false,
    capaLluvia: false,
    extintor: false
  };
}

export function crearEquipoVacio() {
  return {
    moldesCilindros: false,
    termometro: false,
    conoAsentamiento: false,
    varilla: false,
    planchaAsentamiento: false,
    barraRasadora: false,
    cubetas: false,
    cucharon: false,
    carreta: false,
    pala: false,
    tonel: false,
    masos: false,
    probetas: false,
    tamices: false,
    speedy: false,
    estufaGas: false,
    arenaCalibrada: false,
    balanzas: false,
    masoCompactadorGrande: false,
    masoCompactadorPequeno: false,
    moldeCompactacionGrande: false,
    moldeCompactacionPequeno: false,
    bandejaProctor: false,
    rasadoraProctor: false,
    probetaProctor: false,
    cucharonProctor: false,
    espatulaProctor: false,
    brochaProctor: false,
    cintaMetrica: false,
    brochaDensidad: false,
    cajonMadera: false,
    cajonPlastico: false,
    tamizUnaPulgadaYMedia: false,
    tamizTresCuartosPulgada: false,
    vidrioHumedad: false,
    estufaGasButano: false,
    tarros: false,
    palanganas: false,
    clavos: false,
    cuchara: false,
    formon: false,
    martillo: false,
    embudoSeisPulgadas: false,
    embudoCuatroPulgadas: false,
    picnometro: false,
    platoPerforadoGrande: false,
    platoPerforadoPequeno: false,
    balanzaDigitalGrande: false,
    balanzaDigitalPequena: false,
    gasButano: false
  };
}

export const EPP_LABELS = {
  casco: 'Casco',
  lentesSeguridad: 'Lentes de Seguridad',
  mascarilla: 'Mascarilla',
  taponesAuditivos: 'Tapones Auditivos',
  chalecoReflectivo: 'Chaleco Reflectivo',
  guantes: 'Guantes',
  botasPuntaAcero: 'Botas Punta de Acero',
  barbiquejo: 'Barbiquejo',
  capaLluvia: 'Capa de Lluvia',
  extintor: 'Extintor'
};

export const EQUIPO_LABELS = {
  moldesCilindros: 'Moldes de Cilindros',
  termometro: 'Termómetro',
  conoAsentamiento: 'Cono Precaución',
  varilla: 'Varilla',
  planchaAsentamiento: 'Plancha de Asentamiento',
  barraRasadora: 'Barra Rasadora',
  cubetas: 'Cubetas',
  cucharon: 'Cucharón',
  carreta: 'Carreta',
  pala: 'Pala',
  tonel: 'Tonel',
  masos: 'Mazos',
  probetas: 'Probetas',
  tamices: 'Tamices',
  speedy: 'Speedy',
  estufaGas: 'Estufa de Gas',
  arenaCalibrada: 'Arena Calibrada',
  balanzas: 'Balanzas',
  masoCompactadorGrande: 'Maso Compactador Grande',
  masoCompactadorPequeno: 'Maso Compactador Pequeño',
  moldeCompactacionGrande: 'Molde Compactación Grande',
  moldeCompactacionPequeno: 'Molde Compactación Pequeño',
  bandejaProctor: 'Bandeja Proctor',
  rasadoraProctor: 'Rasadora Proctor',
  probetaProctor: 'Probeta Proctor',
  cucharonProctor: 'Cucharón Proctor',
  espatulaProctor: 'Espátula Proctor',
  brochaProctor: 'Brocha Proctor',
  cintaMetrica: 'Cinta Métrica',
  brochaDensidad: 'Brocha Densidad',
  cajonMadera: 'Cajón Madera',
  cajonPlastico: 'Cajón Plástico',
  tamizUnaPulgadaYMedia: 'Tamiz 1 1/2 plg',
  tamizTresCuartosPulgada: 'Tamiz 3/4 plg',
  vidrioHumedad: 'Vidrio Humedad',
  estufaGasButano: 'Estufa Gas Butano',
  tarros: 'Tarros',
  palanganas: 'Palanganas',
  clavos: 'Clavos',
  cuchara: 'Cuchara',
  formon: 'Formón',
  martillo: 'Martillo',
  embudoSeisPulgadas: 'Embudo 6 plg',
  embudoCuatroPulgadas: 'Embudo 4 plg',
  picnometro: 'Picnómetro',
  platoPerforadoGrande: 'Plato Perforado Grande',
  platoPerforadoPequeno: 'Plato Perforado Pequeño',
  balanzaDigitalGrande: 'Balanza Digital Grande',
  balanzaDigitalPequena: 'Balanza Digital Pequeña',
  gasButano: 'Gas Butano'
};

// ----------------------------------------------------------------------------
// 4. CRUD — EMPLEADOS
// ----------------------------------------------------------------------------
export async function obtenerEmpleados() {
  const snap = await getDocs(collection(db, EMPLEADOS_COL));
  return mapDocs(snap);
}

export async function obtenerEmpleadoPorId(id) {
  const ref = doc(db, EMPLEADOS_COL, id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function guardarEmpleado(empleado, id = null) {
  if (id) {
    await updateDoc(doc(db, EMPLEADOS_COL, id), empleado);
    return id;
  }
  const ref = await addDoc(collection(db, EMPLEADOS_COL), {
    ...empleado,
    creadoEn: serverTimestamp()
  });
  return ref.id;
}

export async function eliminarEmpleado(id) {
  await deleteDoc(doc(db, EMPLEADOS_COL, id));
}

// ----------------------------------------------------------------------------
// 5. CRUD — ASISTENCIAS
// ----------------------------------------------------------------------------
export async function obtenerAsistencias(filtros = {}) {
  let restricciones = [];
  if (filtros.fechaInicio) {
    restricciones.push(where('fecha', '>=', filtros.fechaInicio));
  }
  if (filtros.fechaFin) {
    restricciones.push(where('fecha', '<=', filtros.fechaFin));
  }
  if (filtros.correo) {
    restricciones.push(where('correo', '==', filtros.correo));
  }

  const q =
    restricciones.length > 0
      ? query(collection(db, ASISTENCIAS_COL), ...restricciones, orderBy('fecha', 'desc'))
      : query(collection(db, ASISTENCIAS_COL), orderBy('fecha', 'desc'));

  const snap = await getDocs(q);
  return mapDocs(snap);
}

export async function obtenerAsistenciasPorFecha(fecha) {
  const q = query(collection(db, ASISTENCIAS_COL), where('fecha', '==', fecha));
  const snap = await getDocs(q);
  return mapDocs(snap);
}

export async function guardarAsistencia(asistencia, id = null) {
  if (id) {
    await updateDoc(doc(db, ASISTENCIAS_COL, id), asistencia);
    return id;
  }
  const ref = await addDoc(collection(db, ASISTENCIAS_COL), {
    ...asistencia,
    creadoEn: serverTimestamp()
  });
  return ref.id;
}

export async function eliminarAsistencia(id) {
  await deleteDoc(doc(db, ASISTENCIAS_COL, id));
}

export async function importarAsistenciasMasivo(registros) {
  const CHUNK = 400; // límite de 500 operaciones por batch en Firestore
  let importados = 0;
  for (let i = 0; i < registros.length; i += CHUNK) {
    const lote = registros.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    lote.forEach((registro) => {
      const ref = doc(collection(db, ASISTENCIAS_COL));
      batch.set(ref, { ...registro, creadoEn: serverTimestamp() });
    });
    await batch.commit();
    importados += lote.length;
  }
  return importados;
}

export async function eliminarTodosLosDatos() {
  for (const nombreColeccion of [EMPLEADOS_COL, ASISTENCIAS_COL]) {
    const snapshot = await getDocs(collection(db, nombreColeccion));
    for (let i = 0; i < snapshot.docs.length; i += 400) {
      const lote = snapshot.docs.slice(i, i + 400);
      const batch = writeBatch(db);
      lote.forEach((documento) => batch.delete(documento.ref));
      await batch.commit();
    }
  }
}

export async function importarEmpleadosMasivo(registros) {
  const CHUNK = 400;
  let importados = 0;
  for (let i = 0; i < registros.length; i += CHUNK) {
    const lote = registros.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    lote.forEach((registro) => {
      const ref = doc(collection(db, EMPLEADOS_COL));
      batch.set(ref, { ...registro, creadoEn: serverTimestamp() });
    });
    await batch.commit();
    importados += lote.length;
  }
  return importados;
}

// ----------------------------------------------------------------------------
// 6. SINCRONIZACIÓN EN TIEMPO REAL
// ----------------------------------------------------------------------------
export function sincronizarRealtime(callbackEmpleados, callbackAsistencias) {
  const unsubEmpleados = onSnapshot(collection(db, EMPLEADOS_COL), (snap) => {
    callbackEmpleados(mapDocs(snap));
  });

  const qAsistencias = query(collection(db, ASISTENCIAS_COL), orderBy('fecha', 'desc'));
  const unsubAsistencias = onSnapshot(qAsistencias, (snap) => {
    callbackAsistencias(mapDocs(snap));
  });

  return () => {
    unsubEmpleados();
    unsubAsistencias();
  };
}

