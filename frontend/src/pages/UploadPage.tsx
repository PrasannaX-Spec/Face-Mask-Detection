import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, ImageIcon, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import { detectImageApi } from "@/api/client";

interface Detection {
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
}

export default function UploadPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultImg, setResultImg] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);

  const onDrop = useCallback((accepted: File[]) => {
    if (!accepted.length) return;
    const f = accepted[0];
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResultImg(null);
    setDetections([]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
    maxSize: 10 * 1024 * 1024,
  });

  const handleDetect = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const { data } = await detectImageApi(file);
      setResultImg(data.image_b64);
      setDetections(data.detections as Detection[]);
      toast.success(`Detection complete — ${data.detections.length} face(s) found.`);
    } catch {
      toast.error("Detection failed. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setPreview(null);
    setFile(null);
    setResultImg(null);
    setDetections([]);
  };

  const maskCount = detections.filter((d) => d.label === "Mask").length;
  const noMaskCount = detections.filter((d) => d.label === "No Mask").length;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <Navbar />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-2xl font-bold">Image Upload Detection</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
            Drag & drop or select an image to run mask detection
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Upload zone */}
          <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="flex flex-col gap-4">
            {!preview ? (
              <div
                {...getRootProps()}
                id="dropzone"
                className={`glass flex flex-col items-center justify-center p-12 cursor-pointer transition-all min-h-[320px] ${isDragActive ? "border-purple-500 glow-purple" : ""}`}
                style={{ border: `2px dashed ${isDragActive ? "#7C3AED" : "var(--border)"}` }}
              >
                <input {...getInputProps()} />
                <motion.div
                  animate={isDragActive ? { scale: 1.15 } : { scale: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <Upload size={40} className={`mb-4 ${isDragActive ? "text-purple-400" : "text-slate-600"}`} />
                </motion.div>
                <p className="text-sm font-medium text-slate-300">
                  {isDragActive ? "Drop it here!" : "Drag & drop an image"}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  or click to browse — PNG, JPG, WEBP up to 10 MB
                </p>
              </div>
            ) : (
              <div className="glass p-4 relative min-h-[320px] flex flex-col gap-4">
                <button
                  onClick={clear}
                  className="absolute top-4 right-4 z-10 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
                >
                  <X size={16} />
                </button>
                <div className="rounded-xl overflow-hidden bg-black flex-1 min-h-[240px] flex items-center justify-center">
                  <img
                    src={resultImg ? `data:image/jpeg;base64,${resultImg}` : preview}
                    alt="Preview"
                    className="max-w-full max-h-[340px] object-contain"
                  />
                </div>
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                  <ImageIcon size={13} />
                  {file?.name}
                  {resultImg && (
                    <span className="ml-auto flex items-center gap-1 text-green-400">
                      <CheckCircle2 size={12} /> Annotated
                    </span>
                  )}
                </div>
              </div>
            )}

            <button
              id="detect-btn"
              onClick={handleDetect}
              disabled={!file || loading}
              className="btn-gradient py-3 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Analyzing…</>
              ) : (
                <><ImageIcon size={16} /> Detect Masks</>
              )}
            </button>
          </motion.div>

          {/* Results */}
          <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }} className="flex flex-col gap-4">
            {/* Summary */}
            <div className="glass p-5">
              <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--muted)" }}>DETECTION SUMMARY</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="glass-2 p-3 text-center">
                  <div className="text-2xl font-bold gradient-text">{detections.length}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>Faces</div>
                </div>
                <div className="glass-2 p-3 text-center">
                  <div className="text-2xl font-bold text-green-400">{maskCount}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>With Mask</div>
                </div>
                <div className="glass-2 p-3 text-center">
                  <div className="text-2xl font-bold text-red-400">{noMaskCount}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>No Mask</div>
                </div>
              </div>
            </div>

            {/* Detection list */}
            <div className="glass p-5 flex flex-col gap-3 flex-1 min-h-[240px]">
              <h3 className="text-sm font-semibold" style={{ color: "var(--muted)" }}>FACE RESULTS</h3>
              <AnimatePresence>
                {detections.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
                    <AlertCircle size={28} className="text-slate-700 mb-2" />
                    <p className="text-sm" style={{ color: "var(--muted)" }}>
                      {file ? "Run detection to see results" : "Upload an image to get started"}
                    </p>
                  </div>
                ) : (
                  detections.map((d, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="glass-2 px-4 py-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-2.5 h-2.5 rounded-full ${d.label === "Mask" ? "bg-green-400" : "bg-red-400"}`} />
                        <div>
                          <div className="text-sm font-semibold">{d.label}</div>
                          <div className="text-xs" style={{ color: "var(--muted)" }}>
                            Face #{i + 1} — bbox [{d.bbox.join(", ")}]
                          </div>
                        </div>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${d.label === "Mask" ? "badge-mask" : "badge-nomask"}`}>
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
