import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type ClienteT = {
  id: number; nombre: string; rfc: string | null; razon_social: string | null;
  regimen_fiscal: string | null; codigo_postal: string | null;
  whatsapp: string | null; correo: string | null; telefono: string | null;
  dias_credito: number; limite_credito: number | null; activo: boolean;
};

const FORM_VACIO = {
  razon_social: "", rfc: "", regimen_fiscal: "",
  codigo_postal: "", uso_cfdi_default: "G03",
  correo: "", telefono: "", whatsapp: "",
  direccion: "", dias_credito: 0, limite_credito: 0, notas: "",
};

const REGIMENES = [
  { v: "601", t: "601 - General de Ley Personas Morales" },
  { v: "603", t: "603 - PM con Fines no Lucrativos" },
  { v: "605", t: "605 - Sueldos y Salarios" },
  { v: "606", t: "606 - Arrendamiento" },
  { v: "612", t: "612 - PF con Actividades Empresariales" },
  { v: "616", t: "616 - Sin obligaciones fiscales" },
  { v: "621", t: "621 - Incorporacion Fiscal" },
  { v: "626", t: "626 - RESICO" },
];

const USOS_CFDI = [
  { v: "G01", t: "G01 - Adquisicion de mercancias" },
  { v: "G03", t: "G03 - Gastos en general" },
  { v: "P01", t: "P01 - Por definir" },
  { v: "S01", t: "S01 - Sin efectos fiscales" },
  { v: "I01", t: "I01 - Construcciones" },
  { v: "I04", t: "I04 - Equipo de computo" },
];

export default function Clientes() {
  const [clientes, setClientes] = useState<ClienteT[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState(FORM_VACIO);
  const [editId, setEditId] = useState<number | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarCompartir, setMostrarCompartir] = useState(false);

  async function cargar() {
    const r = await api.get("/api/clientes", { params: { q: busqueda || undefined } });
    setClientes(r.data);
  }

  useEffect(() => { cargar(); }, []);

  function abrirNuevo() {
    setForm(FORM_VACIO);
    setEditId(null);
    setMostrarForm(true);
  }

  async function abrirEditar(id: number) {
    const r = await api.get(`/api/clientes/${id}`);
    setForm({
      ...FORM_VACIO,
      ...r.data,
      razon_social: r.data.razon_social || r.data.nombre || "",
      dias_credito: r.data.dias_credito || 0,
      limite_credito: r.data.limite_credito || 0,
    });
    setEditId(id);
    setMostrarForm(true);
  }

  async function guardar() {
    if (!form.razon_social) return alert("Razon social es obligatoria");
    const payload: any = { ...form, nombre: form.razon_social };
    if (!payload.limite_credito) payload.limite_credito = null;
    try {
      if (editId) {
        await api.patch(`/api/clientes/${editId}`, payload);
      } else {
        await api.post("/api/clientes", payload);
      }
      setMostrarForm(false);
      setEditId(null);
      cargar();
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message);
    }
  }

  async function desactivar(id: number) {
    if (!confirm("Desactivar este cliente?")) return;
    await api.delete(`/api/clientes/${id}`);
    cargar();
  }

  return (
    <Layout
      title="Clientes"
      subtitle={`${clientes.length} clientes registrados`}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setMostrarCompartir(true)}
            style={{
              background: "#7c3aed", color: "white", border: 0,
              padding: "10px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
            title="Comparte un link para que tus clientes suban su CSF y se registren solos">
            📱 Link de auto-registro
          </button>
          <button className="btn" onClick={abrirNuevo}>+ Nuevo cliente</button>
        </div>
      }
    >
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <input className="input" placeholder="Buscar por nombre, RFC, WhatsApp..." value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => e.key === "Enter" && cargar()} />
          <button className="btn-icon" onClick={cargar}>Filtrar</button>
        </div>
      </div>

      {mostrarForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="card-header">{editId ? `Editar cliente #${editId}` : "Nuevo cliente"}</h3>
          <div className="form-grid">
            <div className="form-grid-full" style={{ gridColumn: "span 2" }}>
              <label>Razon social / Nombre completo *</label>
              <input className="input" placeholder="Como aparece en su Constancia SAT"
                value={form.razon_social}
                onChange={(e) => setForm({ ...form, razon_social: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label>RFC</label>
              <input className="input" placeholder="13 caracteres" value={form.rfc}
                onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label>WhatsApp</label>
              <input className="input" placeholder="+5215555551234" value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
            </div>
            <div>
              <label>Correo</label>
              <input className="input" value={form.correo}
                onChange={(e) => setForm({ ...form, correo: e.target.value })} />
            </div>
            <div>
              <label>Telefono</label>
              <input className="input" value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </div>
            <div>
              <label>CP fiscal *</label>
              <input className="input" placeholder="5 digitos" maxLength={5} value={form.codigo_postal}
                onChange={(e) => setForm({ ...form, codigo_postal: e.target.value.replace(/\D/g, "") })} />
              <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "4px 0 0" }}>
                Requerido para facturar (debe coincidir con la Constancia SAT).
              </p>
            </div>
            <div>
              <label>Regimen fiscal</label>
              <select className="input" value={form.regimen_fiscal}
                onChange={(e) => setForm({ ...form, regimen_fiscal: e.target.value })}>
                <option value="">-- Selecciona --</option>
                {REGIMENES.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
              </select>
            </div>
            <div>
              <label>Uso CFDI default</label>
              <select className="input" value={form.uso_cfdi_default}
                onChange={(e) => setForm({ ...form, uso_cfdi_default: e.target.value })}>
                {USOS_CFDI.map((u) => <option key={u.v} value={u.v}>{u.t}</option>)}
              </select>
            </div>
            <div>
              <label>Dias credito</label>
              <input className="input" type="number" value={form.dias_credito}
                onChange={(e) => setForm({ ...form, dias_credito: +e.target.value })} />
            </div>
            <div>
              <label>Limite credito (opcional)</label>
              <input className="input" type="number" value={form.limite_credito}
                onChange={(e) => setForm({ ...form, limite_credito: +e.target.value })} />
            </div>
            <div className="form-grid-full">
              <label>Direccion</label>
              <input className="input" value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
            </div>
            <div className="form-grid-full">
              <label>Notas</label>
              <input className="input" value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button className="btn" onClick={guardar}>Guardar</button>
            <button className="btn-icon" onClick={() => { setMostrarForm(false); setEditId(null); }}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Razón social / Nombre</th><th>RFC</th>
              <th>CP</th><th>Régimen</th>
              <th>WhatsApp</th><th>Correo</th><th>Días cred.</th><th></th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.4 }}>
                <td><code>#{c.id}</code></td>
                <td>{c.razon_social || c.nombre}</td>
                <td>{c.rfc || "-"}</td>
                <td>
                  {c.codigo_postal || (
                    <span style={{ color: "var(--color-danger)", fontSize: 11 }}>
                      ⚠ falta
                    </span>
                  )}
                </td>
                <td>{c.regimen_fiscal && <span className="badge badge-info">{c.regimen_fiscal}</span>}</td>
                <td>{c.whatsapp || "-"}</td>
                <td style={{ fontSize: 12 }}>{c.correo || "-"}</td>
                <td>{c.dias_credito}</td>
                <td>
                  <button className="btn-icon" onClick={() => abrirEditar(c.id)} style={{ marginRight: 4 }}>Editar</button>
                  {c.activo && <button className="btn-icon" onClick={() => desactivar(c.id)}>Desactivar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mostrarCompartir && (
        <CompartirRegistroModal onClose={() => setMostrarCompartir(false)} />
      )}
    </Layout>
  );
}


