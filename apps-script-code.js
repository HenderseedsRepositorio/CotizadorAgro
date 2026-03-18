/**
 * ═══════════════════════════════════════════════════════════
 * HENDERSEEDS — Apps Script UNIFICADO
 * Sirve tanto al Cotizador Nidera como al Cotizador Agro
 *
 * HOJAS ESPERADAS EN EL SPREADSHEET:
 *
 * ── Nidera ──
 *   "Catalogo"        → híbridos maíz/girasol (tipo, id, b1, b2, b3)
 *   "Condiciones"     → condiciones comerciales
 *   "Cotizaciones"    → historial cotizaciones Nidera
 *   "DatosTecnicos"   → fichas técnicas híbridos
 *
 * ── Agro ──
 *   "Catalogo Agronomia" → productos agro (14 columnas)
 *   "Financiacion"       → plazos y recargos
 *   "Historial Cotizaciones" → historial cotizaciones Agro
 *   "Clientes"           → lista de clientes (nombre, CUIT)
 * ═══════════════════════════════════════════════════════════
 */

const SPREADSHEET_ID = '1vFYnqndbN3ya3_aZMu4qozXMMlJtcqtrdtKLm-PK9Ew';

/* ── Mapeo SUBTIPO → categoría legible (Agro) ── */
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

/* ═══════════════════════════════════════
   ROUTER — doGet / doPost
   ═══════════════════════════════════════ */

function doGet(e) {
  var action = e.parameter.action || '';
  var result;

  try {
    switch (action) {
      // ── Nidera ──
      case 'getCatalogo':         result = getCatalogo(); break;
      case 'getCondiciones':      result = getCondiciones(); break;
      case 'getHistorial':        result = getHistorial(); break;
      case 'getNextNumber':       result = jsonWrap({ numero: getNextQuoteNumber() }); break;
      case 'getDatosTecnicos':    result = getDatosTecnicos(); break;

      // ── Agro ──
      case 'getCatalogoAgro':     result = getCatalogoAgro(); break;
      case 'getFinanciacion':     result = getFinanciacionAgro(); break;
      case 'getFinanciacionAgro': result = getFinanciacionAgro(); break;
      case 'getHistorialAgro':    result = getHistorialAgro(); break;
      case 'getNextNumberAgro':   result = getNextNumberAgro(); break;
      case 'getClientes':         result = getClientes(); break;

      default:
        result = { error: 'Acción no reconocida: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var result;
  try {
    var data = JSON.parse(e.postData.contents);

    switch (data.action) {
      // ── Nidera ──
      case 'registrar':
        result = { ok: true, numero: registrarCotizacion(data) };
        break;

      // ── Agro ──
      case 'registrarAgro':
        result = registrarCotizacionAgro(data);
        break;
      case 'addCliente':
        result = addCliente(data);
        break;

      default:
        result = { error: 'Acción POST no reconocida: ' + data.action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/* helper — solo para getNextNumber que devuelve un objeto simple */
function jsonWrap(obj) { return obj; }


/* ═══════════════════════════════════════════════════════════
   ██  NIDERA — funciones
   ═══════════════════════════════════════════════════════════ */

function getCatalogo() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Catalogo');
  var data = sheet.getDataRange().getValues();
  var catalogo = { maiz: [], girasol: [] };
  for (var i = 1; i < data.length; i++) {
    var tipo = data[i][0], id = data[i][1], b1 = data[i][2], b2 = data[i][3], b3 = data[i][4];
    if (!tipo || !id) continue;
    var item = { id: String(id).trim(), b1: Number(b1) || 0, b2: Number(b2) || null, b3: Number(b3) || null };
    var key = String(tipo).trim().toLowerCase();
    if (key === 'maiz' || key === 'maíz') catalogo.maiz.push(item);
    else if (key === 'girasol') catalogo.girasol.push(item);
  }
  return catalogo;
}

function getCondiciones() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Condiciones');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var moneda = data[i][0], detalle = data[i][1], tna = data[i][2], tea = data[i][3], plazo = data[i][4];
    if (!moneda && !detalle) continue;
    result.push({
      moneda: String(moneda || '').trim(),
      detalle: String(detalle || '').trim(),
      tna: String(tna || '').trim(),
      tea: String(tea || '').trim(),
      plazo: String(plazo || '').trim()
    });
  }
  return result;
}

function getHistorial() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Cotizaciones');
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var startRow = Math.max(2, lastRow - 99);
  var numRows = lastRow - startRow + 1;
  var numCols = 19;
  var range = sheet.getRange(startRow, 1, numRows, numCols);
  var values = range.getValues();
  return values;
}

function getNextQuoteNumber() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Cotizaciones');
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 1;
  var lastNumber = sheet.getRange(lastRow, 1).getValue();
  return (Number(lastNumber) || 0) + 1;
}

function registrarCotizacion(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Cotizaciones');
  var numero = getNextQuoteNumber();
  var fecha = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm');

  var items = data.items || [];

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    sheet.appendRow([
      numero,
      fecha,
      data.vendedor || '—',
      data.cliente || '—',
      data.cuit || '—',
      item.hibrido || '',
      'B' + (item.banda || 1),
      item.cant || 0,
      item.precioNeto || 0,
      item.bandPct || 0,
      item.pPre || 0,
      item.pCont || 0,
      item.pCre || 0,
      item.pCro || 0,
      item.pVol || 0,
      item.valZ || 0,
      item.valP || 0,
      item.totalSIVA || 0,
      item.totalCIVA || 0
    ]);
  }

  return numero;
}

function getDatosTecnicos() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('DatosTecnicos');
  if (!sheet) return { error: 'Hoja DatosTecnicos no encontrada' };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { maiz: [], girasol: [] };

  var headers = data[0];
  var result = { maiz: [], girasol: [] };

  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      var key = String(headers[j]).trim();
      var val = data[i][j];
      if (val === '' || val === null || val === undefined) {
        row[key] = null;
      } else {
        row[key] = val;
      }
    }

    var tipo = String(row.tipo || '').trim().toLowerCase();
    if (tipo === 'maiz' || tipo === 'maíz') {
      result.maiz.push(row);
    } else if (tipo === 'girasol') {
      result.girasol.push(row);
    }
  }

  return result;
}


