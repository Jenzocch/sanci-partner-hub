/**
 * SANCI Partner Hub → Google Sheets "Form SO INV dan DO-SANCI" (SATU ARAH:
 * sistem → tab SO). Berbeda dari integrations/sheets-orders (yang menyalin
 * SELURUH daftar pesanan tiap 15 menit lewat trigger): skrip ini mengisi SATU
 * pesanan ke SATU tab SO yang sedang aktif, dipicu manual lewat menu — orang
 * di kantor memasukkan nomor pesanan, skrip menarik datanya dari sistem dan
 * menuliskannya ke sel INPUT tab "Sales Order (SO) - Updated". Formula bawaan
 * lembar ini lalu mengisi sendiri tab DO dan Invoice (100% turunan formula
 * dari tab SO — sudah diverifikasi terhadap lembar aslinya, skrip ini TIDAK
 * pernah menyentuh tab DO/Invoice).
 *
 * KEAMANAN — baca ini dulu: skrip ini HANYA boleh memakai anon key + akun sync
 * khusus, TIDAK PERNAH service_role key, karena service_role melewati seluruh
 * RLS dan siapa pun yang bisa membuka Apps Script ini akan memegang kunci
 * tertinggi basis data selamanya.
 *
 * Script Properties yang wajib diisi (Project Settings → Script Properties) —
 * SAMA PERSIS dengan integrations/sheets-orders/Code.gs, satu akun sync boleh
 * dipakai bersama oleh kedua skrip (lihat README.md):
 *   SUPABASE_URL        https://xxxx.supabase.co
 *   SUPABASE_ANON_KEY   anon key (nilai publik — keamanannya dari RLS)
 *   SYNC_EMAIL          email akun sync khusus (platform_admin)
 *   SYNC_PASSWORD       kata sandi akun sync tersebut
 *
 * Yang skrip ini TIDAK lakukan (disengaja, lihat README.md):
 *   - Tidak pernah menulis balik ke sistem. Ini murni SATU ARAH sistem → lembar.
 *   - Tidak pernah membuat trio tab SO/DO/INV baru — proses duplikasi tab tetap
 *     dilakukan manual oleh orang kantor seperti biasa, skrip ini hanya mengisi
 *     tab SO yang SUDAH ada dan sedang aktif.
 *   - Tidak pernah menyentuh tab DO/Invoice atau tab lain mana pun.
 *   - Tidak pernah menyentuh kolom A..N (cermin formula) atau baris 27 ke
 *     bawah (formula total) di tab SO.
 *   - Tidak pakai LockService: ini aksi interaktif satu pengguna yang dipicu
 *     manual dari menu (bukan trigger terjadwal seperti sheets-orders), jadi
 *     tidak ada dua eksekusi yang bisa tabrakan menulis baris yang sama.
 */

// ── Konfigurasi tetap ───────────────────────────────────────

var SO_MARKER_CELL = 'P1';
var SO_MARKER_VALUE = 'No. SO';

var ITEM_FIRST_ROW = 15;
var ITEM_LAST_ROW = 26;
var ITEM_MAX_LINES = ITEM_LAST_ROW - ITEM_FIRST_ROW + 1;   // 12
var ITEM_FIRST_COL = 16;   // P
var ITEM_NUM_COLS = 9;     // P..X

var MAX_DISCOUNT_SLOTS = 3;   // Q7/Q8/Q9 — templat SO cuma punya 3 slot

/**
 * Teks "Delivery Note" (S13) mencerminkan kata-kata yang sudah dipakai
 * aplikasi (web/lib/i18n/messages/common.ts, fulfillmentDirectDesc/
 * fulfillmentShowroomDesc — dibaca lewat web/lib/orders-shared.ts) supaya
 * kantor melihat kalimat yang SAMA di sistem dan di lembar SO ini, bukan
 * terjemahan bebas yang kedua.
 */
var DELIVERY_NOTE = {
  DIRECT_DELIVERY: 'Produk SANCI sudah dibeli di toko — SANCI kirim langsung, pelanggan tidak perlu datang',
  SHOWROOM_VISIT: 'Pelanggan akan datang ke SANCI untuk melihat / memilih produk'
};

// ── Titik masuk ─────────────────────────────────────────────

