import { useRef, useState } from "react";

export default function FilesPanel({ files, onUpload, allowUpload }) {
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // limit size to 25MB (due to base64 overhead ~33%)
    if (file.size > 25 * 1024 * 1024) {
      alert("File is too large (max 25MB allowed).");
      return;
    }

    const reader = new FileReader();
    setIsUploading(true);
    reader.onload = (ev) => {
      const data = ev.target.result;
      if (onUpload) {
        onUpload({
          fileData: data, 
          fileName: file.name, 
          fileType: file.type || "application/octet-stream"
        });
      }
      setIsUploading(false);
    };
    reader.readAsDataURL(file); // Encode file as base64 URL
    e.target.value = null; // reset
  };

  const handleDownload = (e, f) => {
    e.preventDefault();
    // Convert base64 DataURL back to Blob safely to bypass browser URL limits
    fetch(f.fileData)
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = f.fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      })
      .catch(err => alert("Failed to download file."));
  };

  return (
    <div className="chat-panel mt-2" style={{ flex: 1, height: "260px", display: "flex", flexDirection: "column" }}>
      <div className="chat-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>📂 Shared Files ({files.length})</span>
        {allowUpload && (
          <>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: "none" }} 
              onChange={handleFileUpload}
            />
            <button 
              className="btn btn-primary" 
              style={{ padding: "4px 8px", fontSize: "12px", background: "linear-gradient(135deg, #10b981, #059669)" }} 
              onClick={() => fileInputRef.current?.click()}
              title="Upload File"
              disabled={isUploading}
            >
              {isUploading ? "⏳ Uploading..." : "+ Upload File"}
            </button>
          </>
        )}
      </div>
      <div className="chat-messages" style={{ flex: 1, padding: "10px", gap: "10px" }}>
        {files.length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: "12px", textAlign: "center", marginTop: 16 }}>
            No files shared yet...
          </p>
        )}
        {files.map((f, i) => (
          <div key={i} className="chat-message" style={{ flexDirection: "column", gap: "6px", background: "rgba(255,255,255,0.03)", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)" }}>
            <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>📎 {f.fileName}</span>
            <button 
              onClick={(e) => handleDownload(e, f)}
              style={{ 
                fontSize: "12px", background: "var(--success-glow)", 
                padding: "6px 12px", borderRadius: "12px", color: "#6ee7b7",
                textDecoration: "none", display: "inline-block", alignSelf: "flex-start",
                border: "1px solid var(--success)", fontWeight: "bold", cursor: "pointer"
              }}
            >
              ⬇️ Download ({f.fileType ? f.fileType.split('/')[1] || "File" : "File"})
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
