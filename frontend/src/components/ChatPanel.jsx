import { useState, useRef, useEffect } from "react";

export default function ChatPanel({ messages, onSend, myName }) {
  const [text, setText] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <div className="chat-panel mt-2">
      <div className="chat-header">
        💬 Chat — <span style={{ color: "#a5b4fc" }}>{myName}</span>
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: "12px", textAlign: "center", marginTop: 16 }}>
            No messages yet…
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-message ${m.sender === "System" ? "system" : ""}`}>
            {m.sender !== "System" && <span className="sender">{m.sender}:</span>}
            <span className="text">{m.text}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-row">
        <input
          id="chat-input"
          className="input"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={send} id="btn-send-chat">
          Send
        </button>
      </div>
    </div>
  );
}
