import React from "react";
import { CalendarDays } from "lucide-react";
import "./HistoryView.css";

export const HistoryView: React.FC = () => <section className="history-view"><section className="history-hero"><div><span className="section-kicker"><CalendarDays size={16} /> Lịch sử đặt dịch vụ</span><h2>Lịch sử chưa có dữ liệu</h2><p>Danh sách sẽ được lấy từ Booking API sau khi service này được tích hợp.</p></div></section></section>;
