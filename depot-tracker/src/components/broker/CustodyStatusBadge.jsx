import { Badge } from "../ui/Badge";

export function CustodyStatusBadge({ row, brokers }) {
  if (!row || row.status === "settled") return null;
  const target = brokers.find((b) => b.id === row.target_broker_id)?.name ?? row.target_broker_id;
  if (row.status === "pending_transfer") {
    return <Badge variant="warn">Übertrag läuft{target ? ` → ${target}` : ""}</Badge>;
  }
  if (row.status === "in_transit") {
    return <Badge variant="warn">unterwegs</Badge>;
  }
  return null;
}
