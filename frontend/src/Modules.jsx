import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import QRCode from "qrcode";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  FileText,
  KeyRound,
  PenLine,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shield,
  Trash2,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
import { api, assetUrl } from "./api";

const roles = {
  user: "User",
  pengurus: "Pengurus",
  hsse: "HSSE",
  manager_hsse: "Manager HSSE",
  admin: "Administrator",
};
const labels = {
  draft: "Draft",
  pending_hsse: "Menunggu HSSE",
  signed_hsse: "Menunggu Manager",
  approved: "Disetujui",
  rejected: "Ditolak",
};
const date = (v) =>
  v
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(
        new Date(`${String(v).slice(0, 10)}T00:00:00`),
      )
    : "—";
const expiryDateItems = new Set([
  "stnk",
  "pajak",
  "simfitindustri",
  "suratterametrologi",
  "suratkeurdllaajr",
]);
const normalizeChecklistName = (itemName) =>
  String(itemName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const usesExpiryDate = (itemName) =>
  expiryDateItems.has(normalizeChecklistName(itemName));
const status = (v) => (
  <span className={`status ${String(v).toLowerCase()}`}>
    <span />
    {labels[v] || v}
  </span>
);

function Head({ kicker, title, text, children }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow red">{kicker}</p>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function Busy() {
  return (
    <div className="state">
      <span className="spinner" />
      Memuat data…
    </div>
  );
}
function Notice({ value }) {
  return value ? (
    <div className={`alert ${value.ok ? "success" : ""}`}>
      {value.ok ? <Check /> : <AlertTriangle />}
      {value.text}
    </div>
  ) : null;
}
function useLoad(fn) {
  const [s, setS] = useState({ busy: true, data: null, error: "" });
  const load = async () => {
    setS((x) => ({ ...x, busy: true }));
    try {
      const r = await fn();
      setS({ busy: false, data: r.data, error: "" });
    } catch (e) {
      setS({ busy: false, data: null, error: e.message });
    }
  };
  useEffect(() => {
    load();
  }, []);
  return { ...s, load };
}

export function RegisterPage() {
  const [form, setForm] = useState({
      username: "",
      email: "",
      password: "",
      full_name: "",
      phone: "",
      reason: "",
      requested_role: "user",
    }),
    [note, setNote] = useState(null),
    [busy, setBusy] = useState(false);
  const set = (k, v) => setForm({ ...form, [k]: v });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.register(form);
      setNote({
        ok: true,
        text: "Pendaftaran terkirim. Silakan tunggu persetujuan administrator.",
      });
    } catch (x) {
      setNote({ text: x.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="standalone">
      <section className="standalone-card">
        <Link to="/" className="back-link">
          ← Kembali ke login
        </Link>
        <p className="eyebrow red">Registrasi akun</p>
        <h1>Ajukan akses PRIMA</h1>
        <p className="muted">
          Data akan ditinjau administrator sebelum akun dapat digunakan.
        </p>
        <Notice value={note} />
        <form className="form-grid" onSubmit={submit}>
          {[
            ["full_name", "Nama lengkap"],
            ["username", "Username"],
            ["email", "Email"],
            ["phone", "Nomor telepon"],
          ].map(([k, l]) => (
            <label key={k}>
              {l}
              <input
                value={form[k]}
                onChange={(e) => set(k, e.target.value)}
                required
              />
            </label>
          ))}
          <label>
            Role yang diajukan
            <select
              value={form.requested_role}
              onChange={(e) => set("requested_role", e.target.value)}
            >
              <option value="user">User</option>
              <option value="pengurus">Pengurus kendaraan</option>
              <option value="manager_hsse">Manager HSSE</option>
            </select>
          </label>
          <label>
            Password
            <input
              type="password"
              minLength="6"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              required
            />
          </label>
          <label className="full">
            Alasan membutuhkan akses
            <textarea
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              required
            />
          </label>
          <button className="button primary full" disabled={busy}>
            {busy ? "Mengirim…" : "Kirim pendaftaran"}
          </button>
        </form>
      </section>
    </main>
  );
}

const emptyForm = (jenis) => ({
  jenisKendaraan: jenis,
  nomorUrut: "",
  merkMobil: "",
  tahunKendaraan: "",
  namaTransport: "",
  nomorPolisi: "",
  produkKapasitas: "",
  tanggalTerakhir: "",
  emailKontraktor: "",
  statusKendaraan: "",
  selectedVehicleId: "",
  tanggalPemeriksaan: new Date().toISOString().slice(0, 10),
  ekimValidUntil: "",
  statusGate: "",
  statusUpload: "",
  catatan: "",
  namaPemeriksaBagian: "",
  tanggalPemeriksaBagian: "",
  namaManajer: "",
  tanggalManajer: "",
  statusApproval: "draft",
  checklist: [],
});
export function ChecklistEditor({ user }) {
  const { jenis = "SPBU", id } = useParams(),
    nav = useNavigate(),
    [form, setForm] = useState(emptyForm(jenis.toUpperCase())),
    [vehicles, setVehicles] = useState([]),
    [busy, setBusy] = useState(true),
    [note, setNote] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        if (id) {
          const [r, vehicleResponse] = await Promise.all([
              api.checklist(id),
              api.vehicles(),
            ]),
            d = r.data,
            vehicleRows = vehicleResponse.data || [],
            selectedVehicle = vehicleRows.find(
              (vehicle) => vehicle.nomor_polisi === d.nomor_polisi,
            );
          setVehicles(vehicleRows);
          const templateResponse = await api.checklistTemplate(
            d.jenis_kendaraan,
          );
          const templateByName = new Map(
            (templateResponse.data || []).map((templateItem) => [
              normalizeChecklistName(templateItem.nama),
              templateItem,
            ]),
          );
          const viewerName = user?.full_name || user?.username || "";
          setForm({
            id: d.id,
            jenisKendaraan: d.jenis_kendaraan,
            nomorUrut: d.nomor_urut || "",
            merkMobil: selectedVehicle
              ? [selectedVehicle.merk_mobil, selectedVehicle.tahun_kendaraan]
                  .filter(Boolean)
                  .join(" ")
              : d.merk_mobil || "",
            tahunKendaraan: selectedVehicle?.tahun_kendaraan || "",
            namaTransport: d.nama_transport || "",
            nomorPolisi: d.nomor_polisi || "",
            produkKapasitas: d.produk_kapasitas || "",
            tanggalTerakhir: String(
              selectedVehicle?.tanggal_pemeriksaan_terakhir ||
                d.tanggal_terakhir ||
                "",
            ).slice(0, 10),
            emailKontraktor: selectedVehicle?.email_kontraktor || "",
            statusKendaraan: selectedVehicle?.status || "",
            selectedVehicleId: selectedVehicle?.id
              ? String(selectedVehicle.id)
              : "",
            tanggalPemeriksaan: String(d.tanggal_pemeriksaan || "").slice(
              0,
              10,
            ),
            ekimValidUntil: String(d.ekim_valid_until || "").slice(0, 10),
            statusGate: d.status_gate || "",
            statusUpload: d.status_upload || "",
            catatan: d.catatan || "",
            namaPemeriksaBagian: d.ttd_hsse_nama || d.nama_pemeriksa || "",
            tanggalPemeriksaBagian: String(
              d.ttd_hsse_timestamp ||
                d.tanggal_pemeriksa ||
                (["admin", "hsse"].includes(user?.role)
                  ? new Date().toISOString()
                  : ""),
            ).slice(0, 10),
            namaManajer: d.ttd_manajer_nama || "",
            tanggalManajer: String(
              d.ttd_manajer_timestamp ||
                (user?.role === "manager_hsse" ? new Date().toISOString() : ""),
            ).slice(0, 10),
            ttdHsseNama: d.ttd_hsse_nama || "",
            ttdHsseWaktu: d.ttd_hsse_timestamp || "",
            ttdManagerNama: d.ttd_manajer_nama || "",
            ttdManagerWaktu: d.ttd_manajer_timestamp || "",
            verificationUrl: d.verification_url || "",
            viewerRole: d.viewer_role || "",
            viewerName,
            statusApproval: d.status_approval,
            checklist: (d.checklist_items || []).map((x, index) => {
              const templateItem = templateByName.get(
                normalizeChecklistName(x.item_name),
              );
              return {
                nama: x.item_name,
                pelaksana: templateItem?.pelaksana || "",
                prioritas: templateItem?.prioritas || "",
                nomor: templateItem ? templateItem.nomor : String(index + 1),
                rowspan: templateItem ? templateItem.rowspan : 1,
                baik: !!Number(x.is_baik),
                tidak: !!Number(x.is_tidak),
                keterangan: x.keterangan || "",
                tanggal_expire: String(x.tanggal_expire || "").slice(0, 10),
              };
            }),
          });
        } else {
          const [r, vehicleResponse] = await Promise.all([
            api.checklistTemplate(jenis),
            api.vehicles(),
          ]);
          setVehicles(vehicleResponse.data || []);
          const viewerName = user?.full_name || user?.username || "";
          setForm({
            ...emptyForm(jenis.toUpperCase()),
            viewerRole: user?.role || "",
            viewerName,
            namaPemeriksaBagian: "",
            tanggalPemeriksaBagian: ["admin", "hsse"].includes(user?.role)
              ? new Date().toISOString().slice(0, 10)
              : "",
            namaManajer: "",
            tanggalManajer:
              user?.role === "manager_hsse"
                ? new Date().toISOString().slice(0, 10)
                : "",
            checklist: r.data.map((x) => ({
              ...x,
              baik: false,
              tidak: false,
              keterangan: "",
              tanggal_expire: "",
            })),
          });
        }
      } catch (e) {
        setNote({ text: e.message });
      } finally {
        setBusy(false);
      }
    })();
  }, [id, jenis, user?.role, user?.full_name, user?.username]);
  const set = (k, v) => setForm({ ...form, [k]: v }),
    item = (i, p) =>
      setForm({
        ...form,
        checklist: form.checklist.map((x, n) => (n === i ? { ...x, ...p } : x)),
      });
  const selectVehicle = (vehicleId) => {
    const vehicle = vehicles.find(
      (row) => String(row.id) === String(vehicleId),
    );
    if (!vehicle) {
      setForm((current) => ({
        ...current,
        selectedVehicleId: "",
        nomorPolisi: "",
        merkMobil: "",
        tahunKendaraan: "",
        namaTransport: "",
        produkKapasitas: "",
        tanggalTerakhir: "",
        ekimValidUntil: "",
        emailKontraktor: "",
        statusKendaraan: "",
      }));
      return;
    }
    setForm((current) => ({
      ...current,
      selectedVehicleId: String(vehicle.id),
      jenisKendaraan: String(
        vehicle.jenis || current.jenisKendaraan,
      ).toUpperCase(),
      nomorPolisi: vehicle.nomor_polisi || "",
      merkMobil: [vehicle.merk_mobil, vehicle.tahun_kendaraan]
        .filter(Boolean)
        .join(" "),
      tahunKendaraan: vehicle.tahun_kendaraan || "",
      namaTransport: vehicle.nama_transport || "",
      produkKapasitas: vehicle.produk_kapasitas || "",
      tanggalTerakhir: String(vehicle.tanggal_pemeriksaan_terakhir || "").slice(
        0,
        10,
      ),
      ekimValidUntil: String(vehicle.ekim_valid_until || "").slice(0, 10),
      emailKontraktor: vehicle.email_kontraktor || "",
      statusKendaraan: vehicle.status || "",
    }));
    setNote(null);
  };
  const save = async () => {
    setNote(null);
    if (!form.selectedVehicleId) {
      setNote({
        text: "Pilih nomor polisi kendaraan dari daftar sebelum menyimpan checklist.",
      });
      return;
    }
    if (!form.ekimValidUntil) {
      setNote({ text: "Tanggal masa berlaku EKIM wajib diisi." });
      return;
    }
    if (
      form.tanggalPemeriksaan &&
      form.ekimValidUntil < form.tanggalPemeriksaan
    ) {
      setNote({
        text: "Tanggal masa berlaku EKIM tidak boleh lebih awal dari tanggal pemeriksaan.",
      });
      return;
    }
    const datedDocuments = form.checklist.filter(
      (checklistItem) =>
        usesExpiryDate(checklistItem.nama) &&
        !(
          checklistItem.nama === "SIMFIT (Industri)" &&
          form.jenisKendaraan !== "INDUSTRI"
        ),
    );
    const missingExpiry = datedDocuments.find(
      (checklistItem) => !checklistItem.tanggal_expire,
    );
    if (missingExpiry) {
      setNote({
        text: `Tanggal masa berlaku ${missingExpiry.nama} wajib diisi.`,
      });
      return;
    }
    const expiredOnInspection = datedDocuments.find(
      (checklistItem) =>
        form.tanggalPemeriksaan &&
        checklistItem.tanggal_expire < form.tanggalPemeriksaan,
    );
    if (expiredOnInspection) {
      setNote({
        text: `${expiredOnInspection.nama} sudah kedaluwarsa pada tanggal pemeriksaan. Upload surat pengganti dan isi tanggal yang baru.`,
      });
      return;
    }
    try {
      const r = await api.saveChecklist(form);
      setNote({ ok: true, text: r.message });
      if (!id) nav(`/checklists/${r.data.id}`, { replace: true });
    } catch (e) {
      setNote({ text: e.message });
    }
  };
  const remove = async () => {
    if (!id || !confirm("Hapus checklist ini?")) return;
    try {
      await api.deleteChecklist(id);
      nav("/checklists");
    } catch (e) {
      setNote({ text: e.message });
    }
  };
  const completedItems = form.checklist.filter(
    (checklistItem) => checklistItem.baik || checklistItem.tidak,
  ).length;
  const notGoodItems = form.checklist.filter(
    (checklistItem) => checklistItem.tidak,
  ).length;
  const completionPercentage = form.checklist.length
    ? Math.round((completedItems / form.checklist.length) * 100)
    : 0;
  if (busy) return <Busy />;
  return (
    <main
      className={`page checklist-form-page professional-checklist ${
        form.jenisKendaraan === "SPBU" ? "spbu-form" : "industri-form"
      }`}
    >
      <Head
        kicker="Form inspeksi"
        title={`Checklist Mobil Tangki ${form.jenisKendaraan}`}
        text={
          id
            ? `Mengubah dokumen #${id}`
            : "Lengkapi identitas dan seluruh item pemeriksaan."
        }
      >
        <Link className="button secondary" to="/checklists">
          Kembali
        </Link>
        <button className="button secondary" onClick={() => window.print()}>
          Cetak
        </button>
        {id && form.statusApproval === "draft" && (
          <button className="button secondary" onClick={remove}>
            <Trash2 />
            Hapus
          </button>
        )}
        <button
          className="button primary"
          onClick={save}
          disabled={form.statusApproval && form.statusApproval !== "draft"}
        >
          <Save />
          Simpan
        </button>
      </Head>
      <Notice value={note} />
      <section className="inspection-form-header">
        <div className="inspection-brand-row">
          <div className="hsse-form-brand">
            <img src={assetUrl("foto/Logo HSSE 2022.png")} alt="Logo HSSE" />
            <div>
              <strong>Health Safety</strong>
              <span>Security Environment</span>
            </div>
          </div>
          <img
            className="pertamina-form-logo"
            src={assetUrl("foto/PT_Pertamina_Patra_Niaga.png")}
            alt="PT Pertamina Patra Niaga"
          />
        </div>
        <div className="inspection-red-line" />
        <div className="inspection-title-banner">
          <div>
            <small>Dokumen inspeksi resmi</small>
            <strong>
              Formulir Checklist Inspeksi Perpanjangan Kartu Izin Masuk
            </strong>
            <span>
              Hasil pemeriksaan (keur) mobil tangki BBM · {form.jenisKendaraan}
            </span>
          </div>
        </div>
      </section>
      <section className="panel vehicle-identity-panel">
        <header className="professional-section-header">
          <span className="professional-section-number">01</span>
          <div>
            <strong>Identitas Kendaraan</strong>
            <small>
              Data kendaraan terisi otomatis setelah nomor polisi dipilih.
            </small>
          </div>
        </header>
        <div className="vehicle-identity-grid">
          <label>
            Nomor Urut
            <input
              value={form.nomorUrut}
              onChange={(event) => set("nomorUrut", event.target.value)}
              disabled={form.statusApproval !== "draft"}
            />
          </label>
          <label>
            Merk Mobil/Tahun
            <input value={form.merkMobil} readOnly />
          </label>
          <label>
            Nama Transportir
            <input value={form.namaTransport} readOnly />
          </label>
          <label className="nomor-polisi-field">
            Nomor Polisi
            <select
              value={form.selectedVehicleId || ""}
              onChange={(event) => selectVehicle(event.target.value)}
              disabled={form.statusApproval !== "draft"}
              required
            >
              <option value="">-- Pilih nomor polisi --</option>
              {vehicles
                .filter(
                  (vehicle) =>
                    String(vehicle.jenis).toUpperCase() ===
                      String(form.jenisKendaraan).toUpperCase() &&
                    (vehicle.status === "AKTIF" ||
                      vehicle.nomor_polisi === form.nomorPolisi),
                )
                .map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.nomor_polisi}
                  </option>
                ))}
            </select>
            <small>Pilih dari data kendaraan yang telah terdaftar.</small>
          </label>
          <label>
            Produk / Kapasitas
            <input value={form.produkKapasitas} readOnly />
          </label>
          <label>
            Pemeriksaan Tanggal
            <input
              type="date"
              value={form.tanggalPemeriksaan}
              onChange={(event) =>
                set("tanggalPemeriksaan", event.target.value)
              }
              disabled={form.statusApproval !== "draft"}
              required
            />
          </label>
        </div>
      </section>
      <section className="table-panel checklist-edit">
        <header className="professional-section-header checklist-progress-header">
          <span className="professional-section-number">02</span>
          <div>
            <strong>Item Pemeriksaan</strong>
            <small>
              Periksa setiap komponen dan pilih satu kondisi yang sesuai.
            </small>
          </div>
          <div className="inspection-progress-summary">
            <div>
              <span>{completedItems} item diperiksa</span>
              <strong>{completionPercentage}%</strong>
            </div>
            <span className="inspection-progress-track">
              <span style={{ width: `${completionPercentage}%` }} />
            </span>
            {notGoodItems > 0 && (
              <small>{notGoodItems} item perlu tindak lanjut</small>
            )}
          </div>
        </header>
        <div className="table-scroll">
          <table>
            <colgroup>
              <col className="col-number" />
              <col className="col-inspection" />
              <col className="col-officer" />
              <col className="col-priority" />
              <col className="col-condition" />
              <col className="col-condition" />
              <col className="col-description" />
            </colgroup>
            <thead>
              <tr>
                <th>No</th>
                <th>Jenis pemeriksaan</th>
                <th>Pelaksana</th>
                <th>Prioritas</th>
                <th>Baik</th>
                <th>Tidak</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {form.checklist.map((x, i) => (
                <tr key={i}>
                  {x.nomor && (
                    <td data-label="Kelompok" rowSpan={x.rowspan || 1}>
                      {x.nomor}
                    </td>
                  )}
                  <td
                    data-label="Pemeriksaan"
                    className={/^[a-z]\./i.test(x.nama) ? "sub-item" : ""}
                  >
                    <strong>{x.nama}</strong>
                  </td>
                  <td data-label="Pelaksana">{x.pelaksana || "—"}</td>
                  <td data-label="Prioritas" className="priority-cell">
                    {x.prioritas || "—"}
                  </td>
                  <td data-label="Baik" className="checkbox-cell">
                    <input
                      type="checkbox"
                      checked={x.baik}
                      disabled={form.statusApproval !== "draft"}
                      onChange={(e) =>
                        item(i, {
                          baik: e.target.checked,
                          tidak: e.target.checked ? false : x.tidak,
                        })
                      }
                    />
                  </td>
                  <td data-label="Tidak baik" className="checkbox-cell">
                    <input
                      type="checkbox"
                      checked={x.tidak}
                      disabled={form.statusApproval !== "draft"}
                      onChange={(e) =>
                        item(i, {
                          tidak: e.target.checked,
                          baik: e.target.checked ? false : x.baik,
                        })
                      }
                    />
                  </td>
                  <td data-label="Keterangan">
                    <textarea
                      value={x.keterangan}
                      disabled={form.statusApproval !== "draft"}
                      onChange={(e) => item(i, { keterangan: e.target.value })}
                    />
                    {usesExpiryDate(x.nama) && (
                      <div className="expire-field">
                        <label htmlFor={`expire-${i}`}>
                          Tgl Masa Berlaku Habis:
                        </label>
                        <input
                          id={`expire-${i}`}
                          className="mini-input"
                          type="date"
                          value={x.tanggal_expire}
                          required
                          disabled={form.statusApproval !== "draft"}
                          onChange={(e) =>
                            item(i, { tanggal_expire: e.target.value })
                          }
                        />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <ChecklistFooter form={form} setForm={setForm} id={id} onSave={save} />
    </main>
  );
}

function ChecklistFooter({ form, setForm, id, onSave }) {
  const [message, setMessage] = useState(null);
  const [signing, setSigning] = useState("");
  const role = form.viewerRole || "";
  const tidakBaikItems = (form.checklist || []).filter((item) => item.tidak);
  const hasTidakBaik = tidakBaikItems.length > 0;
  const canSignHsse =
    id &&
    ["admin", "hsse"].includes(role) &&
    ["draft", "pending_hsse"].includes(form.statusApproval) &&
    !form.ttdHsseNama &&
    !hasTidakBaik;
  const canSignManager =
    id &&
    role === "manager_hsse" &&
    form.statusApproval === "signed_hsse" &&
    !form.ttdManagerNama &&
    !hasTidakBaik;

  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const sign = async (signatureRole) => {
    const manager = signatureRole === "manajer";
    const name = manager ? form.namaManajer : form.namaPemeriksaBagian;
    const signatureDate = manager
      ? form.tanggalManajer
      : form.tanggalPemeriksaBagian;
    if (!id)
      return setMessage({
        text: "Simpan formulir terlebih dahulu sebelum menandatangani.",
      });
    if (hasTidakBaik)
      return setMessage({
        text: `Tanda tangan tidak dapat dilakukan. ${tidakBaikItems.length} item masih berstatus Tidak Baik: ${tidakBaikItems.map((item) => item.nama).join(", ")}.`,
      });
    if (!name || !signatureDate)
      return setMessage({
        text: "Nama dan tanggal penandatangan wajib diisi.",
      });
    setSigning(signatureRole);
    try {
      const result = await api.saveSignature({
        formulir_id: Number(id),
        role: signatureRole,
        canvas_image: typedSignature(name),
        signer_name: name,
      });
      setMessage({ ok: true, text: result.message });
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setMessage({ text: error.message });
    } finally {
      setSigning("");
    }
  };
  const reset = () => {
    if (!confirm("Kosongkan kembali isian formulir yang belum disimpan?"))
      return;
    setForm((current) => ({
      ...emptyForm(current.jenisKendaraan),
      viewerRole: current.viewerRole,
      viewerName: current.viewerName,
      namaPemeriksaBagian: "",
      tanggalPemeriksaBagian: ["admin", "hsse"].includes(current.viewerRole)
        ? new Date().toISOString().slice(0, 10)
        : "",
      namaManajer: "",
      tanggalManajer:
        current.viewerRole === "manager_hsse"
          ? new Date().toISOString().slice(0, 10)
          : "",
      checklist: current.checklist.map((item) => ({
        ...item,
        baik: false,
        tidak: false,
        keterangan: "",
        tanggal_expire: "",
      })),
    }));
  };

  return (
    <section className="checklist-form-footer">
      <header className="professional-section-header footer-section-header">
        <span className="professional-section-number">03</span>
        <div>
          <strong>Hasil Akhir dan Pengesahan</strong>
          <small>
            Lengkapi kesimpulan pemeriksaan sebelum dokumen ditandatangani.
          </small>
        </div>
      </header>
      <div className="checklist-note-box">
        <label>Catatan:</label>
        <textarea
          placeholder="Masukkan catatan tambahan di sini..."
          value={form.catatan || ""}
          onChange={(event) => update("catatan", event.target.value)}
          disabled={form.statusApproval !== "draft"}
        />
      </div>

      <div className="checklist-status-table">
        <div>
          <strong>EKIM Valid Until</strong>
          <span>
            <input
              type="date"
              value={form.ekimValidUntil || ""}
              required
              onChange={(event) => update("ekimValidUntil", event.target.value)}
              disabled={form.statusApproval !== "draft"}
            />
          </span>
        </div>
        <div>
          <strong>Status Perpanjang Akses Gate Barrier</strong>
          <span className="radio-options">
            {["OK", "Not OK"].map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="statusGateReact"
                  value={value}
                  checked={form.statusGate === value}
                  onChange={() => update("statusGate", value)}
                  disabled={form.statusApproval !== "draft"}
                />
                {value}
              </label>
            ))}
          </span>
        </div>
        <div>
          <strong>Status Upload Dokumen Online</strong>
          <span className="radio-options">
            {["OK", "Not OK"].map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="statusUploadReact"
                  value={value}
                  checked={form.statusUpload === value}
                  onChange={() => update("statusUpload", value)}
                  disabled={form.statusApproval !== "draft"}
                />
                {value}
              </label>
            ))}
          </span>
        </div>
      </div>

      {hasTidakBaik && (
        <div className="signature-blocked-warning">
          <AlertTriangle />
          <span>
            <strong>TANDA TANGAN DINONAKTIFKAN</strong>
            Terdapat {tidakBaikItems.length} item berstatus Tidak Baik:{" "}
            {tidakBaikItems.map((item) => item.nama).join(", ")}. Perbaiki dan
            ubah seluruh item tersebut menjadi Baik terlebih dahulu.
          </span>
        </div>
      )}

      <div className="digital-signature-block">
        <div className="digital-signature-title">
          <span>TANDA TANGAN DIGITAL</span>
          <span className="crypto-mark">VALIDASI WEB · HMAC-SHA256</span>
        </div>
        <div className="signature-card-grid">
          <article className="signature-card hsse-card">
            <header>
              <strong>PEMERIKSA BAGIAN HSSE</strong>
              <span>Health Safety Security Environment</span>
            </header>
            <div className="signature-card-body">
              <label>
                Nama Pemeriksa HSSE:
                <input
                  value={form.namaPemeriksaBagian || ""}
                  onChange={(event) =>
                    update("namaPemeriksaBagian", event.target.value)
                  }
                  disabled={
                    !!form.ttdHsseNama || !["admin", "hsse"].includes(role)
                  }
                  placeholder="Ketik nama lengkap pemeriksa HSSE"
                  autoComplete="name"
                />
                {["admin", "hsse"].includes(role) && !form.ttdHsseNama && (
                  <small>Harus sesuai akun aktif: {form.viewerName}</small>
                )}
              </label>
              <label>
                Tanggal:
                <input
                  type="date"
                  value={form.tanggalPemeriksaBagian || ""}
                  readOnly
                  disabled={
                    !!form.ttdHsseNama || !["admin", "hsse"].includes(role)
                  }
                />
              </label>
              {form.ttdHsseNama ? (
                <div className="signature-verified">
                  <Check />{" "}
                  <span>
                    <strong>TERVERIFIKASI</strong>
                    {form.ttdHsseNama}
                    <small>{form.ttdHsseWaktu}</small>
                  </span>
                </div>
              ) : (
                <button
                  disabled={!canSignHsse || signing}
                  onClick={() => sign("hsse")}
                >
                  {signing === "hsse"
                    ? "Memproses tanda tangan..."
                    : hasTidakBaik
                      ? "Tidak Bisa TTD — Ada Item Tidak Baik"
                      : id
                        ? "Tandatangani & Buat QR Validasi"
                        : "Simpan Data Sebelum Tanda Tangan"}
                </button>
              )}
            </div>
          </article>
          <article className="signature-card manager-card">
            <header>
              <strong>MANAJER / PIMPINAN</strong>
              <span>Persetujuan & Pengesahan</span>
            </header>
            <div className="signature-card-body">
              <label>
                Nama Manajer:
                <input
                  value={form.namaManajer || ""}
                  onChange={(event) =>
                    update("namaManajer", event.target.value)
                  }
                  disabled={!!form.ttdManagerNama || role !== "manager_hsse"}
                  placeholder="Ketik nama lengkap Manajer"
                  autoComplete="name"
                />
                {role === "manager_hsse" && !form.ttdManagerNama && (
                  <small>Harus sesuai akun aktif: {form.viewerName}</small>
                )}
              </label>
              <label>
                Tanggal:
                <input
                  type="date"
                  value={form.tanggalManajer || ""}
                  readOnly
                  disabled={!!form.ttdManagerNama || role !== "manager_hsse"}
                />
              </label>
              {form.ttdManagerNama ? (
                <div className="signature-verified">
                  <Check />{" "}
                  <span>
                    <strong>DISETUJUI</strong>
                    {form.ttdManagerNama}
                    <small>{form.ttdManagerWaktu}</small>
                  </span>
                </div>
              ) : (
                <button
                  className="manager-sign"
                  disabled={!canSignManager || signing}
                  onClick={() => sign("manajer")}
                >
                  {signing === "manajer"
                    ? "Memproses persetujuan..."
                    : hasTidakBaik
                      ? "Tidak Bisa TTD — Ada Item Tidak Baik"
                      : canSignManager
                        ? "Tandatangani dan Setujui"
                        : "Menunggu Persetujuan Manager"}
                </button>
              )}
            </div>
          </article>
        </div>
        {form.verificationUrl && (
          <div className="verification-panel">
            <QrImage value={form.verificationUrl} />
            <div className="verification-link">
              <Shield />
              <span>
                <strong>SCAN UNTUK VALIDASI KEASLIAN</strong>QR membuka halaman
                validasi resmi sistem.
                <a href={form.verificationUrl} target="_blank" rel="noreferrer">
                  {form.verificationUrl}
                </a>
              </span>
            </div>
          </div>
        )}
      </div>
      <Notice value={message} />
      <div className="checklist-footer-actions">
        <Link className="footer-action muted-action" to="/">
          Kembali ke Home
        </Link>
        <Link className="footer-action muted-action" to="/checklists">
          Lihat Semua Data
        </Link>
        <button
          className="footer-action save-action"
          onClick={onSave}
          disabled={form.statusApproval !== "draft"}
        >
          Simpan Data
        </button>
        <button
          className="footer-action print-action"
          onClick={() => window.print()}
        >
          Cetak
        </button>
        <button
          className="footer-action muted-action"
          onClick={reset}
          disabled={form.statusApproval !== "draft"}
        >
          Reset
        </button>
      </div>
    </section>
  );
}