/** Menu khusus di spreadsheet: SANCI → Isi dari sistem…. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SANCI')
    .addItem('Isi dari sistem…', 'isiDariSistem')
    .addToUi();
}

/**
 * Titik masuk menu. Membungkus SELURUH alur dengan satu try/catch supaya
 * satu kegagalan (nomor salah, login gagal, tab salah) selalu berakhir
 * sebagai SATU pesan alert Bahasa Indonesia yang jelas — bukan exception
 * mentah Apps Script yang menakut-nakuti orang kantor.
 */
function isiDariSistem() {
  var ui = SpreadsheetApp.getUi();
  try {
    runFill_(ui);
  } catch (err) {
    ui.alert('Gagal mengisi dari sistem', String((err && err.message) || err), ui.ButtonSet.OK);
  }
}

// ── Inti ────────────────────────────────────────────────────

function runFill_(ui) {
  var sheet = SpreadsheetApp.getActiveSheet();
  assertSoSheet_(sheet);

  var orderNumber = promptText_(ui, 'Nomor pesanan di sistem (kunci pencarian):');
  if (orderNumber === null) return;   // dibatalkan
  orderNumber = orderNumber.trim();
  if (!orderNumber) {
    ui.alert('Nomor pesanan tidak boleh kosong.');
    return;
  }

  var docNumberRaw = promptText_(ui,
    'No. SO — nomor dokumen (kosongkan untuk pakai nomor pesanan "' + orderNumber + '"):');
  if (docNumberRaw === null) return;   // dibatalkan
  var docNumber = docNumberRaw.trim() || orderNumber;

  // Guard: kalau Q1 sudah berisi nilai LAIN dari yang akan ditulis, konfirmasi
  // dulu sebelum menimpa — mencegah orang kantor tidak sengaja menimpa tab SO
  // yang sudah pernah diisi untuk pesanan lain.
  var existingQ1 = String(sheet.getRange('Q1').getValue() || '').trim();
  if (existingQ1 && existingQ1 !== docNumber) {
    var confirm = ui.alert(
      'Konfirmasi timpa',
      'Sel Q1 (No. SO) di tab ini sudah berisi "' + existingQ1 + '".\n' +
      'Akan ditimpa menjadi "' + docNumber + '". Lanjutkan?',
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) return;
  }

  var cfg = readConfig_();
  var token = signIn_(cfg);

  var order = fetchOrder_(cfg, token, orderNumber);
  if (!order) {
    throw new Error('Nomor pesanan tidak ditemukan di sistem: "' + orderNumber +
      '". Periksa ejaan nomor pesanan (bisa disalin dari layar Pesanan di sistem).');
  }

  var itemsResult = fetchOrderItems_(cfg, token, order.id);
  var offer = fetchOrderOffer_(cfg, token, order.id);

  var warnings = [];
  fillHeader_(sheet, order, offer, docNumber, warnings);
  var written = fillItems_(sheet, itemsResult.rows, warnings);

  if (itemsResult.missingTable) {
    warnings.push('Rincian barang (order_items) belum ada di sistem ini (migrasi 0014 belum ' +
      'dijalankan) — hanya data header yang diisi, baris barang P15:X26 dikosongkan.');
  }
  if (order._hasShipping === false) {
    warnings.push('Kolom alamat pengiriman pesanan (shipping_address) belum ada di sistem ' +
      '(migrasi 0014 belum dijalankan) — S9 diisi dari alamat data pelanggan kalau ada.');
  }
  if (order._hasCustomerCode === false) {
    warnings.push('Kolom kode pelanggan (customer_code) belum ada di sistem ' +
      '(migrasi 0017 belum dijalankan) — Q2 dikosongkan seperti sebelumnya.');
  }
  if (order.status === 'CANCELLED') {
    warnings.push('⚠ Pesanan ini berstatus DIBATALKAN di sistem — cek dulu ke admin sebelum ' +
      'dipakai membuat SO/DO/Invoice.');
  }

  showSummary_(ui, order, written, warnings);
}

/**
 * P1 == "No. SO" adalah penanda satu-satunya bahwa tab aktif memang tab SO
 * (bukan tab DO/Invoice hasil duplikasi trio, atau tab lain). REFUSE dengan
 * pesan jelas kalau tidak cocok — lebih baik berhenti daripada menulis P..X
 * ke tab yang salah (LESSONS #16 turunan: gagal dengan jelas > berhasil salah).
 */
