import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

export type ClienteSel = {
  id: number; nombre: string; rfc?: string | null;
  razon_social?: string | null; regimen_fiscal?: string | null;
  codigo_postal?: string | null; correo?: string | null;
  whatsapp?: string | null; telefono?: string | null;
  uso_cfdi_default?: string | null;
  forma_pago_default?: string | null;
  metodo_pago_default?: string | null;
  condiciones_pago?: string | null;
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
    forma_pago_default: "03", metodo_pago_default: "PUE",
    condiciones_pago: "",
  });
  const [creando, setCreando] = useState(false);
  const [parseandoCsf, setParseandoCsf] = useState(false);
  const [csfError, setCsfError] = useState<string | null>(null);
  const inputBuscarRef = useRef<HTMLInputElement>(null);

  async function subirCsf(file: File) {
    setParseandoCsf(true);
    setCsfError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/api/clientes/parsear-csf", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });
      const data = r.data || {};
      setNuevo({
        ...nuevo,
        nombre: data.razon_social || nuevo.nombre,
        razon_social: data.razon_social || nuevo.razon_social,
        rfc: (data.rfc || nuevo.rfc || "").toUpperCase(),
        codigo_postal: data.codigo_postal || nuevo.codigo_postal,
        regimen_fiscal: data.regimen_fiscal || nuevo.regimen_fiscal,
      });
    } catch (err: any) {
      setCsfError(err.response?.data?.detail || err.message);
    } finally {
      setParseandoCsf(false);
    }
  }

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

            {/* Subir Constancia de Situacion Fiscal */}
            <div style={{
              padding: 10, background: "#eff6ff", borderRadius: 6, border: "1px dashed #93c5fd",
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            }}>
              <label style={{ fontSize: 12, color: "#1e40af", fontWeight: 600, cursor: "pointer" }}>
                📎 Subir Constancia (CSF) para auto-llenar
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,image/*,application/pdf"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) subirCsf(f); }}
                  style={{ display: "none" }} disabled={parseandoCsf} />
              </label>
              {parseandoCsf && <span style={{ fontSize: 11, color: "#6b7280" }}>Procesando con IA…</span>}
              {csfError && <span style={{ fontSize: 11, color: "#991b1b" }}>{csfError}</span>}
              {!parseandoCsf && !csfError && (
                <span style={{ fontSize: 11, color: "#6b7280" }}>
                  Lee RFC / Razón social / Régimen / CP del PDF
                </span>
              )}
            </div>
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
              {/* Regimen fiscal: SIEMPRE visible (no solo cuando requiere RFC) */}
              <>
                  <div>
                    <label>Régimen fiscal</label>
                    <select className="input" value={nuevo.regimen_fiscal}
                      onChange={(e) => setNuevo({ ...nuevo, regimen_fiscal: e.target.value })}>
                      <option value="601">601 - General de Ley (PM)</option>
                      <option value="603">603 - PM Fines no Lucrativos</option>
                      <option value="605">605 - Sueldos y Salarios</option>
                      <option value="606">606 - Arrendamiento</option>
                      <option value="607">607 - Enajenación de bienes</option>
                      <option value="608">608 - Demás ingresos</option>
                      <option value="610">610 - Residentes extranjero</option>
                      <option value="611">611 - Dividendos</option>
                      <option value="612">612 - PF Act. empresarial</option>
                      <option value="614">614 - Intereses</option>
                      <option value="615">615 - Premios</option>
                      <option value="616">616 - Sin obligaciones</option>
                      <option value="620">620 - Sociedades cooperativas</option>
                      <option value="621">621 - Incorporación Fiscal</option>
                      <option value="622">622 - Agricultura/ganadería</option>
                      <option value="623">623 - Opcional grupos</option>
                      <option value="624">624 - Coordinados</option>
                      <option value="625">625 - Plataformas tecnológicas</option>
                      <option value="626">626 - RESICO (PF/PM)</option>
                    </select>
                  </div>
                  <div>
                    <label>Uso CFDI default</label>
                    <select className="input" value={nuevo.uso_cfdi_default}
                      onChange={(e) => setNuevo({ ...nuevo, uso_cfdi_default: e.target.value })}>
                      <option value="G01">G01 - Adquisición de mercancías</option>
                      <option value="G02">G02 - Devoluciones, descuentos</option>
                      <option value="G03">G03 - Gastos en general</option>
                      <option value="I01">I01 - Construcciones</option>
                      <option value="I02">I02 - Mobiliario y equipo</option>
                      <option value="I03">I03 - Equipo de transporte</option>
                      <option value="I04">I04 - Equipo cómputo</option>
                      <option value="I08">I08 - Otra maquinaria</option>
                      <option value="D01">D01 - Honorarios médicos</option>
                      <option value="D10">D10 - Pagos por servicios educativos</option>
                      <option value="S01">S01 - Sin efectos fiscales</option>
                      <option value="CP01">CP01 - Pagos</option>
                      <option value="P01">P01 - Por definir</option>
                    </select>
                  </div>
                  <div>
                    <label>Forma de pago default</label>
                    <select className="input" value={nuevo.forma_pago_default}
                      onChange={(e) => setNuevo({ ...nuevo, forma_pago_default: e.target.value })}>
                      <option value="01">01 - Efectivo</option>
                      <option value="02">02 - Cheque nominativo</option>
                      <option value="03">03 - Transferencia</option>
                      <option value="04">04 - Tarjeta de crédito</option>
                      <option value="28">28 - Tarjeta de débito</option>
                      <option value="99">99 - Por definir (PPD)</option>
                    </select>
                  </div>
                  <div>
                    <label>Método de pago default</label>
                    <select className="input" value={nuevo.metodo_pago_default}
                      onChange={(e) => setNuevo({ ...nuevo, metodo_pago_default: e.target.value })}>
                      <option value="PUE">PUE - Pago en una sola exhibición</option>
                      <option value="PPD">PPD - Pago en parcialidades</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / span 2" }}>
                    <label>Condiciones de pago (texto libre)</label>
                    <input className="input" value={nuevo.condiciones_pago}
                      onChange={(e) => setNuevo({ ...nuevo, condiciones_pago: e.target.value })}
                      placeholder="ej. 30 días neto, contraentrega, etc." />
                  </div>
                </>
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
