import { CircleCheck, CircleUserRound, LogOut, ShieldCheck } from "lucide-react";
import type { AuthUser } from "../types";

interface ProfileSettingsProps {
  user: AuthUser;
  onLogout: () => void;
}

export function ProfileSettings({ user, onLogout }: ProfileSettingsProps) {
  return (
    <section className="account-page" aria-labelledby="account-title">
      <div className="section-heading"><div><span className="eyebrow">TÀI KHOẢN</span><h1 id="account-title">Danh tính và phiên đăng nhập</h1><p>Thông tin dưới đây lấy từ Gateway. X-One không dùng dữ liệu local làm trạng thái đặt dịch vụ.</p></div></div>
      <div className="account-grid">
        <article className="account-card account-identity-card">
          <div className="large-avatar"><CircleUserRound size={30} /></div>
          <span className="eyebrow">IDENTITY</span>
          <h2>{user.email}</h2>
          <p>Người dùng đã xác thực qua API Gateway.</p>
          <div className="account-status"><CircleCheck size={16} /> Phiên đang hoạt động</div>
        </article>
        <article className="account-card">
          <div className="account-card-heading"><ShieldCheck size={18} /><h2>Thông tin Gateway</h2></div>
          <dl className="account-details"><div><dt>User ID</dt><dd>{user.sub}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Vai trò</dt><dd>{user.role}</dd></div><div><dt>Trạng thái</dt><dd>Đã xác thực</dd></div></dl>
          <p className="account-note">Token chỉ nằm trong bộ nhớ phiên tab và được xóa khi đăng xuất hoặc khi Gateway trả về 401.</p>
          <button className="button button-danger" type="button" onClick={onLogout}><LogOut size={16} /> Đăng xuất</button>
        </article>
      </div>
    </section>
  );
}