function assertSoSheet_(sheet) {
  var v = String(sheet.getRange(SO_MARKER_CELL).getValue() || '').trim();
  if (v !== SO_MARKER_VALUE) {
    throw new Error('Tab aktif ("' + sheet.getName() + '") sepertinya bukan tab Sales Order (SO) — ' +
      'sel ' + SO_MARKER_CELL + ' seharusnya berisi "' + SO_MARKER_VALUE + '" tapi berisi "' + v + '". ' +
      'Buka tab SO yang benar (hasil duplikasi trio SO/DO/INV untuk pesanan ini), lalu jalankan menu ini lagi.');
  }
}

/**
 * Apps Script tidak punya prompt multi-field — dipanggil DUA KALI berurutan
 * di runFill_ (sekali untuk nomor pesanan, sekali untuk No. SO). Mengembalikan
 * null kalau pengguna menekan Cancel (dibedakan dari string kosong, yang
 * berarti pengguna menekan OK tapi tidak mengetik apa pun).
 */
function promptText_(ui, label) {
  var resp = ui.prompt('Isi dari sistem', label, ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return null;
  return resp.getResponseText();
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
 * Login sebagai akun sync. Token TIDAK disimpan ke Script Properties — ia
 * hidup hanya selama satu run, jadi tidak ada kredensial berumur panjang yang
 * bocor kalau lembar ini kelak dibagikan ke orang lain.
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

// ── Mengambil satu pesanan ──────────────────────────────────

/**
 * shipping_address (kolom migrasi 0014) dan customers.customer_code (kolom
 * migrasi 0017) diminta di SELECT yang SAMA dengan pesanan itu sendiri —
 * kalau salah satu migrasinya belum dijalankan, PostgREST menolak SELURUH
 * permintaan ini (kolom tidak dikenal, HTTP 400 + kode 42703), bukan cuma
 * kolom itu yang kosong. Jadi dicoba dulu DENGAN keduanya; fetchOrder_ di
 * bawah melepas satu-per-satu kolom yang ternyata belum ada dan mengulang,
 * supaya kolom lain tetap terbaca walau salah satu migrasi belum jalan (pola
 * sama dengan sheets-orders/Code.gs).
 *
 * `sales:partner_sales_staff_id(full_name)` memakai nama alias "sales", PERSIS
 * pola yang sudah dipakai app (web/app/cabang/pesanan/page.tsx dan
 * web/app/admin/orders/[orderId]/page.tsx) — WAJIB menyebut kolom FK
 * (partner_sales_staff_id), bukan hanya nama tabel partner_staff, karena
 * partner_orders punya DUA foreign key ke partner_staff (sales DAN pic) dan
 * PostgREST butuh itu untuk tahu FK mana yang dimaksud.
 */
function ordersSelect_(includeShipping, includeCustomerCode) {
  return 'id,order_number,package_name,status,notes,fulfillment_path,created_at,' +
    (includeShipping ? 'shipping_address,' : '') +
    'customers:customer_id(full_name,phone,phone_normalized,address,city,province' +
    (includeCustomerCode ? ',customer_code' : '') + '),' +
    'sales:partner_sales_staff_id(full_name)';
}

/**
 * Dua kolom opsional (shipping_address milik 0014, customer_code milik 0017)
 * dilepas SATU PER SATU sampai permintaan diterima — bukan langsung dua-duanya
 * sekaligus, supaya kalau ternyata cuma SATU migrasi yang belum jalan, kolom
 * dari migrasi yang SUDAH jalan tetap ikut terbaca. Paling banyak 3 percobaan
 * (keduanya ada → satu dilepas → keduanya dilepas).
 */
function fetchOrder_(cfg, token, orderNumber) {
  var includeShipping = true;
  var includeCustomerCode = true;
  for (var attempt = 0; attempt < 3; attempt++) {
    var res = fetchOrderRaw_(cfg, token, ordersSelect_(includeShipping, includeCustomerCode), orderNumber);
    if (res.status === 'missing-shipping') {
      includeShipping = false;
      continue;
    }
    if (res.status === 'missing-customer-code') {
      includeCustomerCode = false;
      continue;
    }
    if (res.status === 'error') {
      throw new Error('Gagal membaca pesanan (HTTP ' + res.code + '): ' + res.body);
    }
    if (!res.rows || !res.rows.length) return null;
    var order = res.rows[0];
    order._hasShipping = includeShipping;
    order._hasCustomerCode = includeCustomerCode;
    return order;
  }
  throw new Error('Gagal membaca pesanan: kolom yang diminta terus ditolak server setelah beberapa percobaan.');
}

function fetchOrderRaw_(cfg, token, select, orderNumber) {
  var url = cfg.url + '/rest/v1/partner_orders?order_number=eq.' + encodeURIComponent(orderNumber) +
    '&select=' + encodeURIComponent(select);
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: restHeaders_(cfg, token),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code === 400 && text.indexOf('42703') >= 0 && text.indexOf('shipping_address') >= 0) {
    return { status: 'missing-shipping' };
  }
  if (code === 400 && text.indexOf('42703') >= 0 && text.indexOf('customer_code') >= 0) {
    return { status: 'missing-customer-code' };
  }
  if (code !== 200) {
    return { status: 'error', code: code, body: text };
  }
  return { status: 'ok', rows: JSON.parse(text) };
}

/**
 * order_items (migrasi 0014). Kalau tabelnya belum ada sama sekali (42P01 —
 * 0014 belum dijalankan di database ini), TIDAK dianggap error: header tetap
 * diisi, baris barang P15:X26 dikosongkan, dan pesannya masuk daftar
 * warnings, persis pola degradasi bertingkat sheets-orders/Code.gs.
 * Pesanan yang dibuat SEBELUM 0014 dijalankan (tabel ADA tapi baris untuk
 * order_id ini tidak ada) juga wajar menghasilkan array kosong — bukan error.
 */
function fetchOrderItems_(cfg, token, orderId) {
  var select = 'code_snapshot,name_snapshot,custom_size,note,color_code,unit_price,line_discount,quantity';
  var url = cfg.url + '/rest/v1/order_items?order_id=eq.' + encodeURIComponent(orderId) +
    '&order=' + encodeURIComponent('created_at.asc') + '&select=' + encodeURIComponent(select);
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: restHeaders_(cfg, token),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code === 404 || (code >= 400 && text.indexOf('42P01') >= 0)) {
    return { rows: [], missingTable: true };
  }
  if (code !== 200) {
    throw new Error('Gagal membaca rincian barang pesanan (HTTP ' + code + '): ' + text);
  }
  return { rows: JSON.parse(text), missingTable: false };
}

