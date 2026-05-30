"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Send, Bot, User, FileText, LogOut, ChevronDown } from "lucide-react";
import { API_URL, authHeaders, getToken } from "@/lib/api";

interface Source { id: string; content: string; document_id: string }
interface Message { role: "user" | "assistant"; content: string; sources?: Source[]; model?: string }
interface Model { id: string; vertex_name: string; default: boolean }

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getToken()) { router.push("/"); return; }
    fetch(`${API_URL}/api/v1/chat/models`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: Model[]) => {
        setModels(data);
        const def = data.find((m) => m.default);
        if (def) setSelectedModel(def.id);
      })
      .catch(() => {});
  }, [router]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/v1/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ question, model: selectedModel || undefined }),
      });

      if (res.status === 401) { router.push("/"); return; }
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer, sources: data.sources, model: data.model }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "An error occurred. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, selectedModel, router]);

  function logout() {
    localStorage.removeItem("token");
    router.push("/");
  }

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-gray-800">RAG Assistant</span>
        </div>
        <div className="flex items-center gap-3">
          {models.length > 0 && (
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="appearance-none border rounded-lg pl-3 pr-8 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.id}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>
          )}
          <button onClick={logout} className="text-gray-400 hover:text-red-500 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
            <Bot className="w-12 h-12 opacity-20" />
            <p>Ask a question about your documents</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && <Bot className="w-7 h-7 text-blue-600 shrink-0 mt-1" />}
            <div className="max-w-[80%] space-y-2">
              <div className={`rounded-2xl px-4 py-3 text-sm ${
                msg.role === "user" ? "bg-blue-600 text-white" : "bg-white border text-gray-800 shadow-sm"
              }`}>
                {msg.content}
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="space-y-1">
                  {msg.sources.slice(0, 3).map((s) => (
                    <div key={s.id} className="flex gap-1.5 text-xs text-gray-500 bg-gray-100 rounded-lg px-3 py-2">
                      <FileText className="w-3 h-3 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{s.content}</span>
                    </div>
                  ))}
                </div>
              )}
              {msg.model && <p className="text-xs text-gray-400 pl-1">{msg.model}</p>}
            </div>
            {msg.role === "user" && <User className="w-7 h-7 text-gray-400 shrink-0 mt-1" />}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <Bot className="w-7 h-7 text-blue-600 shrink-0 mt-1" />
            <div className="bg-white border rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                {[0, 0.15, 0.3].map((delay, i) => (
                  <span key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={sendMessage} className="bg-white border-t p-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-blue-600 text-white rounded-xl px-4 py-2 disabled:opacity-50 hover:bg-blue-700 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
