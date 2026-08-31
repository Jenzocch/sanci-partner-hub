"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useAdminMessages } from "@/lib/i18n/provider";
import { formatIDR, parseIDRInput } from "@/lib/orders-shared";
import { computeChainFinal } from "@/lib/calculator-shared";
import { getOrderOffer, setOrderOffer, clearOrderOffer } from "../../actions-orders";

/**
 * Isi / ubah / hapus nilai penawaran SANCI untuk SATU pesanan (migrasi 0013).
 *
 * Pola modal + useSubmitGuard + submitSafely ditiru dari mark-arrived-button.tsx
 * dan correct-attribution-button.tsx supaya perilaku jaringan lemah konsisten
 * se-halaman. Tanpa `lookup`: tulisannya adalah UPSERT berkunci order_id, jadi
 * kiriman ulang tidak pernah menghasilkan baris kedua — Server Action yang
 * memastikan status sebenarnya saat respons hilang, bukan nomor permintaan.
 *
 * "Hapus" dibuat sebagai tombol TERSENDIRI, bukan "simpan nilai kosong":
 * tidak ada penawaran dan penawaran senilai Rp 0 adalah dua keadaan berbeda,
 * dan layar tidak boleh membuat keduanya terlihat seperti satu hal.
 *
 * Diperluas migrasi 0015: rantai diskon % (slot dinamis, maks 6) + markup% +
 * potongan tunai + Harga Akhir/Sisa Bayar dihitung LIVE di layar (perkiraan —
 * dihitung ulang dengan rumus yang SAMA dengan trigger database supaya
 * pengguna melihat angka yang masuk akal SEBELUM submit) — nilai yang
 * TERSIMPAN selalu datang dari respons server setelah refresh (LESSONS #7:
 * jangan percaya angka yang dihitung sendiri sebagai bukti tersimpan).
 *
 * Perbaikan 2026-08-29 — isi formulir DIMUAT SEGAR tiap kali modal dibuka:
 * setOrderOffer menulis satu baris PENUH (keenam kolom sekaligus, tanpa
 * membandingkan kolom mana yang benar-benar disentuh pengguna), sedangkan
 * halaman detail tidak punya polling maupun Realtime — angka propnya adalah
 * potret saat render pertama dan tidak pernah menyusul sendiri. Mengisi
 * formulir dari potret itu berarti admin yang cuma ingin membetulkan Kondisi
 * Pembayaran ikut MENIMPA balik diskon/markup yang baru saja diubah orang
 * lain: tanpa error, tanpa peringatan, dan tidak seorang pun tahu angka uang
 * itu hilang. Sekarang nilainya diambil lewat getOrderOffer setiap kali modal
 * dibuka, dan tiga keadaannya dibedakan (LESSONS #10): memuat, gagal, siap.
 * Saat gagal, formulirnya TIDAK dibuka sama sekali — mundur ke angka prop
 * sama saja dengan memasang kembali bug yang diperbaiki di sini.
 */
/* Rumus rantai diskonnya TIDAK ditulis ulang di sini — lihat catatan kembar
   di app/cabang/pesanan/[orderId]/offer-section.tsx. Satu-satunya versi yang
   sah: computeChainFinal di lib/calculator-shared.ts (meniru persis
   fn_compute_order_offer_final, 0015 §5). */

/** Nilai yang BENAR-BENAR ada di database saat modal dibuka (bukan prop halaman). */
type OfferSnapshot = {
  amount: number;
  dpAmount: number;
  paymentCondition: string | null;
  discountPcts: number[];
  markupPct: number | null;
  cashDiscount: number;
};

/**
 * `snapshot: null` pada status "ready" = server memastikan pesanan ini MEMANG
 * belum punya penawaran (formulir kosong yang jujur) — berbeda dari "error"
 * yang artinya kita tidak tahu apa-apa (LESSONS #10).
 */
type OfferLoad =
  | { status: "loading" }
  | { status: "error"; message?: string }
  | { status: "ready"; snapshot: OfferSnapshot | null };

