/**
 * ═══════════════════════════════════════════════════════════
 * HENDERSEEDS — Apps Script (backend cotizador agro)
 *
 * SETUP:
 * 1. Abrí tu Google Sheet (el mismo del cotizador Nidera)
 * 2. Extensiones → Apps Script
 * 3. Creá un archivo nuevo (ej: Agro.gs) y pegá este código
 *    O agregalo al código existente
 * 4. Si ya tenés un doGet, integrá los cases nuevos al switch
 * 5. Re-deploy
 * ═══════════════════════════════════════════════════════════
 *
 * HOJA "Catalogo Agronomia" — columnas esperadas:
 * A: N°
 * B: PRODUCTO
 * C: Presentacion
 * D: FORMULACION
 * E: PROVEEDOR
 * F: IVA
 * G: CostoHseeds
 * H: Margen
 * I: P con margen
 * J: PRICING
 * K: Dosis Referencia
 * L: TIPO
 * M: SUBTIPO (HER, INS, FUN, CUR, COA, etc.)
 * N: Stock Ajustado
 *
 * HOJA "Financiacion" — columnas:
 * A: plazo
 * B: label
 * C: recargo_pct
 *
 * HOJA "Historial Cotizaciones" — se crea automáticamente
 */

/* ── Mapeo SUBTIPO → categoría legible ── */
const SUBTIPO_MAP = {
  'HER': 'Herbicidas',
  'INS': 'Insecticidas',
  'FUN': 'Fungicidas',
  'CUR': 'Curasemillas',
  'COA': 'Coadyuvantes',
  'PAS': 'Pasturas',
  'SIL': 'Silo Bolsa',
  'SEM': 'Semillas',
  'FER': 'Fertilizantes'
};

function doGet(e) {
  const action = e.parameter.action || '';
  let result;

  try {
    switch (action) {
      // ── Acciones del cotizador AGRO ──
      case 'getCatalogoAgro':
        result = getCatalogoAgro();
        break;
      case 'getFinanciacion':
        result = getFinanciacion();
        break;
      case 'getHistorialAgro':
        result = getHistorialAgro();
        break;
      case 'getNextNumberAgro':
        result = getNextNumberAgro();
        break;
      case 'getClientes':
        result = getClientes();
        break;

      // ── Acá irían las acciones de Nidera si las tenés ──
      // case 'getPrecios': ...
      // case 'getCatalogo': ...

      default:
        result = { error: 'Acción no válida: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let result;
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'registrarAgro') {
      result = registrarCotizacionAgro(data);
    } else if (data.action === 'addCliente') {
      result = addCliente(data);
    } else {
      result = { error: 'Acción POST no válida' };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ═══════════════════════════════════════
   GET CATALOGO AGRO
   Lee "Catalogo Agronomia" y agrupa por SUBTIPO
   ═══════════════════════════════════════ */
function getCatalogoAgro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Catalogo Agronomia');
  if (!sheet) return { error: 'No se encontró la hoja "Catalogo Agronomia"' };

  const data = sheet.getDataRange().getValues();
  const catalogo = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[1]) continue; // saltar si no hay producto

    const subtipo = (row[12] || '').toString().trim().toUpperCase();
    const categoria = SUBTIPO_MAP[subtipo] || subtipo || 'Otros';

    // Parsear IVA: "21%" → 21
    let ivaPct = 21;
    const ivaRaw = (row[5] || '').toString().replace('%', '').replace(',', '.').trim();
    if (ivaRaw) ivaPct = parseFloat(ivaRaw) || 21;
    // Si viene como decimal (0.21), convertir
    if (ivaPct < 1) ivaPct = ivaPct * 100;

    // Parsear margen: "8%" o "8,00%" → 8
    let margenPct = 0;
    const margenRaw = (row[7] || '').toString().replace('%', '').replace(',', '.').trim();
    if (margenRaw) margenPct = parseFloat(margenRaw) || 0;
    if (margenPct < 1 && margenPct > 0) margenPct = margenPct * 100;

    const producto = {
      nro:            Number(row[0]) || i,
      producto:       (row[1] || '').toString().trim(),
      presentacion:   Number(row[2]) || 0,
      formulacion:    (row[3] || '').toString().trim(),
      proveedor:      (row[4] || '').toString().trim(),
      iva_pct:        ivaPct,
      costo_usd:      parseFloat((row[6] || '0').toString().replace(',', '.')) || 0,
      margen_pct:     margenPct,
      precio_usd:     parseFloat((row[8] || '0').toString().replace(',', '.')) || 0,
      pricing:        row[9] ? row[9].toString() : '',
      dosis_sug:      row[10] ? parseFloat(row[10].toString().replace(',', '.')) || null : null,
      tipo:           (row[11] || '').toString().trim(),
      subtipo:        subtipo,
      stock:          parseFloat((row[13] || '0').toString().replace(',', '.')) || 0
    };

    if (!catalogo[categoria]) catalogo[categoria] = [];
    catalogo[categoria].push(producto);
  }

  return { ok: true, catalogo: catalogo };
}

/* ═══════════════════════════════════════
   GET FINANCIACION
   ═══════════════════════════════════════ */
function getFinanciacion() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Financiacion');
  if (!sheet) {
    // Default si no existe la hoja
    return {
      ok: true,
      financiacion: [
        { plazo: 'contado', label: 'Contado', recargo_pct: 0 },
        { plazo: 'mayo2026', label: 'Mayo 2026', recargo_pct: 2 },
        { plazo: 'dic2026', label: 'Diciembre 2026', recargo_pct: 6 }
      ]
    };
  }

  const data = sheet.getDataRange().getValues();
  const plazos = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    plazos.push({
      plazo:       data[i][0].toString().trim(),
      label:       (data[i][1] || '').toString().trim(),
      recargo_pct: parseFloat((data[i][2] || '0').toString().replace(',', '.')) || 0
    });
  }

  return { ok: true, financiacion: plazos };
}

