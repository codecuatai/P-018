import { Suspense } from "react";
import { notFound } from "next/navigation";

import { ServiceBrowse } from "@/features/product/service-browse";
import type { ServiceKey } from "@/types";

const services: ServiceKey[] = ["food", "ride", "restaurant", "healthcare"];

export default async function ServiceBrowsePage({ params }: { params: Promise<{ service: string }> }) {
  const { service } = await params;
  if (!services.includes(service as ServiceKey)) notFound();
  return (
    <Suspense fallback={<p className="inline-note">Đang tải dịch vụ…</p>}>
      <ServiceBrowse service={service as ServiceKey} />
    </Suspense>
  );
}