function CompartirRegistroModal({ onClose }: { onClose: () => void }) {
  const empresaActiva = (() => {
    try { return JSON.parse(localStorage.getItem("empresa_activa") || "{}"); }
    catch { return {}; }
  })();
  const base = window.location.origin;
  const url = `${base}/registro-cliente/${empresaActiva.id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;
  const msgWhatsapp = encodeURIComponent(
    `Hola! Para facturarte, por favor registra tus datos aqui subiendo tu Constancia de Situacion Fiscal:\n\n${url}\n\nSolo toma 30 segundos. Gracias!`
  );
  const [copiado, setCopiado] = useState(false);

  function copiar() {
    navigator.clipboard?.writeText(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 12,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "white", borderRadius: 12, padding: 24,
        width: "100%", maxWidth: 500, maxHeight: "94vh", overflow: "auto",
      }}>
        <h2 style={{ margin: "0 0 4px", color: "#0f172a" }}>📱 Link de auto-registro</h2>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px" }}>
          Mándale esto a tu cliente por WhatsApp. Sube su CSF y queda registrado automático —
          la IA lee los datos fiscales por ti.
        </p>

        <div style={{ textAlign: "center", margin: "0 0 14px" }}>
          <img src={qrUrl} alt="QR" style={{
            width: 220, height: 220, border: "4px solid #0f172a", borderRadius: 10,
          }} />
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
            Imprimelo en el mostrador o en tu factura
          </div>
        </div>

        <div style={{
          background: "#f1f5f9", padding: 10, borderRadius: 6,
          fontSize: 13, fontFamily: "monospace", wordBreak: "break-all", marginBottom: 10,
        }}>
          {url}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button onClick={copiar}
            style={{
              flex: 1, background: copiado ? "#059669" : "#0f172a", color: "white",
              border: 0, padding: "10px 14px", borderRadius: 6,
              fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}>
            {copiado ? "✓ Copiado" : "📋 Copiar link"}
          </button>
          <a href={`https://wa.me/?text=${msgWhatsapp}`} target="_blank" rel="noopener noreferrer"
            style={{
              flex: 1, background: "#25d366", color: "white",
              border: 0, padding: "10px 14px", borderRadius: 6,
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              textAlign: "center", textDecoration: "none",
            }}>
            💬 Mandar por WhatsApp
          </a>
        </div>

        <div style={{
          background: "#eff6ff", border: "1px solid #93c5fd",
          padding: 10, borderRadius: 6, fontSize: 12, color: "#1e40af",
        }}>
          <strong>Flujo del cliente:</strong>
          <ol style={{ margin: "6px 0 0 18px", padding: 0 }}>
            <li>Abre el link en su celular</li>
            <li>Sube su Constancia (PDF o foto)</li>
            <li>Claude Vision lee RFC, razón social, régimen, CP</li>
            <li>Queda registrado — en su próxima compra ya lo encuentras por RFC</li>
          </ol>
        </div>

        <button onClick={onClose}
          style={{
            marginTop: 14, width: "100%", background: "#e2e8f0",
            border: 0, padding: 10, borderRadius: 6, cursor: "pointer",
          }}>Cerrar</button>
      </div>
    </div>
  );
}
