"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "./use-submit-guard";
import { submitSafely } from "./safe-write";
import { useCommonMessages } from "./i18n/provider";
import { formatDateTimeWIB } from "./orders-shared";
import type { CustomerLinkActionResult } from "./customer-link";

/**
 * Kartu "Link untuk Pelanggan" — DIPAKAI DUA SISI (detail pesanan cabang dan
 * detail pesanan admin). Satu berkas, bukan dua salinan: kalau kartunya
 * disalin, dua sisi akan menyimpang diam-diam (persis LESSONS #27/#31).
 *
 * Semua teksnya dari `common.*` lewat `useCommonI18n()` — hook LINTAS AREA
 * yang memang dibuat untuk komponen seperti ini, jadi berkas ini tidak
 * terikat ke provider cabang MAUPUN admin.
 *
 * Server Action-nya DITERIMA SEBAGAI PROP (sudah di-`bind` ke orderId oleh
 * halaman pemanggil). Dengan begitu kartunya tidak perlu tahu sisi mana
 * yang sedang menggambarnya, dan setiap sisi tetap memakai gerbang
 * identitasnya sendiri di dalam aksinya masing-masing (LESSONS #5/#6).
 */
export default function CustomerLinkCard({
  link,
  waMessage,
  customerPhone,
  orderNumber,
  customerName,
  fonnteConfigured,
  deliveredAt,
  canMarkDelivered,
  sendViaCompany,
  markDelivered,
}: {
  /** Alamat lengkap tautan — DIRAKIT SERVER dari host permintaan. */
  link: string;
  /** Teks pesan yang sama untuk jalur perusahaan maupun wa.me. */
  waMessage: string;
  /** Nomor pelanggan bentuk kanonik "62…", atau null kalau tidak ada. */
  customerPhone: string | null;
  orderNumber: string;
  customerName: string;
  /** false = FONNTE_TOKEN belum diatur → tombol nomor perusahaan TIDAK digambar. */
  fonnteConfigured: boolean;
  deliveredAt: string | null;
  canMarkDelivered: boolean;
  sendViaCompany: () => Promise<CustomerLinkActionResult<{ detail: string | null }>>;
  markDelivered: () => Promise<CustomerLinkActionResult<{ deliveredAt: string }>>;
}) {
  const router = useRouter();
  const m = useCommonMessages();

  const [copied, setCopied] = useState<"none" | "ok" | "failed">("none");
  const [sendMsg, setSendMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  // Tombol cadangan wa.me SELALU ada kalau nomor pelanggan ada; ia juga
  // otomatis jadi satu-satunya jalur saat Fonnte belum dikonfigurasi atau
  // baru saja gagal (keputusan owner: wa.me adalah cadangan, bukan pengganti).
  const [sending, setSending] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [markMsg, setMarkMsg] = useState<string | null>(null);

  const waHref = customerPhone
    ? `https://wa.me/${customerPhone}?text=${encodeURIComponent(waMessage)}`
    : null;

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("ok");
    } catch {
      // Konteks tidak aman / izin ditolak. Katakan apa adanya dan biarkan
      // kotak teks di atas dipakai manual — jangan diam-diam "berhasil".
      setCopied("failed");
    }
  }

  async function onSendCompany() {
    if (sending) return;
    setSending(true);
    setSendMsg(null);
    const out = await submitSafely({
      kind: "update",
      run: sendViaCompany,
      messages: { common: m },
      buttonLabel: m.custLinkSendCompanyCta,
    });
    setSending(false);
    if (out.status !== "ok") {
      setSendMsg({ tone: "bad", text: out.message });
      return;
    }
    const res = out.result;
    if ("error" in res) {
      setSendMsg({ tone: "bad", text: res.error.message });
      return;
    }
    setSendMsg({ tone: "ok", text: m.custLinkSentCompanyMsg });
  }

  async function onConfirmDelivered() {
    if (!begin()) return;
    setMarkMsg(null);
    const out = await submitSafely({
      kind: "update",
      run: markDelivered,
      messages: { common: m },
      buttonLabel: m.markDeliveredConfirmCta,
    });
    if (out.status !== "ok") {
      release();
      setMarkMsg(out.message);
      return;
    }
    const res = out.result;
    if ("error" in res) {
      release();
      setMarkMsg(res.error.message);
      return;
    }
    // Tombol dibiarkan nonaktif sampai halaman disegarkan: keadaan yang
    // ditampilkan datang dari query server, bukan dari tebakan client
    // (LESSONS #7).
    setModalOpen(false);
    router.refresh();
  }

  return (
    <div style={{ marginTop: 18 }}>
      <h3 className="sectiontitle">{m.custLinkTitle}</h3>
      <p className="small muted" style={{ marginTop: 0 }}>
        {m.custLinkHint}
      </p>

      <div className="field">
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
      </div>

      <div className="btnrow-inline">
        <button type="button" className="btn sm" onClick={onCopy}>
          {m.custLinkCopyCta}
        </button>

        {fonnteConfigured && waHref && (
          <button type="button" className="btn sm primary" disabled={sending} onClick={onSendCompany}>
            {sending ? m.custLinkSendingMsg : m.custLinkSendCompanyCta}
          </button>
        )}

        {waHref && (
          <a
            className={`btn sm${fonnteConfigured ? "" : " primary"}`}
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            {m.custLinkSendSelfCta}
          </a>
        )}
      </div>

      {!waHref && <p className="small muted">{m.custLinkNoPhoneMsg}</p>}
      {copied === "ok" && <div className="banner ok">{m.custLinkCopiedMsg}</div>}
      {copied === "failed" && <div className="banner warn">{m.custLinkCopyFailedMsg}</div>}
      {sendMsg && <div className={`banner ${sendMsg.tone}`}>{sendMsg.text}</div>}

      {deliveredAt ? (
        <div className="banner ok" style={{ marginTop: 12 }}>
          {m.markDeliveredDoneLabel} — {formatDateTimeWIB(deliveredAt, m.dateLocale)} WIB
        </div>
      ) : (
        canMarkDelivered && (
          <div className="btnrow-inline" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                reset();
                setMarkMsg(null);
                setModalOpen(true);
              }}
            >
              {m.markDeliveredCta}
            </button>
          </div>
        )
      )}

      {modalOpen && (
        <div
          className="overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              reset();
              setModalOpen(false);
            }
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{m.markDeliveredModalTitle}</h2>
            <p className="small muted" style={{ marginBottom: 14 }}>
              {m.markDeliveredDesc
                .replace("{orderNumber}", orderNumber)
                .replace("{customer}", customerName)}
            </p>
            {markMsg && <div className="banner warn">{markMsg}</div>}
            <div className="btnrow">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  reset();
                  setModalOpen(false);
                }}
              >
                {m.cancel}
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={submitting}
                onClick={onConfirmDelivered}
              >
                {submitting ? m.markDeliveredWorkingCta : m.markDeliveredConfirmCta}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
