import { useEffect, useState } from "react";
import { AuthPage } from "./pages/AuthPage";
import { CustomerDashboard } from "./pages/CustomerDashboard";
import { AdminDashboard } from "./pages/AdminDashboard";
import { OperatorDashboard } from "./pages/OperatorDashboard";
import { ProviderDashboard } from "./pages/ProviderDashboard";
import { ApiService } from "./api";
import { AuthUser } from "./types";
import "./styles.css";

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    ApiService.me().then((user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
  }, []);

  const handleAuthenticated = (user: AuthUser) => {
    setCurrentUser(user);
  };

  const handleLogout = async () => {
    ApiService.logout();
    setCurrentUser(null);
  };

  if (authLoading) {
    return <div className="app-loading">Đang tải phiên đăng nhập...</div>;
  }

  if (!currentUser) {
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

  if (currentUser.role === "admin") {
    return <AdminDashboard currentUser={currentUser} onLogout={handleLogout} />;
  }
  if (currentUser.role === "operator") {
    return <OperatorDashboard currentUser={currentUser} onLogout={handleLogout} />;
  }
  if (currentUser.role === "provider") {
    return <ProviderDashboard currentUser={currentUser} onLogout={handleLogout} />;
  }

  return <CustomerDashboard currentUser={currentUser} onLogout={handleLogout} />;
}
