import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, CameraOff, Wifi, WifiOff, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import { useAuthStore } from "@/store/authStore";

interface Detection {
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
}

const WS_URL = "ws://localhost:8000/detect/live";
const SEND_INTERVAL_MS = 120; // ~8 fps to backend — balanced for ML latency
const MAX_SEND_WIDTH = 640;   // cap frame width before encoding

export default function LiveCameraPage() {
  const { token } = useAuthStore();
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);   // hidden capture/encode canvas
  const overlayRef  = useRef<HTMLCanvasElement>(null);   // visible canvas — always live
  const wsRef       = useRef<WebSocket | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const sendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fpsTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef       = useRef<number | null>(null);       // requestAnimationFrame id

  const [active, setActive]       = useState(false);
  const [connected, setConnected] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [fps, setFps]             = useState(0);

  // Refs that must be readable inside RAF/interval callbacks without stale closures
  const fpsCountRef         = useRef(0);
  const lastSpokenStateRef  = useRef<string>("None");
  const isProcessingRef     = useRef(false);   // true while backend is computing a frame
  const latestDetectionsRef = useRef<Detection[]>([]);  // latest server detections for overlay

  // ── Live canvas loop ───────────────────────────────────────────────────────
  // Runs at monitor refresh rate, draws raw video + latest detection boxes.
  // This means the video is ALWAYS smooth — no stale frames from backend.
  const startLiveCanvas = useCallback(() => {
    const overlay = overlayRef.current;
    const video   = videoRef.current;
    if (!overlay || !video) return;

    const ctx = overlay.getContext("2d")!;

    const draw = () => {
      if (video.readyState >= 2) {
        overlay.width  = video.videoWidth  || 640;
        overlay.height = video.videoHeight || 480;
        ctx.drawImage(video, 0, 0);

        // Paint latest detection boxes from server over the live frame
        latestDetectionsRef.current.forEach(({ label, confidence, bbox }) => {
          const [sx, sy, ex, ey] = bbox;
          // green = Mask | red = No Mask | amber = Uncertain
          const color =
            label === "Mask"      ? "#22c55e" :
            label === "No Mask"   ? "#ef4444" :
                                    "#eab308";  // Uncertain
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.strokeRect(sx, sy, ex - sx, ey - sy);

          const displayLabel = label === "Uncertain" ? "Uncertain / Improper" : label;
          const text = `${displayLabel} ${(confidence * 100).toFixed(1)}%`;
          ctx.font = "bold 13px Inter, sans-serif";
          const tw = ctx.measureText(text).width;
          ctx.fillStyle = color + "CC";
          ctx.fillRect(sx, sy - 22, tw + 12, 22);
          ctx.fillStyle = "#fff";
          ctx.fillText(text, sx + 6, sy - 6);
        });
      }
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  const stopLiveCanvas = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ── stopCamera ─────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    // Stop frame-send interval
    if (sendTimerRef.current) { clearInterval(sendTimerRef.current); sendTimerRef.current = null; }
    // Stop FPS counter
    if (fpsTimerRef.current)  { clearInterval(fpsTimerRef.current);  fpsTimerRef.current  = null; }
    // Stop live canvas RAF loop
    stopLiveCanvas();

    wsRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    wsRef.current   = null;
    streamRef.current = null;

    latestDetectionsRef.current = [];
    isProcessingRef.current = false;

    if (window.speechSynthesis) window.speechSynthesis.cancel();
    lastSpokenStateRef.current = "None";

    setActive(false);
    setConnected(false);
    setDetections([]);
  }, [stopLiveCanvas]);

  // ── startCamera ────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        toast.success("WebSocket connected.");
        startLiveCanvas(); // start smooth canvas loop once connected
      };
      ws.onclose = () => { setConnected(false); };
      ws.onerror = () => { toast.error("WebSocket error."); stopCamera(); };

      // ── Voice helper (event-driven, state-change only) ──────────────────
      const speakText = (text: string) => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      };

      // ── Message handler ─────────────────────────────────────────────────
      ws.onmessage = (ev) => {
        isProcessingRef.current = false; // unblock next frame send

        const data = JSON.parse(ev.data as string);
        const currentDetections: Detection[] = data.detections || [];

        // Update refs — overlay canvas reads from this on every RAF tick
        latestDetectionsRef.current = currentDetections;

        // Batch React state update (sidebar only — not used for canvas render)
        setDetections(currentDetections);
        fpsCountRef.current += 1;

        // Voice alert on detection state change
        // "Uncertain" is intentionally excluded from voice — don't say "safe"
        // for potential hand/scarf occlusions; only speak on confirmed states.
        let currentSafetyState = "None";
        if (currentDetections.some((d: Detection) => d.label === "No Mask"))  currentSafetyState = "No Mask";
        else if (currentDetections.some((d: Detection) => d.label === "Mask")) currentSafetyState = "Mask";
        // Uncertain alone → leave state as previous (no re-speak, no false positive)

        if (currentSafetyState !== lastSpokenStateRef.current) {
          lastSpokenStateRef.current = currentSafetyState;
          if (currentSafetyState === "No Mask") speakText("Please put on your face covering to enter.");
          else if (currentSafetyState === "Mask") speakText("Thank you for keeping us safe.");
        }
      };

      // ── FPS counter ─────────────────────────────────────────────────────
      fpsTimerRef.current = setInterval(() => {
        setFps(fpsCountRef.current);
        fpsCountRef.current = 0;
      }, 1000);

      // ── Frame sender — throttled + skips if backend is busy ─────────────
      const captureCanvas = canvasRef.current!;
      sendTimerRef.current = setInterval(() => {
        const vid = videoRef.current;
        if (!vid || ws.readyState !== WebSocket.OPEN) return;
        if (isProcessingRef.current) return; // ← drop frame — backend still busy

        // Scale down frame to max 640px wide to reduce encoding + transfer cost
        const scaleW = Math.min(vid.videoWidth  || 640, MAX_SEND_WIDTH);
        const scaleH = Math.round((vid.videoHeight || 480) * (scaleW / (vid.videoWidth || 640)));
        captureCanvas.width  = scaleW;
        captureCanvas.height = scaleH;

        const ctx = captureCanvas.getContext("2d")!;
        ctx.drawImage(vid, 0, 0, scaleW, scaleH);

        captureCanvas.toBlob((blob) => {
          if (blob && ws.readyState === WebSocket.OPEN) {
            isProcessingRef.current = true; // mark busy before sending
            blob.arrayBuffer().then((buf) => ws.send(buf));
          }
        }, "image/jpeg", 0.65); // 0.65 quality — good detail, smaller payload
      }, SEND_INTERVAL_MS);

      setActive(true);
    } catch {
      toast.error("Camera access denied. Please allow camera permissions.");
    }
  }, [token, startLiveCanvas, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const maskCount      = detections.filter((d) => d.label === "Mask").length;
  const noMaskCount    = detections.filter((d) => d.label === "No Mask").length;
  const uncertainCount = detections.filter((d) => d.label === "Uncertain").length;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <Navbar />
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold">Live Detection</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
              Real-time webcam mask compliance monitoring
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium ${connected ? "text-green-400" : "text-slate-500"}`}
              style={{ background: connected ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.05)", border: `1px solid ${connected ? "rgba(34,197,94,0.3)" : "var(--border)"}` }}>
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {connected ? "Connected" : "Disconnected"}
            </span>
            <span className="text-xs px-3 py-1.5 rounded-full font-medium"
              style={{ background: "rgba(255,255,255,0.05)", color: "var(--muted)", border: "1px solid var(--border)" }}>
              {fps} FPS
            </span>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Video feed */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2 glass p-4 flex flex-col gap-4"
          >
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
              {!active && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                  <Camera size={48} className="text-slate-700 mb-3" />
                  <p className="text-slate-500 text-sm">Camera not started</p>
                </div>
              )}
              {/* Hidden capture/encode canvas */}
              <canvas ref={canvasRef} className="hidden" />
              {/* Hidden raw video — drives the stream feed, RAF reads from it */}
              <video ref={videoRef} muted playsInline className="hidden" />
              {/* Live overlay canvas — RAF loop draws video + detection boxes at 60fps */}
              <canvas
                ref={overlayRef}
                className="w-full h-full object-contain"
                style={{ display: active ? "block" : "none" }}
              />
            </div>

            <button
              id="toggle-camera"
              onClick={active ? stopCamera : startCamera}
              className={`btn-gradient py-3 flex items-center justify-center gap-2 w-full ${active ? "opacity-70" : ""}`}
              style={active ? { background: "linear-gradient(135deg,#b91c1c,#991b1b)" } : {}}
            >
              {active ? (
                <><CameraOff size={16} /> Stop Camera</>
              ) : (
                <><Camera size={16} /> Start Camera</>
              )}
            </button>
          </motion.div>

          {/* Sidebar */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col gap-4"
          >
            {/* Stats */}
            <div className="glass p-5 flex flex-col gap-4">
              <h3 className="text-sm font-semibold" style={{ color: "var(--muted)" }}>CURRENT FRAME</h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="glass-2 p-3 text-center">
                  <div className="text-2xl font-bold text-green-400">{maskCount}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>Mask</div>
                </div>
                <div className="glass-2 p-3 text-center">
                  <div className="text-2xl font-bold text-red-400">{noMaskCount}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>No Mask</div>
                </div>
                <div className="glass-2 p-3 text-center">
                  <div className="text-2xl font-bold text-yellow-400">{uncertainCount}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>Uncertain</div>
                </div>
              </div>
            </div>

            {/* Detection list */}
            <div className="glass p-5 flex-1 flex flex-col gap-3 min-h-[200px]">
              <h3 className="text-sm font-semibold" style={{ color: "var(--muted)" }}>DETECTIONS</h3>
              <AnimatePresence>
                {detections.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                    <AlertCircle size={28} className="text-slate-700 mb-2" />
                    <p className="text-sm" style={{ color: "var(--muted)" }}>
                      {active ? "No faces detected" : "Start camera to see results"}
                    </p>
                  </div>
                ) : (
                  detections.map((d, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      className="glass-2 px-3 py-2.5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          d.label === "Mask"      ? "bg-green-400"  :
                          d.label === "No Mask"   ? "bg-red-400"    :
                                                    "bg-yellow-400"
                        }`} />
                        <span className="text-sm font-medium">
                          {d.label === "Uncertain" ? "Uncertain / Improper" : d.label}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        d.label === "Mask"      ? "badge-mask"    :
                        d.label === "No Mask"   ? "badge-nomask"  :
                        "badge-uncertain"
                      }`}>
                        {(d.confidence * 100).toFixed(1)}%
                      </span>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
