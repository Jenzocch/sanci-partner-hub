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

/**
 * Kolom A..N (migrasi 0014 — sebelumnya A..K, lihat README.md §2/§8 untuk
 * penjelasan kenapa kontrak "hanya A..K" berubah). Jangan mengubah URUTAN
 * tanpa mengubah buildRow_(). L..N adalah kolom BARU (DP/Kondisi Pembayaran/
 * Alamat Kirim) — kolom SETELAHNYA (O dan seterusnya) tetap milik catatan
 * manual pengguna, tidak pernah disentuh skrip ini (lihat COL_COUNT di bawah).
 */
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
  'Uang Muka / DP (IDR)',
  'Kondisi Pembayaran',
  'Alamat Kirim',
  'Dibuat',
  'Diubah'
];
var COL_COUNT = HEADERS.length;    // 14
var KEY_COL = 1;                   // Nomor Pesanan ada di kolom A
/** Versi header — dinaikkan setiap kali bentuk HEADERS berubah (migrasi 0014: 1 → 2). */
var HEADER_VERSION = 2;

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

  var ordersFetch = fetchAllOrders_(cfg, token);
  var orders = ordersFetch.rows;
  var offers = fetchOffersByOrderId_(cfg, token);   // {} kalau 0013 belum jalan (amount saja jika 0014 belum jalan)

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
function ordersSelect_(includeShipping) {
  return 'id,order_number,package_name,status,fulfillment_path,' +
    'partner_purchase_amount,' + (includeShipping ? 'shipping_address,' : '') + 'created_at,updated_at,' +
    'customers:customer_id(full_name,phone,phone_normalized),' +
    'partner_branches:branch_id(name),' +
    'partners:partner_id(name)';
}

/**
 * shipping_address (migrasi 0014) diminta di SELECT yang SAMA dengan
 * pesanan itu sendiri — beda dari order_sanci_offers (tabel terpisah,
 * permintaan kedua): shipping_address adalah KOLOM di partner_orders, jadi
 * kalau 0014 belum dijalankan, PostgREST menolak SELURUH permintaan ini
 * (kolom tidak dikenal, HTTP 400 + kode 42703), bukan cuma kolom itu yang
 * kosong. Jadi halaman PERTAMA dicoba dulu DENGAN shipping_address; kalau
 * ditolak karena kolom itu, seluruh pengambilan diulang TANPA kolom itu —
 * supaya sepuluh kolom lain tetap tersinkron walau 0014 belum jalan
 * (LESSONS #12, pola yang sama dengan fetchOffersByOrderId_ di bawah).
 */
