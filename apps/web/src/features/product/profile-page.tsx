"use client";

import { CircleUserRound, ShieldCheck } from "lucide-react";

import { useAuth } from "@/providers/auth-provider";

export function ProfilePage() {
  const { user } = useAuth();
  return <section className="account-page" aria-labelledby="profile-title"><header className="section-heading"><div><span className="eyebrow">HỒ SƠ</span><h1 id="profile-title">Thông tin tài khoản</h1><p>Đây là danh tính X-One đang được dùng cho phiên hiện tại.</p></div></header><div className="profile-grid"><article className="profile-identity"><span className="profile-avatar"><CircleUserRound size={34} /></span><span className="eyebrow">X-ONE</span><h2>{user?.full_name || "Tài khoản X-One"}</h2><p>{user?.email}</p><span className="status-badge"><ShieldCheck size={15} /> {user?.status === "active" ? "Đang hoạt động" : "Trạng thái tài khoản"}</span></article><article className="profile-details"><h2>Thông tin hiện có</h2><dl><div><dt>Họ và tên</dt><dd>{user?.full_name || "Chưa có"}</dd></div><div><dt>Email</dt><dd>{user?.email}</dd></div><div><dt>Vai trò</dt><dd>{user?.role === "admin" ? "Quản trị viên" : "Khách hàng"}</dd></div></dl><p className="inline-note">Chỉnh sửa hồ sơ và địa chỉ đã lưu sẽ được bổ sung trong Phase 2.</p></article></div></section>;
}