/**
 * order_sanci_offers (migrasi 0013, diperluas 0014/0015). Turun berjenjang
 * PERSIS pola fetchOffersByOrderId_ di sheets-orders/Code.gs: coba paling
 * lebar dulu (0015: discount_pcts/markup_pct/cash_discount/final_amount),
 * turun ke 0014 (dp_amount/payment_condition) kalau kolom itu belum ada, lalu
 * ke 0013 saja (amount) kalau itu pun belum ada, lalu null total kalau
 * tabelnya sendiri belum ada. Setiap tingkat independen — satu migrasi yang
 * belum jalan tidak menggagalkan tingkat di bawahnya.
 *
 * Baris untuk order_id ini BOLEH tidak ada (SANCI belum kasih penawaran untuk
 * pesanan ini) — itu bukan error, cukup null, dan seluruh sel yang bergantung
 * padanya (Q11/Q12/Q7-Q9/markup-catatan) dibiarkan kosong.
 */
function fetchOrderOffer_(cfg, token, orderId) {
  var full = fetchOfferRaw_(cfg, token, orderId,
    'amount,dp_amount,payment_condition,discount_pcts,markup_pct,cash_discount,final_amount');
  if (full.status === 'ok') return full.rows[0] || null;
  if (full.status === 'missing-table') return null;

  var mid = fetchOfferRaw_(cfg, token, orderId, 'amount,dp_amount,payment_condition');
  if (mid.status === 'ok') return mid.rows[0] || null;
  if (mid.status === 'missing-table') return null;

  var basic = fetchOfferRaw_(cfg, token, orderId, 'amount');
  if (basic.status === 'ok') return basic.rows[0] || null;
  return null;
}

