import React from "react";
import { UserRound } from "lucide-react";
import { UserProfile } from "../types";
import "./ProfileSettings.css";

interface Props { onSaved?: (profile: UserProfile) => void; }

export const ProfileSettings: React.FC<Props> = () => <section className="profile-page"><header className="profile-hero"><UserRound size={24} /><div><h1>Hồ sơ cá nhân</h1><p>Hồ sơ sẽ hiển thị khi Profile Service được tích hợp và người dùng đăng nhập.</p></div></header><section className="profile-card"><h3>Chưa có dữ liệu hồ sơ</h3><p>Không lưu thông tin giả trên trình duyệt. Form cập nhật sẽ sử dụng API thật ở giai đoạn tiếp theo.</p></section></section>;
