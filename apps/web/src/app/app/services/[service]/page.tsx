import { notFound } from "next/navigation";

import { ServiceBrowse } from "@/features/product/service-browse";
import type { ServiceKey } from "@/types";

const services: ServiceKey[] = ["food", "ride", "restaurant", "healthcare"];

export default async function ServiceBrowsePage({ params, searchParams }: { params: Promise<{ service: string }>; searchParams: Promise<{ appointment_id?: string }> }) {
  const { service } = await params;
  const query = await searchParams;
  if (!services.includes(service as ServiceKey)) notFound();
  return <ServiceBrowse service={service as ServiceKey} resumeAppointmentId={service === "healthcare" ? query.appointment_id : undefined} />;
}
