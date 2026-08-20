/**
 * SANCI Partner Hub → Google Sheets (cermin SATU ARAH: sistem → lembar).
 *
 * KEAMANAN — baca ini dulu: skrip ini HANYA boleh memakai anon key + akun sync
 * khusus, TIDAK PERNAH service_role key, karena service_role melewati seluruh
 * RLS dan siapa pun yang bisa membuka Apps Script ini akan memegang kunci
 * tertinggi basis data selamanya.
 *
 * Script Properties yang wajib diisi (Project Settings → Script Properties):
 *   SUPABASE_URL        https://xxxx.supabase.co
 *   SUPABASE_ANON_KEY   anon key (nilai publik — keamanannya dari RLS)
 *   SYNC_EMAIL          email akun sync khusus (platform_admin)
 *   SYNC_PASSWORD       kata sandi akun sync tersebut
 *
 * Yang skrip ini TIDAK lakukan (disengaja, lihat README.md):
 *   - Tidak pernah menulis balik ke sistem. Suntingan di lembar TIDAK naik.
 *   - Tidak pernah menghapus baris. Pesanan batal hanya berubah statusnya.
 *   - Tidak pernah menyentuh kolom L dan seterusnya — itu milik catatan manual.
 */

// ── Konfigurasi tetap ───────────────────────────────────────

var PAGE_SIZE = 1000;              // PostgREST: satu halaman per permintaan
var LOCK_WAIT_MS = 30000;          // tunggu 30 detik kalau ada run lain
var TRIGGER_HANDLER = 'syncNow';   // nama fungsi yang dipasang time-driven
var TRIGGER_EVERY_MINUTES = 15;

/** Kolom A..K. Jangan mengubah URUTAN tanpa mengubah buildRow(). */
var HEADERS = [
  'Nomor Pesanan',
  'Cabang',
  'Pelanggan',
  'Telepon',
  'Package',
  'Status',
  'Jalur Pesanan',
  'Belanja Toko (IDR)',
  'Penawaran SANCI (IDR)',
  'Dibuat',
  'Diubah'
];
var COL_COUNT = HEADERS.length;    // 11
var KEY_COL = 1;                   // Nomor Pesanan ada di kolom A

/** Nilai enum internal tetap Inggris di basis data; label mengikuti glosarium. */
var STATUS_LABEL = {
  REGISTERED: 'Terdaftar',
  CANCELLED: 'Dibatalkan'
};
var FULFILLMENT_LABEL = {
  DIRECT_DELIVERY: 'Kirim Langsung',
  SHOWROOM_VISIT: 'Kunjungan Showroom'
};

// ── Titik masuk ─────────────────────────────────────────────

/** Menu khusus di spreadsheet: SANCI Sync → Sync sekarang. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SANCI Sync')
    .addItem('Sync sekarang', 'syncNow')
    .addToUi();
}

/**
 * Memasang trigger setiap 15 menit. Idempoten: trigger lama untuk handler yang
 * sama dihapus lebih dulu, jadi menjalankan fungsi ini dua kali TIDAK
 * menghasilkan dua trigger (dan dengan itu dua run yang saling menimpa).
 */
function setupTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(existing[i]);
      removed++;
    }
  }
  ScriptApp.newTrigger(TRIGGER_HANDLER)
    .timeBased()
    .everyMinutes(TRIGGER_EVERY_MINUTES)
    .create();
  Logger.log('setupTrigger: ' + removed + ' trigger lama dihapus, 1 trigger baru setiap ' +
    TRIGGER_EVERY_MINUTES + ' menit.');
}

/**
 * Fungsi utama. Dipanggil oleh menu, oleh trigger, atau manual dari editor.
 *
 * LockService dipakai supaya run terjadwal dan run manual tidak pernah berjalan
 * bersamaan: dua run bersamaan sama-sama membaca "nomor pesanan yang sudah ada
 * di lembar", sama-sama menyimpulkan sebuah pesanan belum ada, lalu sama-sama
 * menambahkannya — satu pesanan menjadi dua baris.
 */
