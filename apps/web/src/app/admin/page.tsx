import { RequireAdmin } from "@/features/auth/route-boundaries";
import { AdminDashboard } from "@/features/admin/admin-dashboard";

export default function AdminPage() { return <RequireAdmin><AdminDashboard /></RequireAdmin>; }
