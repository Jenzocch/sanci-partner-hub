# Kartu Darurat — SANCI Partner Hub

> **Cetak halaman ini dan tempel di kantor / kirim ke grup WhatsApp toko.**
> Ini BUKAN dokumen teknis — ini untuk staf yang memakai sistem sehari-hari
> (admin SANCI dan staf toko Golden Home), supaya waktu ada yang aneh, tidak
> perlu panik dan tidak perlu tebak-tebak.

## Kontak darurat

| Nama | WhatsApp / Telepon | Kapan dihubungi |
|---|---|---|
| **[ISI: nama]** | **[ISI: nomor]** | Situs tidak bisa dibuka sama sekali, atau data terlihat hilang/salah |

*(Jenzo — isi baris di atas sebelum kartu ini dicetak/dikirim. Tanpa kontak
ini, staf tidak tahu harus lapor ke siapa.)*

## Kalau muncul begini di layar

| Yang terlihat | Apa yang harus dilakukan |
|---|---|
| Kotak merah/kuning berisi **"Kode laporan: SP-XXXXX"** | Ini BUKAN error acak — sistem sudah mencatatnya di log server. **Screenshot layarnya** (kodenya harus kelihatan), lalu kirim ke kontak di atas. Jangan coba tekan tombol yang sama berkali-kali. |
| Pesan **"koneksi terputus, data belum tersimpan"** | Sambungkan internet, lalu tekan tombolnya SEKALI LAGI. Data yang sudah diketik masih ada di layar, tidak hilang. |
| Pesan **"koneksi terputus, belum bisa dipastikan tersimpan"** | Tekan tombolnya SEKALI LAGI — menekan dua kali TIDAK membuat data tersimpan dobel. Sistem sudah mencegah itu. |
| Pesan **"aplikasi baru diperbarui, muat ulang halaman"** | Tarik layar ke bawah untuk refresh (atau tekan tombol reload browser), baru isi ulang. Jangan langsung tekan Simpan tanpa refresh — pasti gagal lagi. |
| Pengiriman WhatsApp ke pelanggan **gagal**, ada alasan tertulis di layar (kuota habis / device tidak terhubung / dll) | Baca alasannya — itu sudah ditulis dalam bahasa biasa, bukan kode teknis. Kalau alasannya "kuota habis" atau "device tidak terhubung", ini butuh Jenzo untuk perbaiki dari sisi Fonnte. Kirim screenshot ke kontak di atas. |
| Halaman terasa aneh setelah "sistem baru saja diupdate" | Ini normal setelah SANCI merilis pembaruan — refresh halaman, biasanya langsung normal. |

## Kalau situsnya sama sekali tidak bisa dibuka

1. Coba buka dari HP/laptop lain, atau matikan-nyalakan WiFi/data seluler dulu — pastikan bukan masalah internet sendiri.
2. Masih tidak bisa? **Hubungi kontak darurat di atas SEKARANG** — kemungkinan ada gangguan di server, dan admin harus tahu secepatnya, bukan besok.
3. Sambil menunggu: JANGAN mencoba "perbaiki sendiri" (hapus cache, install ulang, dll) — itu tidak akan membantu dan bisa membuat lebih sulit dilacak apa penyebabnya.

## Kalau data terlihat salah/hilang (bukan sekadar error di layar)

1. **Jangan buru-buru menghapus atau mengubah sendiri** untuk "membetulkan" — itu bisa menghilangkan jejak yang dibutuhkan untuk mencari tahu apa yang terjadi.
2. Screenshot keadaannya sekarang, dan ingat/catat kira-kira kapan terakhir kali data itu terlihat benar.
3. Hubungi kontak darurat di atas.
4. Sistem punya cadangan harian (backup) — kalau memang perlu dikembalikan, kehilangan paling lama adalah pekerjaan satu hari terakhir (bukan mundur berminggu-minggu). Lihat `docs/BACKUP.md` untuk detail teknisnya.

---

## 中文備註（給 Jenzo）

這張卡是給**第一線使用者**（SANCI 內勤＋Golden Home 店員）用的，故意全印尼文、
不用任何技術詞——他們看到的動作只有「截圖」「重新整理」「聯絡誰」三種。

- **上面「聯絡人」那一格務必先填好再列印/發群組**，否則等於白做。
- 這張卡對應的技術決策全部寫在 `docs/ROLLBACK.md`（給你或接手的 AI session 看，
  不是給店員看的）。
- `SP-XXXXX` 回報碼機制、成功/失敗的 WhatsApp log，都是這次 audit 已經做好的
  基礎設施——這張卡只是讓「文字說明」真的傳到會看到問題的人手上。