function fetchOfferRaw_(cfg, token, orderId, select) {
  var url = cfg.url + '/rest/v1/order_sanci_offers?order_id=eq.' + encodeURIComponent(orderId) +
    '&select=' + encodeURIComponent(select);
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: restHeaders_(cfg, token),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code === 404 || (code >= 400 && text.indexOf('42P01') >= 0)) {
    return { status: 'missing-table' };
  }
  if (code >= 400 && text.indexOf('42703') >= 0) {
    return { status: 'missing-column' };
  }
  if (code !== 200) {
    return { status: 'error', code: code, body: text };
  }
  return { status: 'ok', rows: JSON.parse(text) };
}

// ── Menulis header (Q/S) ─────────────────────────────────────

/**
 * Menulis seluruh sel header INPUT. Sel-sel ini TERSEBAR (Q1..Q13, S1..S13),
 * bukan satu blok bersambung seperti baris barang — makanya ditulis per sel
 * atau per rentang kecil yang memang bersambung (Q7:Q9, S7:S9), BUKAN
 * dikumpulkan jadi satu setValues() raksasa dengan banyak sel kosong di
 * antaranya (itu justru lebih rapuh: satu perubahan tata letak kolom akan
 * menggeser separuh array tanpa pesan error apa pun).
 */
function fillHeader_(sheet, order, offer, docNumber, warnings) {
  var customer = pickOne_(order.customers);
  var sales = pickOne_(order.sales);

  sheet.getRange('Q1').setValue(docNumber);

  // Q2 (Code Customer): sejak migrasi 0017, sistem PUNYA kode pelanggan
  // (customers.customer_code, diisi lewat impor data pelanggan lama atau
  // manual admin) — ditulis apa adanya kalau ada. Sel ini normalnya jadi
  // kunci XLOOKUP ke tab "Data Customer" untuk mengisi S1/S7/S8/S9, tapi
  // keempat sel itu di bawah ini DITULIS LANGSUNG sebagai nilai literal
  // (lihat komentar S1 di bawah), jadi Q2 tidak berperan fungsional untuk
  // pesanan sistem — nilainya murni informasi rujukan silang ke sistem
  // (dan tetap dikosongkan kalau pelanggan pesanan ini tidak punya kode, atau
  // kalau migrasi 0017 belum dijalankan — lihat _hasCustomerCode di atas —
  // supaya tidak ada kode lama dari tab yang diduplikasi yang menyesatkan
  // pembaca).
  sheet.getRange('Q2').setValue((customer && customer.customer_code) || '');

  var tglSo = toDateOrBlank_(order.created_at);
  if (tglSo) sheet.getRange('Q3').setValue(tglSo);

  // Q6 (Delivery By) SENGAJA TIDAK disentuh: tidak ada field sistem yang
  // jelas jadi sumbernya (bukan cabang, bukan sales, bukan jalur pemenuhan —
  // itu semua sudah punya selnya sendiri). Lihat README.md untuk detail.

  var discounts = (offer && offer.discount_pcts) || [];
  if (discounts.length > MAX_DISCOUNT_SLOTS) {
    warnings.push('Sistem punya ' + discounts.length + ' diskon untuk pesanan ini, tapi templat SO ' +
      'cuma punya ' + MAX_DISCOUNT_SLOTS + ' slot (Q7/Q8/Q9) — ' +
      (discounts.length - MAX_DISCOUNT_SLOTS) + ' diskon terakhir TIDAK ditulis.');
  }
  sheet.getRange('Q7:Q9').setValues([
    [discounts.length > 0 ? Number(discounts[0]) : ''],
    [discounts.length > 1 ? Number(discounts[1]) : ''],
    [discounts.length > 2 ? Number(discounts[2]) : '']
  ]);

  // Q10 (TGL DP) SENGAJA TIDAK disentuh: tidak ada sumber sistem (sistem
  // hanya punya JUMLAH DP, bukan tanggalnya).
  sheet.getRange('Q11').setValue(offer && offer.dp_amount != null ? Number(offer.dp_amount) : '');
  sheet.getRange('Q12').setValue((offer && offer.payment_condition) || '');

  sheet.getRange('Q13').setValue(buildNoted_(order, offer, warnings));

  // S10 (Alamt Kirim Doc) SENGAJA dibiarkan kosong: tidak ada sumber sistem.
  // S11 (Nama Admin) SENGAJA TIDAK PERNAH disentuh sama sekali (tidak dibaca,
  // tidak ditulis, tidak dikosongkan) — operator mengetik namanya sendiri di
  // sana, dan sistem tidak punya "siapa yang sedang mengisi lembar ini" untuk
  // dijadikan sumber.

  // S1/S7/S8/S9: kolom-kolom ini normalnya XLOOKUP dari Q2 ke tab "Data
  // Customer", tapi pelanggan sistem tidak ada di tab itu. Karena SETIAP
  // pesanan mendapat trio tab SO/DO/INV sendiri (bukan satu tab SO yang
  // dipakai berulang untuk banyak pesanan), membekukannya sebagai nilai
  // literal di sini AMAN dan justru lebih benar — datanya tidak akan
  // "berubah sendiri" kalau tab Data Customer diedit orang lain kemudian.
  sheet.getRange('S1').setValue((customer && customer.full_name) || '');
  var email = '';   // sistem tidak punya email pelanggan — selalu kosong
  sheet.getRange('S7:S9').setValues([
    [customerPhone_(customer)],
    [email],
    [order.shipping_address || joinAddress_(customer)]
  ]);

  sheet.getRange('S12').setValue((sales && sales.full_name) || '');
  sheet.getRange('S13').setValue(DELIVERY_NOTE[order.fulfillment_path] || '');
}