export function Approvals({ user }) {
  const q = {
      page: 1,
      limit: 100,
      status:
        user.role === "manager_hsse"
          ? "signed_hsse"
          : user.role === "hsse"
            ? "pending_hsse"
            : "",
    },
    [s, setS] = useState({ busy: true, rows: [] }),
    [note, setNote] = useState(null);
  const load = async () => {
    setS({ busy: true, rows: [] });
    try {
      const r = await api.checklists(q);
      setS({ busy: false, rows: r.data });
    } catch (e) {
      setNote({ text: e.message });
      setS({ busy: false, rows: [] });
    }
  };
  useEffect(() => {
    load();
  }, []);
  const act = async (row, action) => {
    let reason = "";
    if (action === "reject") {
      reason = prompt("Alasan penolakan:") || "";
      if (!reason) return;
    }
    try {
      if (action === "sign_hsse" || action === "approve_manager") {
        const name =
          prompt("Nama penandatangan:", user.full_name) || user.full_name;
        if (!name) return;
        await api.saveSignature({
          formulir_id: row.id,
          role: action === "sign_hsse" ? "hsse" : "manajer",
          canvas_image: typedSignature(name),
          signer_name: name,
        });
      } else await api.workflow({ formulir_id: row.id, action, reason });
      setNote({ ok: true, text: "Status dokumen berhasil diperbarui." });
      load();
    } catch (e) {
      setNote({ text: e.message });
    }
  };
  return (
    <main className="page">
      <Head
        kicker="Workflow"
        title="Persetujuan checklist"
        text="Kunci, tanda tangani, setujui, tolak, atau reset dokumen sesuai wewenang."
      />
      <Notice value={note} />
      {s.busy ? (
        <Busy />
      ) : (
        <DataTable
          heads={["Kendaraan", "Transportir", "Tanggal", "Status", "Aksi"]}
          rows={s.rows.map((r) => [
            <Link to={`/checklists/${r.id}`}>{r.nomor_polisi}</Link>,
            r.nama_transport,
            date(r.tanggal_pemeriksaan),
            status(r.status_approval),
            <div className="row-buttons">
              {r.status_approval === "draft" &&
                ["admin", "user", "hsse"].includes(user.role) && (
                  <button onClick={() => act(r, "submit")}>Submit</button>
                )}
              {r.status_approval === "pending_hsse" &&
                ["admin", "hsse"].includes(user.role) && (
                  <button onClick={() => act(r, "sign_hsse")}>TTD HSSE</button>
                )}
              {r.status_approval === "signed_hsse" &&
                user.role === "manager_hsse" && (
                  <button onClick={() => act(r, "approve_manager")}>
                    Setujui
                  </button>
                )}
              {["signed_hsse", "pending_hsse"].includes(r.status_approval) &&
                ["admin", "manager_hsse"].includes(user.role) && (
                  <button className="danger" onClick={() => act(r, "reject")}>
                    Tolak
                  </button>
                )}
              {user.role === "admin" && r.status_approval !== "approved" && (
                <button onClick={() => act(r, "reset_draft")}>Reset</button>
              )}
            </div>,
          ])}
        />
      )}
    </main>
  );
}
function typedSignature(name) {
  const c = document.createElement("canvas");
  c.width = 500;
  c.height = 180;
  const x = c.getContext("2d");
  x.fillStyle = "#fff";
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#0d1f35";
  x.font = "italic 42px cursive";
  x.textAlign = "center";
  x.fillText(name, 250, 100);
  x.strokeStyle = "#0d1f35";
  x.beginPath();
  x.moveTo(90, 125);
  x.lineTo(410, 125);
  x.stroke();
  return c.toDataURL("image/png");
}

