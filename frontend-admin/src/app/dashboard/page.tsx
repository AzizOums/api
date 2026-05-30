"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, Trash2, FileText, LogOut, Database,
  Users, File, ToggleLeft, ToggleRight, Cpu,
} from "lucide-react";
import { API_URL, authHeaders, getToken } from "@/lib/api";

interface Doc  { id: string; name: string; status: string; created_at: string }
interface User { id: string; email: string; is_active: boolean; created_at: string }
interface Stats { total_documents: number; total_chunks: number; total_users: number }
interface Model { id: string; vertex_name: string; default: boolean }

type Tab = "documents" | "users" | "models";

export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("documents");
  const [docs, setDocs]     = useState<Doc[]>([]);
  const [users, setUsers]   = useState<User[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [stats, setStats]   = useState<Stats | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver]   = useState(false);

  const headers = authHeaders();

  const fetchAll = useCallback(async () => {
    if (!getToken()) { router.push("/"); return; }
    const [d, u, s, m] = await Promise.all([
      fetch(`${API_URL}/api/v1/documents/`,  { headers }).then((r) => r.json()),
      fetch(`${API_URL}/api/v1/admin/users`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/api/v1/admin/stats`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/api/v1/admin/models`,{ headers }).then((r) => r.json()),
    ]);
    setDocs(Array.isArray(d) ? d : []);
    setUsers(Array.isArray(u) ? u : []);
    setStats(s);
    setModels(Array.isArray(m) ? m : []);
  }, [router]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function uploadFile(file: globalThis.File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    await fetch(`${API_URL}/api/v1/documents/upload`, { method: "POST", headers, body: fd });
    await fetchAll();
    setUploading(false);
  }

  async function deleteDoc(id: string) {
    await fetch(`${API_URL}/api/v1/documents/${id}`, { method: "DELETE", headers });
    await fetchAll();
  }

  async function toggleUser(id: string) {
    await fetch(`${API_URL}/api/v1/admin/users/${id}/toggle`, { method: "PATCH", headers });
    await fetchAll();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) uploadFile(f);
  }

  function logout() { localStorage.removeItem("admin_token"); router.push("/"); }

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "documents", label: "Documents", icon: <FileText className="w-4 h-4" /> },
    { key: "users",     label: "Users",     icon: <Users className="w-4 h-4" /> },
    { key: "models",    label: "Models",    icon: <Cpu className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-gray-800">RAG Admin</span>
        </div>
        <button onClick={logout} className="text-gray-400 hover:text-red-500 transition-colors">
          <LogOut className="w-4 h-4" />
        </button>
      </nav>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Documents", value: stats.total_documents, icon: <FileText className="w-5 h-5 text-blue-600" /> },
              { label: "Chunks",    value: stats.total_chunks,    icon: <Database className="w-5 h-5 text-blue-600" /> },
              { label: "Users",     value: stats.total_users,     icon: <Users className="w-5 h-5 text-blue-600" /> },
            ].map(({ label, value, icon }) => (
              <div key={label} className="bg-white rounded-xl border p-4 flex items-center gap-3">
                <div className="bg-blue-50 p-2 rounded-lg">{icon}</div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{value}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Documents tab */}
        {tab === "documents" && (
          <div className="space-y-4">
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              className={`bg-white rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                dragOver ? "border-blue-500 bg-blue-50" : "border-gray-200"
              }`}
            >
              <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 mb-3">Drop files here or</p>
              <label className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors">
                {uploading ? "Uploading..." : "Choose file"}
                <input type="file" className="hidden" accept=".pdf,.txt,.docx,.md"
                  onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                  disabled={uploading} />
              </label>
              <p className="text-xs text-gray-400 mt-2">PDF · TXT · DOCX · MD</p>
            </div>

            <div className="bg-white rounded-xl border overflow-hidden">
              {docs.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <File className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No documents yet</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {docs.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{doc.name}</p>
                          <p className="text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          doc.status === "ready" ? "bg-green-100 text-green-700" :
                          doc.status === "processing" ? "bg-yellow-100 text-yellow-700" :
                          "bg-red-100 text-red-700"
                        }`}>{doc.status}</span>
                        <button onClick={() => deleteDoc(doc.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Users tab */}
        {tab === "users" && (
          <div className="bg-white rounded-xl border overflow-hidden">
            {users.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No users yet</p>
              </div>
            ) : (
              <ul className="divide-y">
                {users.map((u) => (
                  <li key={u.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{u.email}</p>
                      <p className="text-xs text-gray-400">{new Date(u.created_at).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => toggleUser(u.id)}
                      className={`flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                        u.is_active ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700" : "bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700"
                      }`}>
                      {u.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      {u.is_active ? "Active" : "Disabled"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Models tab */}
        {tab === "models" && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <ul className="divide-y">
              {models.map((m) => (
                <li key={m.id} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Cpu className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{m.id}</p>
                      <p className="text-xs text-gray-400">{m.vertex_name}</p>
                    </div>
                  </div>
                  {m.default && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">default</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
