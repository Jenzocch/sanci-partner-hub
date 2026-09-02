import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";
import { getCabangMessages } from "@/lib/i18n";
import LocaleSwitcher from "@/lib/i18n/locale-switcher";
import SignOutButton from "./sign-out-button";

export const dynamic = "force-dynamic";

type Branch = { id: string; name: string; address: string; city: string | null };

export default async function CabangHome() {
  const m = await getCabangMessages();
  const supabase = await createClient();
  // Tanpa auth.getUser(): batas keamanannya RLS, bukan cek halaman (LESSONS
  // #5) — untuk pengunjung yang belum login, pembacaan partner_users ini
  // pulang kosong, jadi `!pu` → redirect sama persis; middleware sudah
  // menyegarkan sesi tiap navigasi. Satu perjalanan bolak-balik ke Supabase
  // Auth hilang dari setiap render. Beda error vs kosong TETAP dijaga
  // (LESSONS #10): error DB → kartu error, hanya hasil kosong di-redirect.
  //
  // partner_access_policies TIDAK bisa di-embed langsung dari partner_users —
  // keduanya tidak punya FK satu sama lain (sama-sama menunjuk partners), jadi
  // PostgREST menolak querynya saat runtime. Ambil lewat query terpisah.
  const { data: pu, error } = await supabase
    .from("partner_users")
    .select("id, name, branch_id, partner_id, partners:partner_id(id, name, code)")
    .maybeSingle();

  if (error) {
    return (
      <main className="page">
        <div className="card">
          <div className="err">{m.cabang.errAccountLoad}</div>
        </div>
      </main>
    );
  }
  if (!pu) redirect("/");
  // Tampilan saja — bukan keputusan akses (LESSONS #5); gagal = tanpa email.
  const { data: claimsData } = await supabase.auth.getClaims();
  const signedInEmail = typeof claimsData?.claims.email === "string" ? claimsData.claims.email : null;

  // Embed bisa null bila RLS menyembunyikan baris partner (mis. partner_user
  // berstatus DISABLED membuat fn_pu_partner() null) — jangan crash.
  const partner = pu.partners as unknown as { id: string; name: string; code: string } | null;
  if (!partner) {
    return (
      <main className="pwrap">
        <div className="card">
          <div className="err">{m.cabang.errPartnerLoad}</div>
        </div>
      </main>
    );
  }

  // Tiga pembacaan di bawah tidak saling bergantung (masing-masing hanya
  // butuh pu.partner_id yang sudah ada / difilter RLS), jadi dijalankan
  // dalam SATU gelombang, bukan berurutan:
  //   - kebijakan akses partner ini;
  //   - RLS pada partner_branches sudah otomatis membatasi baris yang
  //     kembali — tidak perlu logika tambahan untuk boundary partner/branch;
  //   - probe sanci_catalog_access: entri "Produk SANCI" tetap tampil walau
  //     katalog belum dibuka SANCI untuk toko ini (baru begitu staf tahu
  //     fiturnya ada dan bisa minta dibuka) — hanya disembunyikan kalau
  //     migrasi tabelnya sendiri belum jalan (42P01).
  const [{ data: pol }, { data: visibleBranches }, { error: catalogTableError }] = await Promise.all([
    supabase
      .from("partner_access_policies")
      .select("visibility_scope, edit_scope")
      .eq("partner_id", pu.partner_id)
      .maybeSingle(),
    supabase
      .from("partner_branches")
      .select("id, name, address, city")
      .order("name"),
    supabase
      .from("sanci_catalog_access")
      .select("partner_id")
      .limit(1),
  ]);

  const myBranch = (visibleBranches ?? []).find((b: Branch) => b.id === pu.branch_id);
  const otherBranches = (visibleBranches ?? []).filter((b: Branch) => b.id !== pu.branch_id);
  const editAll = pol?.edit_scope === "PARTNER_ALL_BRANCHES";
  const produkVisible = !(catalogTableError && isMissingTableError(catalogTableError));

  return (
    <main className="pwrap">
      <div className="idcard">
        <div className="logos">
          <span className="logo">{partner.code}</span>
          <span className="x">×</span>
          <span className="sanci serif">SANCI</span>
        </div>
        <h2>{partner.name}</h2>
        {myBranch && (
          <>
            <div className="br">{m.cabang.homeBranchLabel.replace("{name}", myBranch.name)}</div>
            <div className="addr">
              {myBranch.address}
              {myBranch.city ? `, ${myBranch.city}` : ""}
            </div>
          </>
        )}
        {/* Siapa yang login (owner 2026-09-02). Nama dari partner_users;
            email dari klaim JWT (getClaims — verifikasi lokal, tanpa
            perjalanan ke server Auth) supaya dua staf bernama sama tetap
            bisa dibedakan. `role` SENGAJA tidak ditampilkan: nilainya selalu
            'BRANCH_USER' (0001), bukan informasi. */}
        <div className="who">
          {m.common.signedInAs} {pu.name}
          {signedInEmail ? ` · ${signedInEmail}` : ""}
        </div>
      </div>

      {/* Urutan menu mengikuti logika kerja toko: buat pesanan dulu (aksi
          utama), lalu daftar pesanan, pelanggan, staf, baru pengaturan. */}
      <Link href="/cabang/pesanan/baru" className="biglink cta">
        <span className="lbl">{m.cabang.homeNewOrder}</span>
        <span className="arrow" aria-hidden="true">&rsaquo;</span>
      </Link>

      <div className="ilist">
        <Link href="/cabang/pesanan" className="biglink">
          <span className="lbl">{m.cabang.homeOrders}</span>
          <span className="arrow" aria-hidden="true">&rsaquo;</span>
        </Link>
        <Link href="/cabang/pelanggan" className="biglink">
          <span className="lbl">{m.cabang.homeCustomers}</span>
          <span className="arrow" aria-hidden="true">&rsaquo;</span>
        </Link>
        {/* Kalkulator DI ATAS Produk (arahan owner 2026-08-24, logika
            pengguna): staf membuka kalkulator SAAT pelanggan di depannya —
            langkah menuju pesanan; katalog produk lebih ke rujukan santai.
            Sama gerbang dengan Produk SANCI (baris sanci_catalog_access ada,
            terlepas dari enabled) — kalkulator pakai katalog yang sama,
            halamannya sendiri yang menjelaskan kalau belum dibuka. */}
        {produkVisible && (
          <Link href="/cabang/kalkulator" className="biglink">
            <span className="lbl">{m.cabang.homeCalculator}</span>
            <span className="arrow" aria-hidden="true">&rsaquo;</span>
          </Link>
        )}
        {/* Harga Normal DI BAWAH Kalkulator (rencana 0021 — entry di bawah
            Kalkulator): daftar harga adalah alat pendukung penawaran.
            Gerbang tampil sama dengan Kalkulator/Produk; halamannya sendiri
            yang menjelaskan kalau katalog belum dibuka. */}
        {produkVisible && (
          <Link href="/cabang/harga" className="biglink">
            <span className="lbl">{m.cabang.homePriceList}</span>
            <span className="arrow" aria-hidden="true">&rsaquo;</span>
          </Link>
        )}
        {produkVisible && (
          <Link href="/cabang/produk" className="biglink">
            <span className="lbl">{m.cabang.homeProducts}</span>
            <span className="arrow" aria-hidden="true">&rsaquo;</span>
          </Link>
        )}
        {myBranch && (
          <Link href={`/cabang/staff/${myBranch.id}`} className="biglink">
            <span className="lbl">{m.cabang.homeStaff}</span>
            <span className="arrow" aria-hidden="true">&rsaquo;</span>
          </Link>
        )}
      </div>

      {otherBranches.length > 0 && (
        <>
          <div className="overline">{m.cabang.homeOtherBranches.replace("{name}", partner.name)}</div>
          <div className="ilist">
            {otherBranches.map((b: Branch) => (
              <Link key={b.id} href={`/cabang/staff/${b.id}`} className="biglink">
                <span className="lbl">
                  {b.name}
                  <span className="sublabel">{editAll ? m.cabang.homeAccessViewEdit : m.cabang.homeAccessViewOnly}</span>
                </span>
                <span className="arrow" aria-hidden="true">&rsaquo;</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="ilist">
        <Link href="/cabang/profil" className="biglink">
          <span className="lbl">{m.cabang.homeBranchProfile}</span>
          <span className="arrow" aria-hidden="true">&rsaquo;</span>
        </Link>
        <Link href="/cabang/akun" className="biglink">
          <span className="lbl">{m.cabang.homeMyAccount}</span>
          <span className="arrow" aria-hidden="true">&rsaquo;</span>
        </Link>
        <LocaleSwitcher />
      </div>

      <SignOutButton />

      <p className="footnote">{m.cabang.homeFooterWarehouse}</p>
    </main>
  );
}
