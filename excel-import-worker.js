importScripts('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');

self.addEventListener('message', (event) => {
  try {
    const libro = XLSX.read(event.data, { type: 'array', cellDates: true });
    const registros = libro.SheetNames.flatMap((nombreHoja) =>
      XLSX.utils.sheet_to_json(libro.Sheets[nombreHoja], { defval: '' })
    );
    self.postMessage({ registros });
  } catch (error) {
    self.postMessage({ error: error.message || 'No se pudo leer el archivo Excel.' });
  }
});