/* ═══════════════════════════════════════════════════════════
   ██  AGRO — funciones
   ═══════════════════════════════════════════════════════════ */

function getCatalogoAgro() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Catalogo Agronomia');
  if (!sheet) return { error: 'No se encontró la hoja "Catalogo Agronomia"' };

  var data = sheet.getDataRange().getValues();
  var catalogo = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[1]) continue;

    var subtipo = (row[12] || '').toString().trim().toUpperCase();
    var categoria = SUBTIPO_MAP[subtipo] || subtipo || 'Otros';

    // Parsear IVA
    var ivaPct = 21;
    var ivaRaw = (row[5] || '').toString().replace('%', '').replace(',', '.').trim();
    if (ivaRaw) ivaPct = parseFloat(ivaRaw) || 21;
    if (ivaPct < 1) ivaPct = ivaPct * 100;

    // Parsear margen
    var margenPct = 0;
    var margenRaw = (row[7] || '').toString().replace('%', '').replace(',', '.').trim();
    if (margenRaw) margenPct = parseFloat(margenRaw) || 0;
    if (margenPct < 1 && margenPct > 0) margenPct = margenPct * 100;

    var producto = {
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

function getFinanciacionAgro() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Financiacion');
  if (!sheet) {
    return {
      ok: true,
      financiacion: [
        { plazo: 'contado', label: 'Contado', recargo_pct: 0 },
        { plazo: 'mayo2026', label: 'Mayo 2026', recargo_pct: 2 },
        { plazo: 'dic2026', label: 'Diciembre 2026', recargo_pct: 6 }
      ]
    };
  }

  var data = sheet.getDataRange().getValues();
  var plazos = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    plazos.push({
      plazo:       data[i][0].toString().trim(),
      label:       (data[i][1] || '').toString().trim(),
      recargo_pct: parseFloat((data[i][2] || '0').toString().replace(',', '.')) || 0
    });
  }

  return { ok: true, financiacion: plazos };
}

function getHistorialAgro() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Historial Cotizaciones');
  if (!sheet) return { ok: true, historial: [] };

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, historial: [] };

  var rows = data.slice(1).reverse().slice(0, 500);
  var grouped = {};
  var orden = [];

  rows.forEach(function(row) {
    var nro = row[0];
    if (!nro) return;
    var has = Number(row[5]) || 0;
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
    var precio = Number(row[11]) || 0;
    var dosis = Number(row[12]) || 0;
    var costoHa = Number(row[13]) || 0;
    var vol = has > 0 ? dosis * has : 0;
    var monto = has > 0 ? precio * dosis * has : 0;
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

  var result = orden.map(function(nro) { return grouped[nro]; });
  result.forEach(function(h) {
    var totalHas = h.hectareas > 0 ? (h.total * h.hectareas).toFixed(2) : '';
    h.total = h.total.toFixed(2);
    h.totalHas = totalHas;
  });

  return { ok: true, historial: result };
}

function getNextNumberAgro() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Historial Cotizaciones');
  if (!sheet) return { numero: 1 };

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { numero: 1 };

  var max = 0;
  for (var i = 1; i < data.length; i++) {
    var n = Number(data[i][0]) || 0;
    if (n > max) max = n;
  }
  return { numero: max + 1 };
}

function registrarCotizacionAgro(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Historial Cotizaciones');

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

  var nextNum = getNextNumberAgro().numero;
  var fecha = new Date();
  var lineas = data.lineas || [];

  var totalCotiz = 0;
  lineas.forEach(function(l) {
    var costoHa = (Number(l.precio) || 0) * (Number(l.dosis) || 0);
    var iva = costoHa * ((Number(l.iva_pct) || 21) / 100);
    totalCotiz += (costoHa + iva) * (Number(data.hectareas) || 1);
  });

  lineas.forEach(function(l) {
    var precio = Number(l.precio) || 0;
    var dosis = Number(l.dosis) || 0;
    var costoHa = precio * dosis;
    var has = Number(data.hectareas) || 0;
    var subtSinIva = has > 0 ? costoHa * has : costoHa;
    var ivaPct = Number(l.iva_pct) || 21;
    var ivaMonto = subtSinIva * (ivaPct / 100);

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

function getClientes() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Clientes');
  if (!sheet) return { ok: true, clientes: [] };

  var data = sheet.getDataRange().getValues();
  var clientes = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    clientes.push({
      nombre: data[i][0].toString().trim(),
      cuit: (data[i][1] || '').toString().trim()
    });
  }
  return { ok: true, clientes: clientes };
}

function addCliente(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Clientes');
  if (!sheet) {
    sheet = ss.insertSheet('Clientes');
    sheet.appendRow(['Cliente', 'CUIT']);
  }
  sheet.appendRow([data.nombre || '', data.cuit || '']);
  return { ok: true };
}