function syncNow() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    Logger.log('syncNow: dilewati — run lain sedang berjalan.');
    return;
  }
  try {
    runSync_();
  } finally {
    lock.releaseLock();
  }
}

// ── Inti ────────────────────────────────────────────────────

function runSync_() {
  var startedAt = new Date();
  var cfg = readConfig_();
  var token = signIn_(cfg);

  var orders = fetchAllOrders_(cfg, token);
  var offers = fetchOffersByOrderId_(cfg, token);   // {} kalau 0013 belum jalan

  var byPartner = {};
  var partnerNames = [];
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i];
    var partnerName = pickName_(o.partners) || '(Tanpa Partner)';
    // hasOwnProperty, bukan `if (!byPartner[x])`: nama partner datang dari data,
    // dan sebuah nama seperti "constructor" akan terbaca sebagai "sudah ada"
    // lewat prototipe Object — lalu push() ke sesuatu yang bukan array.
    if (!Object.prototype.hasOwnProperty.call(byPartner, partnerName)) {
      byPartner[partnerName] = [];
      partnerNames.push(partnerName);
    }
    byPartner[partnerName].push(o);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var okTabs = 0, failedTabs = 0, updated = 0, appended = 0;

  for (var p = 0; p < partnerNames.length; p++) {
    var name = partnerNames[p];
    // Satu tab bermasalah (nama aneh, lembar terkunci, kuota) tidak boleh
    // menggagalkan seluruh run — partner lain tetap harus tersinkron.
    try {
      var res = writePartnerTab_(ss, name, byPartner[name], offers);
      updated += res.updated;
      appended += res.appended;
      okTabs++;
    } catch (err) {
      failedTabs++;
      Logger.log('TAB GAGAL "' + name + '": ' + err);
    }
  }

  var seconds = ((new Date()).getTime() - startedAt.getTime()) / 1000;
  Logger.log('SANCI Sync selesai: ' + orders.length + ' pesanan, ' +
    okTabs + ' tab OK, ' + failedTabs + ' tab gagal, ' +
    updated + ' baris diperbarui, ' + appended + ' baris baru, ' +
    'penawaran: ' + countKeys_(offers) + ' baris, ' +
    seconds.toFixed(1) + ' detik. Zona waktu lembar: ' + tz + '.');
}

function readConfig_() {
  var props = PropertiesService.getScriptProperties();
  var cfg = {
    url: (props.getProperty('SUPABASE_URL') || '').replace(/\/+$/, ''),
    anonKey: props.getProperty('SUPABASE_ANON_KEY') || '',
    email: props.getProperty('SYNC_EMAIL') || '',
    password: props.getProperty('SYNC_PASSWORD') || ''
  };
  var missing = [];
  if (!cfg.url) missing.push('SUPABASE_URL');
  if (!cfg.anonKey) missing.push('SUPABASE_ANON_KEY');
  if (!cfg.email) missing.push('SYNC_EMAIL');
  if (!cfg.password) missing.push('SYNC_PASSWORD');
  if (missing.length) {
    throw new Error('Script Property belum diisi: ' + missing.join(', ') +
      '. Isi di Project Settings → Script Properties, lalu jalankan lagi.');
  }
  return cfg;
}

/**
 * Login sebagai akun sync. Token TIDAK disimpan ke Script Properties — ia hidup
 * hanya selama satu run, jadi tidak ada kredensial berumur panjang yang bocor
 * kalau lembar ini kelak dibagikan ke orang lain.
 */
