import React, { useEffect, useState } from "react";
import { ApiService } from "../api";
import { AuthUser } from "../types";

interface Props {
  currentUser: AuthUser;
  onLogout: () => void;
}

export const ProviderDashboard: React.FC<Props> = ({ currentUser, onLogout }) => {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ApiService.getBookings()
      .then((data) => {
        // In a real app, we would only show bookings dispatched to this provider partner
        setBookings(data || []);
      })
      .catch((err) => console.error("Error loading provider bookings:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-[#051424] text-[#d4e4fa] antialiased overflow-hidden flex h-screen font-['Inter',sans-serif]">
      {/* SideNavBar */}
      <aside className="hidden md:flex bg-[#122131]/40 backdrop-blur-2xl text-[#8ed5ff] fixed left-0 top-0 h-full z-40 flex-col pt-12 pb-8 w-64 border-r border-white/10 shadow-2xl">
        <div className="px-6 mb-8 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#273647] flex items-center justify-center border border-[#8ed5ff]/30">
            <span className="material-symbols-outlined text-[#8ed5ff] text-[28px]">store</span>
          </div>
          <div>
            <p className="font-['Outfit',sans-serif] text-sm font-black text-white">Vai trò: Provider</p>
            <p className="text-xs text-[#bdc8d1]">{currentUser.fullName}</p>
          </div>
        </div>
        <nav className="flex-grow px-4 space-y-2">
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
        </nav>
        <div className="px-6 mt-auto space-y-4">
          <button className="w-full py-2 bg-[#2c3a4c]/50 border border-white/10 rounded-lg hover:bg-[#38bdf8]/20 text-[#8ed5ff] transition-colors flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-sm">support_agent</span>
            Yêu cầu hỗ trợ
          </button>
          <div className="flex flex-col gap-2 pt-4 border-t border-white/10">
            <a className="flex items-center gap-4 text-[#bdc8d1] px-2 py-2 hover:text-white transition-colors text-sm" href="#">
              <span className="material-symbols-outlined text-[20px]">help</span> Trợ giúp
            </a>
            <button onClick={onLogout} className="flex items-center gap-4 text-[#bdc8d1] px-2 py-2 hover:text-[#ffb4ab] transition-colors text-sm text-left w-full">
              <span className="material-symbols-outlined text-[20px]">logout</span> Đăng xuất
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Canvas */}
      <main className="flex-1 md:ml-64 pt-24 md:pt-8 p-6 md:p-12 overflow-y-auto h-full bg-gradient-to-br from-[#0b0f19]/95 to-[#051424]/98">
        <header className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="font-['Outfit',sans-serif] text-2xl md:text-[32px] leading-10 font-bold text-white text-glow">Tổng quan bảng điều khiển</h1>
            <p className="text-sm md:text-lg text-[#bdc8d1] mt-2">Chào mừng trở lại. Đây là trạng thái điều phối dịch vụ hiện tại của bạn.</p>
          </div>
          <div className="hidden md:flex gap-4">
            <button className="glass-pane px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-[#38bdf8]/10 transition-colors">
              <span className="material-symbols-outlined">filter_list</span> Lọc
            </button>
          </div>
        </header>

        {/* Earnings Summary Bento Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="glass-pane rounded-xl p-6 flex flex-col justify-between h-40">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-semibold uppercase text-[#bdc8d1]">Thu nhập hằng ngày</h3>
              <span className="material-symbols-outlined text-[#8ed5ff]">account_balance_wallet</span>
            </div>
            <div>
              <div className="font-['Outfit',sans-serif] text-[32px] leading-10 text-[#8ed5ff] font-bold">$428.50</div>
              <p className="text-xs text-[#bdc8d1] mt-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-emerald-400 text-sm">trending_up</span> +12% so với hôm qua
              </p>
            </div>
          </div>
          <div className="glass-pane rounded-xl p-6 flex flex-col justify-between h-40">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-semibold uppercase text-[#bdc8d1]">Hiệu quả điều phối</h3>
              <span className="material-symbols-outlined text-[#8ed5ff]">speed</span>
            </div>
            <div>
              <div className="font-['Outfit',sans-serif] text-[32px] leading-10 text-[#8ed5ff] font-bold">94%</div>
              <p className="text-xs text-[#bdc8d1] mt-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-[#8ed5ff] text-sm">check_circle</span> Mục tiêu: &gt;95%
              </p>
            </div>
          </div>
          <div className="glass-pane rounded-xl p-6 flex flex-col justify-between h-40">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-semibold uppercase text-[#bdc8d1]">Tổng số chuyến giao</h3>
              <span className="material-symbols-outlined text-[#8ed5ff]">local_shipping</span>
            </div>
            <div>
              <div className="font-['Outfit',sans-serif] text-[32px] leading-10 text-[#8ed5ff] font-bold">28</div>
              <p className="text-xs text-[#bdc8d1] mt-2">Đang hoạt động: 3 chuyến đang trên đường</p>
            </div>
          </div>
        </section>

        {/* Live Active Dispatch Feed */}
        <section className="glass-pane rounded-xl p-6">
          <h3 className="font-['Outfit',sans-serif] text-xl font-bold text-white mb-4">Lệnh điều phối đang chạy</h3>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-8 text-center text-[#bdc8d1]">Đang tải lệnh điều phối...</div>
            ) : bookings.length === 0 ? (
              <div className="py-8 text-center text-[#bdc8d1]">Không có lệnh điều phối đang hoạt động.</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-[#bdc8d1] font-semibold text-sm">
                    <th className="py-3 px-2">Mã đơn hàng</th>
                    <th className="py-3 px-2">Loại dịch vụ</th>
                    <th className="py-3 px-2">Chi tiết</th>
                    <th className="py-3 px-2">Trạng thái</th>
                    <th className="py-3 px-2 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-[#d4e4fa]">
                  {bookings.map((b) => (
                    <tr key={b.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-3 px-2 font-mono">#{b.id?.substring(0, 8)}</td>
                      <td className="py-3 px-2">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#38bdf8]/10 text-[#8ed5ff] text-xs border border-[#38bdf8]/20 capitalize">
                          {b.serviceType}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        {b.serviceType === "car" ? "Chuyến xe đón khách" : "Giao đồ ăn"}
                      </td>
                      <td className="py-3 px-2 text-[#8ed5ff]">{b.status}</td>
                      <td className="py-3 px-2 text-right">
                        <button className="px-3 py-1 bg-[#38bdf8]/20 text-[#8ed5ff] hover:bg-[#38bdf8]/30 rounded text-xs font-semibold transition-colors">
                          Hoàn tất điều phối
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
