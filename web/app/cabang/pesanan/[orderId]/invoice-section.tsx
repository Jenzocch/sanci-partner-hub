"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { useMessages } from "@/lib/i18n/provider";
import { getOrderInvoiceSignedUrl } from "../actions";
import { INVOICE_ACCEPT, unggahInvoice } from "../invoice-upload";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp"]);

/**
 * Bucket privat — tidak pernah getPublicUrl. Signed URL diminta baru setiap
 * halaman detail dibuka (server component page.tsx sudah memutuskan
 * `hasInvoice`; komponen ini yang mengambil URL bertanda tangan lewat Server
 * Action supaya alamatnya tidak pernah kedaluwarsa diam-diam kalau halaman
 * dibiarkan terbuka lama).
 */
export default function InvoiceSection({
  orderId,
  hasInvoice,
  invoiceExt,
  canManage,
}: {
  orderId: string;
  hasInvoice: boolean;
  invoiceExt: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const m = useMessages();
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">(hasInvoice ? "loading" : "idle");
  const { submitting, begin, release } = useSubmitGuard();
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!hasInvoice) {
      setStatus("idle");
      setUrl(null);
      return;
    }
    setStatus("loading");
    getOrderInvoiceSignedUrl(orderId).then((res) => {
      if (!alive) return;
      if (res.status === "ok") {
        setUrl(res.url);
        setStatus("idle");
      } else {
        setUrl(null);
        setStatus("error");
      }
    });
    return () => {
      alive = false;
    };
  }, [orderId, hasInvoice]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!begin()) return;
    setUploadMsg(null);
    const msg = await unggahInvoice(m, orderId, file);
    release();
    if (msg) {
      setUploadMsg(msg);
      return;
    }
    // Berhasil dicatat server — segarkan halaman supaya hasInvoice/URL baru terbaca ulang.
    router.refresh();
  }

  if (!hasInvoice && !canManage) return null;

  const isImage = invoiceExt ? IMAGE_EXT.has(invoiceExt) : false;

  return (
    <div className="stack" style={{ marginTop: 14 }}>
      <div className="sectiontitle" style={{ marginTop: 0 }}>
        {m.common.invoice}
      </div>
      {uploadMsg && <div className="banner warn">{uploadMsg}</div>}
      {!hasInvoice && <p className="hint">{m.cabang.noInvoiceYet}</p>}
      {hasInvoice && status === "loading" && <p className="hint">{m.cabang.loadingInvoice}</p>}
      {hasInvoice && status === "error" && (
        <p className="hint">{m.cabang.errInvoiceLoadFailed}</p>
      )}
      {hasInvoice && url && isImage && (
        <a href={url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={m.common.invoice}
            style={{
              maxWidth: 220,
              maxHeight: 220,
              borderRadius: "var(--r-md)",
              border: "1px solid var(--line)",
              display: "block",
              objectFit: "contain",
            }}
          />
        </a>
      )}
      {hasInvoice && url && !isImage && (
        <a href={url} target="_blank" rel="noreferrer" className="btn sm">
          {m.cabang.openInvoicePdfCta}
        </a>
      )}
      {canManage && (
        <div className="field" style={{ marginBottom: 0, maxWidth: 360 }}>
          <label htmlFor="invoice_replace">{hasInvoice ? m.cabang.replaceInvoiceLabel : m.cabang.uploadInvoiceLabel}</label>
          <input
            id="invoice_replace"
            type="file"
            accept={INVOICE_ACCEPT}
            onChange={onFileChange}
            disabled={submitting}
          />
          <div className="hint">{m.cabang.invoiceFileHintShort}</div>
        </div>
      )}
    </div>
  );
}