function signIn_(cfg) {
  var res = UrlFetchApp.fetch(cfg.url + '/auth/v1/token?grant_type=password', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: cfg.anonKey },
    payload: JSON.stringify({ email: cfg.email, password: cfg.password }),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code !== 200) {
    throw new Error('Login akun sync GAGAL (HTTP ' + code + '). Periksa Script Property ' +
      'SUPABASE_URL, SUPABASE_ANON_KEY, SYNC_EMAIL, dan SYNC_PASSWORD. Jawaban server: ' + body);
  }
  var token = JSON.parse(body).access_token;
  if (!token) {
    throw new Error('Login berhasil tapi access_token tidak ada di jawaban server. ' +
      'Periksa Script Property SUPABASE_URL.');
  }
  return token;
}

function restHeaders_(cfg, token, extra) {
  var h = {
    apikey: cfg.anonKey,
    Authorization: 'Bearer ' + token,
    Accept: 'application/json'
  };
  if (extra) {
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
    }
  }
  return h;
}

/**
 * Mengambil SELURUH pesanan, halaman demi halaman lewat header Range.
 *
 * `order=` WAJIB ada dan harus menghasilkan urutan yang TOTAL (created_at bisa
 * sama persis untuk dua pesanan; `id` memutuskan sisanya). Tanpa urutan yang
 * pasti, halaman kedua boleh saja mengembalikan baris yang sudah ikut di
 * halaman pertama — dan baris lain hilang tanpa ada yang tahu.
 */
