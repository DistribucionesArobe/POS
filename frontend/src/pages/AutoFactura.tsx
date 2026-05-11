import { useState } from "react";
import { publicApi } from "../api/public";

const fmt = (n: number) =>
  "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const USO_CFDI = [
  { v: "G01", t: "G01 - Adquisición de mercancías" },
  { v: "G03", t: "G03 - Gastos en general" },
  { v: "I04", t: "I04 - Equipo de computo y accesorios" },
  { v: "I08", t: "I08 - Otra maquinaria y equipo" },
  { v: "P01", t: "P01 - Por definir" },
  { v: "S01", t: "S01 - Sin efectos fiscales" },
  { v: "CP01", t: "CP01 - Pagos" },
];

const REGIMEN_FISCAL = [
  { v: "601", t: "601 - General de Ley Personas Morales" },
  { v: "603", t: "603 - Personas Morales con Fines no Lucrativos" },
  { v: "605", t: "605 - Sueldos y Salarios e Ingresos Asimilados" },
  { v: "606", t: "606 - Arrendamiento" },
  { v: "608", t: "608 - Demás ingresos" },
  { v: "612", t: "612 - Personas Físicas con Actividades Empresariales y Profesionales" },
  { v: "614", t: "614 - Ingresos por intereses" },
  { v: "616", t: "616 - Sin obligaciones fiscales" },
  { v: "621", t: "621 - Incorporación Fiscal" },
  { v: "626", t: "626 - Régimen Simplificado de Confianza" },
];

type TicketInfo = {
  folio: string;
  fecha: string;
  subtotal: number;
  iva: number;
  total: number;
  emisor: { nombre: string; rfc: string; razon_social: string };
  conceptos: { descripcion: string; cantidad: number; precio_unitario: number; importe: number }[];
};

type Resultado = {
  factura_folio: string;
  uuid: string;
  serie_folio_sat: string;
  correo_enviado_a: string | null;
  cfdi_id: number;
};

