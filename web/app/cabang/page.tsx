import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";
import SignOutButton from "./sign-out-button";

export const dynamic = "force-dynamic";

type Branch = { id: string; name: string; address: string; city: string | null };

export default async function CabangHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

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
          <div className="err">Data akun gagal dimuat. Muat ulang halaman untuk mencoba lagi.</div>
        </div>
      </main>
    );
  }
  if (!pu) redirect("/");

  // Embed bisa null bila RLS menyembunyikan baris partner (mis. partner_user
  // berstatus DISABLED membuat fn_pu_partner() null) — jangan crash.
  const partner = pu.partners as unknown as { id: string; name: string; code: string } | null;
  if (!partner) {
    return (
      <main className="pwrap">
        <div className="card">
          <div className="err">
            Data partner Anda tidak dapat dimuat. Hubungi SANCI Admin untuk memeriksa pengaturan akun.
          </div>
        </div>
      </main>
    );
  }

  const { data: pol } = await supabase
    .from("partner_access_policies")
    .select("visibility_scope, edit_scope")
    .eq("partner_id", pu.partner_id)
    .maybeSingle();

  // RLS pada partner_branches sudah otomatis membatasi baris yang kembali —
  // tidak perlu logika tambahan untuk boundary partner/branch di sini.
  const { data: visibleBranches } = await supabase
    .from("partner_branches")
    .select("id, name, address, city")
    .order("name");

  const myBranch = (visibleBranches ?? []).find((b: Branch) => b.id === pu.branch_id);
  const otherBranches = (visibleBranches ?? []).filter((b: Branch) => b.id !== pu.branch_id);
  const editAll = pol?.edit_scope === "PARTNER_ALL_BRANCHES";

  // Entri "Produk SANCI" tetap tampil walau katalog belum dibuka SANCI untuk
  // toko ini (baru begitu staf tahu fiturnya ada dan bisa minta dibuka) —
  // hanya disembunyikan kalau migrasi tabelnya sendiri belum jalan (42P01).
  const { error: catalogTableError } = await supabase
    .from("sanci_catalog_access")
    .select("partner_id")
    .limit(1);
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
            <div className="br">Cabang {myBranch.name}</div>
            <div className="addr">
              {myBranch.address}
              {myBranch.city ? `, ${myBranch.city}` : ""}
            </div>
          </>
        )}
      </div>

      {/* Urutan menu mengikuti logika kerja toko: buat pesanan dulu (aksi
          utama), lalu daftar pesanan, pelanggan, staf, baru pengaturan. */}
      <Link href="/cabang/pesanan/baru" className="biglink cta">
        <span className="lbl">+ Pesanan Baru</span>
        <span className="arrow" aria-hidden="true">&rsaquo;</span>
      </Link>

      <div className="ilist">
        <Link href="/cabang/pesanan" className="biglink">
          <span className="lbl">Daftar Pesanan</span>
          <span className="arrow" aria-hidden="true">&rsaquo;</span>
        </Link>
        <Link href="/cabang/pelanggan" className="biglink">
          <span className="lbl">Pelanggan</span>
          <span className="arrow" aria-hidden="true">&rsaquo;</span>
        </Link>
        {produkVisible && (
          <Link href="/cabang/produk" className="biglink">
            <span className="lbl">Produk SANCI</span>
            <span className="arrow" aria-hidden="true">&rsaquo;</span>
          </Link>
        )}
        {myBranch && (
          <Link href={`/cabang/staff/${myBranch.id}`} className="biglink">
            <span className="lbl">Staf</span>
            <span className="arrow" aria-hidden="true">&rsaquo;</span>
          </Link>
        )}
      </div>

      {otherBranches.length > 0 && (
        <>
          <div className="overline">Cabang {partner.name} lainnya</div>
          <div className="ilist">
            {otherBranches.map((b: Branch) => (
              <Link key={b.id} href={`/cabang/staff/${b.id}`} className="biglink">
                <span className="lbl">
                  {b.name}
                  <span className="sublabel">{editAll ? "Lihat + edit" : "Lihat saja"}</span>
                </span>
                <span className="arrow" aria-hidden="true">&rsaquo;</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="ilist">
        <Link href="/cabang/profil" className="biglink">
          <span className="lbl">Profil Cabang</span>
          <span className="arrow" aria-hidden="true">&rsaquo;</span>
        </Link>
        <Link href="/cabang/akun" className="biglink">
          <span className="lbl">Akun Saya</span>
          <span className="arrow" aria-hidden="true">&rsaquo;</span>
        </Link>
      </div>

      <SignOutButton />

      <p className="footnote">
        Gudang dan pengiriman adalah fase berikutnya — sengaja belum ditampilkan.
      </p>
    </main>
  );
}
