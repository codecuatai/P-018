import { RequireAdmin } from "@/features/auth/route-boundaries";
import { AuthProvider } from "@/providers/auth-provider";

export default function AdminPage() { return <AuthProvider><RequireAdmin /></AuthProvider>; }
