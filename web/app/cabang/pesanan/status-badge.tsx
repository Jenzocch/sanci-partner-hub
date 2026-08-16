import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/orders-shared";

const STYLE: Record<OrderStatus, { background: string; color: string }> = {
  REGISTERED: { background: "var(--ok-bg)", color: "var(--ok)" },
  CANCELLED: { background: "var(--off-bg)", color: "var(--off)" },
};

/** Lencana status order, label selalu dari ORDER_STATUS_LABEL (satu sumber kebenaran). */
export default function StatusBadge({ status }: { status: OrderStatus }) {
  const style = STYLE[status] ?? STYLE.REGISTERED;
  return (
    <span className="chip" style={style}>
      {ORDER_STATUS_LABEL[status] ?? status}
    </span>
  );
}