/* ═══════════════════════════════════════
   GET HISTORIAL AGRO
   ═══════════════════════════════════════ */
function getHistorialAgro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Historial Cotizaciones');
  if (!sheet) return { ok: true, historial: [] };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, historial: [] };

  const rows = data.slice(1).reverse().slice(0, 500);
  const grouped = {};
  const orden = []; // mantener orden de aparición (más nuevo primero)

  rows.forEach(row => {
    const nro = row[0];
    if (!nro) return;
    const has = Number(row[5]) || 0;
    if (!grouped[nro]) {
      orden.push(nro);
      grouped[nro] = {
        numero: nro,
        fecha: row[1] ? Utilities.formatDate(new Date(row[1]), 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy') : '',
        vendedor: row[2] || '',
        cliente: row[3] || '',
        establecimiento: row[4] || '',
        hectareas: has,
        plazo: row[6] || '',
        lineas: [],
        total: 0
      };
    }
    const precio = Number(row[11]) || 0;
    const dosis = Number(row[12]) || 0;
    const costoHa = Number(row[13]) || 0;
    const vol = has > 0 ? dosis * has : 0;
    const monto = has > 0 ? precio * dosis * has : 0;
    grouped[nro].lineas.push({
      producto: row[9] || '',
      unidad: row[10] || 'L',
      precio: precio.toFixed(2),
      dosis: dosis,
      costoHa: costoHa.toFixed(2),
      vol: vol > 0 ? vol.toFixed(2) : '—',
      monto: monto > 0 ? monto.toFixed(2) : '—'
    });
    grouped[nro].total += costoHa;
  });

  // Mantener orden descendente (más nuevo primero)
  const result = orden.map(nro => grouped[nro]);
  result.forEach(h => {
    const totalHas = h.hectareas > 0 ? (h.total * h.hectareas).toFixed(2) : '';
    h.total = h.total.toFixed(2);
    h.totalHas = totalHas;
  });

  return { ok: true, historial: result };
}

/* ═══════════════════════════════════════
   GET NEXT NUMBER AGRO
   ═══════════════════════════════════════ */
function getNextNumberAgro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Historial Cotizaciones');
  if (!sheet) return { numero: 1 };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { numero: 1 };

  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const n = Number(data[i][0]) || 0;
    if (n > max) max = n;
  }
  return { numero: max + 1 };
}

/* ═══════════════════════════════════════
   REGISTRAR COTIZACION AGRO
   ═══════════════════════════════════════ */
function registrarCotizacionAgro(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Historial Cotizaciones');

  if (!sheet) {
    sheet = ss.insertSheet('Historial Cotizaciones');
    sheet.appendRow([
      'nro_cotizacion', 'fecha', 'vendedor', 'cliente', 'localidad',
      'hectareas', 'plazo', 'recargo_pct',
      'categoria', 'producto', 'unidad', 'precio_ud', 'dosis_ha',
      'costo_ha', 'subtotal_sin_iva', 'iva_pct', 'iva_monto',
      'subtotal_con_iva', 'total_cotizacion', 'observaciones'
    ]);
  }

  const nextNum = getNextNumberAgro().numero;
  const fecha = new Date();
  const lineas = data.lineas || [];

  let totalCotiz = 0;
  lineas.forEach(l => {
    const costoHa = (Number(l.precio) || 0) * (Number(l.dosis) || 0);
    const iva = costoHa * ((Number(l.iva_pct) || 21) / 100);
    totalCotiz += (costoHa + iva) * (Number(data.hectareas) || 1);
  });

  lineas.forEach(l => {
    const precio = Number(l.precio) || 0;
    const dosis = Number(l.dosis) || 0;
    const costoHa = precio * dosis;
    const has = Number(data.hectareas) || 0;
    const subtSinIva = has > 0 ? costoHa * has : costoHa;
    const ivaPct = Number(l.iva_pct) || 21;
    const ivaMonto = subtSinIva * (ivaPct / 100);

    sheet.appendRow([
      nextNum, fecha, data.vendedor || '', data.cliente || '',
      data.localidad || '', has, data.plazo || 'contado', data.recargo_pct || 0,
      l.categoria || '', l.producto || '', l.unidad || 'L',
      precio, dosis, costoHa, subtSinIva, ivaPct, ivaMonto,
      subtSinIva + ivaMonto, totalCotiz, l.observaciones || ''
    ]);
  });

  return { ok: true, numero: nextNum };
}

/* ═══════════════════════════════════════
   GET CLIENTES
   Lee la hoja "Clientes" (columnas: A=Cliente, B=CUIT)
   ═══════════════════════════════════════ */
function getClientes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Clientes');
  if (!sheet) return { ok: true, clientes: [] };

  const data = sheet.getDataRange().getValues();
  const clientes = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    clientes.push({
      nombre: data[i][0].toString().trim(),
      cuit: (data[i][1] || '').toString().trim()
    });
  }
  return { ok: true, clientes: clientes };
}

/* ═══════════════════════════════════════
   ADD CLIENTE
   Agrega un cliente nuevo a la hoja "Clientes"
   ═══════════════════════════════════════ */
function addCliente(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Clientes');
  if (!sheet) {
    sheet = ss.insertSheet('Clientes');
    sheet.appendRow(['Cliente', 'CUIT']);
  }
  sheet.appendRow([data.nombre || '', data.cuit || '']);
  return { ok: true };
}
