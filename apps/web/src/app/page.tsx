import { LandingPage } from "@/components/marketing/landing-page";
import { MarketingAuthProvider } from "@/components/marketing/marketing-auth";
import { MarketingHeader } from "@/components/marketing/marketing-header";

export default function HomePage() {
  return <MarketingAuthProvider><MarketingHeader /><LandingPage /></MarketingAuthProvider>;
}
