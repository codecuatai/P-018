import { LandingPage } from "@/components/marketing/landing-page";
import { MarketingAuthProvider } from "@/components/marketing/marketing-auth";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { AuthProvider } from "@/providers/auth-provider";

export default function HomePage() {
  return <AuthProvider><MarketingAuthProvider><MarketingHeader /><LandingPage /></MarketingAuthProvider></AuthProvider>;
}