/**
 * Q13 (Noted) = order.notes, ditambah SATU baris ringkas kalau ada markup
 * dan/atau potongan tunai — keduanya TIDAK punya kolom sendiri di templat SO
 * (lihat README.md), jadi angkanya harus tetap terlihat di suatu tempat
 * daripada hilang begitu saja waktu SO ini dicetak.
 */
function buildNoted_(order, offer, warnings) {
  var base = order.notes || '';
  var extras = [];
  if (offer && offer.markup_pct) {
    extras.push('Markup ' + offer.markup_pct + '% — lihat sistem');
  }
  if (offer && offer.cash_discount) {
    extras.push('Potongan tunai Rp ' + formatRupiahPlain_(offer.cash_discount) + ' — lihat sistem');
  }
  if (extras.length) {
    warnings.push('Markup/Potongan tunai tidak punya kolom sendiri di templat SO — ditambahkan ' +
      'sebagai catatan tambahan di Q13 (Noted).');
    return (base ? base + ' | ' : '') + extras.join(' | ');
  }
  return base;
}

// ── Menulis baris barang (P15:X26) ──────────────────────────

/**
 * SELALU dikosongkan dulu (clearContent, bukan setValues nilai kosong satu
 * per satu) sebelum ditulis ulang — baris sisa dari tab yang diduplikasi
 * TIDAK BOLEH bertahan kalau pesanan baru ini barangnya lebih sedikit dari
 * pesanan asal duplikasi.
 *
 * Penulisan baris barang memakai SATU setValues() untuk seluruh blok —
 * BUKAN loop sel-demi-sel — persis prinsip yang sama dengan writePartnerTab_
 * di sheets-orders/Code.gs.
 */
function fillItems_(sheet, items, warnings) {
  sheet.getRange(ITEM_FIRST_ROW, ITEM_FIRST_COL, ITEM_MAX_LINES, ITEM_NUM_COLS).clearContent();

  var toWrite = items.length > ITEM_MAX_LINES ? items.slice(0, ITEM_MAX_LINES) : items;
  if (items.length > ITEM_MAX_LINES) {
    var dropped = items.slice(ITEM_MAX_LINES);
    var names = [];
    for (var d = 0; d < dropped.length; d++) {
      names.push(dropped[d].name_snapshot || dropped[d].code_snapshot || '(tanpa nama)');
    }
    warnings.push('Pesanan ini punya ' + items.length + ' baris barang, tapi templat SO cuma muat ' +
      ITEM_MAX_LINES + ' baris (P15:X26) — ' + dropped.length + ' baris TERAKHIR tidak ditulis: ' +
      names.join(', '));
  }

  if (!toWrite.length) return 0;

  var rows = [];
  for (var i = 0; i < toWrite.length; i++) {
    var it = toWrite[i];
    var hasCode = it.code_snapshot && String(it.code_snapshot).trim();
    // Baris manual TANPA kode: P dibiarkan kosong (tidak ada apa pun untuk
    // XLOOKUP di B/E), dan name_snapshot ditaruh DI DEPAN kolom Note supaya
    // baris ini tetap bisa dikenali orang yang baca SO-nya — bukan cuma
    // catatan kosong tanpa nama barang.
    var note = it.note || '';
    if (!hasCode) {
      var label = it.name_snapshot || '';
      note = label + (note ? ' — ' + note : '');
    }
    rows.push([
      hasCode ? it.code_snapshot : '',                              // P  Kode produk
      it.custom_size || '',                                          // Q  Custom Size
      note,                                                            // R  Note
      it.color_code || '',                                           // S  Code Warna
      it.unit_price != null ? Number(it.unit_price) : '',            // T  Custom Price/Unit
      it.line_discount != null ? Number(it.line_discount) : '',      // U  Manual Disc
      it.quantity != null ? Number(it.quantity) : '',                // V  Qty
      '',                                                               // W  Pack QTY — tidak ada sumber sistem
      ''                                                                // X  Pack/Bag — tidak ada sumber sistem
    ]);
  }
  sheet.getRange(ITEM_FIRST_ROW, ITEM_FIRST_COL, rows.length, ITEM_NUM_COLS).setValues(rows);
  return rows.length;
}

