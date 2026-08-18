import { orderStatusLabel, type OrderStatus } from "@/lib/orders-shared";
import type { Messages } from "@/lib/i18n";

const CLASS: Record<OrderStatus, string> = {
  REGISTERED: "chip ok",
  CANCELLED: "chip neutral",
};

/**
 * Lencana status order, label selalu dari orderStatusLabel (satu sumber
 * kebenaran). Menerima `messages` sebagai prop (bukan useMessages()) karena
 * dipakai dari server component maupun client component.
 */
export default function StatusBadge({
  status,
  messages,
}: {
  status: OrderStatus;
  messages: Messages;
}) {
  return (
    <span className={CLASS[status] ?? "chip ok"}>
      {orderStatusLabel(messages, status)}
    </span>
  );
}
