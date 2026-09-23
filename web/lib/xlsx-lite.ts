/**
 * Penulis .xlsx (Office Open XML) minimal, tanpa dependency npm baru.
 *
 * Kenapa tulis tangan: kebutuhannya cuma "keluarkan tabel jadi file Excel
 * yang bisa dibuka" dari Route Handler (Node runtime) — sekitar 60 baris
 * logika ZIP + XML, bukan alasan yang cukup untuk menambah paket seberat
 * `exceljs`/`xlsx` ke bundle server (lih. gaya lib/safe-write.ts, lib/
 * compress-image.ts: masalah kecil & jelas batasnya ditulis sendiri, bukan
 * langsung tarik dependency). File ini sengaja PALING SEDERHANA yang masih
 * valid dibuka Excel/LibreOffice/openpyxl:
 *   - ZIP metode STORE (tanpa kompresi) — lebih besar di disk, tapi hilang-
 *     kan seluruh kelas bug dari implementasi DEFLATE tulisan sendiri.
 *   - Semua teks pakai inline string (`t="inlineStr"`), BUKAN sharedStrings
 *     — satu bagian XML lebih sedikit untuk salah, dan tidak perlu index
 *     dedup string yang gampang meleset dihitung dengan tangan.
 *   - Satu style default untuk semua sel (xl/styles.xml minimal). Tidak ada
 *     format tanggal/mata uang, tidak ada freeze pane, tidak ada styling —
 *     kalau nanti dibutuhkan, itu alasan bagus untuk pindah ke library asli,
 *     bukan menambah fitur di sini.
 *
 * Batasan yang SENGAJA tidak ditangani (jangan dipakai untuk ini):
 *   - Tidak ada validasi ukuran file/jumlah baris — pemanggil yang menjaga
 *     supaya hasilnya tidak jadi puluhan MB (STORE = tidak dimampatkan).
 *   - Tanggal Excel (serial number) tidak didukung; kirim tanggal sebagai
 *     string yang sudah diformat kalau perlu dibaca manusia.
 *   - Rumus, merge cell, warna/border, multi-style per sel: tidak ada.
 */

import { crc32 as zlibCrc32 } from "node:zlib";

export type XlsxCell = string | number | null;
export type XlsxSheet = { name: string; rows: XlsxCell[][] };

/* -------------------------------------------------------------------- *
 * CRC-32
 *
 * `node:zlib` punya `crc32()` bawaan sejak Node 20.12/21.4 — dipakai kalau
 * ada (lebih cepat, tidak perlu tabel 256 entri di sini). Kalau berjalan di
 * Node yang lebih lama dan exportnya tidak ada, jatuh ke tabel CRC-32
 * standar (polinomial 0xEDB88320, dipakai ZIP/PNG/dst) sebagai cadangan.
 * ------------------------------------------------------------------- */

let crc32Table: Uint32Array | undefined;

