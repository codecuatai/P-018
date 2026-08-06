import React from "react";
import { Bot } from "lucide-react";
import "./WelcomeScreen.css";

interface Props { onQuickAction?: (action: string) => void; }

export const WelcomeScreen: React.FC<Props> = () => <div className="welcome-screen"><div className="welcome-header"><div className="bot-avatar-fallback"><Bot size={32} /></div><h2>NaviGo AI Concierge</h2><p>Hãy nhập yêu cầu để bắt đầu. Các gợi ý sẽ được cấu hình từ backend khi có dữ liệu thật.</p></div></div>;
