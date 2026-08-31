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
 *   - Tidak pernah menyentuh kolom U dan seterusnya — itu milik catatan manual
 *     (batas ini bergeser dari L → O → T → U → AF seiring migrasi 0014/0015/0020 dan
 *     penambahan arsip 2026-08-31 menambah kolom, lihat README.md §2
 *     "⚠️ Perubahan cakupan kolom").
 *   - Tab "Item Pesanan" dan "Pelanggan" adalah ARSIP: ditulis ULANG penuh
 *     tiap run, jadi JANGAN menulis catatan apa pun di kedua tab itu.
 */

// ── Konfigurasi tetap ───────────────────────────────────────

var PAGE_SIZE = 1000;              // PostgREST: satu halaman per permintaan
var LOCK_WAIT_MS = 30000;          // tunggu 30 detik kalau ada run lain
var TRIGGER_HANDLER = 'syncNow';   // nama fungsi yang dipasang time-driven
var TRIGGER_EVERY_MINUTES = 15;

/**
 * Kolom A..T (migrasi 0020 — sebelumnya A..S sejak 0015, A..N sejak 0014,
 * lihat README.md §2/§8 untuk penjelasan kenapa kontraknya terus berubah).
 * Jangan mengubah URUTAN tanpa mengubah buildRow_(). B ("No. PO Pelanggan")
 * adalah kolom BARU 0020, sengaja diletakkan TEPAT SETELAH Nomor Pesanan
 * (bukan di ujung sebelum Dibuat/Diubah seperti 0014/0015) karena kedua nomor
 * ini dibaca berdampingan; ini menggeser SEMUA kolom C dan seterusnya satu
 * huruf ke kanan dibanding versi sebelumnya — README.md §"⚠️ Perubahan
 * cakupan kolom" menjelaskan kenapa pergeseran ini tidak berbeda risikonya
 * dari penambahan di ujung (headerMatches_ menolak SELURUH tab lama sama
 * saja, apa pun posisi kolom barunya). Kolom SETELAH Diubah (U dan
 * seterusnya) tetap milik catatan manual pengguna, tidak pernah disentuh
 * skrip ini (lihat COL_COUNT di bawah).
 */