function fetchAllOrders_(cfg, token) {
  var select = 'id,order_number,package_name,status,fulfillment_path,' +
    'partner_purchase_amount,created_at,updated_at,' +
    'customers:customer_id(full_name,phone,phone_normalized),' +
    'partner_branches:branch_id(name),' +
    'partners:partner_id(name)';
  var base = cfg.url + '/rest/v1/partner_orders?select=' + encodeURIComponent(select) +
    '&order=' + encodeURIComponent('created_at.asc,id.asc');

  var out = [];
  var from = 0;
  while (true) {
    var to = from + PAGE_SIZE - 1;
    var res = UrlFetchApp.fetch(base, {
      method: 'get',
      headers: restHeaders_(cfg, token, {
        'Range-Unit': 'items',
        Range: from + '-' + to,
        Prefer: 'count=exact'
      }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    // 200 = halaman terakhir (atau semuanya muat), 206 = masih ada sisanya.
    if (code !== 200 && code !== 206) {
      throw new Error('Gagal membaca pesanan (HTTP ' + code + '): ' + res.getContentText());
    }
    var page = JSON.parse(res.getContentText());
    out = out.concat(page);
    if (page.length < PAGE_SIZE) break;

    var total = totalFromContentRange_(res);
    from += PAGE_SIZE;
    if (total !== null && from >= total) break;
    if (from > 200000) break;  // sabuk pengaman: jangan pernah berputar selamanya
  }
  return out;
}

/**
 * Nilai penawaran SANCI (tabel order_sanci_offers, migration 0013).
 *
 * SENGAJA permintaan KEDUA, bukan embed di dalam query pesanan: kalau 0013
 * belum dijalankan, embed akan menggagalkan SELURUH pengambilan pesanan, dan
 * lembar ini kosong total gara-gara satu kolom. Sebagai permintaan terpisah,
 * "tabelnya belum ada" hanya berarti kolom Penawaran SANCI tetap kosong.
 */
function fetchOffersByOrderId_(cfg, token) {
  var map = {};
  var from = 0;
  var base = cfg.url + '/rest/v1/order_sanci_offers?select=' +
    encodeURIComponent('order_id,amount') + '&order=' + encodeURIComponent('order_id.asc');
  while (true) {
    var res = UrlFetchApp.fetch(base, {
      method: 'get',
      headers: restHeaders_(cfg, token, {
        'Range-Unit': 'items',
        Range: from + '-' + (from + PAGE_SIZE - 1),
        Prefer: 'count=exact'
      }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var text = res.getContentText();
    // 42P01 hanya diperiksa pada jawaban GAGAL. Kalau diperiksa juga pada
    // jawaban sukses, sebuah isi yang kebetulan memuat teks itu akan salah
    // dibaca sebagai "tabelnya tidak ada".
    if (code === 404 || (code >= 400 && text.indexOf('42P01') >= 0)) {
      Logger.log('order_sanci_offers belum ada (migration 0013 belum dijalankan) — ' +
        'kolom Penawaran SANCI dibiarkan kosong.');
      return {};
    }
    if (code !== 200 && code !== 206) {
      // Bukan alasan untuk membatalkan seluruh sync: sepuluh kolom lainnya tetap
      // benar. Yang sudah terbaca DIPERTAHANKAN (bukan dibuang menjadi {}), dan
      // jumlahnya ikut dilaporkan di baris ringkasan supaya selisihnya terlihat.
      Logger.log('Gagal membaca penawaran (HTTP ' + code + '): ' + text +
        ' — memakai ' + countKeys_(map) + ' baris penawaran yang sempat terbaca.');
      return map;
    }
    var page = JSON.parse(text);
    for (var i = 0; i < page.length; i++) {
      map[page[i].order_id] = page[i].amount;
    }
    if (page.length < PAGE_SIZE) break;
    var total = totalFromContentRange_(res);
    from += PAGE_SIZE;
    if (total !== null && from >= total) break;
    if (from > 200000) break;
  }
  return map;
}

/** "0-999/12345" → 12345. null kalau server memakai "*" atau header tidak ada. */
function totalFromContentRange_(res) {
  var headers = res.getAllHeaders();
  var value = null;
  for (var k in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, k) &&
        k.toLowerCase() === 'content-range') {
      value = headers[k];
      break;
    }
  }
  if (!value) return null;
  var parts = String(value).split('/');
  if (parts.length < 2 || parts[1] === '*') return null;
  var n = parseInt(parts[1], 10);
  return isNaN(n) ? null : n;
}

// ── Menulis satu tab partner ────────────────────────────────

function writePartnerTab_(ss, partnerName, orders, offers) {
  var sheet = ensureSheet_(ss, partnerName);

  // Peta "nomor pesanan → nomor baris" dibaca SEKALI per tab (satu panggilan
  // API), bukan sel demi sel.
  var lastRow = sheet.getLastRow();
  var rowOf = {};
  var lastKeyRow = 1;   // baris 1 adalah judul; data mulai baris 2
  if (lastRow >= 2) {
    var keys = sheet.getRange(2, KEY_COL, lastRow - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i][0];
      if (key !== '' && key !== null) {
        rowOf[String(key)] = i + 2;
        lastKeyRow = i + 2;
      }
    }
  }

  var updates = [];   // { row: <nomor baris>, values: [...] }
  var appends = [];
  for (var j = 0; j < orders.length; j++) {
    var row = buildRow_(orders[j], offers);
    var existingRow = rowOf[String(orders[j].order_number)];
    if (existingRow) updates.push({ row: existingRow, values: row });
    else appends.push(row);
  }

  // Baris yang berurutan digabung menjadi satu setValues. Karena lembar ini
  // hanya pernah DITAMBAH di bawah dan pesanan diambil dengan urutan yang sama,
  // dalam praktiknya ini hampir selalu menjadi SATU panggilan — tapi
  // pengelompokannya tetap benar walau urutannya kelak berubah.
  updates.sort(function (a, b) { return a.row - b.row; });
  var g = 0;
  while (g < updates.length) {
    var startRow = updates[g].row;
    var block = [updates[g].values];
    var next = g + 1;
    while (next < updates.length && updates[next].row === updates[next - 1].row + 1) {
      block.push(updates[next].values);
      next++;
    }
    // HANYA kolom 1..COL_COUNT (A..K). Kolom L dan seterusnya — catatan manual
    // yang ditulis orang di lembar ini — tidak pernah ikut tersentuh.
    sheet.getRange(startRow, 1, block.length, COL_COUNT).setValues(block);
    g = next;
  }

  // Ditambahkan tepat di bawah baris berkunci TERAKHIR, bukan di bawah
  // getLastRow(). Bedanya muncul kalau seseorang menulis catatan manual jauh di
  // bawah tabel: getLastRow() akan melompati lubang itu dan tabel pesanannya
  // pecah menjadi dua bagian yang makin lama makin jauh. Kolom L dan seterusnya
  // tetap tidak tersentuh — yang ditulis di sini hanya A..K.
  if (appends.length) {
    sheet.getRange(lastKeyRow + 1, 1, appends.length, COL_COUNT).setValues(appends);
  }

  return { updated: updates.length, appended: appends.length };
}

function ensureSheet_(ss, partnerName) {
  var name = safeSheetName_(partnerName);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, COL_COUNT).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  // Tab yang sudah ada tapi masih kosong (dibuat manual) tetap diberi judul.
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, COL_COUNT).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Google Sheets menolak : \ / ? * [ ] di nama tab, dan membatasi 100 karakter. */
function safeSheetName_(name) {
  var cleaned = String(name).replace(/[:\\\/\?\*\[\]]/g, ' ').trim();
  if (!cleaned) cleaned = 'Tanpa Nama';
  return cleaned.length > 95 ? cleaned.substring(0, 95) : cleaned;
}

function buildRow_(o, offers) {
  var customer = pickOne_(o.customers);
  var branch = pickOne_(o.partner_branches);
  var offerAmount = offers[o.id];

  return [
    o.order_number || '',
    (branch && branch.name) || '',
    (customer && customer.full_name) || '',
    customerPhone_(customer),
    o.package_name || '',
    STATUS_LABEL[o.status] || o.status || '',
    FULFILLMENT_LABEL[o.fulfillment_path] || '',
    toNumberOrBlank_(o.partner_purchase_amount),
    toNumberOrBlank_(offerAmount),
    toDateOrBlank_(o.created_at),
    toDateOrBlank_(o.updated_at)
  ];
}

/**
 * Bentuk lokal "0812-3456-789" seperti di aplikasi (displayPhoneID); kalau
 * bentuk kanoniknya tidak ada, pakai apa adanya yang diketik cabang.
 */
function customerPhone_(customer) {
  if (!customer) return '';
  var n = customer.phone_normalized;
  if (n && String(n).indexOf('62') === 0) {
    var local = '0' + String(n).substring(2);
    return local.replace(/(\d{4})(?=\d)/g, '$1-');
  }
  return customer.phone || '';
}

/** Angka ditulis sebagai ANGKA — pemformatan Rupiah diserahkan ke Sheets. */
function toNumberOrBlank_(v) {
  if (v === null || v === undefined || v === '') return '';
  var n = Number(v);
  return isNaN(n) ? '' : n;
}

/**
 * Tanggal ditulis sebagai Date SUNGGUHAN, bukan teks — supaya bisa diurutkan
 * dan difilter di Sheets. Basis data menyimpan timestamptz (UTC); Sheets
 * menampilkannya dalam zona waktu spreadsheet dengan sendirinya, jadi tidak ada
 * penggeseran jam yang perlu dilakukan di sini. Kalau jam yang tampil terasa
 * salah, yang perlu diubah adalah File → Setelan → Zona waktu spreadsheet
 * (nilainya ikut dicatat di baris ringkasan log).
 */
function toDateOrBlank_(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d;
}

/** PostgREST mengembalikan embed sebagai objek, tapi bisa juga array. */
function pickOne_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Array]') return v.length ? v[0] : null;
  return v;
}

function pickName_(v) {
  var one = pickOne_(v);
  return one && one.name ? String(one.name) : '';
}

function countKeys_(obj) {
  var n = 0;
  for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) n++; }
  return n;
}