function fetchAllOrders_(cfg, token) {
  var includeShipping = true;
  var probe = fetchOrdersPage_(cfg, token, ordersSelect_(true), 0, PAGE_SIZE);
  if (probe.status === 'missing-column') {
    includeShipping = false;
    Logger.log('shipping_address belum ada di partner_orders (migrasi 0014 belum dijalankan) — ' +
      'kolom Alamat Kirim dibiarkan kosong.');
  } else if (probe.status === 'error') {
    throw new Error('Gagal membaca pesanan (HTTP ' + probe.code + '): ' + probe.body);
  }

  var select = ordersSelect_(includeShipping);
  var out = [];
  var from = 0;
  while (true) {
    var page = includeShipping && from === 0
      ? probe.rows
      : fetchOrdersPage_(cfg, token, select, from, PAGE_SIZE).rows;
    out = out.concat(page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (from > 200000) break;  // sabuk pengaman: jangan pernah berputar selamanya
  }
  return { rows: out, hasShipping: includeShipping };
}

function fetchOrdersPage_(cfg, token, select, from, pageSize) {
  var base = cfg.url + '/rest/v1/partner_orders?select=' + encodeURIComponent(select) +
    '&order=' + encodeURIComponent('created_at.asc,id.asc');
  var to = from + pageSize - 1;
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
  var text = res.getContentText();
  if (code === 400 && text.indexOf('42703') >= 0 && text.indexOf('shipping_address') >= 0) {
    return { status: 'missing-column' };
  }
  // 200 = halaman terakhir (atau semuanya muat), 206 = masih ada sisanya.
  if (code !== 200 && code !== 206) {
    return { status: 'error', code: code, body: text };
  }
  return { status: 'ok', rows: JSON.parse(text) };
}

/**
 * Nilai penawaran SANCI (tabel order_sanci_offers, migration 0013).
 *
 * SENGAJA permintaan KEDUA, bukan embed di dalam query pesanan: kalau 0013
 * belum dijalankan, embed akan menggagalkan SELURUH pengambilan pesanan, dan
 * lembar ini kosong total gara-gara satu kolom. Sebagai permintaan terpisah,
 * "tabelnya belum ada" hanya berarti kolom Penawaran SANCI tetap kosong.
 */
/**
 * Peta order_id → { amount, dp, condition }. dp_amount/payment_condition
 * adalah kolom BARU migrasi 0014 pada tabel yang SAMA (order_sanci_offers,
 * 0013) — dicoba dulu DENGAN kedua kolom itu; kalau ditolak 42703 (0014
 * belum jalan tapi 0013 sudah), diulang HANYA dengan `amount` supaya kolom
 * Penawaran SANCI yang sudah lama jalan tidak ikut kosong gara-gara dua
 * kolom baru (LESSONS #12).
 */
function fetchOffersByOrderId_(cfg, token) {
  var wide = fetchOffersPage_(cfg, token, 'order_id,amount,dp_amount,payment_condition', 0);
  if (wide.status === 'missing-column') {
    Logger.log('dp_amount/payment_condition belum ada di order_sanci_offers ' +
      '(migrasi 0014 belum dijalankan) — kolom Uang Muka/Kondisi Pembayaran dibiarkan kosong.');
    return fetchOffersLoop_(cfg, token, 'order_id,amount', false);
  }
  if (wide.status === 'missing-table') {
    Logger.log('order_sanci_offers belum ada (migration 0013 belum dijalankan) — ' +
      'kolom Penawaran SANCI dibiarkan kosong.');
    return {};
  }
  return fetchOffersLoop_(cfg, token, 'order_id,amount,dp_amount,payment_condition', true, wide);
}

function fetchOffersLoop_(cfg, token, select, wide, firstPage) {
  var map = {};
  var from = 0;
  while (true) {
    var page = (from === 0 && firstPage) ? firstPage : fetchOffersPage_(cfg, token, select, from);
    if (page.status === 'error') {
      // Bukan alasan untuk membatalkan seluruh sync: kolom lainnya tetap benar.
      // Yang sudah terbaca DIPERTAHANKAN, dan jumlahnya ikut dilaporkan di baris
      // ringkasan supaya selisihnya terlihat.
      Logger.log('Gagal membaca penawaran (HTTP ' + page.code + '): ' + page.body +
        ' — memakai ' + countKeys_(map) + ' baris penawaran yang sempat terbaca.');
      return map;
    }
    if (page.status === 'missing-table' || page.status === 'missing-column') return map;
    for (var i = 0; i < page.rows.length; i++) {
      var r = page.rows[i];
      map[r.order_id] = wide ? { amount: r.amount, dp: r.dp_amount, condition: r.payment_condition } : { amount: r.amount };
    }
    if (page.rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (from > 200000) break;
  }
  return map;
}

function fetchOffersPage_(cfg, token, select, from) {
  var base = cfg.url + '/rest/v1/order_sanci_offers?select=' +
    encodeURIComponent(select) + '&order=' + encodeURIComponent('order_id.asc');
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
  // 42P01 = tabel tidak ada sama sekali (0013 belum jalan).
  if (code === 404 || (code >= 400 && text.indexOf('42P01') >= 0)) {
    return { status: 'missing-table' };
  }
  // 42703 = kolom dp_amount/payment_condition tidak ada (0014 belum jalan).
  if (code >= 400 && text.indexOf('42703') >= 0) {
    return { status: 'missing-column' };
  }
  if (code !== 200 && code !== 206) {
    return { status: 'error', code: code, body: text };
  }
  return { status: 'ok', rows: JSON.parse(text) };
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

/**
 * Deteksi format lama (migrasi 0014 menambah 3 kolom, A..K → A..N — README.md
 * §2/§8 dulu menjanjikan "hanya menulis A..K", janji itu SENGAJA dilanggar
 * di sini karena bentuk datanya sendiri berubah). Tab lama yang header-nya
 * masih A..K (11 kolom) TIDAK ditimpa diam-diam — kalau begitu, kolom L
 * lama (catatan manual pengguna, dijamin README "tidak pernah disentuh")
 * akan tertimpa Uang Muka/DP tanpa peringatan. Lebih baik REFUSE dengan
 * pesan jelas daripada salah tulis (LESSONS #16 turunan: gagal dengan jelas
 * lebih baik daripada berhasil dengan salah).
 */
function headerMatches_(sheet) {
  if (sheet.getLastRow() === 0) return true;   // tab kosong — aman ditulis header baru
  var existing = sheet.getRange(1, 1, 1, Math.min(sheet.getLastColumn(), COL_COUNT + 2)).getValues()[0];
  if (existing.length < HEADERS.length) return false;
  for (var i = 0; i < HEADERS.length; i++) {
    if (String(existing[i]).trim() !== HEADERS[i]) return false;
  }
  return true;
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
    return sheet;
  }
  if (!headerMatches_(sheet)) {
    throw new Error(
      'Format lama terdeteksi di tab "' + name + '" (header tidak cocok dengan versi ' +
      'terbaru — migrasi 0014 menambah kolom L "Uang Muka / DP", M "Kondisi Pembayaran", ' +
      'N "Alamat Kirim"; kolom lama L dst. bergeser ke O dst.). Skrip ini TIDAK menimpa ' +
      'tab ini secara otomatis supaya catatan manual Anda di kolom lama tidak salah tertulis. ' +
      'Ganti nama tab ini (mis. tambahkan " (lama)") atau arsipkan ke lembar lain, lalu jalankan ' +
      'Sync sekarang lagi — tab baru dengan format terbaru akan dibuat otomatis.'
    );
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
  var offer = offers[o.id];   // { amount, dp, condition } | { amount } | undefined

  return [
    o.order_number || '',
    (branch && branch.name) || '',
    (customer && customer.full_name) || '',
    customerPhone_(customer),
    o.package_name || '',
    STATUS_LABEL[o.status] || o.status || '',
    FULFILLMENT_LABEL[o.fulfillment_path] || '',
    toNumberOrBlank_(o.partner_purchase_amount),
    toNumberOrBlank_(offer && offer.amount),
    toNumberOrBlank_(offer && offer.dp),
    (offer && offer.condition) || '',
    // shipping_address bisa `undefined` (0014 belum jalan, lihat
    // fetchAllOrders_) ATAU `null` (kolom ada tapi belum diisi) — keduanya
    // sama-sama harus jadi sel kosong, bukan teks "undefined"/"null".
    o.shipping_address || '',
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
