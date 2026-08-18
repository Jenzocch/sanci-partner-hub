import OfflineCard from "./offline-card";

// Tetap statis: service worker menyimpan halaman ini saat install dan
// menyajikannya tanpa server sama sekali. Teksnya dipilih di browser —
// lihat offline-card.tsx.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="authwrap">
      <OfflineCard />
    </main>
  );
}
