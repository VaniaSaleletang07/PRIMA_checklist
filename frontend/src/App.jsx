import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Bell,
  Database,
  Factory,
  FilePlus2,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ScrollText,
  Truck,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { api, assetUrl } from "./api";
import {
  AlertsPage,
  Approvals,
  AuditsPage,
  ChecklistDataPage,
  ChecklistEditor,
  DocumentsPage,
  MyVehiclesPage,
  NotificationsPage,
  RegisterPage,
  RegistrationsPage,
  SettingsPage,
  UsersPage,
  VehicleRegistrationPage,
  VehiclesPage,
  VerifyPage,
} from "./Modules";

const roleNames = {
  admin: "Administrator",
  hsse: "Petugas HSSE",
  manager_hsse: "Manager HSSE",
  pengurus: "Pengurus Kendaraan",
  user: "User",
};
const statusNames = {
  draft: "Draft",
  pending_hsse: "Menunggu HSSE",
  signed_hsse: "Menunggu Manager",
  approved: "Disetujui",
  rejected: "Ditolak",
};

function useAsync(loader, dependencies = []) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const run = useCallback(async () => {
    setState((value) => ({ ...value, loading: true, error: "" }));
    try {
      const response = await loader();
      setState({ loading: false, data: response.data, error: "" });
    } catch (error) {
      setState({ loading: false, data: null, error: error.message });
    }
  }, dependencies);
  useEffect(() => {
    run();
  }, [run]);
  return { ...state, reload: run };
}

function Loading() {
  return (
    <div className="state">
      <span className="spinner" />
      Memuat data…
    </div>
  );
}

function ErrorState({ message, retry }) {
  return (
    <div className="state error">
      <AlertTriangle size={20} />
      {message}
      <button className="button secondary" onClick={retry}>
        Coba lagi
      </button>
    </div>
  );
}

