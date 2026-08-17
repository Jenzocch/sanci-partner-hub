import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/orders-shared";

const CLASS: Record<OrderStatus, string> = {
  REGISTERED: "chip ok",
  CANCELLED: "chip neutral",
};

/** Lencana status order, label selalu dari ORDER_STATUS_LABEL (satu sumber kebenaran). */
export default function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={CLASS[status] ?? "chip ok"}>
      {ORDER_STATUS_LABEL[status] ?? status}
    </span>
  );
}
