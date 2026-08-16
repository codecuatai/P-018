import { notFound } from "next/navigation";

import { ServiceBrowse } from "@/features/product/service-browse";
import type { ServiceKey } from "@/types";

const services: ServiceKey[] = ["food", "ride", "restaurant", "healthcare"];

export default async function ServiceBrowsePage({ params }: { params: Promise<{ service: string }> }) {
  const { service } = await params;
  if (!services.includes(service as ServiceKey)) notFound();
  return <ServiceBrowse service={service as ServiceKey} />;
}
