"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { createBranch } from "../../actions-branches";

export default function AddBranchButton({ partnerId }: { partnerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const requestId = useRef<string | null>(null);

  function openModal() {
    // Nomor permintaan dipakai ulang bila percobaan sebelumnya belum pasti berhasil.
    if (!requestId.current) requestId.current = crypto.randomUUID();
    reset();
    setErrs({});
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    const fd = new FormData(e.currentTarget);
    const res = await createBranch(partnerId, {
      name: String(fd.get("name") || ""),
      code: String(fd.get("code") || ""),
      address: String(fd.get("address") || ""),
      city: String(fd.get("city") || ""),
      province: String(fd.get("province") || ""),
      contactName: String(fd.get("contact_name") || ""),
      contactPhone: String(fd.get("contact_phone") || ""),
      clientRequestId: requestId.current!,
    });
    if ("error" in res) {
      release();
      setErrs({ [res.error.field || "_form"]: res.error.message });
      return;
    }
    requestId.current = null;
    setOpen(false);
    router.push(`/admin/partners/${partnerId}/branches/${res.data.id}`);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn primary" onClick={openModal}>
        + Tambah Cabang
      </button>
    );
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>Tambah Cabang</h2>
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <form onSubmit={onSubmit}>
          <div className={`field${errs.name ? " invalid" : ""}`}>
            <label htmlFor="ab_name">Nama cabang *</label>
            <input id="ab_name" name="name" type="text" />
            {errs.name && <div className="err-text">{errs.name}</div>}
          </div>
          <div className={`field${errs.code ? " invalid" : ""}`}>
            <label htmlFor="ab_code">Kode cabang *</label>
            <input id="ab_code" name="code" type="text" style={{ textTransform: "uppercase" }} />
            <div className="hint">Unik di dalam partner ini. Partner lain boleh pakai kode yang sama.</div>
            {errs.code && <div className="err-text">{errs.code}</div>}
          </div>
          <div className={`field${errs.address ? " invalid" : ""}`}>
            <label htmlFor="ab_addr">Alamat lengkap *</label>
            <textarea id="ab_addr" name="address" />
            {errs.address && <div className="err-text">{errs.address}</div>}
          </div>
          <div className="field">
            <label htmlFor="ab_city">Kota</label>
            <input id="ab_city" name="city" type="text" />
          </div>
          <div className="field">
            <label htmlFor="ab_prov">Provinsi</label>
            <input id="ab_prov" name="province" type="text" />
          </div>
          <div className="field">
            <label htmlFor="ab_contact">Narahubung</label>
            <input id="ab_contact" name="contact_name" type="text" />
          </div>
          <div className="field">
            <label htmlFor="ab_phone">WhatsApp</label>
            <input id="ab_phone" name="contact_phone" type="tel" inputMode="tel" />
          </div>
          <div className="btnrow">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Batal
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? "Menyimpan…" : "Buat Cabang"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