function QrImage({ value, size = 148 }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let active = true;
    if (!value) return undefined;
    QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#071d33", light: "#ffffff" },
    }).then((dataUrl) => active && setSource(dataUrl));
    return () => {
      active = false;
    };
  }, [value, size]);
  return source ? (
    <img
      className="verification-qr"
      src={source}
      alt="QR Code validasi dokumen"
      width={size}
      height={size}
    />
  ) : (
    <span className="qr-loading">Membuat QR...</span>
  );
}

function DataTable({ heads, rows }) {
  return (
    <section className="table-panel">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {heads.map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={heads.length}>
                  <div className="empty">Belum ada data.</div>
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} data-label={heads[j]}>
                      {c ?? "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function nextSemester() {
  const now = new Date(),
    year = now.getFullYear(),
    dates = [
      new Date(year, 1, 25),
      new Date(year, 7, 25),
      new Date(year + 1, 1, 25),
    ],
    next = dates.find(
      (x) => x >= new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    );
  return {
    label: new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(next),
    days: Math.ceil((next - now) / 86400000),
  };
}
export function ChecklistDataPage() {
  const [filters, setFilters] = useState({
      search: "",
      dateFrom: "",
      dateTo: "",
      jenis: "",
      status: "",
      page: 1,
      limit: 20,
    }),
    [applied, setApplied] = useState({
      search: "",
      dateFrom: "",
      dateTo: "",
      jenis: "",
      status: "",
      page: 1,
      limit: 20,
    }),
    [result, setResult] = useState({ busy: true, rows: [], pagination: {} }),
    stats = useLoad(api.checklistStats),
    [note, setNote] = useState(null);
  const semester = nextSemester();
  const load = async () => {
    setResult((x) => ({ ...x, busy: true }));
    try {
      const r = await api.checklists(applied);
      setResult({
        busy: false,
        rows: r.data || [],
        pagination: r.pagination || {},
      });
    } catch (e) {
      setResult({ busy: false, rows: [], pagination: {} });
      setNote({ text: e.message });
    }
  };
  useEffect(() => {
    load();
  }, [applied]);
  const apply = (e) => {
    e?.preventDefault();
    setApplied({ ...filters, page: 1 });
  };
  const tab = (jenis) => {
    setFilters((x) => ({ ...x, jenis }));
    setApplied((x) => ({ ...x, jenis, page: 1 }));
  };
  const reset = () => {
    const x = {
      search: "",
      dateFrom: "",
      dateTo: "",
      jenis: "",
      status: "",
      page: 1,
      limit: 20,
    };
    setFilters(x);
    setApplied(x);
  };
  const remove = async (row) => {
    if (!confirm(`Hapus checklist ${row.nomor_polisi}?`)) return;
    try {
      await api.deleteChecklist(row.id);
      load();
      stats.load();
    } catch (e) {
      setNote({ text: e.message });
    }
  };
  const go = (page) => setApplied((x) => ({ ...x, page }));
  const p = result.pagination,
    page = p.page || 1,
    pages = p.totalPages || 1;
  return (
    <main className="page checklist-page">
      <div className="checklist-module-head">
        <div className="module-identity">
          <img src={assetUrl("foto/PT_Pertamina_Patra_Niaga.png")} />
          <span />
          <div>
            <h1>Data Checklist E-KIM Pertamina</h1>
            <p>Sistem Manajemen Inspeksi Perpanjangan Kartu Izin Masuk</p>
          </div>
        </div>
        <div className="heading-actions">
          <Link className="button secondary" to="/">
            ← Kembali
          </Link>
          <Link className="button primary" to="/checklists/new/SPBU">
            Input SPBU
          </Link>
          <Link className="button secondary" to="/checklists/new/INDUSTRI">
            Input Industri
          </Link>
        </div>
      </div>
      <Notice value={note} />
      <section className="checklist-stat-grid">
        {[
          ["TOTAL DATA", stats.data?.total || 0, ""],
          ["SPBU", stats.data?.spbu || 0, ""],
          ["INDUSTRI", stats.data?.industri || 0, ""],
          ["BULAN INI", stats.data?.bulan_ini || 0, ""],
          ["KIM KEDALUWARSA", stats.data?.kim_kedaluwarsa || 0, "danger"],
        ].map(([l, v, t]) => (
          <article className={`checklist-stat ${t}`}>
            <strong>{v}</strong>
            <span>{l}</span>
          </article>
        ))}
      </section>
      <div className="semester-alert">
        <CalendarDays />
        <span>
          <strong>Jadwal Inspeksi Semester:</strong> Setiap <b>25 Februari</b>{" "}
          dan <b>25 Agustus</b> — Inspeksi semester berikutnya:{" "}
          <strong>{semester.label}</strong>
        </span>
        <em>{semester.days} hari lagi</em>
      </div>
      <form className="checklist-filter" onSubmit={apply}>
        <input
          placeholder="Cari Nomor Polisi, Nama Transport, atau Nomor Urut…"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
        />
        <button className="button secondary">Filter</button>
        <button type="button" className="button secondary" onClick={reset}>
          ↻ Reset
        </button>
        <button
          type="button"
          className="button primary"
          onClick={() => api.exportChecklists(applied)}
        >
          ⇩ Export Excel
        </button>
      </form>
      <div className="vehicle-tabs">
        <button
          className={!applied.jenis ? "active" : ""}
          onClick={() => tab("")}
        >
          Semua Kendaraan
        </button>
        <button
          className={applied.jenis === "SPBU" ? "active" : ""}
          onClick={() => tab("SPBU")}
        >
          SPBU
        </button>
        <button
          className={applied.jenis === "INDUSTRI" ? "active" : ""}
          onClick={() => tab("INDUSTRI")}
        >
          Industri
        </button>
      </div>
      {result.busy ? (
        <Busy />
      ) : (
        <section className="checklist-table">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>NO</th>
                  <th>JENIS</th>
                  <th>NOMOR POLISI</th>
                  <th>NAMA TRANSPORT</th>
                  <th>MERK MOBIL</th>
                  <th>TGL PERIKSA</th>
                  <th>EKIM VALID</th>
                  <th>STATUS</th>
                  <th>PROGRESS</th>
                  <th>TTD</th>
                  <th>AKSI</th>
                </tr>
              </thead>
              <tbody>
                {!result.rows.length ? (
                  <tr>
                    <td colSpan="11">
                      <div className="empty">Belum ada data checklist.</div>
                    </td>
                  </tr>
                ) : (
                  result.rows.map((r, i) => (
                    <tr
                      className={
                        r.total_dokumen_expired > 0 ? "expired-row" : ""
                      }
                      key={r.id}
                    >
                      <td data-label="No">
                        {(page - 1) * (p.limit || 20) + i + 1}
                      </td>
                      <td data-label="Jenis">
                        <span className="kind-badge">{r.jenis_kendaraan}</span>
                      </td>
                      <td data-label="Nomor polisi">
                        <strong>{r.nomor_polisi}</strong>
                      </td>
                      <td data-label="Transportir">
                        {r.nama_transport || "—"}
                      </td>
                      <td data-label="Merk mobil">{r.merk_mobil || "—"}</td>
                      <td data-label="Tgl periksa">
                        {date(r.tanggal_pemeriksaan)}
                      </td>
                      <td data-label="EKIM valid">
                        <strong
                          className={
                            r.ekim_valid_until &&
                            r.ekim_valid_until <
                              new Date().toISOString().slice(0, 10)
                              ? "expired-text"
                              : ""
                          }
                        >
                          {date(r.ekim_valid_until)}
                        </strong>
                        {r.ekim_valid_until &&
                          r.ekim_valid_until <
                            new Date().toISOString().slice(0, 10) && (
                            <span className="expired-label">KEDALUWARSA</span>
                          )}
                      </td>
                      <td data-label="Status">
                        <span
                          className={`operation ${String(r.status_gate).toLowerCase().includes("tidak") ? "bad" : "good"}`}
                        >
                          {r.status_gate ||
                            labels[r.status_approval] ||
                            "Draft"}
                        </span>
                      </td>
                      <td data-label="Progress">
                        <span className="progress-badge">
                          {Math.round(Number(r.persentase_baik || 0))}%
                        </span>
                      </td>
                      <td data-label="Tanda tangan">
                        <div className="signature-pills">
                          <span className={r.ttd_hsse_nama ? "done" : ""}>
                            HSSE{r.ttd_hsse_nama ? " ✓" : " −"}
                          </span>
                          <span className={r.ttd_manajer_nama ? "done" : ""}>
                            MGR{r.ttd_manajer_nama ? " ✓" : " −"}
                          </span>
                        </div>
                      </td>
                      <td data-label="Aksi">
                        <div className="icon-actions">
                          <Link
                            className="view"
                            title="Lihat"
                            to={`/checklists/${r.id}`}
                          >
                            <Eye />
                          </Link>
                          <Link
                            className="edit"
                            title="Edit"
                            to={`/checklists/${r.id}`}
                          >
                            <Edit3 />
                          </Link>
                          <button
                            className="delete"
                            title="Hapus"
                            onClick={() => remove(r)}
                          >
                            <Trash2 />
                          </button>
                          <Link
                            className="secure"
                            title="Approval"
                            to="/approvals"
                          >
                            <Shield />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="checklist-pagination">
        <button disabled={page <= 1} onClick={() => go(1)}>
          First
        </button>
        <button disabled={page <= 1} onClick={() => go(page - 1)}>
          Prev
        </button>
        <span>
          Halaman <strong>{page}</strong> dari <strong>{pages}</strong>
        </span>
        <button disabled={page >= pages} onClick={() => go(page + 1)}>
          Next
        </button>
        <button disabled={page >= pages} onClick={() => go(pages)}>
          Last
        </button>
      </div>
    </main>
  );
}

export function UsersPage({ currentUser }) {
  const { data, busy, load } = useLoad(api.users),
    [note, setNote] = useState(null),
    [edit, setEdit] = useState(null);
  const toggle = async (u) => {
    try {
      await api.toggleUser({
        user_id: u.id,
        status: u.status === "active" ? "inactive" : "active",
      });
      load();
    } catch (e) {
      setNote({ text: e.message });
    }
  };
  const reset = async (u) => {
    const p = prompt(`Password baru untuk ${u.username}:`);
    if (!p) return;
    try {
      await api.resetPassword({ user_id: u.id, new_password: p });
      setNote({ ok: true, text: "Password berhasil direset." });
    } catch (e) {
      setNote({ text: e.message });
    }
  };
  const remove = async (u) => {
    const confirmed = window.confirm(
      `Hapus pengguna ${u.full_name} (${u.username}) secara permanen?\n\nRiwayat checklist dan audit tetap disimpan, tetapi akun tidak dapat dipulihkan.`,
    );
    if (!confirmed) return;

    try {
      await api.deleteUser(u.id);
      if (edit?.id === u.id) setEdit(null);
      setNote({ ok: true, text: `Pengguna ${u.username} berhasil dihapus.` });
      await load();
    } catch (e) {
      setNote({ text: e.message });
    }
  };
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.updateUser({ ...edit, user_id: edit.id });
      setEdit(null);
      load();
    } catch (x) {
      setNote({ text: x.message });
    }
  };
  return (
    <main className="page">
      <Head
        kicker="Administrasi"
        title="Kelola pengguna"
        text="Role, status akun, dan reset kredensial."
      />
      <Notice value={note} />
      {edit && (
        <section className="panel">
          <form className="form-grid" onSubmit={save}>
            {[
              ["full_name", "Nama"],
              ["email", "Email"],
              ["phone", "Telepon"],
              ["department", "Departemen"],
              ["position", "Jabatan"],
            ].map(([k, l]) => (
              <label>
                {l}
                <input
                  value={edit[k] || ""}
                  onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                  required={["full_name", "email"].includes(k)}
                />
              </label>
            ))}
            <label>
              Role
              <select
                value={edit.role}
                onChange={(e) => setEdit({ ...edit, role: e.target.value })}
              >
                {Object.entries(roles).map(([v, l]) => (
                  <option value={v}>{l}</option>
                ))}
              </select>
            </label>
            <div className="row-buttons full">
              <button className="button primary">Simpan</button>
              <button type="button" onClick={() => setEdit(null)}>
                Batal
              </button>
            </div>
          </form>
        </section>
      )}
      {busy ? (
        <Busy />
      ) : (
        <DataTable
          heads={["Pengguna", "Kontak", "Role", "Status", "Aksi"]}
          rows={(data || []).map((u) => [
            <>
              <strong>{u.full_name}</strong>
              <small>{u.username}</small>
            </>,
            <>
              <span>{u.email}</span>
              <small>{u.phone}</small>
            </>,
            roles[u.role],
            status(u.status),
            <div className="row-buttons">
              <button onClick={() => setEdit(u)}>Edit</button>
              <button onClick={() => toggle(u)}>
                {u.status === "active" ? "Nonaktifkan" : "Aktifkan"}
              </button>
              <button onClick={() => reset(u)}>
                <KeyRound />
                Reset password
              </button>
              <button
                className="danger"
                onClick={() => remove(u)}
                disabled={u.id === currentUser?.id || u.username === "admin"}
                title={
                  u.id === currentUser?.id
                    ? "Akun yang sedang digunakan tidak dapat dihapus"
                    : u.username === "admin"
                      ? "Akun admin utama tidak dapat dihapus"
                      : "Hapus pengguna"
                }
              >
                <Trash2 />
                Hapus
              </button>
            </div>,
          ])}
        />
      )}
    </main>
  );
}
export function RegistrationsPage() {
  const { data, busy, load } = useLoad(api.registrations),
    [note, setNote] = useState(null);
  const review = async (r, action) => {
    const reason =
      action === "reject"
        ? prompt("Alasan penolakan:") || "Ditolak administrator"
        : "";
    try {
      await api.reviewRegistration({ id: r.id, action, reason });
      load();
    } catch (e) {
      setNote({ text: e.message });
    }
  };
  return (
    <main className="page">
      <Head
        kicker="Administrasi"
        title="Pendaftaran akun"
        text="Tinjau permohonan akses pengguna baru."
      />
      <Notice value={note} />
      {busy ? (
        <Busy />
      ) : (
        <DataTable
          heads={["Pemohon", "Role", "Alasan", "Status", "Aksi"]}
          rows={(data || []).map((r) => [
            <>
              <strong>{r.full_name}</strong>
              <small>{r.email}</small>
            </>,
            roles[r.requested_role],
            r.reason,
            status(r.status),
            r.status === "pending" ? (
              <div className="row-buttons">
                <button onClick={() => review(r, "approve")}>Setujui</button>
                <button className="danger" onClick={() => review(r, "reject")}>
                  Tolak
                </button>
              </div>
            ) : (
              "—"
            ),
          ])}
        />
      )}
    </main>
  );
}

export function DocumentsPage({ user }) {
  const expiryRequiredTypes = [
    "STNK",
    "PAJAK",
    "SIM",
    "SURAT_KEUR",
    "SURAT_TERA",
  ];
  const { data, busy, load } = useLoad(api.documents),
    [note, setNote] = useState(null),
    [form, setForm] = useState({
      nomor_polisi: "",
      jenis_dokumen: "STNK",
      tanggal_berlaku: "",
      nama_transport: "",
      keterangan: "",
      file: null,
    });
  const upload = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => v != null && fd.append(k, v));
    try {
      await api.uploadDocument(fd);
      setNote({ ok: true, text: "Dokumen berhasil diunggah." });
      load();
    } catch (x) {
      setNote({ text: x.message });
    }
  };
  const review = async (d, s) => {
    try {
      await api.reviewDocument({
        action: "review_doc",
        doc_id: d.id,
        status: s,
        catatan:
          s === "DITOLAK" ? prompt("Catatan penolakan:") || "Ditolak" : "",
      });
      load();
    } catch (e) {
      setNote({ text: e.message });
    }
  };
  return (
    <main className="page">
      <Head
        kicker="Dokumen kendaraan"
        title={
          user.role === "admin"
            ? "Review dokumen pengurus"
            : "Dokumen kendaraan"
        }
        text={
          user.role === "admin"
            ? "Setujui atau tolak dokumen kendaraan yang diunggah pengurus mobil tangki."
            : "Unggah dan pantau dokumen kendaraan yang menjadi tanggung jawab Anda."
        }
      />
      <Notice value={note} />
      {user.role === "pengurus" && (
        <section className="panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow red">Pengurus mobil tangki</p>
              <h2>Upload dokumen kendaraan</h2>
            </div>
          </div>
          <form className="form-grid" onSubmit={upload}>
            <label>
              Nomor polisi
              <input
                value={form.nomor_polisi}
                onChange={(e) =>
                  setForm({ ...form, nomor_polisi: e.target.value })
                }
                required
              />
            </label>
            <label>
              Jenis
              <select
                value={form.jenis_dokumen}
                onChange={(e) =>
                  setForm({ ...form, jenis_dokumen: e.target.value })
                }
              >
                {[
                  "STNK",
                  "PAJAK",
                  "SIM",
                  "SURAT_KEUR",
                  "SURAT_TERA",
                  "KIM",
                  "LAINNYA",
                ].map((x) => (
                  <option>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Berlaku sampai
              <input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={form.tanggal_berlaku}
                onChange={(e) =>
                  setForm({ ...form, tanggal_berlaku: e.target.value })
                }
                required={expiryRequiredTypes.includes(form.jenis_dokumen)}
              />
              {expiryRequiredTypes.includes(form.jenis_dokumen) && (
                <small>Wajib diisi untuk menentukan masa berlaku EKIM.</small>
              )}
            </label>
            <label>
              File
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setForm({ ...form, file: e.target.files[0] })}
                required
              />
            </label>
            <button className="button primary full">
              <Upload />
              Upload dokumen
            </button>
          </form>
        </section>
      )}
      {busy ? (
        <Busy />
      ) : (
        <DataTable
          heads={[
            "Kendaraan",
            "Dokumen",
            "Berlaku",
            "Uploader",
            "Status",
            "Aksi",
          ]}
          rows={(data || []).map((d) => [
            d.nomor_polisi,
            <>
              <button
                className="link-button"
                onClick={() => api.openDocument(d.id, d.nama_file_asli)}
              >
                {d.jenis_dokumen}
              </button>
              <small>{d.nama_file_asli}</small>
            </>,
            date(d.tanggal_berlaku),
            d.uploader_name,
            status(d.status),
            user.role === "admin" && d.status === "PENDING" ? (
              <div className="row-buttons">
                <button onClick={() => review(d, "DISETUJUI")}>Setujui</button>
                <button className="danger" onClick={() => review(d, "DITOLAK")}>
                  Tolak
                </button>
              </div>
            ) : (
              "—"
            ),
          ])}
        />
      )}
    </main>
  );
}

export function AuditsPage() {
  const [search, setSearch] = useState(""),
    [data, setData] = useState([]),
    [busy, setBusy] = useState(true);
  const load = async () => {
    setBusy(true);
    try {
      setData((await api.audits(search)).data);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  return (
    <main className="page">
      <Head
        kicker="Keamanan"
        title="Audit log"
        text="Riwayat aktivitas dan perubahan data."
      />
      <div className="filter-bar compact">
        <div className="search-field">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pengguna, aksi, detail…"
          />
        </div>
        <button className="button primary" onClick={load}>
          Cari
        </button>
      </div>
      {busy ? (
        <Busy />
      ) : (
        <DataTable
          heads={["Waktu", "Pengguna", "Aksi", "Kendaraan", "Detail"]}
          rows={data.map((x) => [
            x.created_at,
            x.user_name,
            x.action,
            x.nomor_polisi,
            x.description,
          ])}
        />
      )}
    </main>
  );
}
export function AlertsPage() {
  const { data, busy, load } = useLoad(api.alerts);
  return (
    <main className="page">
      <Head
        kicker="Monitoring"
        title="Peringatan kendaraan"
        text="Status EKIM mengikuti tanggal EKIM Valid Until yang ditetapkan pada formulir checklist."
      >
        <button className="button secondary" onClick={load}>
          <RefreshCw />
          Perbarui
        </button>
      </Head>
      {busy ? (
        <Busy />
      ) : (
        <DataTable
          heads={[
            "Kendaraan",
            "Transportir",
            "EKIM valid until",
            "Penyebab",
            "Status",
            "Sisa hari",
          ]}
          rows={(data || []).map((x) => [
            x.nomor_polisi,
            x.nama_transport,
            date(x.ekim_valid_until),
            x.expiry_source || "EKIM",
            status(x.status_alert),
            x.hari_tersisa,
          ])}
        />
      )}
    </main>
  );
}
export function SettingsPage() {
  const state = useLoad(api.settings),
    [policies, setPolicies] = useState(null),
    [note, setNote] = useState(null),
    [saving, setSaving] = useState(false),
    [backingUp, setBackingUp] = useState(false),
    [applyingRetention, setApplyingRetention] = useState(false);
  useEffect(() => {
    if (state.data) setPolicies(state.data.policies);
  }, [state.data]);
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNote(null);
    try {
      const result = await api.saveSystemSettings(policies);
      setNote({ ok: true, text: result.message });
      state.load();
    } catch (error) {
      setNote({ text: error.message });
    } finally {
      setSaving(false);
    }
  };
  const backup = async () => {
    if (
      !confirm(
        "Buat backup database sekarang? Proses dapat memerlukan waktu beberapa saat.",
      )
    )
      return;
    setBackingUp(true);
    setNote(null);
    try {
      const result = await api.createBackup();
      setNote({
        ok: true,
        text: `${result.message} ${result.data.filename} (${result.data.size})`,
      });
      state.load();
    } catch (error) {
      setNote({ text: error.message });
    } finally {
      setBackingUp(false);
    }
  };
  const applyRetention = async () => {
    if (
      !confirm(
        `Terapkan retensi audit ${policies.audit_retention_days} hari dan backup ${policies.backup_retention_days} hari? Data yang melewati masa retensi akan dihapus.`,
      )
    )
      return;
    setApplyingRetention(true);
    setNote(null);
    try {
      const result = await api.applyAuditRetention();
      setNote({ ok: true, text: result.message });
      state.load();
    } catch (error) {
      setNote({ text: error.message });
    } finally {
      setApplyingRetention(false);
    }
  };
  const data = state.data;
  const storageUsed = data?.storage?.total_bytes
    ? Math.max(
        0,
        Math.min(
          100,
          ((data.storage.total_bytes - data.storage.free_bytes) /
            data.storage.total_bytes) *
            100,
        ),
      )
    : 0;
  return (
    <main className="page system-settings-page">
      <Head
        kicker="Sistem"
        title="Pengaturan sistem"
        text="Pantau kesehatan layanan, backup data, kapasitas penyimpanan, dan kebijakan operasional."
      >
        <button className="button secondary" onClick={state.load}>
          <RefreshCw /> Perbarui status
        </button>
      </Head>
      <Notice value={note} />
      {state.error ? (
        <Notice value={{ text: state.error }} />
      ) : state.busy || !data || !policies ? (
        <Busy />
      ) : (
        <>
          <section className="metric-grid settings-metrics">
            {[
              ["Aplikasi", `v${data.app_version}`],
              ["PHP", data.php_version],
              ["Database", data.database],
              ["Timezone", data.timezone],
              ["Upload maksimum", data.upload_max],
            ].map((x) => (
              <article className="metric-card" key={x[0]}>
                <div>
                  <strong>{x[1]}</strong>
                  <span>{x[0]}</span>
                </div>
              </article>
            ))}
          </section>

          <section className="system-settings-grid">
            <article className="panel system-health-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow red">Status layanan</p>
                  <h2>Kesehatan sistem</h2>
                </div>
              </div>
              <div className="system-health-list">
                {[
                  ["Database", data.health.database],
                  ["Folder upload", data.health.uploads],
                  ["Penyimpanan backup", data.health.backup_storage],
                  ["SMTP email", data.health.smtp],
                  ["Scheduler notifikasi", data.health.scheduler],
                ].map(([label, health]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong
                      className={health.ok ? "health-ok" : "health-warning"}
                    >
                      <i /> {health.label}
                    </strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel storage-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow red">Server</p>
                  <h2>Penyimpanan</h2>
                </div>
              </div>
              <div className="storage-numbers">
                <div>
                  <span>Tersedia</span>
                  <strong>{data.storage.free_label}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{data.storage.total_label}</strong>
                </div>
              </div>
              <div className="storage-track">
                <span style={{ width: `${storageUsed}%` }} />
              </div>
              <small>{storageUsed.toFixed(1)}% penyimpanan digunakan</small>
              <dl className="storage-paths">
                <div>
                  <dt>Upload</dt>
                  <dd>{data.storage.upload_path}</dd>
                </div>
                <div>
                  <dt>Backup</dt>
                  <dd>{data.storage.backup_path}</dd>
                </div>
              </dl>
            </article>
          </section>

          <section className="panel backup-panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow red">Backup & recovery</p>
                <h2>Backup database</h2>
                <p className="muted">
                  Backup disimpan pada folder terproteksi. Proses restore hanya
                  dilakukan tim IT berwenang.
                </p>
              </div>
              <button
                className="button primary"
                onClick={backup}
                disabled={backingUp || !data.health.backup_storage.ok}
              >
                {backingUp ? "Membuat backup…" : "Backup sekarang"}
              </button>
            </div>
            <div className="backup-summary">
              <div>
                <span>Backup terakhir</span>
                <strong>{data.backup.last_at || "Belum pernah"}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>
                  {data.backup.last_status === "success"
                    ? "Berhasil"
                    : data.backup.last_status === "failed"
                      ? "Gagal"
                      : "Belum ada"}
                </strong>
              </div>
              <div>
                <span>Retensi kebijakan</span>
                <strong>{policies.backup_retention_days} hari</strong>
              </div>
            </div>
            <DataTable
              heads={["Nama backup", "Waktu", "Ukuran", "Integritas"]}
              rows={(data.backup.items || []).map((item) => [
                item.filename,
                item.created_at,
                item.size,
                item.checksum
                  ? `SHA-256 ${item.checksum.slice(0, 16)}…`
                  : "Belum diverifikasi",
              ])}
            />
          </section>

          <section className="system-settings-grid settings-lower-grid">
            <article className="panel scheduler-summary-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow red">Integrasi</p>
                  <h2>Scheduler dan email</h2>
                </div>
              </div>
              <div
                className={`scheduler-state ${data.scheduler.healthy ? "is-healthy" : "is-warning"}`}
              >
                <strong>
                  {data.scheduler.healthy
                    ? "Scheduler aktif"
                    : "Scheduler perlu diperiksa"}
                </strong>
                <span>
                  Terakhir berjalan: {data.scheduler.last_run || "Belum pernah"}
                </span>
              </div>
              <Link className="button secondary" to="/notifications">
                Buka pengaturan Notifikasi Email KIM
              </Link>
            </article>

            <article className="panel policy-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow red">Kebijakan</p>
                  <h2>Keamanan dan pemeliharaan</h2>
                </div>
              </div>
              <form className="system-policy-form" onSubmit={save}>
                <label>
                  Durasi sesi tanpa aktivitas (menit)
                  <input
                    type="number"
                    min="15"
                    max="480"
                    value={policies.session_timeout_minutes}
                    onChange={(e) =>
                      setPolicies({
                        ...policies,
                        session_timeout_minutes: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Retensi audit log (hari)
                  <input
                    type="number"
                    min="90"
                    max="3650"
                    value={policies.audit_retention_days}
                    onChange={(e) =>
                      setPolicies({
                        ...policies,
                        audit_retention_days: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Retensi backup (hari)
                  <input
                    type="number"
                    min="7"
                    max="365"
                    value={policies.backup_retention_days}
                    onChange={(e) =>
                      setPolicies({
                        ...policies,
                        backup_retention_days: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="maintenance-toggle">
                  <input
                    type="checkbox"
                    checked={policies.maintenance_mode}
                    onChange={(e) =>
                      setPolicies({
                        ...policies,
                        maintenance_mode: e.target.checked,
                      })
                    }
                  />
                  <span>
                    <strong>Maintenance mode</strong>
                    <small>
                      Jika aktif, hanya Administrator yang dapat menggunakan
                      sistem.
                    </small>
                  </span>
                </label>
                <label className="full">
                  Pesan maintenance
                  <textarea
                    maxLength="250"
                    value={policies.maintenance_message}
                    onChange={(e) =>
                      setPolicies({
                        ...policies,
                        maintenance_message: e.target.value,
                      })
                    }
                  />
                </label>
                <div className="system-policy-actions full">
                  <button className="button primary" disabled={saving}>
                    {saving ? "Menyimpan…" : "Simpan kebijakan"}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={applyingRetention}
                    onClick={applyRetention}
                  >
                    {applyingRetention
                      ? "Memproses…"
                      : "Terapkan semua retensi"}
                  </button>
                </div>
              </form>
            </article>
          </section>

          <section className="panel database-detail-panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow red">Database</p>
                <h2>Penggunaan tabel</h2>
              </div>
              <span className="memory-limit">
                Memory limit PHP: {data.memory_limit}
              </span>
            </div>
            <DataTable
              heads={["Tabel", "Baris", "Ukuran (MB)"]}
              rows={data.tables.map((x) => [x.name, x.row_count, x.size_mb])}
            />
          </section>
        </>
      )}
    </main>
  );
}
export function NotificationsPage() {
  const state = useLoad(api.notifications),
    [form, setForm] = useState(null),
    [note, setNote] = useState(null);
  useEffect(() => {
    if (state.data) setForm({ ...state.data.config, smtp_password: "" });
  }, [state.data]);
  const save = async (e) => {
    e.preventDefault();
    try {
      const r = await api.saveNotifications(form);
      setNote({ ok: true, text: r.message });
    } catch (x) {
      setNote({ text: x.message });
    }
  };
  const cron = async () => {
    if (!confirm("Buat ulang kunci cron? URL lama akan berhenti bekerja."))
      return;
    await api.regenerateCron();
    state.load();
  };
  return (
    <main className="page">
      <Head
        kicker="Notifikasi"
        title="Email dan scheduler"
        text="Konfigurasi SMTP, ambang pengingat, dan riwayat pengiriman."
      />
      <Notice value={note} />
      {state.busy || !form ? (
        <Busy />
      ) : (
        <>
          <section className="panel">
            <form className="form-grid" onSubmit={save}>
              {[
                ["smtp_host", "SMTP host"],
                ["smtp_port", "Port"],
                ["smtp_username", "Username SMTP"],
                ["smtp_password", "Password SMTP"],
                ["smtp_from_email", "Email pengirim"],
                ["smtp_from_name", "Nama pengirim"],
                ["notif_days_threshold", "Ambang hari"],
              ].map(([k, l]) => (
                <label>
                  {l}
                  <input
                    type={k === "smtp_password" ? "password" : "text"}
                    value={form[k] || ""}
                    placeholder={
                      k === "smtp_password"
                        ? "Kosongkan untuk mempertahankan password"
                        : ""
                    }
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                </label>
              ))}
              <label>
                Enkripsi
                <select
                  value={form.smtp_encryption || "tls"}
                  onChange={(e) =>
                    setForm({ ...form, smtp_encryption: e.target.value })
                  }
                >
                  <option>tls</option>
                  <option>ssl</option>
                  <option>none</option>
                </select>
              </label>
              <button className="button primary full">
                Simpan konfigurasi
              </button>
            </form>
          </section>
          <section className="panel">
            <h2>Scheduler</h2>
            <p className="muted">
              Terakhir berjalan: {state.data.cron_last_run || "Belum pernah"}
            </p>
            <input readOnly value={state.data.cron_url} />
            <button className="button secondary" onClick={cron}>
              Buat ulang kunci
            </button>
          </section>
          <DataTable
            heads={["Waktu", "Kendaraan", "Email", "Status", "Pesan"]}
            rows={(state.data.history || []).map((x) => [
              x.sent_at || x.created_at,
              x.nomor_polisi,
              x.email_to,
              x.status,
              x.error_message,
            ])}
          />
        </>
      )}
    </main>
  );
}
export function VehiclesPage() {
  const vehicles = useLoad(api.vehicles),
    users = useLoad(api.users),
    [edit, setEdit] = useState(null),
    [note, setNote] = useState(null);
  const blank = {
    action: "save",
    jenis: "SPBU",
    nomor_polisi: "",
    merk_mobil: "",
    tahun_kendaraan: "",
    produk_kapasitas: "",
    nama_transport: "",
    email_kontraktor: "",
    ekim_valid_until: "",
    status: "AKTIF",
    username_transportir: "",
  };
  const save = async (e) => {
    e.preventDefault();
    try {
      const r = await api.saveVehicle(edit);
      setNote({ ok: true, text: r.message });
      setEdit(null);
      vehicles.load();
    } catch (x) {
      setNote({ text: x.message });
    }
  };
  const remove = async (r) => {
    if (!confirm(`Hapus ${r.nomor_polisi}?`)) return;
    try {
      await api.saveVehicle({ action: "delete", id: r.id });
      vehicles.load();
    } catch (x) {
      setNote({ text: x.message });
    }
  };
  return (
    <main className="page">
      <Head
        kicker="Master data"
        title="Kelola kendaraan"
        text="Tambah, ubah, nonaktifkan, dan hapus kendaraan."
      >
        <button className="button primary" onClick={() => setEdit(blank)}>
          <Plus />
          Tambah
        </button>
      </Head>
      <Notice value={note} />
      {edit && (
        <section className="panel">
          <form className="form-grid" onSubmit={save}>
            {[
              ["nomor_polisi", "Nomor polisi"],
              ["merk_mobil", "Merk/tipe"],
              ["tahun_kendaraan", "Tahun"],
              ["produk_kapasitas", "Produk/kapasitas"],
              ["nama_transport", "Transportir"],
              ["email_kontraktor", "Email kontraktor"],
            ].map(([k, l]) => (
              <label>
                {l}
                <input
                  value={edit[k] || ""}
                  onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                  required={[
                    "nomor_polisi",
                    "merk_mobil",
                    "email_kontraktor",
                  ].includes(k)}
                />
              </label>
            ))}
            <label>
              Jenis
              <select
                value={edit.jenis}
                onChange={(e) => setEdit({ ...edit, jenis: e.target.value })}
              >
                <option>SPBU</option>
                <option>INDUSTRI</option>
              </select>
            </label>
            <label>
              Akun pengurus
              <select
                value={edit.username_transportir || ""}
                onChange={(e) =>
                  setEdit({ ...edit, username_transportir: e.target.value })
                }
                required
              >
                <option value="">Pilih akun</option>
                {(users.data || [])
                  .filter((u) => u.role === "pengurus" && u.status === "active")
                  .map((u) => (
                    <option value={u.username}>
                      {u.full_name} ({u.username})
                    </option>
                  ))}
              </select>
            </label>
            <label>
              EKIM berlaku
              <input
                type="date"
                value={String(edit.ekim_valid_until || "").slice(0, 10)}
                onChange={(e) =>
                  setEdit({ ...edit, ekim_valid_until: e.target.value })
                }
              />
            </label>
            <label>
              Status
              <select
                value={edit.status}
                onChange={(e) => setEdit({ ...edit, status: e.target.value })}
              >
                <option>AKTIF</option>
                <option>TIDAK_AKTIF</option>
              </select>
            </label>
            <div className="row-buttons full">
              <button className="button primary">Simpan</button>
              <button
                type="button"
                className="button secondary"
                onClick={() => setEdit(null)}
              >
                Batal
              </button>
            </div>
          </form>
        </section>
      )}
      {vehicles.busy ? (
        <Busy />
      ) : (
        <DataTable
          heads={[
            "Kendaraan",
            "Jenis",
            "Transportir",
            "EKIM",
            "Status",
            "Aksi",
          ]}
          rows={(vehicles.data || []).map((r) => [
            <>
              <strong>{r.nomor_polisi}</strong>
              <small>
                {r.merk_mobil} {r.tahun_kendaraan}
              </small>
            </>,
            r.jenis,
            r.nama_transport,
            date(r.ekim_valid_until),
            status(r.status),
            <div className="row-buttons">
              <button onClick={() => setEdit({ ...r, action: "save" })}>
                Edit
              </button>
              <button className="danger" onClick={() => remove(r)}>
                Hapus
              </button>
            </div>,
          ])}
        />
      )}
    </main>
  );
}
export function VehicleRegistrationPage() {
  const initialForm = {
      jenis: "SPBU",
      nomor_polisi: "",
      merk_mobil: "",
      tahun_kendaraan: "",
      produk_kapasitas: "",
      nama_transport: "",
      email_kontraktor: "",
    },
    state = useLoad(api.userVehicles),
    [form, setForm] = useState(initialForm),
    [note, setNote] = useState(null),
    [saving, setSaving] = useState(false);
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNote(null);
    try {
      const result = await api.registerUserVehicle(form);
      setNote({ ok: true, text: result.message });
      setForm(initialForm);
      state.load();
    } catch (error) {
      setNote({ text: error.message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <main className="page vehicle-registration-page">
      <Head
        kicker="Registrasi kendaraan"
        title="Daftarkan kendaraan baru"
        text="Lengkapi identitas kendaraan agar tersedia pada proses checklist SPBU atau Industri."
      />
      <Notice value={note} />
      <section className="panel vehicle-registration-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow red">Data kendaraan</p>
            <h2>Identitas mobil tangki</h2>
          </div>
        </div>
        <form className="form-grid vehicle-registration-form" onSubmit={submit}>
          <label>
            Jenis kendaraan
            <select
              value={form.jenis}
              onChange={(e) => update("jenis", e.target.value)}
            >
              <option value="SPBU">SPBU</option>
              <option value="INDUSTRI">Industri</option>
            </select>
          </label>
          <label>
            Nomor polisi
            <input
              value={form.nomor_polisi}
              onChange={(e) =>
                update("nomor_polisi", e.target.value.toUpperCase())
              }
              placeholder="Contoh: DB 1234 AB"
              maxLength="20"
              required
            />
          </label>
          <label>
            Merk/tipe kendaraan
            <input
              value={form.merk_mobil}
              onChange={(e) => update("merk_mobil", e.target.value)}
              placeholder="Contoh: Hino 500"
              required
            />
          </label>
          <label>
            Tahun kendaraan
            <input
              type="number"
              min="1980"
              max={new Date().getFullYear() + 1}
              value={form.tahun_kendaraan}
              onChange={(e) => update("tahun_kendaraan", e.target.value)}
              placeholder="2025"
            />
          </label>
          <label>
            Produk/kapasitas
            <input
              value={form.produk_kapasitas}
              onChange={(e) => update("produk_kapasitas", e.target.value)}
              placeholder="Contoh: BBM / 16 KL"
            />
          </label>
          <label>
            Nama transportir
            <input
              value={form.nama_transport}
              onChange={(e) => update("nama_transport", e.target.value)}
              placeholder="Nama perusahaan transportir"
              required
            />
          </label>
          <label className="registration-email-field">
            Email kontraktor/PJ
            <input
              type="email"
              value={form.email_kontraktor}
              onChange={(e) => update("email_kontraktor", e.target.value)}
              placeholder="nama@perusahaan.com"
              required
            />
            <small>
              Digunakan untuk pengiriman notifikasi masa berlaku EKIM.
            </small>
          </label>
          <div className="vehicle-registration-submit">
            <button className="button primary" disabled={saving}>
              <Plus />
              {saving ? "Menyimpan…" : "Registrasikan kendaraan"}
            </button>
          </div>
        </form>
      </section>
      <section className="vehicle-registration-list">
        <div className="section-copy">
          <p className="eyebrow red">Riwayat registrasi</p>
          <h2>Kendaraan yang saya daftarkan</h2>
        </div>
        {state.busy ? (
          <Busy />
        ) : (
          <DataTable
            heads={[
              "Kendaraan",
              "Jenis",
              "Transportir",
              "Produk/Kapasitas",
              "Status",
              "Tanggal daftar",
            ]}
            rows={(state.data || []).map((vehicle) => [
              <>
                <strong>{vehicle.nomor_polisi}</strong>
                <small>
                  {vehicle.merk_mobil} {vehicle.tahun_kendaraan || ""}
                </small>
              </>,
              vehicle.jenis,
              vehicle.nama_transport || "—",
              vehicle.produk_kapasitas || "—",
              status(vehicle.status),
              date(vehicle.created_at),
            ])}
          />
        )}
      </section>
    </main>
  );
}
export function MyVehiclesPage() {
  const state = useLoad(api.myVehicles),
    [form, setForm] = useState({ nomor_polisi: "", nama_transport: "" }),
    [note, setNote] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await api.registerMyVehicle(form);
      setNote({ ok: true, text: r.message });
      state.load();
    } catch (x) {
      setNote({ text: x.message });
    }
  };
  return (
    <main className="page">
      <Head
        kicker="Kendaraan saya"
        title="Tanggung jawab kendaraan"
        text="Daftarkan kendaraan lalu lengkapi dokumennya."
      />
      <Notice value={note} />
      <section className="panel">
        <form className="form-grid" onSubmit={submit}>
          <label>
            Nomor polisi
            <input
              value={form.nomor_polisi}
              onChange={(e) =>
                setForm({ ...form, nomor_polisi: e.target.value })
              }
              required
            />
          </label>
          <label>
            Nama transportir
            <input
              value={form.nama_transport}
              onChange={(e) =>
                setForm({ ...form, nama_transport: e.target.value })
              }
            />
          </label>
          <button className="button primary full">Daftarkan kendaraan</button>
        </form>
      </section>
      {state.busy ? (
        <Busy />
      ) : (
        <DataTable
          heads={["Nomor polisi", "Transportir", "Dokumen pending", "Aksi"]}
          rows={(state.data || []).map((r) => [
            r.nomor_polisi,
            r.nama_transport,
            r.pending_dokumen || 0,
            <Link to="/documents">Kelola dokumen</Link>,
          ])}
        />
      )}
    </main>
  );
}
export function VerifyPage() {
  const { value = "" } = useParams(),
    [result, setResult] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (value)
      api
        .verify(value)
        .then((r) => setResult(r.data))
        .catch((e) => setError(e.message));
  }, [value]);
  const validation = result?.validation;
  const validationState = validation?.state || "pending";
  const summary =
    validationState === "valid"
      ? {
          icon: <Shield />,
          title: "ASLI & VALID",
          text: "Dokumen cocok dengan data yang ditandatangani di sistem.",
        }
      : validationState === "expired"
        ? {
            icon: <AlertTriangle />,
            title: "ASLI, TETAPI EKIM TIDAK BERLAKU",
            text: `Masa berlaku ${validation?.expiry_source || "EKIM"} telah habis. Kendaraan wajib memperbarui surat dan menjalani inspeksi ulang.`,
          }
        : validationState === "invalid"
          ? {
              icon: <X />,
              title: "TIDAK VALID",
              text: "Bukti autentikasi gagal atau isi dokumen telah berubah.",
            }
          : {
              icon: <AlertTriangle />,
              title: "BELUM FINAL",
              text: "Dokumen ditemukan, tetapi persetujuan Manager belum selesai.",
            };
  const checks = result
    ? [
        ["Integritas isi dokumen", validation?.document_unchanged],
        ["Validasi tanda tangan HSSE", validation?.hsse_valid],
        ["Validasi persetujuan Manager", validation?.manager_valid],
        ["Bukti pengesahan final", validation?.final_proof_valid],
        ["Masa berlaku EKIM", validation?.certificate_not_expired],
      ]
    : [];
  return (
    <main className="standalone">
      <section className="standalone-card verify-card">
        <p className="eyebrow red">Verifikasi PRIMA</p>
        <h1>Keaslian dokumen</h1>
        {error && <Notice value={{ text: error }} />}
        {!result && !error ? (
          <Busy />
        ) : (
          result && (
            <>
              <div className={`verify-result ${validationState}`}>
                {summary.icon}
                <span>
                  <strong>{summary.title}</strong>
                  {summary.text}
                </span>
              </div>
              <div className="verify-checks">
                {checks.map(([label, valid]) => (
                  <div
                    className={
                      valid
                        ? "passed"
                        : validationState === "pending"
                          ? "waiting"
                          : "failed"
                    }
                    key={label}
                  >
                    {valid ? (
                      <Check />
                    ) : validationState === "pending" ? (
                      <AlertTriangle />
                    ) : (
                      <X />
                    )}
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              {!!validation?.expired_documents?.length && (
                <div className="verify-expired-documents">
                  <strong>Surat yang sudah kedaluwarsa</strong>
                  <ul>
                    {validation.expired_documents.map((document) => (
                      <li key={document.item_name}>
                        {document.label}: {date(document.tanggal_expire)}
                      </li>
                    ))}
                  </ul>
                  <span>
                    Upload surat pengganti, tunggu persetujuan Admin, kemudian
                    lakukan inspeksi kendaraan ulang.
                  </span>
                </div>
              )}
              <dl>
                <div>
                  <dt>Nomor polisi</dt>
                  <dd>{result.nomor_polisi}</dd>
                </div>
                <div>
                  <dt>Transportir</dt>
                  <dd>{result.nama_transport}</dd>
                </div>
                <div>
                  <dt>Jenis kendaraan</dt>
                  <dd>{result.jenis_kendaraan || "—"}</dd>
                </div>
                <div>
                  <dt>Tanggal pemeriksaan</dt>
                  <dd>{date(result.tanggal_pemeriksaan)}</dd>
                </div>
                <div>
                  <dt>EKIM berlaku sampai</dt>
                  <dd>{date(result.ekim_valid_until)}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{status(result.status_approval)}</dd>
                </div>
                <div>
                  <dt>Penandatangan HSSE</dt>
                  <dd>
                    {result.ttd_hsse_nama || "—"}
                    <small>
                      {result.ttd_hsse_timestamp
                        ? date(result.ttd_hsse_timestamp)
                        : ""}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Manager</dt>
                  <dd>
                    {result.ttd_manajer_nama || "—"}
                    <small>
                      {result.ttd_manajer_timestamp
                        ? date(result.ttd_manajer_timestamp)
                        : ""}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Metode validasi</dt>
                  <dd>{validation?.algorithm || "—"}</dd>
                </div>
                <div>
                  <dt>ID verifikasi</dt>
                  <dd className="verification-id">
                    {result.verification_uuid || value}
                  </dd>
                </div>
              </dl>
              <p className="verify-security-note">
                <Shield /> Hasil ini dihitung langsung dari data aktif di
                server. Perubahan pada isi checklist setelah ditandatangani akan
                membuat validasi gagal.
              </p>
            </>
          )
        )}
      </section>
    </main>
  );
}