export default function AutoFactura() {
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [folio, setFolio] = useState("");
  const [total, setTotal] = useState<number>(0);
  const [ticket, setTicket] = useState<TicketInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Datos fiscales
  const [rfc, setRfc] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [regimen, setRegimen] = useState("612");
  const [cp, setCp] = useState("");
  const [usoCfdi, setUsoCfdi] = useState("G03");
  const [correo, setCorreo] = useState("");

  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function buscar(e?: React.FormEvent) {
    e?.preventDefault();
    if (!folio || !total) return setError("Captura folio y total");
    setBusy(true); setError(null);
    try {
      const r = await publicApi.post("/api/public/facturar/buscar", { folio, total });
      setTicket(r.data);
      setPaso(2);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setBusy(false);
    }
  }

  async function facturar(e?: React.FormEvent) {
    e?.preventDefault();
    if (!rfc || !razonSocial || !cp || !correo) return setError("Completa todos los campos");
    if (rfc.length < 12 || rfc.length > 13) return setError("RFC inválido");
    if (cp.length !== 5) return setError("CP debe ser 5 dígitos");
    setBusy(true); setError(null);
    try {
      const r = await publicApi.post("/api/public/facturar/emitir", {
        folio, total,
        rfc: rfc.toUpperCase().trim(),
        razon_social: razonSocial.trim(),
        regimen_fiscal: regimen,
        codigo_postal: cp,
        uso_cfdi: usoCfdi,
        correo: correo.trim(),
      });
      setResultado(r.data);
      setPaso(3);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "var(--color-bg, #f3f4f6)",
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px",
    }}>
      <div style={{ maxWidth: 720, width: "100%" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "0.05em" }}>
            {ticket?.emisor?.nombre?.toUpperCase() || "AUTOFACTURACIÓN"}
          </h1>
          <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
            Genera tu factura electrónica desde tu ticket
          </p>
        </div>

        {/* Stepper */}
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 24 }}>
          {[1, 2, 3].map((n) => (
            <div key={n} style={{
              width: 32, height: 32, borderRadius: "50%",
              background: paso >= n ? "#2563eb" : "#e5e7eb",
              color: paso >= n ? "white" : "#9ca3af",
              display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
            }}>{n}</div>
          ))}
        </div>

        {error && (
          <div style={{ background: "#fee2e2", border: "1px solid #ef4444", color: "#991b1b",
            padding: 12, borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Paso 1: Folio + total */}
        {paso === 1 && (
          <form onSubmit={buscar} style={{ background: "white", padding: 24, borderRadius: 12,
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>1. Captura los datos de tu ticket</h2>
            <p style={{ color: "#6b7280", fontSize: 13, marginTop: 0 }}>
              Encuentra el folio y total impresos en tu ticket.
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={lblStyle}>Folio del ticket</label>
                <input value={folio} onChange={(e) => setFolio(e.target.value.trim())}
                  placeholder="Ej. T-1234" style={inpStyle} required />
              </div>
              <div>
                <label style={lblStyle}>Total ($)</label>
                <input type="number" step="0.01" value={total || ""}
                  onChange={(e) => setTotal(+e.target.value)}
                  placeholder="Ej. 1259.00" style={inpStyle} required />
              </div>
              <button type="submit" disabled={busy} style={btnStyle}>
                {busy ? "Buscando..." : "Continuar →"}
              </button>
            </div>
          </form>
        )}

        {/* Paso 2: Datos fiscales */}
        {paso === 2 && ticket && (
          <form onSubmit={facturar} style={{ background: "white", padding: 24, borderRadius: 12,
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>2. Tus datos fiscales</h2>

            <div style={{ background: "#f9fafb", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              <div><strong>Emisor:</strong> {ticket.emisor.razon_social} ({ticket.emisor.rfc})</div>
              <div><strong>Folio:</strong> {ticket.folio} — <strong>Total:</strong> {fmt(ticket.total)}</div>
              <div><strong>Fecha:</strong> {new Date(ticket.fecha).toLocaleString("es-MX")}</div>
            </div>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label style={lblStyle}>RFC *</label>
                <input value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())}
                  placeholder="XAXX010101000" style={inpStyle} required maxLength={13} />
              </div>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label style={lblStyle}>Razón social / Nombre *</label>
                <input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)}
                  style={inpStyle} required />
              </div>
              <div>
                <label style={lblStyle}>Régimen fiscal *</label>
                <select value={regimen} onChange={(e) => setRegimen(e.target.value)} style={inpStyle}>
                  {REGIMEN_FISCAL.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
                </select>
              </div>
              <div>
                <label style={lblStyle}>Código postal *</label>
                <input value={cp} onChange={(e) => setCp(e.target.value.replace(/\D/g, ""))}
                  maxLength={5} style={inpStyle} required />
              </div>
              <div>
                <label style={lblStyle}>Uso CFDI *</label>
                <select value={usoCfdi} onChange={(e) => setUsoCfdi(e.target.value)} style={inpStyle}>
                  {USO_CFDI.map((u) => <option key={u.v} value={u.v}>{u.t}</option>)}
                </select>
              </div>
              <div>
                <label style={lblStyle}>Correo electrónico *</label>
                <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)}
                  style={inpStyle} required />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button type="button" onClick={() => { setPaso(1); setError(null); }}
                style={{ ...btnStyle, background: "white", color: "#374151", border: "1px solid #d1d5db" }}>
                ← Atrás
              </button>
              <button type="submit" disabled={busy} style={{ ...btnStyle, flex: 1 }}>
                {busy ? "Generando factura..." : "Generar factura"}
              </button>
            </div>
          </form>
        )}

        {/* Paso 3: Resultado */}
        {paso === 3 && resultado && (
          <div style={{ background: "white", padding: 24, borderRadius: 12,
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)", textAlign: "center" }}>
            <div style={{ fontSize: 56 }}>✓</div>
            <h2 style={{ marginTop: 8, color: "#059669" }}>¡Factura generada!</h2>
            <p style={{ color: "#6b7280", marginBottom: 16 }}>
              {resultado.correo_enviado_a
                ? `Enviamos tu factura (XML + PDF) a ${resultado.correo_enviado_a}.`
                : "Tu factura fue timbrada correctamente."}
            </p>
            <div style={{ background: "#f9fafb", padding: 16, borderRadius: 8, marginBottom: 16, fontSize: 13, textAlign: "left" }}>
              <div><strong>Folio interno:</strong> {resultado.factura_folio}</div>
              <div><strong>Folio fiscal:</strong> {resultado.serie_folio_sat}</div>
              <div style={{ wordBreak: "break-all" }}><strong>UUID:</strong> {resultado.uuid}</div>
            </div>
            <p style={{ fontSize: 12, color: "#9ca3af" }}>
              Si no recibes el correo en unos minutos revisa tu bandeja de spam.
            </p>
            <button onClick={() => {
              setPaso(1); setFolio(""); setTotal(0); setTicket(null);
              setRfc(""); setRazonSocial(""); setCp(""); setCorreo("");
              setResultado(null); setError(null);
            }} style={{ ...btnStyle, marginTop: 12 }}>
              Facturar otro ticket
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const lblStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: "#374151",
  marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
};
const inpStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #d1d5db",
  borderRadius: 6, outline: "none", boxSizing: "border-box",
};
const btnStyle: React.CSSProperties = {
  width: "100%", padding: "12px 16px", fontSize: 15, fontWeight: 600, color: "white",
  background: "#2563eb", border: 0, borderRadius: 8, cursor: "pointer",
};
