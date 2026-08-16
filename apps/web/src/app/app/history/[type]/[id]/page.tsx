import { HistoryDetail } from "@/features/product/history-detail";
import type { HistoryType } from "@/types";

type Props = { params: Promise<{ type: string; id: string }> };
const types: HistoryType[] = ["food_order", "ride_booking", "restaurant_reservation", "healthcare_appointment"];

export default async function HistoryResourcePage({ params }: Props) {
  const { type, id } = await params;
  const safeType = types.includes(type as HistoryType) ? type as HistoryType : "food_order";
  return <HistoryDetail type={safeType} id={decodeURIComponent(id)} />;
}