export default function OrderOfferForm({
  orderId,
  currentAmount,
  canDiscount,
}: {
  orderId: string;
  /**
   * Nilai penawaran versi render halaman. Dipakai HANYA untuk memilih label
   * tombol pembuka ("Isi" vs "Ubah") — angka yang sama sedang tampil di kartu
   * tepat di atas tombol ini, jadi keduanya tidak pernah saling bertentangan.
   * SENGAJA TIDAK dipakai mengisi formulir: itulah bug yang diperbaiki di
   * berkas ini.
   */
  currentAmount: number | null;
  /**
   * Prop sisa dari halaman detail tetap DITERIMA supaya halaman itu tidak
   * perlu diubah, tapi TIDAK dibaca sama sekali di sini — isi formulir hanya
   * boleh datang dari getOrderOffer.
   */
  currentDpAmount?: number | null;
  currentPaymentCondition?: string | null;
  currentDiscountPcts?: number[];
  currentMarkupPct?: number | null;
  currentCashDiscount?: number;
  /** Admin selalu true secara efektif (server tidak pernah mengecek ini untuk
   * admin — hanya dipakai untuk menyembunyikan bagian diskon di layar cabang
   * kalau komponen ini kelak dipakai ulang di sana; halaman admin selalu
   * memberi `true`). */
  canDiscount?: boolean;
}) {
  const router = useRouter();
  const m = useAdminMessages();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [clearing, setClearing] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [load, setLoad] = useState<OfferLoad>({ status: "loading" });
  // Nomor urut pemuatan. Modal ini TIDAK di-unmount saat ditutup (state-nya
  // milik komponen ini), jadi respons dari pembukaan sebelumnya masih bisa
  // mendarat setelah pembukaan berikutnya sudah siap dan pengguna sudah
  // mengetik — dan karena diskon/markup adalah input TERKONTROL, mendaratnya
  // berarti ketikan itu tertimpa diam-diam (LESSONS #1: respons server yang
  // telat tidak boleh menghapus draf yang belum disimpan). Hanya pemuatan
  // TERBARU yang boleh menulis state.
  const loadSeq = useRef(0);
  // Sisa bayar = matematika TAMPILAN saja (amount - dp_amount), TIDAK PERNAH
  // disimpan sebagai kolom — pola yang sama sudah didokumentasikan di
  // migration 0014 §2. Dihitung ulang setiap kali kedua input berubah.
  //
  // Nilai awalnya KOSONG, bukan dari prop: kolom-kolomnya baru dirender
  // setelah status "ready", dan state ini diisi dari respons server di
  // loadFresh().
  const [liveAmount, setLiveAmount] = useState<number | null>(null);
  const [liveDp, setLiveDp] = useState<number | null>(null);
  const [liveDiscounts, setLiveDiscounts] = useState<string[]>([""]);
  const [liveMarkup, setLiveMarkup] = useState<string>("");
  const [liveCash, setLiveCash] = useState<number | null>(null);

  // Perkiraan LIVE — rumus SAMA PERSIS dengan fn_compute_order_offer_final
  // (0015): rantai % berurutan (kalikan, bukan jumlah) → markup → kurangi
  // potongan tunai. Elemen kosong/tidak valid di slot diskon diabaikan di
  // sini (bukan error) — validasi sungguhan tetap di server + database.
  const parsedDiscounts = liveDiscounts
    .map((s) => Number(s.trim().replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 100);
  const parsedMarkup = liveMarkup.trim() === "" ? 0 : Number(liveMarkup.trim().replace(",", "."));
  const liveFinal =
    liveAmount != null
      ? computeChainFinal(
          liveAmount,
          parsedDiscounts,
          Number.isFinite(parsedMarkup) ? parsedMarkup : 0,
          liveCash ?? 0
        )
      : null;
  const remaining = liveFinal != null ? liveFinal - (liveDp ?? 0) : null;

  /**
   * Ambil nilai yang berlaku SEKARANG lalu isi seluruh state formulir dari
   * respons itu. Dipanggil saat modal dibuka DAN oleh tombol "Coba Lagi" di
   * kartu error — pola yang sama dengan product-gallery-client.tsx, supaya
   * mencoba ulang tidak menuntut pengguna menutup lalu membuka lagi.
   */
  async function loadFresh() {
    const seq = ++loadSeq.current;
    setLoad({ status: "loading" });
    try {
      const res = await getOrderOffer(orderId);
      if (seq !== loadSeq.current) return; // sudah ada pemuatan yang lebih baru
      if ("error" in res) {
        setLoad({ status: "error", message: res.error.message });
        return;
      }
      const snap = res.data;
      setLiveAmount(snap?.amount ?? null);
      setLiveDp(snap?.dpAmount ?? null);
      setLiveDiscounts(snap && snap.discountPcts.length ? snap.discountPcts.map(String) : [""]);
      setLiveMarkup(snap?.markupPct == null ? "" : String(snap.markupPct));
      setLiveCash(snap?.cashDiscount || null);
      setLoad({ status: "ready", snapshot: snap });
    } catch {
      if (seq !== loadSeq.current) return;
      setLoad({ status: "error" });
    }
  }

  function openModal() {
    reset();
    setErrMsg(null);
    setNetMsg(null);
    setClearing(false);
    setOpen(true);
    void loadFresh();
  }

  function addDiscountSlot() {
    setLiveDiscounts((slots) => (slots.length >= 6 ? slots : [...slots, ""]));
  }
  function removeDiscountSlot(idx: number) {
    setLiveDiscounts((slots) => slots.filter((_, i) => i !== idx));
  }
  function handleDiscountSlotChange(idx: number, value: string) {
    setLiveDiscounts((slots) => slots.map((s, i) => (i === idx ? value : s)));
  }
  function handleCashChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseIDRInput(e.target.value);
    e.target.value = n === null ? "" : formatIDR(n);
    setLiveCash(n);
  }

  function closeModal() {
    reset();
    setClearing(false);
    setOpen(false);
  }

  /** Format Rupiah langsung saat mengetik — sama persis dengan formulir pesanan cabang. */
  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseIDRInput(e.target.value);
    e.target.value = n === null ? "" : formatIDR(n);
    setLiveAmount(n);
  }

  function handleDpChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseIDRInput(e.target.value);
    e.target.value = n === null ? "" : formatIDR(n);
    setLiveDp(n);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrMsg(null);
    setNetMsg(null);
    const fd = new FormData(e.currentTarget);
    const raw = String(fd.get("offer_amount") || "");
    const dpRaw = String(fd.get("dp_amount") || "");
    const conditionRaw = String(fd.get("payment_condition") || "");
    const markupRaw = String(fd.get("markup_pct") || "");
    const cashRaw = String(fd.get("cash_discount") || "");
    const out = await submitSafely({
      kind: "update",
      run: () => setOrderOffer(orderId, raw, dpRaw, conditionRaw, liveDiscounts, markupRaw, cashRaw),
      messages: m,
      buttonLabel: m.admin.orderOfferSaveBtn,
    });
    if (out.status !== "ok") {
      release();
      setNetMsg(out.message);
      return;
    }
    const res = out.result;
    if ("error" in res) {
      release();
      setErrMsg(res.error.message);
      return;
    }
    // Tombol tetap nonaktif sampai halaman disegarkan — nilai yang tampil
    // datang dari query server yang sudah dipastikan (LESSONS #7).
    setOpen(false);
    router.refresh();
  }

  async function onClear() {
    if (!confirm(m.admin.orderOfferClearConfirm)) return;
    if (!begin()) return;
    setErrMsg(null);
    setNetMsg(null);
    setClearing(true);
    const out = await submitSafely({
      kind: "update",
      run: () => clearOrderOffer(orderId),
      messages: m,
      buttonLabel: m.admin.orderOfferClearBtn,
    });
    if (out.status !== "ok") {
      release();
      setClearing(false);
      setNetMsg(out.message);
      return;
    }
    const res = out.result;
    if ("error" in res) {
      release();
      setClearing(false);
      setErrMsg(res.error.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  // Hanya terisi pada status "ready", dan dipakai sebagai prefill setiap
  // kolom. `null` di sini berarti "server memastikan belum ada penawaran",
  // bukan "belum sempat dimuat" — kolomnya memang baru dirender setelah siap.
  const snapshot = load.status === "ready" ? load.snapshot : null;

  return (
    <>
      <div className="btnrow-inline">
        <button className="btn primary" onClick={openModal}>
          {currentAmount == null ? m.admin.orderOfferSetBtn : m.admin.orderOfferEditBtn}
        </button>
      </div>

      {open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{m.admin.orderOfferModalTitle}</h2>
            <p className="small muted" style={{ marginBottom: 14 }}>
              {m.admin.orderOfferModalDesc}
            </p>
            {netMsg && <div className="banner warn">{netMsg}</div>}
            {errMsg && <div className="banner bad">{errMsg}</div>}

            {load.status === "loading" && (
              <>
                <div className="hint">{m.common.loading}</div>
                <div className="btnrow">
                  <button type="button" className="btn" onClick={closeModal}>
                    {m.common.cancel}
                  </button>
                </div>
              </>
            )}

            {/* Gagal memuat = formulirnya tidak dirender sama sekali. Tidak ada
                kolom untuk diisi, jadi tidak ada satu pun angka basi yang bisa
                terkirim balik ke database (LESSONS #10 + #7). */}
            {load.status === "error" && (
              <>
                <div className="banner bad">{load.message ?? m.admin.orderOfferLoadFailed}</div>
                <div className="btnrow">
                  <button type="button" className="btn" onClick={closeModal}>
                    {m.common.close}
                  </button>
                  <button type="button" className="btn primary" onClick={loadFresh}>
                    {m.common.retry}
                  </button>
                </div>
              </>
            )}

            {load.status === "ready" && (
              <form onSubmit={onSubmit}>
                <div className={`field${errMsg ? " invalid" : ""}`} style={{ marginBottom: 10 }}>
                  <label htmlFor="offer_amount">{m.admin.orderOfferFieldLabel}</label>
                  <input
                    id="offer_amount"
                    name="offer_amount"
                    type="text"
                    inputMode="numeric"
                    defaultValue={snapshot == null ? "" : formatIDR(snapshot.amount)}
                    onChange={handleAmountChange}
                    placeholder={m.admin.orderOfferPlaceholder}
                  />
                </div>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label htmlFor="dp_amount">{m.admin.orderOfferDpFieldLabel}</label>
                  <input
                    id="dp_amount"
                    name="dp_amount"
                    type="text"
                    inputMode="numeric"
                    defaultValue={snapshot?.dpAmount ? formatIDR(snapshot.dpAmount) : ""}
                    onChange={handleDpChange}
                    placeholder="Rp 0"
                  />
                </div>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label htmlFor="payment_condition">{m.admin.orderOfferPaymentConditionFieldLabel}</label>
                  <input
                    id="payment_condition"
                    name="payment_condition"
                    type="text"
                    defaultValue={snapshot?.paymentCondition ?? ""}
                    placeholder={m.admin.orderOfferPaymentConditionPlaceholder}
                  />
                </div>

                {canDiscount !== false && (
                  <div style={{ marginBottom: 10, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                    <div className="overline">{m.admin.orderOfferDiscountSectionTitle}</div>
                    <p className="small muted" style={{ marginBottom: 10 }}>
                      {m.admin.orderOfferDiscountHint}
                    </p>
                    {liveDiscounts.map((slot, idx) => (
                      <div key={idx} className="field" style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <div style={{ flex: 1 }}>
                          <label htmlFor={`discount_${idx}`}>
                            {m.admin.orderOfferDiscountFieldLabel.replace("{n}", String(idx + 1))}
                          </label>
                          <input
                            id={`discount_${idx}`}
                            type="text"
                            inputMode="decimal"
                            value={slot}
                            onChange={(e) => handleDiscountSlotChange(idx, e.target.value)}
                            placeholder="8"
                          />
                        </div>
                        {liveDiscounts.length > 1 && (
                          <button type="button" className="btn sm" onClick={() => removeDiscountSlot(idx)}>
                            {m.admin.orderOfferDiscountRemoveBtn}
                          </button>
                        )}
                      </div>
                    ))}
                    {liveDiscounts.length < 6 && (
                      <button type="button" className="btn sm" onClick={addDiscountSlot} style={{ marginBottom: 10 }}>
                        {m.admin.orderOfferDiscountAddBtn}
                      </button>
                    )}
                    <div className="field" style={{ marginBottom: 10 }}>
                      <label htmlFor="markup_pct">{m.admin.orderOfferMarkupFieldLabel}</label>
                      <input
                        id="markup_pct"
                        name="markup_pct"
                        type="text"
                        inputMode="decimal"
                        value={liveMarkup}
                        onChange={(e) => setLiveMarkup(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 10 }}>
                      <label htmlFor="cash_discount">{m.admin.orderOfferCashFieldLabel}</label>
                      <input
                        id="cash_discount"
                        name="cash_discount"
                        type="text"
                        inputMode="numeric"
                        defaultValue={snapshot?.cashDiscount ? formatIDR(snapshot.cashDiscount) : ""}
                        onChange={handleCashChange}
                        placeholder="Rp 0"
                      />
                    </div>
                  </div>
                )}

                {liveFinal != null && (
                  <>
                    <dl className="kv" style={{ marginBottom: 4 }}>
                      <dt>{m.admin.orderOfferFinalLiveLabel}</dt>
                      <dd>
                        <strong>{formatIDR(Math.max(liveFinal, 0))}</strong>
                      </dd>
                    </dl>
                    <p className="small muted" style={{ marginBottom: 10 }}>
                      {m.admin.orderOfferFinalLiveHint}
                    </p>
                  </>
                )}
                {remaining != null && (
                  <dl className="kv" style={{ marginBottom: 10 }}>
                    <dt>{m.admin.orderOfferRemainingLabel}</dt>
                    <dd>
                      <strong>{formatIDR(Math.max(remaining, 0))}</strong>
                    </dd>
                  </dl>
                )}
                <div className="btnrow">
                  <button type="button" className="btn" onClick={closeModal}>
                    {m.common.cancel}
                  </button>
                  {/* Tombol Hapus mengikuti keadaan yang DIPASTIKAN server saat
                      modal dibuka, bukan prop halaman: kalau tab lain sudah
                      menghapus penawaran ini, tombolnya memang tidak boleh ada. */}
                  {snapshot != null && (
                    <button type="button" className="btn" disabled={submitting} onClick={onClear}>
                      {clearing ? m.admin.orderOfferClearingBtn : m.admin.orderOfferClearBtn}
                    </button>
                  )}
                  <button type="submit" className="btn primary" disabled={submitting}>
                    {submitting && !clearing ? m.common.saving : m.admin.orderOfferSaveBtn}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
