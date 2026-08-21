import { ORDER_STATUS_CHIP, orderStatusLabel, type OrderStatus } from "@/lib/orders-shared";
import type { CabangMessages } from "@/lib/i18n";

/**
 * Lencana status order, label selalu dari orderStatusLabel (satu sumber
 * kebenaran). Menerima `messages` sebagai prop (bukan useCabangMessages()) karena
 * dipakai dari server component maupun client component.
 */
export default function StatusBadge({
  status,
  messages,
}: {
  status: OrderStatus;
  messages: CabangMessages;
}) {
  return (
    <span className={ORDER_STATUS_CHIP[status] ?? "chip ok"}>
      {orderStatusLabel(messages, status)}
    </span>
  );
}