var HEADERS = [
  'Nomor Pesanan',
  'No. PO Pelanggan',
  'Cabang',
  'Pelanggan',
  'Kode Pelanggan',
  'Telepon',
  'Nama Sales',
  'Package',
  'Status',
  'Jalur Pesanan',
  'Status Kirim',
  'Belanja Toko (IDR)',
  'Penawaran SANCI (IDR)',
  'Uang Muka / DP (IDR)',
  'Kondisi Pembayaran',
  'Alamat Kirim',
  'Diskon',
  'Markup (%)',
  'Potongan Tunai (IDR)',
  'Harga Akhir (IDR)',
  'Sisa (IDR)',
  'No. SO',
  'Tgl SO',
  'No. DO',
  'Tgl DO',
  'No. Invoice',
  'Tgl Invoice',
  'Tgl Terima Pelanggan',
  'Alasan Batal',
  'Dibuat',
  'Diubah'
];
var COL_COUNT = HEADERS.length;    // 31
var KEY_COL = 1;                   // Nomor Pesanan ada di kolom A
/** Versi header — dinaikkan setiap kali bentuk HEADERS berubah (migrasi 0014: 1 → 2, migrasi 0015: 2 → 3, migrasi 0020: 3 → 4, arsip 2026-08-31: 4 → 5). */
var HEADER_VERSION = 5;

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

  // Dokumen + item + cakupan DO. Ketiganya opsional: kalau migrasinya belum
  // jalan, kolomnya kosong dan sisa lembar tetap benar (LESSONS #12).
  var docs = fetchDocsByOrderId_(cfg, token);
  var itemsFetch = fetchOrderItems_(cfg, token);
  var coverage = docs.available
    ? fetchDoCoverage_(cfg, token, docs.doDocIds)
    : { covered: {}, available: false };

  var itemsByOrder = {};
  for (var it = 0; it < itemsFetch.rows.length; it++) {
    var item = itemsFetch.rows[it];
    if (!Object.prototype.hasOwnProperty.call(itemsByOrder, item.order_id)) {
      itemsByOrder[item.order_id] = [];
    }
    itemsByOrder[item.order_id].push(item);
  }

  var ctx = {
    offers: offers,
    docsByOrder: docs.byOrder,
    docsAvailable: docs.available,
    itemsByOrder: itemsByOrder,
    itemsAvailable: itemsFetch.available,
    doCovered: coverage.covered,
    staffNames: fetchStaffNames_(cfg, token)
  };

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
      var res = writePartnerTab_(ss, name, byPartner[name], ctx);
      updated += res.updated;
      appended += res.appended;
      okTabs++;
    } catch (err) {
      failedTabs++;
      Logger.log('TAB GAGAL "' + name + '": ' + err);
    }
  }

  // ── Tab ARSIP (bukan per partner): satu tab untuk seluruh sistem ──
  // Ditulis ULANG penuh setiap run, TIDAK pakai pola "cari baris lalu
  // perbarui" seperti tab partner. Alasannya beda kegunaan: tab partner
  // adalah lembar KERJA yang orang tulisi catatan di kolom sebelah kanan, tab
  // ini adalah SALINAN — tidak ada yang menulis di sini, dan penulisan ulang
  // penuh membuatnya mustahil menyimpan baris hantu dari data yang sudah
  // dihapus di sistem.
  var archiveTabs = 0, archiveFailed = 0;
  try {
    writeItemsTab_(ss, itemsFetch.rows, orders, ctx);
    archiveTabs++;
  } catch (errItems) {
    archiveFailed++;
    Logger.log('TAB "' + ITEMS_TAB_NAME + '" GAGAL: ' + errItems);
  }
  try {
    writeCustomersTab_(ss, orders);
    archiveTabs++;
  } catch (errCust) {
    archiveFailed++;
    Logger.log('TAB "' + CUSTOMERS_TAB_NAME + '" GAGAL: ' + errCust);
  }

  var seconds = ((new Date()).getTime() - startedAt.getTime()) / 1000;
  Logger.log('SANCI Sync selesai: ' + orders.length + ' pesanan, ' +
    okTabs + ' tab OK, ' + failedTabs + ' tab gagal, ' +
    updated + ' baris diperbarui, ' + appended + ' baris baru, ' +
    'penawaran: ' + countKeys_(offers) + ' baris, ' +
    'dokumen: ' + (docs.available ? countKeys_(docs.byOrder) + ' pesanan berdokumen' : 'belum dimigrasikan') + ', ' +
    'item: ' + itemsFetch.rows.length + ' baris, ' +
    'tab arsip: ' + archiveTabs + ' OK / ' + archiveFailed + ' gagal, ' +
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
/**
 * Kolom partner_orders yang boleh HILANG kalau migrasinya belum dijalankan di
 * suatu environment. Ditulis sebagai DAFTAR, bukan tangga if-else bertingkat:
 * sampai 2026-08-31 setiap kolom opsional baru menuntut satu anak tangga
 * tulis-tangan sendiri di fetchAllOrders_, dan tangga itu harus tahu urutan
 * mana yang dilaporkan PostgREST lebih dulu. Sekarang: coba SELECT terlebar,
 * kalau ditolak 42703 buang kolom yang disebut, ulangi. Kolom apa pun yang
 * kelak ditambahkan cukup didaftarkan di sini (LESSONS #12).
 */
var OPTIONAL_ORDER_COLS = [
  'customer_po',          // 0020
  'shipping_address',     // 0014
  'delivered_at',         // 0023
  'cancellation_reason'   // 0005
];

/** Kolom customers yang boleh hilang (customer_code: 0017/0018/0019). */
var OPTIONAL_CUSTOMER_COLS = ['customer_code'];

/**
 * Menyusun `select=` dari kolom wajib + kolom opsional yang MASIH dianggap
 * ada. `dropped` adalah objek {nama_kolom: true} berisi yang sudah terbukti
 * tidak ada.
 */
function ordersSelect_(dropped) {
  var cols = ['id', 'order_number', 'package_name', 'status', 'fulfillment_path',
    'partner_purchase_amount', 'partner_sales_staff_id', 'created_at', 'updated_at'];
  for (var i = 0; i < OPTIONAL_ORDER_COLS.length; i++) {
    var c = OPTIONAL_ORDER_COLS[i];
    if (!dropped[c]) cols.push(c);
  }
  var custCols = ['full_name', 'phone', 'phone_normalized'];
  for (var j = 0; j < OPTIONAL_CUSTOMER_COLS.length; j++) {
    var cc = OPTIONAL_CUSTOMER_COLS[j];
    if (!dropped[cc]) custCols.push(cc);
  }
  return cols.join(',') +
    ',customers:customer_id(' + custCols.join(',') + ')' +
    ',partner_branches:branch_id(name)' +
    ',partners:partner_id(name)';
}

/**
 * Mengambil SELURUH pesanan, halaman demi halaman lewat header Range.
 *
 * `order=` WAJIB ada dan harus menghasilkan urutan yang TOTAL (created_at bisa
 * sama persis untuk dua pesanan; `id` memutuskan sisanya). Tanpa urutan yang
 * pasti, halaman kedua boleh saja mengembalikan baris yang sudah ikut di
 * halaman pertama — dan baris lain hilang tanpa ada yang tahu.
 *
 * Degradasi kolom opsional: lihat OPTIONAL_ORDER_COLS di atas. Satu kolom yang
 * belum dimigrasikan membuat selnya KOSONG, bukan menggagalkan seluruh sync.
 */
function fetchAllOrders_(cfg, token) {
  var dropped = {};
  var probe = null;
  // +1 percobaan terakhir setelah semua kolom opsional habis dibuang.
  var maxTries = OPTIONAL_ORDER_COLS.length + OPTIONAL_CUSTOMER_COLS.length + 1;
  var select = '';
  for (var attempt = 0; attempt < maxTries; attempt++) {
    select = ordersSelect_(dropped);
    probe = fetchOrdersPage_(cfg, token, select, 0, PAGE_SIZE);
    if (probe.status !== 'missing-column') break;
    if (dropped[probe.column]) {
      // Kolom yang sama dilaporkan dua kali = kita salah membaca pesannya.
      // Jangan berputar selamanya dan jangan pura-pura sukses.
      throw new Error('Gagal membaca pesanan: kolom "' + probe.column +
        '" tetap ditolak setelah dibuang. Periksa skema partner_orders.');
    }
    dropped[probe.column] = true;
    Logger.log('Kolom "' + probe.column + '" belum ada (migrasinya belum dijalankan) — ' +
      'kolom lembar yang bergantung padanya dibiarkan kosong.');
  }
  if (probe.status === 'missing-column') {
    throw new Error('Gagal membaca pesanan: kolom "' + probe.column + '" tidak dikenal dan tidak ' +
      'terdaftar di OPTIONAL_ORDER_COLS. Periksa skema partner_orders.');
  }
  if (probe.status === 'error') {
    throw new Error('Gagal membaca pesanan (HTTP ' + probe.code + '): ' + probe.body);
  }

  var out = [];
  var from = 0;
  while (true) {
    var page = from === 0 ? probe.rows : fetchOrdersPage_(cfg, token, select, from, PAGE_SIZE).rows;
    out = out.concat(page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (from > 200000) break;  // sabuk pengaman: jangan pernah berputar selamanya
  }
  return { rows: out, dropped: dropped };
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
  if (code === 400 && text.indexOf('42703') >= 0) {
    // PostgREST hanya melaporkan kolom PERTAMA yang tidak dikenal per respons.
    // Namanya dicari di dalam pesan, dicocokkan dengan daftar kolom opsional —
    // dicocokkan, BUKAN diambil mentah dari pesan server, supaya pesan yang
    // bentuknya berubah tidak pernah membuat kita membuang kolom wajib.
    var known = OPTIONAL_ORDER_COLS.concat(OPTIONAL_CUSTOMER_COLS);
    for (var k = 0; k < known.length; k++) {
      if (text.indexOf(known[k]) >= 0) return { status: 'missing-column', column: known[k] };
    }
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
 * Peta order_id → { amount, dp, condition, discountPcts, markup, cash, final }.
 * dp_amount/payment_condition adalah kolom migrasi 0014; discount_pcts/
 * markup_pct/cash_discount/final_amount adalah kolom migrasi 0015 —
 * SEMUANYA pada tabel yang SAMA (order_sanci_offers, 0013). Dicoba dari yang
 * PALING LEBAR (0015) dulu, turun berjenjang kalau ditolak 42703 — setiap
 * tingkat degradasi independen (LESSONS #12), persis pola fetchAllOrders_
 * untuk shipping_address.
 */
function fetchOffersByOrderId_(cfg, token) {
  var full = fetchOffersPage_(cfg, token,
    'order_id,amount,dp_amount,payment_condition,discount_pcts,markup_pct,cash_discount,final_amount', 0);
  if (full.status === 'missing-table') {
    Logger.log('order_sanci_offers belum ada (migration 0013 belum dijalankan) — ' +
      'kolom Penawaran SANCI dibiarkan kosong.');
    return {};
  }
  if (full.status === 'ok') {
    return fetchOffersLoop_(cfg, token,
      'order_id,amount,dp_amount,payment_condition,discount_pcts,markup_pct,cash_discount,final_amount',
      'full', full);
  }
  // full.status === 'missing-column' → discount_pcts/markup_pct/cash_discount/
  // final_amount (0015) belum ada. Coba tingkat 0014 (dp_amount/payment_condition).
  Logger.log('discount_pcts/markup_pct/cash_discount/final_amount belum ada di order_sanci_offers ' +
    '(migrasi 0015 belum dijalankan) — kolom Diskon/Markup/Potongan Tunai/Harga Akhir/Sisa dibiarkan kosong.');
  var mid = fetchOffersPage_(cfg, token, 'order_id,amount,dp_amount,payment_condition', 0);
  if (mid.status === 'missing-column') {
    Logger.log('dp_amount/payment_condition belum ada di order_sanci_offers ' +
      '(migrasi 0014 belum dijalankan) — kolom Uang Muka/Kondisi Pembayaran dibiarkan kosong.');
    return fetchOffersLoop_(cfg, token, 'order_id,amount', 'amount-only');
  }
  if (mid.status === 'missing-table') return {};
  return fetchOffersLoop_(cfg, token, 'order_id,amount,dp_amount,payment_condition', 'mid', mid);
}

function fetchOffersLoop_(cfg, token, select, level, firstPage) {
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
      if (level === 'full') {
        map[r.order_id] = {
          amount: r.amount, dp: r.dp_amount, condition: r.payment_condition,
          discountPcts: r.discount_pcts, markup: r.markup_pct, cash: r.cash_discount, final: r.final_amount
        };
      } else if (level === 'mid') {
        map[r.order_id] = { amount: r.amount, dp: r.dp_amount, condition: r.payment_condition };
      } else {
        map[r.order_id] = { amount: r.amount };
      }
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

// ── Dokumen (SO/DO/Invoice), item pesanan, dan status kirim ─
//
// Ketiganya lahir dari migrasi 0014 (order_items) dan 0016 (order_documents,
// order_document_items). SEMUANYA permintaan TERPISAH, tidak pernah embed di
// dalam query pesanan — alasan yang sama dengan order_sanci_offers: satu
// migrasi yang belum jalan tidak boleh mengosongkan seluruh lembar, ia hanya
// boleh mengosongkan kolom yang bergantung padanya (LESSONS #12).

var DOC_TYPES = ['SO', 'DO', 'INVOICE'];

/** Label kolom "Status Kirim" — satu kolom, empat keadaan yang berbeda nyata. */
var SHIPPING_LABEL = {
  CANCELLED: 'Dibatalkan',
  RECEIVED: 'Sudah diterima',
  FULL: 'Sudah DO',
  PARTIAL: 'DO sebagian',
  NONE: 'Belum DO',
  UNKNOWN: ''
};

/**
 * Pengambil generik satu tabel, halaman demi halaman.
 * `{ status:'missing-table' }` kalau tabelnya belum ada (42P01/404) — itu
 * BUKAN kegagalan sync, hanya berarti fitur itu belum dimigrasikan.
 * Kegagalan lain mengembalikan baris yang SEMPAT terbaca + menandai partial,
 * supaya selisihnya kelihatan di log dan bukan diam-diam jadi "tidak ada".
 */
function fetchTableAll_(cfg, token, table, select, orderBy) {
  var rows = [];
  var from = 0;
  while (true) {
    var url = cfg.url + '/rest/v1/' + table + '?select=' + encodeURIComponent(select) +
      '&order=' + encodeURIComponent(orderBy);
    var res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: restHeaders_(cfg, token, {
        'Range-Unit': 'items',
        Range: from + '-' + (from + PAGE_SIZE - 1)
      }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var text = res.getContentText();
    if (code === 404 || (code >= 400 && text.indexOf('42P01') >= 0)) {
      Logger.log('Tabel "' + table + '" belum ada — kolom yang bergantung padanya dibiarkan kosong.');
      return { status: 'missing-table', rows: [] };
    }
    if (code >= 400 && text.indexOf('42703') >= 0) {
      Logger.log('Kolom tidak dikenal saat membaca "' + table + '" — dilewati. Jawaban: ' + text);
      return { status: 'missing-column', rows: rows };
    }
    if (code !== 200 && code !== 206) {
      Logger.log('Gagal membaca "' + table + '" (HTTP ' + code + '): ' + text +
        ' — memakai ' + rows.length + ' baris yang sempat terbaca.');
      return { status: 'partial', rows: rows };
    }
    var page = JSON.parse(text);
    rows = rows.concat(page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (from > 500000) break;   // sabuk pengaman
  }
  return { status: 'ok', rows: rows };
}

/**
 * order_id → { SO: {numbers:[], lastDate:''}, DO: {...}, INVOICE: {...} }.
 *
 * Satu pesanan BOLEH punya lebih dari satu dokumen per jenis — itu justru
 * inti fitur 0016: pengiriman bertahap = beberapa DO, penagihan bertahap =
 * beberapa Invoice. Jadi nomornya digabung dengan "+" (pola yang sama dengan
 * rantai diskon di kolom Diskon) dan tanggalnya memakai yang TERBARU. Menaruh
 * hanya satu nomor akan menyembunyikan pengiriman kedua dan seterusnya.
 */
function fetchDocsByOrderId_(cfg, token) {
  var out = { byOrder: {}, doDocIds: {}, available: false };
  var res = fetchTableAll_(cfg, token, 'order_documents',
    'id,order_id,doc_type,doc_number,doc_date', 'doc_date.asc,id.asc');
  if (res.status === 'missing-table') return out;
  out.available = true;
  for (var i = 0; i < res.rows.length; i++) {
    var d = res.rows[i];
    if (!Object.prototype.hasOwnProperty.call(out.byOrder, d.order_id)) {
      out.byOrder[d.order_id] = { SO: null, DO: null, INVOICE: null };
    }
    var slot = out.byOrder[d.order_id];
    if (DOC_TYPES.indexOf(d.doc_type) < 0) continue;
    if (!slot[d.doc_type]) slot[d.doc_type] = { numbers: [], lastDate: '' };
    slot[d.doc_type].numbers.push(d.doc_number);
    // Baris datang urut doc_date menaik, jadi yang terakhir menang.
    if (d.doc_date) slot[d.doc_type].lastDate = d.doc_date;
    if (d.doc_type === 'DO') out.doDocIds[d.id] = true;
  }
  return out;
}

/** Semua baris order_items (dipakai tab "Item Pesanan" DAN status kirim). */
function fetchOrderItems_(cfg, token) {
  var res = fetchTableAll_(cfg, token, 'order_items',
    'id,order_id,product_id,name_snapshot,code_snapshot,quantity,color_code,custom_size,note,unit_price,line_discount,created_at',
    'created_at.asc,id.asc');
  return { rows: res.rows, available: res.status !== 'missing-table' };
}

/**
 * order_item_id → jumlah yang SUDAH tercakup DO. `doDocIds` datang dari
 * fetchDocsByOrderId_ supaya tidak perlu embed order_documents di sini —
 * embed menambah satu cara gagal tanpa menambah satu pun informasi.
 */
function fetchDoCoverage_(cfg, token, doDocIds) {
  var covered = {};
  var res = fetchTableAll_(cfg, token, 'order_document_items',
    'document_id,order_item_id,quantity', 'document_id.asc,order_item_id.asc');
  if (res.status === 'missing-table') return { covered: covered, available: false };
  for (var i = 0; i < res.rows.length; i++) {
    var r = res.rows[i];
    if (!doDocIds[r.document_id]) continue;   // Invoice/SO tidak menandakan pengiriman
    covered[r.order_item_id] = (covered[r.order_item_id] || 0) + Number(r.quantity || 0);
  }
  return { covered: covered, available: true };
}

/**
 * Status kirim satu pesanan. Urutan pemeriksaannya adalah keputusan yang
 * disengaja:
 *   1. Dibatalkan menang atas segalanya — pesanan batal yang tertulis
 *      "Belum DO" akan ikut terhitung sebagai pekerjaan yang menunggu dikirim.
 *   2. "Sudah diterima" (delivered_at, 0023) menang atas hitungan DO: kalau
 *      pelanggan sudah menerima barangnya, seberapa lengkap DO-nya tidak lagi
 *      menjadi pertanyaan operasional.
 *   3. Sisanya dihitung dari kuantitas: DO menutup SEMUA item → Sudah DO,
 *      sebagian → DO sebagian, tidak ada DO sama sekali → Belum DO.
 *
 * Mengembalikan '' (kosong) kalau datanya memang tidak bisa diketahui —
 * 0016/0014 belum dimigrasikan, atau pesanan tanpa satu pun item. Sel kosong
 * berarti "tidak diketahui"; ia TIDAK PERNAH ditulis sebagai "Belum DO",
 * karena menebak akan menyuruh orang mengirim barang yang mungkin sudah
 * dikirim (LESSONS #10).
 */
function shippingStatus_(order, ctx) {
  if (order.status === 'CANCELLED') return SHIPPING_LABEL.CANCELLED;
  if (order.delivered_at) return SHIPPING_LABEL.RECEIVED;
  if (!ctx.docsAvailable || !ctx.itemsAvailable) return SHIPPING_LABEL.UNKNOWN;

  var items = ctx.itemsByOrder[order.id] || [];
  if (!items.length) return SHIPPING_LABEL.UNKNOWN;

  var ordered = 0, covered = 0;
  for (var i = 0; i < items.length; i++) {
    ordered += Number(items[i].quantity || 0);
    covered += Number(ctx.doCovered[items[i].id] || 0);
  }
  if (covered <= 0) return SHIPPING_LABEL.NONE;
  return covered >= ordered ? SHIPPING_LABEL.FULL : SHIPPING_LABEL.PARTIAL;
}

/** {numbers:[...]} → "SO-001+SO-002"; null/kosong → ''. */
function docNumbers_(slot) {
  return slot && slot.numbers && slot.numbers.length ? slot.numbers.join('+') : '';
}

function docLastDate_(slot) {
  return slot && slot.lastDate ? toDateOrBlank_(slot.lastDate) : '';
}

/**
 * partner_staff.id → nama. Permintaan TERPISAH, bukan embed: partner_orders
 * punya DUA foreign key ke partner_staff (partner_sales_staff_id dan
 * partner_pic_staff_id), dan embed PostgREST terhadap tabel yang ditunjuk dua
 * kali WAJIB disebutkan nama constraint-nya — persis jebakan LESSONS #24,
 * yang tidak tertangkap sampai benar-benar dijalankan. Peta lokal ini tidak
 * punya cara gagal seperti itu.
 */
function fetchStaffNames_(cfg, token) {
  var map = {};
  var res = fetchTableAll_(cfg, token, 'partner_staff', 'id,full_name', 'id.asc');
  for (var i = 0; i < res.rows.length; i++) {
    map[res.rows[i].id] = res.rows[i].full_name || '';
  }
  return map;
}

// ── Tab arsip: Item Pesanan & Pelanggan ─────────────────────
//
// KENAPA ADA: lembar per partner adalah SATU BARIS PER PESANAN, jadi isi
// pesanannya tidak pernah muncul di mana pun. Akibatnya dua pertanyaan yang
// paling sering ditanya tidak bisa dijawab dari lembar ini sama sekali:
// "model ini pernah dijual ke siapa saja" dan "pelanggan ini pernah beli
// apa". Di aplikasi, pencarian produk hanya memindai 200 baris item TERBARU
// (ORDER_ITEMS_SCAN_LIMIT), jadi model laris justru yang paling cepat
// terpotong — tab ini memuat SEMUANYA, tanpa batas itu.

var ITEMS_TAB_NAME = 'Item Pesanan';
/**
 * Urutannya sengaja mengikuti cara "Laporan Penjualan-Sanci" (lembar manual
 * yang dipakai kantor) dibaca dari kiri ke kanan: nomor & tanggal SO dulu,
 * lalu pelanggan, lalu barang, lalu uang, lalu pengiriman. Tujuannya supaya
 * kedua lembar bisa ditaruh berdampingan tanpa mata harus melompat-lompat.
 *
 * KUNCI YANG MENYAMBUNGKAN KEDUANYA ADALAH "No. SO": laporan manual itu
 * dikenali per nomor SO, bukan per nomor pesanan sistem — tanpa kolom ini
 * kedua lembar tidak punya satu pun kolom yang sama untuk dicocokkan.
 */
var ITEMS_HEADERS = [
  'Nomor Pesanan',
  'Tanggal Pesanan',
  'No. SO',
  'Tgl SO',
  'Partner',
  'Cabang',
  'Pelanggan',
  'Telepon',
  'Kode Produk',
  'Nama Produk',
  'Ukuran',
  'Warna',
  'Jumlah',
  'Harga Satuan (IDR)',
  'Total Baris (IDR)',
  'Diskon Baris (IDR)',
  'Catatan',
  'Nama Sales',
  'Status Kirim',
  'Sudah DO (jumlah)',
  'No. DO',
  'Tgl DO',
  'Tgl Terima Pelanggan',
  'Alamat Kirim'
];

var CUSTOMERS_TAB_NAME = 'Pelanggan';
var CUSTOMERS_HEADERS = [
  'Pelanggan',
  'Kode Pelanggan',
  'Telepon',
  'Partner',
  'Cabang',
  'Jumlah Pesanan',
  'Pesanan Pertama',
  'Pesanan Terakhir'
];

/**
 * Menulis ulang SELURUH isi satu tab arsip (judul + data) dalam satu
 * setValues, lalu menghapus sisa baris lama kalau datanya menyusut. Berbeda
 * dari tab partner yang tidak pernah menyentuh kolom di sebelah kanan: tab
 * arsip adalah salinan murni, tidak ada catatan manual yang perlu dijaga —
 * dan justru karena itu ia boleh dibersihkan sepenuhnya.
 */
function writeArchiveTab_(ss, name, headers, rows) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.setFrozenRows(1);
  }
  var wanted = 1 + rows.length;
  if (sheet.getMaxRows() < wanted) sheet.insertRowsAfter(sheet.getMaxRows(), wanted - sheet.getMaxRows());
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  var block = [headers].concat(rows);
  sheet.getRange(1, 1, block.length, headers.length).setValues(block);
  // Baris sisa dari run sebelumnya yang datanya sudah lebih pendek: dibersihkan,
  // bukan ditinggalkan sebagai baris hantu yang terlihat seperti data sungguhan.
  var lastRow = sheet.getLastRow();
  if (lastRow > wanted) {
    sheet.getRange(wanted + 1, 1, lastRow - wanted, sheet.getLastColumn()).clearContent();
  }
  return sheet;
}

function writeItemsTab_(ss, items, orders, ctx) {
  var orderById = {};
  for (var i = 0; i < orders.length; i++) orderById[orders[i].id] = orders[i];

  var rows = [];
  for (var j = 0; j < items.length; j++) {
    var it = items[j];
    var o = orderById[it.order_id];
    // Item milik pesanan yang tidak ikut terbaca (RLS/halaman) DILEWATI,
    // bukan ditulis dengan sel kosong: baris tanpa pesanan tidak bisa
    // ditelusuri ke mana pun dan hanya menambah keraguan pada tab ini.
    if (!o) continue;
    var customer = pickOne_(o.customers);
    var branch = pickOne_(o.partner_branches);
    var docs = (ctx.docsByOrder && ctx.docsByOrder[o.id]) || { SO: null, DO: null, INVOICE: null };
    // Total baris dihitung DI SINI, bukan ditinggalkan sebagai rumus di
    // lembar: rumus yang ditulis skrip akan tertimpa tiap kali tab arsip
    // ditulis ulang, dan rumus yang ditulis manusia akan hilang bersamanya.
    // Angka mati selalu benar untuk baris yang sedang disalin ini.
    var unit = it.unit_price === null || it.unit_price === undefined ? null : Number(it.unit_price);
    var qty = Number(it.quantity || 0);
    rows.push([
      o.order_number || '',
      toDateOrBlank_(o.created_at),
      docNumbers_(docs.SO),
      docLastDate_(docs.SO),
      pickName_(o.partners) || '',
      (branch && branch.name) || '',
      (customer && customer.full_name) || '',
      customerPhone_(customer),
      it.code_snapshot || '',
      it.name_snapshot || '',
      it.custom_size || '',
      it.color_code || '',
      toNumberOrBlank_(it.quantity),
      toNumberOrBlank_(it.unit_price),
      unit === null || isNaN(unit) ? '' : unit * qty,
      toNumberOrBlank_(it.line_discount),
      it.note || '',
      (ctx.staffNames && ctx.staffNames[o.partner_sales_staff_id]) || '',
      shippingStatus_(o, ctx),
      toNumberOrBlank_(ctx.doCovered[it.id] || 0),
      docNumbers_(docs.DO),
      docLastDate_(docs.DO),
      toDateOrBlank_(o.delivered_at),
      o.shipping_address || ''
    ]);
  }
  writeArchiveTab_(ss, ITEMS_TAB_NAME, ITEMS_HEADERS, rows);
}

/**
 * Satu baris per pelanggan, diringkas DARI pesanan yang sudah terbaca — bukan
 * permintaan baru ke tabel customers. Konsekuensi yang disengaja: pelanggan
 * yang BELUM pernah memesan tidak muncul di sini. Tab ini menjawab "pelanggan
 * ini pernah beli apa dan kapan", dan pelanggan tanpa pesanan tidak punya
 * jawaban untuk pertanyaan itu.
 */
function writeCustomersTab_(ss, orders) {
  var byKey = {};
  var keys = [];
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i];
    var customer = pickOne_(o.customers);
    if (!customer) continue;
    var branch = pickOne_(o.partner_branches);
    // Kunci = nama + telepon: customer_id tidak ikut di select, dan dua orang
    // bernama sama dengan nomor berbeda memang dua pelanggan berbeda.
    var key = String(customer.full_name || '') + '|' + String(customer.phone_normalized || customer.phone || '');
    if (!Object.prototype.hasOwnProperty.call(byKey, key)) {
      byKey[key] = {
        name: customer.full_name || '',
        code: customer.customer_code || '',
        phone: customerPhone_(customer),
        partner: pickName_(o.partners) || '',
        branch: (branch && branch.name) || '',
        count: 0,
        first: o.created_at || '',
        last: o.created_at || ''
      };
      keys.push(key);
    }
    var rec = byKey[key];
    rec.count++;
    if (o.created_at && (!rec.first || o.created_at < rec.first)) rec.first = o.created_at;
    if (o.created_at && (!rec.last || o.created_at > rec.last)) rec.last = o.created_at;
    if (!rec.code && customer.customer_code) rec.code = customer.customer_code;
  }

  var rows = [];
  for (var k = 0; k < keys.length; k++) {
    var r = byKey[keys[k]];
    rows.push([r.name, r.code, r.phone, r.partner, r.branch, r.count,
      toDateOrBlank_(r.first), toDateOrBlank_(r.last)]);
  }
  writeArchiveTab_(ss, CUSTOMERS_TAB_NAME, CUSTOMERS_HEADERS, rows);
}

// ── Menulis satu tab partner ────────────────────────────────

function writePartnerTab_(ss, partnerName, orders, ctx) {
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
    var row = buildRow_(orders[j], ctx);
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
    // HANYA kolom 1..COL_COUNT (A..T). Kolom U dan seterusnya — catatan manual
    // yang ditulis orang di lembar ini — tidak pernah ikut tersentuh.
    sheet.getRange(startRow, 1, block.length, COL_COUNT).setValues(block);
    g = next;
  }

  // Ditambahkan tepat di bawah baris berkunci TERAKHIR, bukan di bawah
  // getLastRow(). Bedanya muncul kalau seseorang menulis catatan manual jauh di
  // bawah tabel: getLastRow() akan melompati lubang itu dan tabel pesanannya
  // pecah menjadi dua bagian yang makin lama makin jauh. Kolom U dan seterusnya
  // tetap tidak tersentuh — yang ditulis di sini hanya A..T.
  if (appends.length) {
    sheet.getRange(lastKeyRow + 1, 1, appends.length, COL_COUNT).setValues(appends);
  }

  return { updated: updates.length, appended: appends.length };
}

/**
 * Deteksi format lama (migrasi 0014 menambah 3 kolom, A..K → A..N; migrasi
 * 0015 menambah 5 kolom lagi, A..N → A..S; migrasi 0020 menyisipkan 1 kolom
 * BARU di posisi B, A..S → A..T, menggeser SEMUA kolom C dst satu huruf ke
 * kanan — README.md §2/§8 dulu menjanjikan "hanya menulis A..K" lalu
 * "hanya menulis A..N", janji-janji itu SENGAJA dilanggar berturut-turut
 * karena bentuk datanya sendiri berubah). Tab lama dengan header versi
 * MANAPUN sebelum yang sekarang (11/14/19 kolom, atau 20 kolom tapi urutan
 * lama) TIDAK ditimpa diam-diam — perbandingan HEADERS di bawah adalah
 * kecocokan PERSIS posisi demi posisi, jadi pergeseran satu huruf gara-gara
 * kolom baru disisipkan di tengah (bukan di ujung) tertangkap sama pastinya
 * dengan penambahan di ujung. Kalau ditimpa diam-diam, kolom lama (catatan
 * manual pengguna, dijamin README "tidak pernah disentuh") akan tertimpa
 * data yang salah tanpa peringatan. Lebih baik REFUSE dengan pesan jelas
 * daripada salah tulis (LESSONS #16 turunan: gagal dengan jelas lebih baik
 * daripada berhasil dengan salah).
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
      'terbaru). Versi 2026-08-31 menambah 11 kolom: Kode Pelanggan, Nama Sales, Status Kirim, ' +
      'No./Tgl SO, No./Tgl DO, No./Tgl Invoice, Tgl Terima Pelanggan, dan Alasan Batal — ' +
      'jumlahnya menjadi 31 kolom (A..AE), sehingga catatan manual Anda sekarang mulai dari ' +
      'kolom AF. Skrip ini TIDAK menimpa tab ini secara otomatis supaya catatan manual Anda di ' +
      'kolom lama tidak salah tertulis. Ganti nama tab ini (mis. tambahkan " (lama)") atau ' +
      'arsipkan ke lembar lain, lalu jalankan Sync sekarang lagi — tab baru dengan format ' +
      'terbaru akan dibuat otomatis.'
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

/**
 * "[8,10]" → "8+10" (per README §8/kepala berkas: render tanpa tanda %,
 * dipisah "+" — beda dari audit-format.ts di aplikasi Next.js yang merender
 * "8% + 10%" untuk manusia baca di layar Activity; di lembar ini ringkas
 * lebih penting supaya kolomnya tetap enak dibaca berdampingan dengan kolom
 * angka lain). Array kosong/undefined/null → sel kosong.
 */
function discountChainForSheet_(discountPcts) {
  if (!discountPcts || !discountPcts.length) return '';
  return discountPcts.join('+');
}

function buildRow_(o, ctx) {
  var customer = pickOne_(o.customers);
  var branch = pickOne_(o.partner_branches);
  // { amount, dp, condition, discountPcts, markup, cash, final } | { amount, dp, condition }
  // | { amount } | undefined — lihat fetchOffersByOrderId_ untuk tiga tingkat degradasi.
  var offer = ctx.offers[o.id];
  // Sisa (Q) = Harga Akhir − DP, sama seperti "Sisa Bayar" di layar aplikasi
  // (matematika tampilan, tidak pernah disimpan sebagai kolom) — dihitung
  // HANYA kalau kedua nilainya ada (final_amount butuh 0015 sudah jalan).
  var hasFinal = offer && offer.final !== undefined && offer.final !== null;
  var remaining = hasFinal ? Number(offer.final) - Number(offer.dp || 0) : '';

  var docs = (ctx.docsByOrder && ctx.docsByOrder[o.id]) || { SO: null, DO: null, INVOICE: null };

  return [
    o.order_number || '',
    // Kolom opsional bisa `undefined` (migrasinya belum jalan, lihat
    // OPTIONAL_ORDER_COLS) ATAU `null` (kolom ada tapi belum diisi) —
    // keduanya sama-sama harus jadi sel kosong, bukan teks "undefined".
    o.customer_po || '',
    (branch && branch.name) || '',
    (customer && customer.full_name) || '',
    (customer && customer.customer_code) || '',
    customerPhone_(customer),
    (ctx.staffNames && ctx.staffNames[o.partner_sales_staff_id]) || '',
    o.package_name || '',
    STATUS_LABEL[o.status] || o.status || '',
    FULFILLMENT_LABEL[o.fulfillment_path] || '',
    shippingStatus_(o, ctx),
    toNumberOrBlank_(o.partner_purchase_amount),
    toNumberOrBlank_(offer && offer.amount),
    toNumberOrBlank_(offer && offer.dp),
    (offer && offer.condition) || '',
    o.shipping_address || '',
    discountChainForSheet_(offer && offer.discountPcts),
    toNumberOrBlank_(offer && offer.markup),
    toNumberOrBlank_(offer && offer.cash),
    toNumberOrBlank_(offer && offer.final),
    remaining,
    docNumbers_(docs.SO),
    docLastDate_(docs.SO),
    docNumbers_(docs.DO),
    docLastDate_(docs.DO),
    docNumbers_(docs.INVOICE),
    docLastDate_(docs.INVOICE),
    toDateOrBlank_(o.delivered_at),
    o.cancellation_reason || '',
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
