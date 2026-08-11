"use client";

import { ArrowRight, Check, CircleDot, MessageCircleMore } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

const milestones = ["Yêu cầu", "Đã tìm thấy", "Chờ bạn xác nhận", "Điểm đến đã sẵn sàng", "Báo giá đã sẵn sàng"];

export function StoryBoard() {
  const reduceMotion = useReducedMotion();
  return <motion.div className="story-board" initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: reduceMotion ? 0 : 0.42 }}>
    <div className="story-request"><MessageCircleMore size={18} /><p>“Tối nay đặt bàn cho 2 người rồi gọi xe đưa tôi tới đó.”</p></div>
    <ol>{milestones.map((item, index) => <li key={item} className={index === 2 ? "awaiting" : index < 2 ? "complete" : ""}><span>{index < 2 ? <Check size={14} /> : <CircleDot size={14} />}</span><p>{item}</p>{index === 1 ? <small>Nhà hàng có lựa chọn phù hợp</small> : null}{index === 2 ? <small>Xem lại trước khi giữ bàn</small> : null}{index === 4 ? <small>Chờ bạn xác nhận chuyến xe</small> : null}</li>)}</ol>
    <div className="story-connector" aria-hidden="true"><span>Nhà hàng</span><ArrowRight size={18} /><span>Chuyến xe</span></div>
  </motion.div>;
}
