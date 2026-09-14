const API_BASE = (import.meta.env.VITE_API_URL || "/api/v1").replace(/\/$/, "");
const TOKEN_KEY = "prima_api_token";

export function assetUrl(file) {
  const assets = {
    "foto/bgpertamina.png": "/images/bg-pertamina.png",
    "foto/Logo HSSE 2022.png": "/images/logo-hsse.png",
    "foto/PT_Pertamina_Patra_Niaga.png": "/images/pertamina-patra-niaga.png",
  };
  return assets[file] || file;
}

async function request(path, options = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("json") ? await response.json() : null;
  if (!response.ok || payload?.success === false) {
    if (response.status === 401) sessionStorage.removeItem(TOKEN_KEY);
    const error = new Error(
      payload?.message || `Request gagal (${response.status})`,
    );
    error.status = response.status;
    error.validation = payload?.data;
    throw error;
  }
  return payload;
}

const json = (path, data, method = "POST") =>
  request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

async function download(path, filename) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "*/*" },
  });
  if (!response.ok) throw new Error(`Unduhan gagal (${response.status})`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "download";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  me: () => request("/auth/me"),
  captchaConfig: () => request("/auth/captcha-config"),
  login: async (credentials) => {
    const payload = await json("/auth/login", credentials);
    sessionStorage.setItem(TOKEN_KEY, payload.data.token);
    return { ...payload, data: payload.data.user };
  },
  logout: async () => {
    try {
      return await request("/auth/logout", { method: "POST" });
    } finally {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  },
  register: (data) => json("/auth/register", data),
  dashboard: () => request("/dashboard"),
  vehicles: () => request("/vehicles"),
  checklists: (params = {}) =>
    request(`/checklists?${new URLSearchParams(params)}`),
  checklistStats: () => request("/checklists/stats"),
  deleteChecklist: (id) => request(`/checklists/${id}`, { method: "DELETE" }),
  checklistTemplate: (jenis) =>
    request(`/checklists/template?jenis=${encodeURIComponent(jenis)}`),
  checklist: (id) => request(`/checklists/${id}`),
  saveChecklist: (data) =>
    json(
      data.id ? `/checklists/${data.id}` : "/checklists",
      data,
      data.id ? "PUT" : "POST",
    ),
  workflow: (data) => json("/checklists/workflow", data),
  saveSignature: (data) => json("/checklists/signature", data),
  users: () => request("/users"),
  updateUser: (data) => json(`/users/${data.user_id}`, data, "PUT"),
  deleteUser: (id) => request(`/users/${id}`, { method: "DELETE" }),
  toggleUser: (data) => json(`/users/${data.user_id}/status`, data, "PATCH"),
  resetPassword: (data) => json(`/users/${data.user_id}/reset-password`, data),
  registrations: () => request("/registrations"),
  reviewRegistration: (data) => json(`/registrations/${data.id}/review`, data),
  documents: () => request("/documents"),
  reviewDocument: (data) =>
    json(`/documents/${data.doc_id || data.id}/review`, {
      ...data,
      catatan_admin: data.catatan_admin || data.catatan,
      action:
        data.status === "DISETUJUI" || data.action === "DISETUJUI"
          ? "approve"
          : "reject",
    }),
  uploadDocument: (form) =>
    request("/documents", { method: "POST", body: form }),
  deleteDocument: (id) => request(`/documents/${id}`, { method: "DELETE" }),
  openDocument: (id, filename) =>
    download(`/documents/${id}/download`, filename),
  audits: (search = "") =>
    request(`/audits?search=${encodeURIComponent(search)}`),
  alerts: () => request("/alerts"),
  settings: () => request("/settings"),
  saveSystemSettings: (data) => json("/settings", data, "PUT"),
  createBackup: () => request("/settings/backup", { method: "POST" }),
  applyAuditRetention: () =>
    request("/settings/audit-retention", { method: "POST" }),
  notifications: () => request("/notifications"),
  saveNotifications: (data) => json("/notifications", data, "PUT"),
  regenerateCron: () =>
    request("/notifications/regenerate-cron", { method: "POST" }),
  myVehicles: () => request("/my-vehicles"),
  registerMyVehicle: (data) => json("/my-vehicles", data),
  userVehicles: () => request("/user-vehicles"),
  registerUserVehicle: (data) => json("/user-vehicles", data),
  saveVehicle: (data) => json("/vehicles/manage", data),
  verify: (value) => request(`/verify/${encodeURIComponent(value)}`),
  exportChecklists: (params = {}) =>
    download(
      `/export/checklists?${new URLSearchParams(params)}`,
      "data-checklist.xlsx",
    ),
};
