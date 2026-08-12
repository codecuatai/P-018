import { RequireAdmin } from "@/features/auth/route-boundaries";

export default function AdminPage() { return <RequireAdmin />; }
