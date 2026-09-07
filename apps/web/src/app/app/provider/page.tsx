import { RequireProvider } from "@/features/auth/route-boundaries";
import { ProviderPortal } from "@/features/provider/provider-portal";

export default function ProviderPage() {
  return (
    <RequireProvider>
      <ProviderPortal />
    </RequireProvider>
  );
}