// ── Ringkasan akhir ──────────────────────────────────────────

function showSummary_(ui, order, itemsWritten, warnings) {
  var customer = pickOne_(order.customers);
  var lines = [];
  lines.push('Nomor pesanan: ' + order.order_number);
  lines.push('Paket: ' + (order.package_name || '—'));
  lines.push('Pelanggan: ' + ((customer && customer.full_name) || '(tanpa nama)'));
  lines.push('Baris barang ditulis: ' + itemsWritten);
  if (warnings.length) {
    lines.push('');
    lines.push('⚠ Peringatan:');
    for (var i = 0; i < warnings.length; i++) lines.push('• ' + warnings[i]);
  }
  ui.alert('Selesai diisi dari sistem', lines.join('\n'), ui.ButtonSet.OK);
}

// ── Util kecil ───────────────────────────────────────────────

/**
 * Bentuk lokal "0812-3456-789" seperti di aplikasi (displayPhoneID); kalau
 * bentuk kanoniknya tidak ada, pakai apa adanya yang diketik cabang. Sama
 * persis dengan customerPhone_ di sheets-orders/Code.gs.
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

/**
 * Menggabungkan address/city/province jadi satu baris alamat — dipakai
 * HANYA sebagai cadangan waktu order.shipping_address kosong/null (pesanan
 * tanpa alamat kirim sendiri, atau 0014 belum dijalankan). Pola gabung PERSIS
 * sama dengan prefillShippingAddress() di
 * web/app/cabang/pesanan/baru/new-order-form.tsx supaya hasilnya konsisten
 * dengan yang sudah dilihat orang kantor di aplikasi.
 */
function joinAddress_(customer) {
  if (!customer) return '';
  var parts = [customer.address, customer.city, customer.province];
  var filtered = [];
  for (var i = 0; i < parts.length; i++) {
    if (parts[i] && String(parts[i]).trim()) filtered.push(String(parts[i]).trim());
  }
  return filtered.join(', ');
}

/**
 * Format ribuan tanpa Intl (V8 runtime Apps Script sebenarnya mendukung
 * Intl.NumberFormat, tapi fungsi kecil ini sengaja tanpa dependency supaya
 * tetap konsisten dengan gaya ES5 polos sheets-orders/Code.gs). Dipakai
 * HANYA untuk teks catatan Q13 — sel angka sungguhan (Q11, T:U kolom barang)
 * tetap ditulis sebagai Number, bukan string berformat, supaya Sheets bisa
 * menghitungnya.
 */
function formatRupiahPlain_(n) {
  var neg = Number(n) < 0;
  var s = Math.round(Math.abs(Number(n))).toString();
  var out = '';
  while (s.length > 3) {
    out = '.' + s.substring(s.length - 3) + out;
    s = s.substring(0, s.length - 3);
  }
  out = s + out;
  return (neg ? '-' : '') + out;
}

/**
 * Tanggal ditulis sebagai Date SUNGGUHAN, bukan teks — sama alasannya dengan
 * toDateOrBlank_ di sheets-orders/Code.gs (bisa diurutkan/difilter, dan
 * Sheets menampilkannya di zona waktu spreadsheet dengan sendirinya).
 */
function toDateOrBlank_(iso) {
  if (!iso) return null;
  var d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** PostgREST mengembalikan embed sebagai objek, tapi bisa juga array. */
function pickOne_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Array]') return v.length ? v[0] : null;
  return v;
}
