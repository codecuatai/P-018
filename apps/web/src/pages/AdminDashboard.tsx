import React, { useEffect, useState } from "react";
import { ApiService } from "../api";
import { AuthUser } from "../types";

interface Props {
  currentUser: AuthUser;
  onLogout: () => void;
}

export const AdminDashboard: React.FC<Props> = ({ currentUser, onLogout }) => {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    ApiService.getBookings()
      .then((data) => {
        setBookings(data || []);
      })
      .catch((err) => console.error("Error loading bookings for Admin:", err))
      .finally(() => setLoading(false));
  }, []);

  const filteredBookings = bookings.filter((b) => {
    if (!filterText) return true;
    const term = filterText.toLowerCase();
    return (
      (b.id && String(b.id).toLowerCase().includes(term)) ||
      (b.serviceType && String(b.serviceType).toLowerCase().includes(term)) ||
      (b.status && String(b.status).toLowerCase().includes(term))
    );
  });

  return (
    <div className="bg-[#051424] text-[#d4e4fa] antialiased flex h-screen overflow-hidden font-['Inter',sans-serif]">
      {/* SideNavBar */}
      <nav className="fixed left-0 top-0 h-full z-40 flex flex-col pt-12 pb-8 w-64 border-r border-white/10 shadow-2xl bg-[#122131]/40 backdrop-blur-2xl">
        <div className="px-6 mb-8">
          <h1 className="font-['Outfit',sans-serif] text-xl font-black text-white tracking-wide">NaviGo AI</h1>
          <div className="mt-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#273647] flex items-center justify-center border border-white/15">
              <span className="material-symbols-outlined text-[#8ed5ff]">shield</span>
            </div>
            <div>
              <div className="font-['Inter',sans-serif] text-sm font-semibold text-[#8ed5ff]">Vai trò: Admin</div>
              <div className="font-['Inter',sans-serif] text-xs text-[#bdc8d1]">{currentUser.fullName}</div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-2 overflow-y-auto mt-4 px-2">
          <a className="flex items-center gap-4 bg-[#38bdf8]/20 text-[#8ed5ff] border-r-4 border-[#8ed5ff] px-4 py-3 rounded-r-lg" href="#">
            <span className="material-symbols-outlined">dashboard</span>
            <span className="font-semibold text-sm">Bảng điều khiển</span>
          </a>
          <a className="flex items-center gap-4 text-[#bdc8d1] px-4 py-3 hover:bg-white/5 hover:text-white transition-colors" href="#">
            <span className="material-symbols-outlined">insights</span>
            <span className="text-sm">Phân tích</span>
          </a>
          <a className="flex items-center gap-4 text-[#bdc8d1] px-4 py-3 hover:bg-white/5 hover:text-white transition-colors" href="#">
            <span className="material-symbols-outlined">assignment_late</span>
            <span className="text-sm">Nhiệm vụ đang xử lý</span>
          </a>
          <a className="flex items-center gap-4 text-[#bdc8d1] px-4 py-3 hover:bg-white/5 hover:text-white transition-colors" href="#">
            <span className="material-symbols-outlined">hourglass_empty</span>
            <span className="text-sm">Hàng đợi</span>
          </a>
          <a className="flex items-center gap-4 text-[#bdc8d1] px-4 py-3 hover:bg-white/5 hover:text-white transition-colors" href="#">
            <span className="material-symbols-outlined">inventory_2</span>
            <span className="text-sm">Kho</span>
          </a>
        </div>

        <div className="mt-auto px-4 flex flex-col gap-2">
          <button className="w-full py-2 bg-[#38bdf8]/10 border border-[#38bdf8]/30 text-[#8ed5ff] rounded-lg text-sm hover:bg-[#38bdf8]/20 transition-colors">Yêu cầu hỗ trợ</button>
          <div className="h-px bg-white/10 my-2 w-full"></div>
          <a className="flex items-center gap-4 text-[#bdc8d1] px-4 py-2 hover:bg-white/5 hover:text-white transition-colors" href="#">
            <span className="material-symbols-outlined">help</span>
            <span className="text-sm">Trợ giúp</span>
          </a>
          <button onClick={onLogout} className="flex w-full items-center gap-4 text-[#bdc8d1] px-4 py-2 hover:bg-white/5 hover:text-white transition-colors text-left">
            <span className="material-symbols-outlined">logout</span>
            <span className="text-sm">Đăng xuất</span>
          </button>
        </div>
      </nav>

      {/* Main Content Canvas */}
      <main className="ml-64 flex-1 h-full overflow-y-auto p-12">
        <header className="mb-6 flex justify-between items-center">
          <div>
            <h2 className="font-['Outfit',sans-serif] text-[32px] leading-10 font-bold text-white text-glow">Chỉ số điều hành</h2>
            <p className="text-lg text-[#bdc8d1] mt-1">Tổng quan hiệu suất nền tảng theo thời gian thực.</p>
          </div>
          <div className="flex gap-4">
            <button className="w-10 h-10 rounded-full glass-pane flex items-center justify-center text-white hover:text-[#8ed5ff] transition-colors">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="w-10 h-10 rounded-full glass-pane flex items-center justify-center text-white hover:text-[#8ed5ff] transition-colors">
              <span className="material-symbols-outlined">settings</span>
            </button>
          </div>
        </header>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          <div className="glass-pane rounded-xl p-6 flex flex-col gap-1 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-[#8ed5ff]/10 rounded-full blur-xl group-hover:bg-[#8ed5ff]/20 transition-all duration-500"></div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-[#bdc8d1]">Tổng doanh thu</span>
              <span className="material-symbols-outlined text-[#8ed5ff]">payments</span>
            </div>
            <div className="font-['Outfit',sans-serif] text-2xl font-semibold text-white mt-2">$24M</div>
            <div className="text-xs text-[#8ed5ff] flex items-center gap-1 mt-1">
              <span className="material-symbols-outlined text-[16px]">trending_up</span> +12% tuần này
            </div>
          </div>

          <div className="glass-pane rounded-xl p-6 flex flex-col gap-1 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-[#8ed5ff]/10 rounded-full blur-xl group-hover:bg-[#8ed5ff]/20 transition-all duration-500"></div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-[#bdc8d1]">Đơn hàng hoàn thành</span>
              <span className="material-symbols-outlined text-[#8ed5ff]">check_circle</span>
            </div>
            <div className="font-['Outfit',sans-serif] text-2xl font-semibold text-white mt-2">142K</div>
            <div className="text-xs text-[#8ed5ff] flex items-center gap-1 mt-1">
              <span className="material-symbols-outlined text-[16px]">trending_up</span> +5% tuần này
            </div>
          </div>

          <div className="glass-pane rounded-xl p-6 flex flex-col gap-1 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-[#8ed5ff]/10 rounded-full blur-xl group-hover:bg-[#8ed5ff]/20 transition-all duration-500"></div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-[#bdc8d1]">SLA hệ thống</span>
              <span className="material-symbols-outlined text-[#8ed5ff]">speed</span>
            </div>
            <div className="font-['Outfit',sans-serif] text-2xl font-semibold text-white mt-2">99.9%</div>
            <div className="text-xs text-[#bdc8d1] flex items-center gap-1 mt-1">
              Mục tiêu: 99.99%
            </div>
          </div>

          <div className="glass-pane rounded-xl p-6 flex flex-col gap-1 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-[#ffb4ab]/10 rounded-full blur-xl group-hover:bg-[#ffb4ab]/20 transition-all duration-500"></div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-[#bdc8d1]">Tỷ lệ hủy</span>
              <span className="material-symbols-outlined text-[#ffb4ab]">cancel</span>
            </div>
            <div className="font-['Outfit',sans-serif] text-2xl font-semibold text-white mt-2">1.2%</div>
            <div className="text-xs text-[#ffb4ab] flex items-center gap-1 mt-1">
              <span className="material-symbols-outlined text-[16px]">trending_down</span> -0.3% tuần này
            </div>
          </div>
        </div>

        {/* Live Bookings Table / Support center */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass-pane rounded-xl p-6 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-['Outfit',sans-serif] text-xl font-semibold text-white">Đặt chỗ trực tiếp</h3>
              <div className="flex gap-2">
                <input
                  className="bg-[#051424]/50 border border-[#3e484f] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#8ed5ff] w-48"
                  placeholder="Lọc..."
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                />
                <button className="bg-[#273647]/50 border border-[#3e484f] rounded-lg px-3 py-1.5 text-sm text-white hover:bg-[#273647] transition-colors flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">filter_list</span> Lọc
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="py-8 text-center text-[#bdc8d1]">Đang tải đặt chỗ...</div>
              ) : filteredBookings.length === 0 ? (
                <div className="py-8 text-center text-[#bdc8d1]">Không tìm thấy đặt chỗ.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-[#bdc8d1] font-semibold text-sm">
                      <th className="py-3 px-2">ID</th>
                      <th className="py-3 px-2">Loại dịch vụ</th>
                      <th className="py-3 px-2">Trạng thái</th>
                      <th className="py-3 px-2">Giá</th>
                      <th className="py-3 px-2 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm text-[#d4e4fa]">
                    {filteredBookings.map((b) => (
                      <tr key={b.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-3 px-2 font-mono">#{b.id?.substring(0, 8)}</td>
                        <td className="py-3 px-2">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#38bdf8]/10 text-[#8ed5ff] text-xs border border-[#38bdf8]/20 capitalize">
                            <span className="material-symbols-outlined text-[14px]">
                              {b.serviceType === "car" ? "local_taxi" : "restaurant"}
                            </span>{" "}
                            {b.serviceType}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <span
                            className={
                              b.status === "completed"
                                ? "text-[#bdc2ff]"
                                : b.status === "pending_payment"
                                ? "text-[#ffb4ab]"
                                : "text-[#8ed5ff]"
                            }
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="py-3 px-2 font-mono">
                          {b.price?.toLocaleString()} {b.currency || "VND"}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <button className="text-[#bdc8d1] hover:text-[#8ed5ff]">
                            <span className="material-symbols-outlined">more_vert</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Support Ticket list */}
          <div className="glass-pane rounded-xl p-6 flex flex-col">
            <h3 className="font-['Outfit',sans-serif] text-xl font-semibold text-white mb-4 flex items-center justify-between">
              Trung tâm hỗ trợ
              <span className="w-2 h-2 bg-[#ffb4ab] rounded-full animate-pulse shadow-[0_0_8px_rgba(255,180,171,0.8)]"></span>
            </h3>
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-2">
              <div className="bg-[#051424]/40 border border-[#ffb4ab]/20 rounded-lg p-3 hover:bg-[#051424]/60 transition-colors cursor-pointer border-l-2 border-l-[#ffb4ab]">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs text-[#ffb4ab] font-bold">SUP-9942</span>
                  <span className="text-xs text-[#bdc8d1]">2 phút trước</span>
                </div>
                <div className="text-sm text-[#d4e4fa] mb-2">Không tìm được tài xế phù hợp - AI hỗ trợ thất bại.</div>
                <button className="w-full py-1.5 bg-[#ffb4ab]/10 text-[#ffb4ab] rounded text-sm hover:bg-[#ffb4ab]/20 transition-colors flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">support_agent</span> Tiếp quản
                </button>
              </div>

              <div className="bg-[#051424]/40 border border-white/5 rounded-lg p-3 hover:bg-[#051424]/60 transition-colors cursor-pointer border-l-2 border-l-[#8ed5ff]">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs text-[#8ed5ff] font-bold">SUP-9938</span>
                  <span className="text-xs text-[#bdc8d1]">15 phút trước</span>
                </div>
                <div className="text-sm text-[#d4e4fa] mb-2">Thanh toán hết thời gian chờ - webhook MoMo đang chờ xử lý.</div>
                <button className="w-full py-1.5 bg-[#38bdf8]/10 text-[#8ed5ff] rounded text-sm hover:bg-[#38bdf8]/20 transition-colors flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">support_agent</span> Kiểm tra
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
