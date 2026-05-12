import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

export type ClienteSel = {
  id: number; nombre: string; rfc?: string | null;
  razon_social?: string | null; regimen_fiscal?: string | null;
  codigo_postal?: string | null; correo?: string | null;
  whatsapp?: string | null; telefono?: string | null;
};

export default function ClientePicker({ onClose, onSelect, requiereRfc = false }: {
  onClose: () => void;
  onSelect: (c: ClienteSel) => void;
  requiereRfc?: boolean;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [nuevo, setNuevo] = useState({
    nombre: "", rfc: "", razon_social: "",
    regimen_fiscal: "612", codigo_postal: "", correo: "",
    whatsapp: "", uso_cfdi_default: "G03",
  });
  const [creando, setCreando] = useState(false);
  const inputBuscarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputBuscarRef.current?.focus(), 80);
    buscar("");
  }, []);

  async function buscar(query: string) {
    setLoading(true);
    try {
      const r = await api.get("/api/clientes", { params: { q: query || undefined } });
      setResultados(r.data);
    } finally {
      setLoading(false);
    }
  }

  async function crear() {
    if (!nuevo.nombre && !nuevo.razon_social) return alert("Captura nombre o razón social");
    if (requiereRfc && (!nuevo.rfc || nuevo.rfc.length < 12)) return alert("RFC requerido (12-13 chars)");
    setCreando(true);
    try {
      const payload: any = { ...nuevo };
      payload.rfc = nuevo.rfc ? nuevo.rfc.toUpperCase().trim() : null;
      payload.nombre = nuevo.nombre || nuevo.razon_social;
      const r = await api.post("/api/clientes", payload);
      const det = await api.get(`/api/clientes/${r.data.id}`);
      onSelect(det.data);
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setCreando(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "white", maxWidth: 640, width: "92%", maxHeight: "90vh",
          overflow: "auto", padding: 20, borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Seleccionar cliente</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {!mostrarCrear ? (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input ref={inputBuscarRef} className="input"
                placeholder="Buscar por nombre, RFC, WhatsApp..."
                value={q} onChange={(e) => { setQ(e.target.value); buscar(e.target.value); }}
                style={{ flex: 1, fontSize: 14 }} />
              <button className="btn" onClick={() => setMostrarCrear(true)}>+ Nuevo</button>
            </div>
            <div style={{ maxHeight: 400, overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 6 }}>
              {loading && <div style={{ padding: 12, textAlign: "center", color: "var(--color-text-muted)" }}>Buscando...</div>}
              {!loading && resultados.length === 0 && (
                <div style={{ padding: 16, textAlign: "center", color: "var(--color-text-muted)" }}>
                  Sin resultados. <button onClick={() => setMostrarCrear(true)}
                    style={{ background: "transparent", border: 0, color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline" }}>
                    Crear nuevo cliente
                  </button>
                </div>
              )}
              {resultados.map((c) => {
                const apto = !requiereRfc || !!c.rfc;
                return (
                  <div key={c.id} onClick={() => apto && onSelect(c)}
                    style={{ padding: "10px 14px", cursor: apto ? "pointer" : "not-allowed",
                      borderBottom: "1px solid var(--color-border)",
                      opacity: apto ? 1 : 0.45, fontSize: 14 }}
                    onMouseEnter={(e) => apto && (e.currentTarget.style.background = "var(--color-bg)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "white")}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <strong>{c.nombre}</strong>
                      <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                        {c.rfc || (requiereRfc ? "⚠ sin RFC" : "—")}
                      </span>
                    </div>
                    {(c.razon_social || c.correo || c.whatsapp) && (
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                        {[c.razon_social, c.correo, c.whatsapp].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
              {requiereRfc ? "Captura datos fiscales completos para CFDI." : "Datos mínimos: nombre."}
            </p>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label>Nombre / Razón social *</label>
                <input className="input" value={nuevo.nombre}
                  onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value, razon_social: e.target.value })} />
              </div>
              <div>
                <label>RFC {requiereRfc && "*"}</label>
                <input className="input" maxLength={13} value={nuevo.rfc}
                  onChange={(e) => setNuevo({ ...nuevo, rfc: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label>CP {requiereRfc && "*"}</label>
                <input className="input" maxLength={5} value={nuevo.codigo_postal}
                  onChange={(e) => setNuevo({ ...nuevo, codigo_postal: e.target.value.replace(/\D/g, "") })} />
              </div>
              <div>
                <label>WhatsApp (sin lada)</label>
                <input className="input" value={nuevo.whatsapp}
                  onChange={(e) => setNuevo({ ...nuevo, whatsapp: e.target.value })} placeholder="8341234567" />
              </div>
              <div>
                <label>Correo</label>
                <input className="input" type="email" value={nuevo.correo}
                  onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })} />
              </div>
              {requiereRfc && (
                <>
                  <div>
                    <label>Régimen fiscal</label>
                    <select className="input" value={nuevo.regimen_fiscal}
                      onChange={(e) => setNuevo({ ...nuevo, regimen_fiscal: e.target.value })}>
                      <option value="601">601 - General PM</option>
                      <option value="612">612 - PF Act. empresarial</option>
                      <option value="616">616 - Sin obligaciones</option>
                      <option value="626">626 - RESICO</option>
                    </select>
                  </div>
                  <div>
                    <label>Uso CFDI default</label>
                    <select className="input" value={nuevo.uso_cfdi_default}
                      onChange={(e) => setNuevo({ ...nuevo, uso_cfdi_default: e.target.value })}>
                      <option value="G01">G01 - Adquisición</option>
                      <option value="G03">G03 - Gastos en general</option>
                      <option value="P01">P01 - Por definir</option>
                    </select>
                  </div>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn" disabled={creando} onClick={crear}>
                {creando ? "Creando..." : "Guardar y usar"}
              </button>
              <button className="btn-icon" onClick={() => setMostrarCrear(false)}>← Volver a buscar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
