import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, LogOut, ChevronLeft } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

export default function Navbar() {
  const { username, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const showBack = location.pathname !== "/";

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex items-center justify-between px-6 py-4 border-b"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={() => navigate("/")}
            className="mr-1 p-1.5 rounded-lg hover:bg-white/5 transition-colors text-slate-400 hover:text-white"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#7C3AED,#2563EB)" }}
          >
            <Shield size={16} className="text-white" />
          </div>
          <span className="font-bold text-sm tracking-wide gradient-text">
            AI Mask Compliance
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400 hidden sm:block">
          {username}
        </span>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-all"
        >
          <LogOut size={15} />
          <span className="hidden sm:block">Logout</span>
        </button>
      </div>
    </motion.nav>
  );
}
