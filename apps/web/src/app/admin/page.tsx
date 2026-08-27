import { RequireAdmin } from "@/features/auth/route-boundaries";
import { AdminDashboard } from "@/features/admin";

export default function AdminPage() { return <RequireAdmin><AdminDashboard /></RequireAdmin>; }