function crc32Fallback(data: Uint8Array): number {
  if (!crc32Table) {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    crc32Table = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crc32Table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function crc32(data: Uint8Array): number {
  if (typeof zlibCrc32 === "function") {
    return zlibCrc32(data) >>> 0;
  }
  return crc32Fallback(data);
}

/* -------------------------------------------------------------------- *
 * XML helpers
 * ------------------------------------------------------------------- */

/**
 * Escape teks untuk isi elemen XML, dan buang karakter kontrol yang
 * dilarang standar XML 1.0 (0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F) — kalau lolos,
 * Excel menganggap file-nya rusak dan menolak membuka sama sekali, bukan
 * cuma menampilkan karakter aneh.
 */
function xmlEscape(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A, B, ..., Z, AA, AB, ... — indeks kolom 0-based ke notasi huruf Excel. */
function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Nama sheet menurut aturan Excel: maksimal 31 karakter, tanpa
 * `[ ] : * ? / \`, tidak boleh kosong, dan harus unik dalam satu workbook
 * (Excel menolak buka file yang dua sheet-nya nama sama).
 */
function sanitizeSheetNames(sheets: XlsxSheet[]): string[] {
  const used = new Set<string>();
  const result: string[] = [];
  for (let i = 0; i < sheets.length; i++) {
    let base = (sheets[i].name || "").replace(/[[\]:*?/\\]/g, "").trim();
    if (!base) base = `Sheet${i + 1}`;
    base = base.slice(0, 31);

    let candidate = base;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
      const tail = `_${suffix}`;
      candidate = base.slice(0, 31 - tail.length) + tail;
      suffix++;
    }
    used.add(candidate.toLowerCase());
    result.push(candidate);
  }
  return result;
}

/** Lebar kolom kasar dari panjang isi terpanjang, dibatasi supaya masuk akal. */
function computeColWidths(rows: XlsxCell[][]): number[] {
  const widths: number[] = [];
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      const len = cell === null ? 0 : String(cell).length;
      widths[c] = Math.max(widths[c] ?? 0, len);
    }
  }
  return widths.map((w) => Math.min(60, Math.max(8, w + 2)));
}

function buildSheetXml(rows: XlsxCell[][]): string {
  const widths = computeColWidths(rows);
  const colsXml = widths.length
    ? `<cols>${widths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";

  const rowsXml = rows
    .map((row, rIdx) => {
      const rowNum = rIdx + 1;
      const cellsXml = row
        .map((cell, cIdx) => {
          if (cell === null) return "";
          const ref = `${colLetter(cIdx)}${rowNum}`;
          if (typeof cell === "number" && Number.isFinite(cell)) {
            return `<c r="${ref}"><v>${cell}</v></c>`;
          }
          const text = typeof cell === "number" ? String(cell) : cell;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(
            text
          )}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNum}">${cellsXml}</row>`;
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    colsXml +
    `<sheetData>${rowsXml}</sheetData>` +
    `</worksheet>`
  );
}

const CONTENT_TYPES_HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

function buildContentTypesXml(sheetCount: number): string {
  const overrides = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");
  return (
    `${CONTENT_TYPES_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    overrides +
    `</Types>`
  );
}

function buildRootRelsXml(): string {
  return (
    `${CONTENT_TYPES_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`
  );
}

function buildWorkbookXml(sheetNames: string[]): string {
  const sheetsXml = sheetNames
    .map(
      (name, i) =>
        `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
    )
    .join("");
  return (
    `${CONTENT_TYPES_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>${sheetsXml}</sheets>` +
    `</workbook>`
  );
}

function buildWorkbookRelsXml(sheetCount: number): string {
  // rId1..rIdN dipakai sheet; rId setelahnya untuk styles.xml (bukan sharedStrings
  // karena semua teks inline — lih. komentar kepala berkas).
  const sheetRels = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  ).join("");
  const stylesRel = `<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  return (
    `${CONTENT_TYPES_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheetRels +
    stylesRel +
    `</Relationships>`
  );
}

function buildStylesXml(): string {
  // Style minimal: satu font/fill/border/format default (index 0), satu
  // cellXfs (index 0) yang dipakai semua sel karena tidak ada cell yang
  // menyebut atribut `s="..."` — cukup supaya file dianggap valid.
  return (
    `${CONTENT_TYPES_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
    `</styleSheet>`
  );
}

/* -------------------------------------------------------------------- *
 * ZIP (metode STORE — lihat komentar kepala berkas)
 * ------------------------------------------------------------------- */

type ZipEntry = { name: string; data: Uint8Array };

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;

function writeZip(entries: ZipEntry[]): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  // Tanggal/waktu DOS tetap (2026-01-01 00:00:00) — file ini tidak butuh
  // timestamp asli, dan angka tetap membuat output deterministic (enak untuk
  // diff/test).
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data);
    const crc = crc32(data);
    const size = data.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIG, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // general purpose flag: UTF-8 names
    localHeader.writeUInt16LE(0, 8); // method: STORE
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18); // compressed size
    localHeader.writeUInt32LE(size, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localParts.push(localHeader, nameBytes, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(CENTRAL_DIR_HEADER_SIG, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // flags
    centralHeader.writeUInt16LE(0, 10); // method: STORE
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // local header offset

    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + data.length;
  }

  const centralDirStart = offset;
  const centralDir = Buffer.concat(centralParts);
  const centralDirSize = centralDir.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(END_OF_CENTRAL_DIR_SIG, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirStart, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return new Uint8Array(Buffer.concat([...localParts, centralDir, eocd]));
}

/* -------------------------------------------------------------------- *
 * API publik
 * ------------------------------------------------------------------- */

export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  const safeSheets = sheets.length ? sheets : [{ name: "Sheet1", rows: [] }];
  const sheetNames = sanitizeSheetNames(safeSheets);

  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: Buffer.from(buildContentTypesXml(safeSheets.length), "utf8") },
    { name: "_rels/.rels", data: Buffer.from(buildRootRelsXml(), "utf8") },
    { name: "xl/workbook.xml", data: Buffer.from(buildWorkbookXml(sheetNames), "utf8") },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(buildWorkbookRelsXml(safeSheets.length), "utf8"),
    },
    { name: "xl/styles.xml", data: Buffer.from(buildStylesXml(), "utf8") },
  ];

  safeSheets.forEach((sheet, i) => {
    entries.push({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: Buffer.from(buildSheetXml(sheet.rows), "utf8"),
    });
  });

  return writeZip(entries);
}