let turnstileLoader;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileLoader) return turnstileLoader;

  turnstileLoader = new Promise((resolve, reject) => {
    const existing = document.getElementById("cloudflare-turnstile-script");
    const script = existing || document.createElement("script");
    const loaded = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error("Layanan CAPTCHA tidak tersedia."));

    script.addEventListener("load", loaded, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Layanan CAPTCHA gagal dimuat.")),
      { once: true },
    );
    if (!existing) {
      script.id = "cloudflare-turnstile-script";
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return turnstileLoader;
}

function TurnstileCaptcha({ siteKey, resetKey, onVerify, onError }) {
  const container = useRef(null);
  const callbacks = useRef({ onVerify, onError });
  callbacks.current = { onVerify, onError };

  useEffect(() => {
    let active = true;
    let widgetId;

    loadTurnstile()
      .then((turnstile) => {
        if (!active || !container.current) return;
        widgetId = turnstile.render(container.current, {
          sitekey: siteKey,
          action: "login",
          theme: "light",
          size: "flexible",
          callback: (token) => callbacks.current.onVerify(token),
          "expired-callback": () =>
            callbacks.current.onError(
              "CAPTCHA kedaluwarsa. Silakan verifikasi kembali.",
            ),
          "error-callback": () =>
            callbacks.current.onError(
              "CAPTCHA gagal diverifikasi. Silakan coba kembali.",
            ),
        });
      })
      .catch((error) => callbacks.current.onError(error.message));

    return () => {
      active = false;
      if (widgetId !== undefined && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [siteKey, resetKey]);

  return <div className="turnstile-widget" ref={container} />;
}

function Login({ onLogin }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [captchaConfig, setCaptchaConfig] = useState(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaError, setCaptchaError] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .captchaConfig()
      .then((response) => {
        if (active) setCaptchaConfig(response.data);
      })
      .catch((requestError) => {
        if (active) setCaptchaError(requestError.message);
      });

    return () => {
      active = false;
    };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (captchaConfig?.enabled && !captchaToken) {
      setCaptchaError("Selesaikan verifikasi CAPTCHA terlebih dahulu.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.login({ ...form, captcha_token: captchaToken });
      onLogin(result.data);
    } catch (err) {
      setError(err.message);
      setCaptchaToken("");
      setCaptchaReset((value) => value + 1);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-page">
      <section
        className="login-panel brand-panel"
        style={{ "--login-bg": `url("${assetUrl("foto/bgpertamina.png")}")` }}
      >
        <div className="brand-kicker">
          <span /> Sistem inspeksi terintegrasi
        </div>
        <div className="brand-lockup">
          <img
            className="brand-hsse-logo"
            src={assetUrl("foto/Logo HSSE 2022.png")}
            alt="Logo HSSE Integrated Terminal Bitung"
          />
          <div className="brand-divider" />
          <img
            className="brand-pertamina-logo"
            src={assetUrl("foto/PT_Pertamina_Patra_Niaga.png")}
            alt="Pertamina Patra Niaga"
          />
        </div>
        <p className="eyebrow">PRIMA</p>
        <h1>Pertamina Checklist Mobil Tangki</h1>
        <p>
          Kelola inspeksi, persetujuan, dan kelayakan kendaraan dalam satu ruang
          kerja yang aman.
        </p>
        <div className="brand-points">
          <span>
            <ShieldCheck /> Data terproteksi
          </span>
          <span>
            <ClipboardCheck /> Alur terdokumentasi
          </span>
        </div>
      </section>
      <section className="login-panel form-panel">
        <div className="login-form-wrap">
          <p className="eyebrow red">Selamat datang</p>
          <h2>Masuk ke PRIMA</h2>
          <p className="muted">
            Gunakan akun yang telah disetujui administrator.
          </p>
          {error && (
            <div className="alert">
              <AlertTriangle size={18} />
              {error}
            </div>
          )}
          <form onSubmit={submit}>
            <label>
              Username
              <input
                autoFocus
                autoComplete="username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
            <div className="captcha-field">
              <span>Verifikasi keamanan</span>
              {!captchaConfig && !captchaError && (
                <div className="captcha-loading">
                  <span className="spinner" /> Memuat CAPTCHA…
                </div>
              )}
              {captchaConfig?.enabled && (
                <TurnstileCaptcha
                  siteKey={captchaConfig.site_key}
                  resetKey={captchaReset}
                  onVerify={(token) => {
                    setCaptchaToken(token);
                    setCaptchaError("");
                  }}
                  onError={(message) => {
                    setCaptchaToken("");
                    setCaptchaError(message);
                  }}
                />
              )}
              {captchaConfig?.enabled === false && (
                <small>CAPTCHA dinonaktifkan pada lingkungan ini.</small>
              )}
              {captchaError && (
                <small className="captcha-error">{captchaError}</small>
              )}
            </div>
            <button
              className="button primary wide"
              disabled={
                busy ||
                !captchaConfig ||
                !!captchaError ||
                (captchaConfig.enabled && !captchaToken)
              }
            >
              {busy ? "Memproses…" : "Masuk"}
            </button>
          </form>
          <p className="register-link">
            Belum punya akun? <a href="#/register">Ajukan pendaftaran</a>
          </p>
        </div>
      </section>
    </main>
  );
}

function menuFor(user) {
  const common = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/checklists", label: "Data checklist", icon: Database },
  ];
  if (["admin", "user", "hsse", "pengurus"].includes(user.role))
    common.push(
      { to: "/checklists/new/SPBU", label: "Formulir SPBU", icon: FilePlus2 },
      {
        to: "/checklists/new/INDUSTRI",
        label: "Formulir Industri",
        icon: Factory,
      },
    );
  if (user.role === "admin")
    common.push({ to: "/vehicles", label: "Kelola Kendaraan", icon: Truck });
  if (user.role === "user")
    common.push({
      to: "/vehicle-registration",
      label: "Registrasi Kendaraan",
      icon: Truck,
    });
  if (user.role === "pengurus")
    common.push({ to: "/my-vehicles", label: "Kendaraan saya", icon: Truck });
  if (user.role === "admin")
    common.push({
      to: "/documents",
      label: "Review Dokumen Pengurus",
      icon: FileText,
    });
  if (user.role === "pengurus")
    common.push({
      to: "/documents",
      label: "Upload Dokumen Kendaraan",
      icon: FileText,
    });
  if (["admin", "hsse", "manager_hsse"].includes(user.role))
    common.push({
      to: "/approvals",
      label: "Persetujuan Checklist",
      icon: ClipboardCheck,
    });
  if (user.role === "admin")
    common.push(
      { to: "/registrations", label: "Review Pendaftaran", icon: UserPlus },
      { to: "/users", label: "Kelola Akun User", icon: Users },
      { to: "/alerts", label: "Notifikasi Inspeksi", icon: Bell },
      { to: "/audits", label: "Audit Log Sistem", icon: ScrollText },
      { to: "/notifications", label: "Notifikasi Email KIM", icon: Bell },
      { to: "/settings", label: "Pengaturan Sistem", icon: Settings },
    );
  return common;
}

function Shell({ user, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.body.classList.add("mobile-menu-open");
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.classList.remove("mobile-menu-open");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);
  return (
    <div className="app-shell">
      <aside
        id="primary-navigation"
        className={`sidebar ${mobileOpen ? "open" : ""}`}
      >
        <div className="sidebar-brand">
          <img
            src={assetUrl("foto/PT_Pertamina_Patra_Niaga.png")}
            alt="Pertamina"
          />
          <span>PRIMA · HSSE</span>
          <button
            className="sidebar-close"
            type="button"
            aria-label="Tutup menu navigasi"
            onClick={() => setMobileOpen(false)}
          >
            <X />
          </button>
        </div>
        <nav>
          <p className="nav-label">Menu utama</p>
          {menuFor(user).map(({ to, href, label, icon: Icon }) =>
            href ? (
              <a key={label} className="nav-link" href={assetUrl(href)}>
                <Icon />
                {label}
              </a>
            ) : (
              <NavLink
                key={label}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "active" : ""}`
                }
                to={to}
                end={to === "/" || to === "/checklists"}
              >
                <Icon />
                {label}
              </NavLink>
            ),
          )}
        </nav>
        <div className="sidebar-user">
          <div className="avatar">
            {(user.full_name || user.username).slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>{user.full_name || user.username}</strong>
            <span>{roleNames[user.role] || user.role}</span>
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="scrim"
          aria-label="Tutup menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="main-column">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            type="button"
            aria-label="Buka menu navigasi"
            aria-controls="primary-navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </button>
          <div>
            <strong>PRIMA</strong>
            <span>Pertamina Checklist Mobil Tangki</span>
          </div>
          <button className="button ghost" onClick={onLogout}>
            <LogOut size={16} />
            Keluar
          </button>
        </header>
        <Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route
            path="/checklists"
            element={<ChecklistDataPage user={user} />}
          />
          <Route
            path="/checklists/new/:jenis"
            element={<ChecklistEditor user={user} />}
          />
          <Route
            path="/checklists/:id"
            element={<ChecklistEditor user={user} />}
          />
          <Route
            path="/vehicles"
            element={
              user.role === "admin" ? (
                <VehiclesPage />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/my-vehicles"
            element={
              user.role === "pengurus" ? (
                <MyVehiclesPage />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/vehicle-registration"
            element={
              user.role === "user" ? (
                <VehicleRegistrationPage />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/approvals"
            element={
              ["admin", "hsse", "manager_hsse"].includes(user.role) ? (
                <Approvals user={user} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/documents"
            element={
              ["admin", "pengurus"].includes(user.role) ? (
                <DocumentsPage user={user} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/registrations"
            element={
              user.role === "admin" ? (
                <RegistrationsPage />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/users"
            element={
              user.role === "admin" ? (
                <UsersPage currentUser={user} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/alerts"
            element={
              user.role === "admin" ? (
                <AlertsPage />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/audits"
            element={
              user.role === "admin" ? (
                <AuditsPage />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/notifications"
            element={
              user.role === "admin" ? (
                <NotificationsPage />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/settings"
            element={
              user.role === "admin" ? (
                <SettingsPage />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route path="/verify/:value" element={<VerifyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow red">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}

function Dashboard({ user }) {
  const { data, loading, error, reload } = useAsync(api.dashboard, []);
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} retry={reload} />;
  const cards = [
    ["Total checklist", data.checklists, Database, "navy"],
    ["Draft", data.draft, FilePlus2, "slate"],
    ["Menunggu HSSE", data.pending_hsse, ClipboardCheck, "amber"],
    ["Menunggu Manager", data.signed_hsse, ShieldCheck, "blue"],
    ["Disetujui", data.approved, CheckCircle2, "green"],
  ];
  if (user.role === "admin")
    cards.push(["Pengguna aktif", data.active_users, Users, "red"]);
  return (
    <main className="page">
      <PageHeader
        eyebrow="Ringkasan operasional"
        title={`Selamat datang, ${user.full_name || user.username}`}
        description="Pantau progres inspeksi dan status persetujuan mobil tangki."
        actions={
          <button className="button secondary" onClick={reload}>
            <RefreshCw size={15} />
            Perbarui
          </button>
        }
      />
      <section className="metric-grid">
        {cards.map(([label, value, Icon, tone]) => (
          <article className={`metric-card ${tone}`} key={label}>
            <div className="metric-icon">
              <Icon />
            </div>
            <div>
              <strong>{value ?? 0}</strong>
              <span>{label}</span>
            </div>
          </article>
        ))}
      </section>
      {user.role === "user" && <UserStatistics data={data} />}
      {user.role === "user" && <UserProfilePanel user={user} />}
      {user.role === "manager_hsse" && <ManagerStatistics data={data} />}
      {user.role === "manager_hsse" && <UserProfilePanel user={user} />}
      {user.role === "pengurus" && !!data.ekim_notifications?.length && (
        <section className="pengurus-ekim-notifications">
          <div className="pengurus-notification-title">
            <AlertTriangle />
            <div>
              <strong>Notifikasi status EKIM</strong>
              <span>
                Tindak lanjuti surat kedaluwarsa sebelum mengajukan inspeksi
                ulang.
              </span>
            </div>
          </div>
          {data.ekim_notifications.map((notification) => (
            <article
              className={notification.is_new ? "is-new" : ""}
              key={notification.id}
            >
              <strong>{notification.nomor_polisi}</strong>
              <span>{notification.pesan}</span>
              <small>{notification.created_at}</small>
            </article>
          ))}
        </section>
      )}
      {user.role === "pengurus" && <PengurusStatistics data={data} />}
      {user.role === "pengurus" && <UserProfilePanel user={user} />}
      {user.role === "admin" ? (
        <AdminMonitoring data={data} />
      ) : !["user", "manager_hsse", "pengurus"].includes(user.role) ? (
        <section className="content-grid">
          <article className="panel span-2">
            <div className="panel-title">
              <div>
                <p className="eyebrow red">Akses cepat</p>
                <h2>Aktivitas utama</h2>
              </div>
            </div>
            <div className="quick-grid">
              <NavLink to="/checklists" className="quick-card">
                <Database />
                <strong>Database checklist</strong>
                <span>Cari dan pantau seluruh hasil inspeksi.</span>
                <ChevronRight />
              </NavLink>
              {["admin", "user", "hsse", "pengurus"].includes(user.role) && (
                <NavLink to="/checklists/new/SPBU" className="quick-card">
                  <FilePlus2 />
                  <strong>Checklist SPBU</strong>
                  <span>Mulai inspeksi kendaraan SPBU.</span>
                  <ChevronRight />
                </NavLink>
              )}
              {["admin", "user", "hsse", "pengurus"].includes(user.role) && (
                <NavLink to="/checklists/new/INDUSTRI" className="quick-card">
                  <Factory />
                  <strong>Checklist Industri</strong>
                  <span>Mulai inspeksi kendaraan Industri.</span>
                  <ChevronRight />
                </NavLink>
              )}
              {["admin", "hsse", "manager_hsse"].includes(user.role) && (
                <NavLink to="/approvals" className="quick-card">
                  <ShieldCheck />
                  <strong>Antrian persetujuan</strong>
                  <span>Tinjau dokumen yang menunggu tindakan.</span>
                  <ChevronRight />
                </NavLink>
              )}
            </div>
          </article>
          <aside className="panel">
            <p className="eyebrow red">Akun aktif</p>
            <div className="profile-block">
              <div className="avatar large">
                {(user.full_name || user.username)[0].toUpperCase()}
              </div>
              <h3>{user.full_name || user.username}</h3>
              <span className="role-pill">
                {roleNames[user.role] || user.role}
              </span>
              <dl>
                <div>
                  <dt>Username</dt>
                  <dd>{user.username}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{user.email || "—"}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </section>
      ) : null}
    </main>
  );
}

function UserStatistics({ data }) {
  const total = Math.max(Number(data.checklists) || 0, 1);
  const workflow = [
    ["Draft", data.draft, "slate"],
    ["Menunggu HSSE", data.pending_hsse, "amber"],
    ["Menunggu Manager", data.signed_hsse, "blue"],
    ["Disetujui", data.approved, "green"],
    ["Ditolak", data.rejected, "red"],
  ];
  return (
    <section className="user-statistics-grid">
      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow red">Statistik checklist</p>
            <h2>Distribusi status pemeriksaan</h2>
          </div>
          <BarChart3 />
        </div>
        <div className="workflow-bars">
          {workflow.map(([label, value, tone]) => (
            <div className="workflow-row" key={label}>
              <div>
                <span>{label}</span>
                <strong>{value || 0}</strong>
              </div>
              <div className="workflow-track">
                <span
                  className={tone}
                  style={{
                    width: `${Math.min(((value || 0) / total) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </article>
      <article className="panel user-data-summary">
        <div className="panel-title">
          <div>
            <p className="eyebrow red">Statistik data</p>
            <h2>Ringkasan kendaraan dan inspeksi</h2>
          </div>
          <Truck />
        </div>
        <div className="watch-list">
          <div>
            <span>Checklist SPBU</span>
            <strong>{data.spbu || 0}</strong>
          </div>
          <div>
            <span>Checklist Industri</span>
            <strong>{data.industri || 0}</strong>
          </div>
          <div>
            <span>Inspeksi bulan ini</span>
            <strong>{data.bulan_ini || 0}</strong>
          </div>
          <div>
            <span>Kendaraan yang saya registrasikan</span>
            <strong>{data.my_vehicles || 0}</strong>
          </div>
          <div>
            <span>Kendaraan saya berstatus aktif</span>
            <strong>{data.my_active_vehicles || 0}</strong>
          </div>
        </div>
      </article>
    </section>
  );
}

function UserProfilePanel({ user }) {
  const displayName = user.full_name || user.username;
  return (
    <section className="panel user-profile-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow red">Profil pengguna</p>
          <h2>Informasi akun</h2>
        </div>
        <UserRound />
      </div>
      <div className="user-profile-content">
        <div className="avatar large">
          {displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="user-profile-name">
          <strong>{displayName}</strong>
          <span className="role-pill">{roleNames[user.role] || user.role}</span>
        </div>
        <dl>
          <div>
            <dt>Username</dt>
            <dd>{user.username}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user.email || "—"}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function ManagerStatistics({ data }) {
  const total = Math.max(Number(data.checklists) || 0, 1);
  const workflow = [
    ["Draft", data.draft, "slate"],
    ["Menunggu HSSE", data.pending_hsse, "amber"],
    ["Menunggu persetujuan Manager", data.signed_hsse, "blue"],
    ["Disetujui", data.approved, "green"],
    ["Ditolak", data.rejected, "red"],
  ];
  return (
    <section className="user-statistics-grid manager-statistics-grid">
      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow red">Statistik persetujuan</p>
            <h2>Distribusi status checklist</h2>
          </div>
          <BarChart3 />
        </div>
        <div className="workflow-bars">
          {workflow.map(([label, value, tone]) => (
            <div className="workflow-row" key={label}>
              <div>
                <span>{label}</span>
                <strong>{value || 0}</strong>
              </div>
              <div className="workflow-track">
                <span
                  className={tone}
                  style={{
                    width: `${Math.min(((value || 0) / total) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </article>
      <article className="panel user-data-summary">
        <div className="panel-title">
          <div>
            <p className="eyebrow red">Statistik data</p>
            <h2>Ringkasan pemeriksaan kendaraan</h2>
          </div>
          <Database />
        </div>
        <div className="watch-list">
          <div>
            <span>Total checklist</span>
            <strong>{data.checklists || 0}</strong>
          </div>
          <div>
            <span>Checklist SPBU</span>
            <strong>{data.spbu || 0}</strong>
          </div>
          <div>
            <span>Checklist Industri</span>
            <strong>{data.industri || 0}</strong>
          </div>
          <div>
            <span>Inspeksi bulan ini</span>
            <strong>{data.bulan_ini || 0}</strong>
          </div>
          <div>
            <span>Persentase disetujui</span>
            <strong>
              {Math.round(((Number(data.approved) || 0) / total) * 100)}%
            </strong>
          </div>
        </div>
      </article>
    </section>
  );
}

function PengurusStatistics({ data }) {
  const total = Math.max(Number(data.checklists) || 0, 1);
  const workflow = [
    ["Draft", data.draft, "slate"],
    ["Menunggu HSSE", data.pending_hsse, "amber"],
    ["Menunggu Manager", data.signed_hsse, "blue"],
    ["Disetujui", data.approved, "green"],
    ["Ditolak", data.rejected, "red"],
  ];
  return (
    <section className="user-statistics-grid pengurus-statistics-grid">
      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow red">Statistik checklist</p>
            <h2>Distribusi status pemeriksaan</h2>
          </div>
          <BarChart3 />
        </div>
        <div className="workflow-bars">
          {workflow.map(([label, value, tone]) => (
            <div className="workflow-row" key={label}>
              <div>
                <span>{label}</span>
                <strong>{value || 0}</strong>
              </div>
              <div className="workflow-track">
                <span
                  className={tone}
                  style={{
                    width: `${Math.min(((value || 0) / total) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </article>
      <article className="panel user-data-summary">
        <div className="panel-title">
          <div>
            <p className="eyebrow red">Data tanggung jawab</p>
            <h2>Ringkasan kendaraan dan dokumen</h2>
          </div>
          <Truck />
        </div>
        <div className="watch-list">
          <div>
            <span>Kendaraan yang dikelola</span>
            <strong>{data.my_vehicles || 0}</strong>
          </div>
          <div>
            <span>Dokumen menunggu review</span>
            <strong>{data.my_pending_documents || 0}</strong>
          </div>
          <div>
            <span>Dokumen disetujui</span>
            <strong>{data.my_approved_documents || 0}</strong>
          </div>
          <div>
            <span>Dokumen ditolak</span>
            <strong>{data.my_rejected_documents || 0}</strong>
          </div>
          <div>
            <span>Inspeksi bulan ini</span>
            <strong>{data.bulan_ini || 0}</strong>
          </div>
        </div>
      </article>
    </section>
  );
}

function AdminMonitoring({ data }) {
  const total = Math.max(Number(data.checklists) || 0, 1);
  const workflow = [
    ["Draft", data.draft, "slate"],
    ["Menunggu HSSE", data.pending_hsse, "amber"],
    ["Menunggu Manager", data.signed_hsse, "blue"],
    ["Disetujui", data.approved, "green"],
    ["Ditolak", data.rejected, "red"],
  ];
  const watch = [
    ["Pendaftaran akun menunggu review", data.pending_registrations],
    ["Dokumen pengurus menunggu review", data.pending_documents],
    ["Kendaraan dengan peringatan inspeksi/KIM", data.vehicle_alerts],
    ["Total kendaraan terdaftar", data.vehicles],
    ["Akun pengguna aktif", data.active_users],
    [
      "Akun pengguna nonaktif",
      Math.max((data.users || 0) - (data.active_users || 0), 0),
    ],
  ];
  return (
    <section className="admin-monitor-grid">
      <article className="panel workflow-monitor">
        <div className="panel-title">
          <div>
            <p className="eyebrow red">Pantauan checklist</p>
            <h2>Distribusi status workflow</h2>
          </div>
          <BarChart3 />
        </div>
        <div className="workflow-bars">
          {workflow.map(([label, value, tone]) => (
            <div className="workflow-row" key={label}>
              <div>
                <span>{label}</span>
                <strong>{value || 0}</strong>
              </div>
              <div className="workflow-track">
                <span
                  className={tone}
                  style={{
                    width: `${Math.min(((value || 0) / total) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </article>
      <article className="panel admin-watch-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow red">Pantauan admin</p>
            <h2>Data yang perlu diperhatikan</h2>
          </div>
          <ShieldCheck />
        </div>
        <div className="watch-list">
          {watch.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value || 0}</strong>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function Checklists() {
  const [filters, setFilters] = useState({
    search: "",
    jenis: "",
    status: "",
    page: 1,
    limit: 12,
  });
  const [query, setQuery] = useState(filters);
  const [state, setState] = useState({
    loading: true,
    rows: [],
    pagination: {},
    error: "",
  });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const result = await api.checklists(query);
      setState({
        loading: false,
        rows: result.data || [],
        pagination: result.pagination || {},
        error: "",
      });
    } catch (error) {
      setState({
        loading: false,
        rows: [],
        pagination: {},
        error: error.message,
      });
    }
  }, [query]);
  useEffect(() => {
    load();
  }, [load]);
  const submit = (event) => {
    event.preventDefault();
    setQuery({ ...filters, page: 1 });
  };
  const page = state.pagination.page || 1,
    totalPages = state.pagination.totalPages || 1;
  return (
    <main className="page">
      <PageHeader
        eyebrow="Inspeksi kendaraan"
        title="Data checklist"
        description="Cari, filter, dan tinjau hasil pemeriksaan mobil tangki."
        actions={
          <>
            <button
              className="button secondary"
              onClick={() => api.exportChecklists()}
            >
              Export Excel
            </button>
            <NavLink className="button secondary" to="/checklists/new/INDUSTRI">
              Input Industri
            </NavLink>
            <NavLink className="button primary" to="/checklists/new/SPBU">
              Input SPBU
            </NavLink>
          </>
        }
      />
      <form className="filter-bar" onSubmit={submit}>
        <div className="search-field">
          <Search />
          <input
            placeholder="Cari nomor polisi, transportir, nomor urut…"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <select
          value={filters.jenis}
          onChange={(e) => setFilters({ ...filters, jenis: e.target.value })}
        >
          <option value="">Semua jenis</option>
          <option>SPBU</option>
          <option>INDUSTRI</option>
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">Semua status</option>
          {Object.entries(statusNames).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="button primary">Terapkan</button>
      </form>
      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <ErrorState message={state.error} retry={load} />
      ) : (
        <section className="table-panel">
          <div className="table-meta">
            <span>
              <strong>{state.pagination.total || 0}</strong> data ditemukan
            </span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>No. polisi</th>
                  <th>Jenis</th>
                  <th>Transportir</th>
                  <th>Tanggal</th>
                  <th>Kondisi</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.rows.length === 0 ? (
                  <tr>
                    <td colSpan="7">
                      <div className="empty">Belum ada data yang sesuai.</div>
                    </td>
                  </tr>
                ) : (
                  state.rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.nomor_polisi || "—"}</strong>
                        <small>{row.nomor_urut || "Tanpa nomor urut"}</small>
                      </td>
                      <td>
                        <span className="type-pill">{row.jenis_kendaraan}</span>
                      </td>
                      <td>{row.nama_transport || "—"}</td>
                      <td>{formatDate(row.tanggal_pemeriksaan)}</td>
                      <td>
                        <strong>
                          {Number(row.persentase_baik || 0).toFixed(0)}%
                        </strong>
                        <small>
                          {row.total_baik || 0}/{row.total_items || 0} baik
                        </small>
                      </td>
                      <td>
                        <Status value={row.status_approval} />
                      </td>
                      <td>
                        <NavLink
                          className="row-action"
                          to={`/checklists/${row.id}`}
                        >
                          Buka <ChevronRight />
                        </NavLink>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button
              disabled={page <= 1}
              onClick={() => setQuery({ ...query, page: page - 1 })}
            >
              <ChevronLeft />
            </button>
            <span>
              Halaman <strong>{page}</strong> dari {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setQuery({ ...query, page: page + 1 })}
            >
              <ChevronRight />
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function Status({ value }) {
  return (
    <span className={`status ${value || "draft"}`}>
      <span />
      {statusNames[value] || value || "Draft"}
    </span>
  );
}
function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export default function App() {
  const [auth, setAuth] = useState({ loading: true, user: null });
  const navigate = useNavigate();
  useEffect(() => {
    api
      .me()
      .then((r) => setAuth({ loading: false, user: r.data }))
      .catch(() => setAuth({ loading: false, user: null }));
  }, []);
  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setAuth({ loading: false, user: null });
      navigate("/");
    }
  };
  if (auth.loading) return <Loading />;
  if (!auth.user)
    return (
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify/:value" element={<VerifyPage />} />
        <Route
          path="*"
          element={
            <Login onLogin={(user) => setAuth({ loading: false, user })} />
          }
        />
      </Routes>
    );
  return <Shell user={auth.user} onLogout={logout} />;
}
