import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Video, Upload, Activity, Shield } from "lucide-react";
import Navbar from "@/components/Navbar";
import { useAuthStore } from "@/store/authStore";

const cards = [
  {
    id: "live",
    icon: Video,
    title: "Live Detection",
    description:
      "Stream your webcam in real-time. AI annotates every face with mask compliance status and confidence score.",
    to: "/live",
    gradient: "from-purple-600 to-blue-600",
    glow: "rgba(124,58,237,0.3)",
    badge: "Real-time",
  },
  {
    id: "upload",
    icon: Upload,
    title: "Image Upload",
    description:
      "Upload any photo for instant analysis. Drag & drop an image and receive an annotated result in seconds.",
    to: "/upload",
    gradient: "from-blue-600 to-cyan-500",
    glow: "rgba(37,99,235,0.3)",
    badge: "Instant",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};
const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
} satisfies import("framer-motion").Variants;

export default function DashboardPage() {
  const navigate = useNavigate();
  const { username } = useAuthStore();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full opacity-10 blur-3xl"
          style={{ background: "var(--accent-1)" }} />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full opacity-10 blur-3xl"
          style={{ background: "var(--accent-2)" }} />
      </div>

      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <div className="flex items-center justify-center gap-2 mb-4">
            <div
              className="p-2.5 rounded-xl"
              style={{ background: "linear-gradient(135deg,#7C3AED,#2563EB)" }}
            >
              <Shield size={24} className="text-white" />
            </div>
            <span className="text-sm font-semibold px-3 py-1 rounded-full"
              style={{ background: "rgba(124,58,237,0.15)", color: "#A78BFA", border: "1px solid rgba(124,58,237,0.3)" }}>
              <Activity size={12} className="inline mr-1" />
              System Active
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-3">
            AI Mask{" "}
            <span className="gradient-text">Compliance</span> System
          </h1>
          <p className="max-w-md mx-auto text-base" style={{ color: "var(--muted)" }}>
            Welcome back, <span className="text-slate-200 font-medium">{username}</span>. Choose a
            detection mode to begin monitoring.
          </p>
        </motion.div>

        {/* Cards */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid sm:grid-cols-2 gap-6 w-full max-w-2xl"
        >
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <motion.div
                key={c.id}
                variants={item}
                whileHover={{ y: -6, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(c.to)}
                className="glass cursor-pointer p-7 flex flex-col gap-4 group relative overflow-hidden"
                style={{ boxShadow: `0 0 0 transparent`, transition: "box-shadow 0.3s" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 0 40px ${c.glow}`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 transparent";
                }}
                id={`card-${c.id}`}
              >
                {/* Icon */}
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br ${c.gradient}`}
                >
                  <Icon size={22} className="text-white" />
                </div>

                {/* Badge */}
                <span
                  className="absolute top-5 right-5 text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    color: "var(--muted)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {c.badge}
                </span>

                <div>
                  <h2 className="text-lg font-bold mb-1">{c.title}</h2>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                    {c.description}
                  </p>
                </div>

                <div className="flex items-center gap-1 text-sm font-medium"
                  style={{ color: "var(--accent-1)" }}>
                  Get Started →
                </div>

                {/* Hover shimmer */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-2xl"
                  style={{ background: "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.04), transparent 60%)" }} />
              </motion.div>
            );
          })}
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex gap-8 mt-14 text-center"
        >
          {[
            { label: "Model", value: "MobileNetV2" },
            { label: "Face Detector", value: "Caffe SSD" },
            { label: "Confidence", value: "> 50%" },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-lg font-bold gradient-text">{s.value}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{s.label}</div>
            </div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
