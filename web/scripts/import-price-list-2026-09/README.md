# Impor Price List SANCI 2026-09

Sumber: `202609_SANCI_Selling_Price_List_ADMIN.xlsx` (937 baris, 15 sheet).
Price list = sumber kebenaran (owner 2026-09-22).

## Keputusan owner
- Setiap varian (bahan/ukuran) = satu produk sendiri. Varian ke-2 dst dari
  produk lama diberi kode `<kode lama>-2`, `-3`, …; model baru yang punya
  beberapa varian diberi `<model>-1`, `-2`, ….
- Kolom baru Material/Configuration/Packing/CBM/Weight → `sanci_products`
  (0031). Remarks + Old showroom price → `product_internal_notes` (khusus admin).
- POSM (43 baris): diimpor sebagai produk biasa, kategori
  `Display Material (POSM)`, nama berakhiran `(Display)`.
- Foto: thumbnail dari Excel (±100px) dipakai untuk produk yang BELUM punya
  foto. Foto yang sudah ada tidak diganti.
- Ukuran lain produk lama yang tidak ada di price list (mis. CX01-R150/R200)
  TIDAK disentuh.

## Pencocokan dengan produk lama
Lewat kolom Remarks price list ("Old showroom price, code CX01-R180 …") —
30 produk lama ↔ 41 baris. Sisanya 907 baris jadi produk baru.
Ukuran dalam meter (`1.8*2.0*30`) dinormalkan ke cm (`180*200*30`).

## Menjalankan
Lihat komentar di `run.mjs`. Jalankan tanpa `--jalankan` dulu untuk melihat rencana.
