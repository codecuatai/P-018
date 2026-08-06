import React, { useState } from "react";
import { AuthUser } from "../types";

interface Props {
  currentUser: AuthUser;
  onLogout: () => void;
}

export const OperatorDashboard: React.FC<Props> = ({ currentUser, onLogout }) => {
  const [activeTab, setActiveTab] = useState<"tasks" | "queue" | "inventory">("tasks");
  const [selectedTicket, setSelectedTicket] = useState<any>({
    id: "SUP-9942",
    user: "Nguyễn Văn A",
    issue: "Không tìm được tài xế phù hợp - AI hỗ trợ thất bại.",
    time: "2 phút trước",
    status: "pending",
    details: "Khách hàng đặt xe từ Quận 1 đi Quận 7. Hệ thống AI tìm kiếm tài xế tự động thất bại sau 3 lần thử lại. Cần nhân viên vận hành chỉ định tài xế thủ công."
  });

  return (
    <div className="bg-[#0b0f19] min-h-screen flex text-[#d4e4fa] font-['Inter',sans-serif] overflow-hidden">
      {/* SideNavBar */}
      <nav className="hidden md:flex bg-[#122131]/40 backdrop-blur-2xl text-[#8ed5ff] h-screen w-64 border-r border-white/10 shadow-2xl fixed flex-col pt-12 pb-8 z-40">
        {/* Header */}
        <div className="px-6 mb-8 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#273647] flex items-center justify-center border border-[#8ed5ff]/30">
            <span className="material-symbols-outlined text-[#8ed5ff] text-[28px]">support_agent</span>
          </div>
          <div>
            <h2 className="font-['Outfit',sans-serif] text-sm font-black text-white">Vai trò: Operator</h2>
            <p className="text-xs text-[#bdc8d1]">Nhân viên hỗ trợ trực tiếp</p>
          </div>
        </div>
        {/* Navigation Links */}
        <div className="flex flex-col space-y-2 flex-grow overflow-y-auto px-2">
          <button
            onClick={() => setActiveTab("tasks")}
            className={`flex items-center gap-4 px-4 py-3 rounded-r-lg text-left transition-transform hover:translate-x-1 ${
              activeTab === "tasks" ? "bg-[#38bdf8]/20 text-[#8ed5ff] border-r-4 border-[#8ed5ff]" : "text-[#bdc8d1] hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="material-symbols-outlined">assignment_late</span>
            <span className="font-semibold text-sm">Nhiệm vụ đang xử lý</span>
          </button>
          <button
            onClick={() => setActiveTab("queue")}
            className={`flex items-center gap-4 px-4 py-3 rounded-r-lg text-left transition-transform hover:translate-x-1 ${
              activeTab === "queue" ? "bg-[#38bdf8]/20 text-[#8ed5ff] border-r-4 border-[#8ed5ff]" : "text-[#bdc8d1] hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="material-symbols-outlined">hourglass_empty</span>
            <span className="font-semibold text-sm">Hàng đợi</span>
          </button>
          <button
            onClick={() => setActiveTab("inventory")}
            className={`flex items-center gap-4 px-4 py-3 rounded-r-lg text-left transition-transform hover:translate-x-1 ${
              activeTab === "inventory" ? "bg-[#38bdf8]/20 text-[#8ed5ff] border-r-4 border-[#8ed5ff]" : "text-[#bdc8d1] hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="material-symbols-outlined">inventory_2</span>
            <span className="font-semibold text-sm">Kho</span>
          </button>
        </div>
        {/* Footer Actions */}
        <div className="px-6 mt-auto flex flex-col space-y-4">
          <button className="w-full py-2 px-4 rounded-lg bg-[#2c3a4c]/50 border border-[#87929a]/30 text-white hover:bg-[#2c3a4c] hover:text-[#8ed5ff] transition-all duration-300 flex justify-center items-center gap-2">
            Yêu cầu hỗ trợ
          </button>
          <div className="flex justify-between text-[#bdc8d1]">
            <button className="hover:text-[#8ed5ff] transition-colors flex items-center gap-1"><span className="material-symbols-outlined text-sm">help</span> Trợ giúp</button>
            <button onClick={onLogout} className="hover:text-[#ffb4ab] transition-colors flex items-center gap-1"><span className="material-symbols-outlined text-sm">logout</span> Đăng xuất</button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 ml-0 md:ml-64 flex flex-col h-screen relative">
        {/* TopNavBar */}
        <header className="bg-[#051424]/60 backdrop-blur-xl border-b border-white/10 shadow-md fixed top-0 w-full md:w-[calc(100%-16rem)] z-50 flex justify-between items-center px-6 h-20">
          <div className="flex items-center gap-4">
            <h1 className="font-['Outfit',sans-serif] text-xl font-bold text-[#8ed5ff] md:hidden">NaviGo AI</h1>
            <h1 className="font-['Outfit',sans-serif] text-xl font-bold text-[#8ed5ff] hidden md:block">Trung tâm điều hành Operator</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex bg-[#2c3a4c]/50 border border-[#87929a]/30 rounded-full px-4 py-1.5 items-center gap-2 mr-4">
              <span className="w-2 h-2 rounded-full bg-[#06b6d4] shadow-[0_0_8px_#06b6d4] animate-pulse"></span>
              <span className="text-xs text-[#bdc8d1] uppercase tracking-wider">Hệ thống trực tuyến</span>
            </div>
            <button className="p-2 rounded-full text-[#bdc8d1] hover:bg-white/5 hover:text-white transition-all active:scale-95">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="p-2 rounded-full text-[#bdc8d1] hover:bg-white/5 hover:text-white transition-all active:scale-95">
              <span className="material-symbols-outlined">settings</span>
            </button>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-y-auto pt-24 pb-8 px-4 md:px-8 bg-gradient-to-br from-[#0b0f19]/95 to-[#051424]/98">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Metrics Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-pane rounded-xl p-4 flex flex-col justify-between h-28 hover:border-[#38bdf8]/30 transition-all duration-300">
                <div className="flex justify-between items-start text-[#bdc8d1]">
                  <span className="text-xs font-semibold uppercase">Ticket đang mở</span>
                  <span className="material-symbols-outlined text-[#ffb4ab]">warning</span>
                </div>
                <div className="font-['Outfit',sans-serif] text-2xl font-bold text-white">14</div>
              </div>
              <div className="glass-pane rounded-xl p-4 flex flex-col justify-between h-28 hover:border-[#38bdf8]/30 transition-all duration-300">
                <div className="flex justify-between items-start text-[#bdc8d1]">
                  <span className="text-xs font-semibold uppercase">Phản hồi trung bình</span>
                  <span className="material-symbols-outlined text-[#8ed5ff]">timer</span>
                </div>
                <div className="font-['Outfit',sans-serif] text-2xl font-bold text-white flex items-baseline gap-1">42<span className="text-sm text-[#bdc8d1]">sec</span></div>
              </div>
              <div className="glass-pane rounded-xl p-4 flex flex-col justify-between h-28 hover:border-[#38bdf8]/30 transition-all duration-300">
                <div className="flex justify-between items-start text-[#bdc8d1]">
                  <span className="text-xs font-semibold uppercase">Bàn giao AI</span>
                  <span className="material-symbols-outlined text-[#bdc2ff]">smart_toy</span>
                </div>
                <div className="font-['Outfit',sans-serif] text-2xl font-bold text-white">89</div>
              </div>
              <div className="glass-pane rounded-xl p-4 flex flex-col justify-between h-28 hover:border-[#38bdf8]/30 transition-all duration-300">
                <div className="flex justify-between items-start text-[#bdc8d1]">
                  <span className="text-xs font-semibold uppercase">Đã giải quyết hôm nay</span>
                  <span className="material-symbols-outlined text-[#bdc2ff]">check_circle</span>
                </div>
                <div className="font-['Outfit',sans-serif] text-2xl font-bold text-white">156</div>
              </div>
            </div>

            {/* Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Alert Task table */}
              <div className="lg:col-span-2 glass-pane rounded-xl p-6">
                <h3 className="font-['Outfit',sans-serif] text-lg font-bold text-white mb-4">Cảnh báo hệ thống & yêu cầu tiếp quản</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-[#bdc8d1] font-semibold text-sm">
                        <th className="py-3 px-2">ID</th>
                        <th className="py-3 px-2">Người dùng</th>
                        <th className="py-3 px-2">Sự cố</th>
                        <th className="py-3 px-2">Thời gian</th>
                        <th className="py-3 px-2 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm text-[#d4e4fa]">
                      <tr className="border-b border-white/5 bg-white/5 hover:bg-white/10 transition-colors">
                        <td className="py-3 px-2 font-mono text-[#ffb4ab] font-bold">SUP-9942</td>
                        <td className="py-3 px-2">Nguyễn Văn A</td>
                        <td className="py-3 px-2">Không tìm được tài xế phù hợp - AI hỗ trợ thất bại</td>
                        <td className="py-3 px-2">2 phút trước</td>
                        <td className="py-3 px-2 text-right">
                          <button onClick={() => setSelectedTicket({
                            id: "SUP-9942",
                            user: "Nguyễn Văn A",
                            issue: "Không tìm được tài xế phù hợp - AI hỗ trợ thất bại.",
                            time: "2 phút trước",
                            status: "pending",
                            details: "Khách hàng đặt xe từ Quận 1 đi Quận 7. Hệ thống AI tìm kiếm tài xế tự động thất bại sau 3 lần thử lại. Cần nhân viên vận hành chỉ định tài xế thủ công."
                          })} className="px-3 py-1 bg-[#ffb4ab]/20 text-[#ffb4ab] hover:bg-[#ffb4ab]/30 rounded transition-colors text-xs font-semibold">Đang hoạt động</button>
                        </td>
                      </tr>
                      <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-3 px-2 font-mono text-[#8ed5ff]">SUP-9938</td>
                        <td className="py-3 px-2">Trần Thị B</td>
                        <td className="py-3 px-2">Thanh toán hết thời gian chờ - thử lại liên kết MoMo</td>
                        <td className="py-3 px-2">15 phút trước</td>
                        <td className="py-3 px-2 text-right">
                          <button onClick={() => setSelectedTicket({
                            id: "SUP-9938",
                            user: "Trần Thị B",
                            issue: "Thanh toán hết thời gian chờ - thử lại liên kết MoMo.",
                            time: "15 phút trước",
                            status: "inspected",
                            details: "Giao dịch Momopay cho chuyến xe #BK-8820 bị timeout phản hồi webhook. Cần gửi yêu cầu truy vấn trạng thái tới MoMo API Gateway."
                          })} className="px-3 py-1 bg-[#38bdf8]/10 text-[#8ed5ff] hover:bg-[#38bdf8]/20 rounded transition-colors text-xs">Kiểm tra</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Takeover Control Card */}
              <div className="glass-pane rounded-xl p-6 flex flex-col justify-between">
                <div>
                  <h3 className="font-['Outfit',sans-serif] text-lg font-bold text-white mb-4">Chi tiết Ticket: {selectedTicket.id}</h3>
                  <div className="space-y-4 text-sm text-[#bdc8d1]">
                    <div>
                      <span className="text-xs uppercase font-semibold text-[#8ed5ff]">Người dùng</span>
                      <p className="text-white font-medium">{selectedTicket.user}</p>
                    </div>
                    <div>
                      <span className="text-xs uppercase font-semibold text-[#8ed5ff]">Mô tả sự cố</span>
                      <p className="text-[#ffb4ab] font-medium">{selectedTicket.issue}</p>
                    </div>
                    <div>
                      <span className="text-xs uppercase font-semibold text-[#8ed5ff]">Chi tiết chẩn đoán</span>
                      <p className="text-xs leading-relaxed text-[#d4e4fa] bg-[#051424]/60 p-3 rounded border border-white/5 mt-1">{selectedTicket.details}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-6 space-y-2">
                  <button className="w-full py-2 bg-[#ffb4ab] text-[#690005] hover:bg-white hover:text-black transition-colors rounded-lg font-bold text-sm">
                    Chỉ định tài xế thủ công
                  </button>
                  <button className="w-full py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-colors rounded-lg text-sm">
                    Chạy lại ghép cặp AI
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
