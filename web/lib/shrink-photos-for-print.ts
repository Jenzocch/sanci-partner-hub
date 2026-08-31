/**
 * Menurunkan resolusi foto TEPAT SEBELUM mencetak, lalu mengembalikannya.
 *
 * Kenapa perlu: Chrome TIDAK menurunkan resolusi gambar saat membuat PDF. Ia
 * menanam tiap gambar pada resolusi aslinya, sekecil apa pun gambar itu
 * tampil di halaman — diukur: dua belas foto 1280px menghasilkan PDF 2714 KB
 * baik ketika dicetak selebar 29mm maupun 178mm, selisihnya 4 KB. Chrome juga
 * MENGKODE ULANG WebP saat menanamnya, sehingga 756 KB sumber membengkak jadi
 * 2714 KB. Proposal dengan enam produk berfoto lengkap bisa menjadi berkas
 * puluhan MB yang tidak nyaman dikirim lewat WhatsApp di jaringan seluler.
 *
 * Yang dilakukan: tiap gambar digambar ulang ke canvas seukuran yang memang
 * dibutuhkan cetakannya, lalu `src`-nya ditukar sementara. Foto pembuka yang
 * memang tampil selebar halaman TIDAK ikut turun (targetnya melebihi
 * resolusi aslinya) — hanya bingkai kecil seperti galeri dan daftar pilihan
 * yang menyusut. Jadi "diperkecil" di sini berarti "tidak lagi jauh lebih
 * besar daripada yang bisa dicetak", bukan "dikaburkan".
 *
 * KESELAMATAN LEBIH DULU: gambar yang tampil TIDAK PERNAH diberi atribut
 * crossOrigin, karena kalau penyimpanan tidak mengirim header CORS gambarnya
 * akan gagal dimuat sama sekali — dokumen rusak demi berkas yang lebih kecil
 * adalah pertukaran yang salah. Pemuatan CORS dilakukan pada salinan
 * TERSEMBUNYI; kalau salinan itu gagal atau canvas-nya ternoda, foto itu
 * dibiarkan apa adanya dan cetakannya tetap benar, hanya lebih besar.
 */

/** Piksel per satu piksel tata letak CSS saat dicetak (~200 dpi di A4). */
const PRINT_SCALE = 2;
/** Jangan repot menukar gambar yang penghematannya tidak berarti. */
const MIN_GAIN = 1.25;
/** Salinan yang tidak juga termuat tidak boleh menahan dialog cetak. */
const LOAD_TIMEOUT_MS = 4000;

function loadCrossOrigin(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = (v: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const timer = setTimeout(() => done(null), LOAD_TIMEOUT_MS);
    img.crossOrigin = "anonymous";
    img.onload = () => {
      clearTimeout(timer);
      done(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    img.src = src;
  });
}

/**
 * Mengecilkan foto di dalam `root` seukuran cetak. Mengembalikan fungsi
 * pemulih yang WAJIB dipanggil sesudah dialog cetak ditutup — layar tetap
 * memakai foto resolusi penuh.
 */
export async function shrinkPhotosForPrint(root: HTMLElement): Promise<() => void> {
  const restore: Array<[HTMLImageElement, string]> = [];
  const imgs = Array.from(root.querySelectorAll("img"));

  await Promise.all(
    imgs.map(async (img) => {
      const laidOut = img.getBoundingClientRect().width;
      if (!laidOut || !img.naturalWidth) return;
      const target = Math.round(laidOut * PRINT_SCALE);
      if (img.naturalWidth < target * MIN_GAIN) return; // sudah sepadan

      const source = await loadCrossOrigin(img.src);
      if (!source || !source.naturalWidth) return;

      const canvas = document.createElement("canvas");
      const scale = target / source.naturalWidth;
      canvas.width = target;
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // Latar putih dulu: hasilnya JPEG yang tidak punya transparansi, dan
      // piksel transparan tanpa alas akan menjadi HITAM, bukan putih.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

      try {
        const url = canvas.toDataURL("image/jpeg", 0.85);
        restore.push([img, img.src]);
        img.src = url;
      } catch {
        // Canvas ternoda (penyimpanan tanpa header CORS) — biarkan aslinya.
      }
    })
  );

  return () => {
    for (const [img, src] of restore) img.src = src;
  };
}
