/**
 * EMPAT kalimat yang dipakai batas-error React (`app/error.tsx` dan
 * `app/admin/error.tsx`) — dipisah ke berkas mungil ini dengan alasan yang
 * sama persis seperti `offline.ts`:
 *
 *  1. `app/error.tsx` adalah komponen client yang ikut masuk ke bundle
 *     SETIAP rute. Meng-import slice `common` di sana berarti seluruh app
 *     menggendong 231 kunci × 3 bahasa hanya untuk empat kalimat ini — satu
 *     export objek tidak bisa di-tree-shake per properti (LESSONS #38).
 *  2. `app/error.tsx` menggantikan SELURUH pohon di bawah layout root,
 *     termasuk `app/admin/layout.tsx` / `app/cabang/layout.tsx` yang memasang
 *     provider bahasa. Jadi `useCommonMessages()` di sana pasti melempar
 *     ("dipakai di luar provider-nya") — teksnya harus datang dari import
 *     langsung, bukan context.
 *
 * Kunci `retry` SENGAJA tidak ada di sini: "Coba Lagi" sudah punya satu
 * sumber kebenaran di `offline.ts` (dan `common.ts` menyebarkannya). Layar
 * error meng-import `offline` untuk kunci itu — jangan tulis ulang
 * terjemahannya di berkas ini.
 *
 * Aturan berkas pesan tetap berlaku: `id` adalah sumber kebenaran, `en`/`zh`
 * memakai `satisfies Shape` sehingga kunci yang hilang = error saat build.
 */

const id = {
  errorTitle: "Halaman ini bermasalah",
  errorBody:
    "Sistem tidak bisa menampilkan halaman ini. Coba lagi — kalau masih sama, kembali ke halaman awal.",
  // Halaman bisa gagal TEPAT setelah tombol simpan ditekan, jadi staf toko
  // tidak boleh diarahkan untuk langsung mengetik ulang: yang tadi diketik
  // mungkin sudah masuk (LESSONS #2 No Fake Success — layar yang error bukan
  // bukti bahwa datanya tidak tersimpan).
  errorCheckSaved:
    "Kalau tadi sedang menyimpan sesuatu, periksa dulu apakah datanya sudah masuk sebelum mengisi ulang.",
  errorHome: "Kembali ke Halaman Awal",
} as const;

type Shape = Record<keyof typeof id, string>;

const en = {
  errorTitle: "This page ran into a problem",
  errorBody:
    "The system could not show this page. Try again — if it stays the same, go back to the start page.",
  errorCheckSaved:
    "If you were saving something, check whether it went through before entering it again.",
  errorHome: "Back to start page",
} satisfies Shape;

const zh = {
  errorTitle: "这个页面出问题了",
  errorBody: "系统无法显示这个页面。请重试；如果还是一样，就回到首页。",
  errorCheckSaved: "如果刚才正在保存，请先确认数据有没有存进去，再重新填写。",
  errorHome: "返回首页",
} satisfies Shape;

export const errorBoundary = { id, en, zh };
