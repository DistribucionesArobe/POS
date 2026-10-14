import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { publicApi } from "../api/public";

// Portal publico. NO requiere login.
// URL: /registro-cliente/:empresaId
// El cliente llega aqui desde un link/QR que le mandas por WhatsApp.
// Sube su Constancia de Situacion Fiscal (CSF) y queda registrado automatico.

export default function RegistroPublico() {
  const { empresaId } = useParams<{ empresaId: string }>();
  const [empresa, setEmpresa] = useState<any | null>(null);
  const [cargando, setCargando] = useState(true);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [whatsapp, setWhatsapp] = useState("");
  const [correo, setCorreo] = useState("");
  const [usoCfdi, setUsoCfdi] = useState("G03");
  const [metodoPago, setMetodoPago] = useState("PUE");
  const [formaPago, setFormaPago] = useState("03");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputFileRef = useRef<HTMLInputElement>(null);

  function resetFormulario() {
    setArchivo(null);
    setWhatsapp("");
    setCorreo("");
    setUsoCfdi("G03");
    setMetodoPago("PUE");
    setFormaPago("03");
    setResultado(null);
    setError(null);
  }

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      try {
        const r = await publicApi.get(`/api/public/registro-cliente/${empresaId}`);
        setEmpresa(r.data);
      } catch { setError("Empresa no encontrada o link invalido."); }
      finally { setCargando(false); }
    })();
  }, [empresaId]);

  async function enviar() {
    if (!archivo) { setError("Primero elige tu Constancia (PDF o foto)"); return; }
    setEnviando(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", archivo);
      if (whatsapp.trim()) fd.append("whatsapp", whatsapp.trim());
      if (correo.trim()) fd.append("correo", correo.trim());
      fd.append("uso_cfdi", usoCfdi);
      fd.append("metodo_pago", metodoPago);
      // Si eligio PPD, la forma de pago fiscal es 99 "por definir"
      fd.append("forma_pago", metodoPago === "PPD" ? "99" : formaPago);
      const r = await publicApi.post(
        `/api/public/registro-cliente/${empresaId}/subir-csf`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" }, timeout: 120000 }
      );
      setResultado(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || "No se pudo procesar");
    } finally { setEnviando(false); }
  }

  if (cargando) {
    return <div style={pageWrap}><div style={{ textAlign: "center", color: "#64748b" }}>Cargando...</div></div>;
  }

  if (!empresa) {
    return (
      <div style={pageWrap}>
        <div style={cardStyle}>
          <h2 style={{ color: "#dc2626", margin: "0 0 10px" }}>⚠ Link invalido</h2>
          <p style={{ color: "#64748b" }}>Pide al vendedor que te comparta el link correcto.</p>
        </div>
      </div>
    );
  }

  if (resultado) {
    return (
      <div style={pageWrap}>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 64 }}>✅</div>
            <h2 style={{ color: "#059669", margin: "10px 0" }}>
              {resultado.nuevo ? "¡Registrado!" : "Ya estabas con nosotros"}
            </h2>
            <p style={{ color: "#334155", fontSize: 15, margin: "0 0 20px" }}>
              {resultado.mensaje}
            </p>
            <div style={{
              background: "#f1f5f9", padding: 14, borderRadius: 8,
              textAlign: "left", fontSize: 13,
            }}>
              <div><strong>RFC:</strong> <code>{resultado.rfc}</code></div>
              <div><strong>Razón social:</strong> {resultado.razon_social}</div>
              {resultado.regimen_fiscal && (
                <div><strong>Régimen:</strong> {resultado.regimen_fiscal}</div>
              )}
              {resultado.codigo_postal && (
                <div><strong>CP:</strong> {resultado.codigo_postal}</div>
              )}
            </div>
            {(resultado.uso_cfdi || resultado.metodo_pago) && (
              <div style={{
                background: "#eff6ff", padding: 10, borderRadius: 6,
                marginTop: 10, fontSize: 12, color: "#1e40af", textAlign: "left",
              }}>
                <strong>Tus preferencias guardadas:</strong>
                <div>Uso CFDI: <code>{resultado.uso_cfdi}</code></div>
                <div>Método de pago: <code>{resultado.metodo_pago}</code></div>
              </div>
            )}
            <p style={{ color: "#64748b", fontSize: 12, marginTop: 20 }}>
              La próxima vez que compres, solo di tu RFC y podrán facturarte sin tener que llenar nada.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={resetFormulario}
                style={{
                  flex: 1, background: "#0f172a", color: "white",
                  border: 0, padding: "12px 18px", borderRadius: 8,
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}>
                ➕ Registrar otro cliente
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageWrap}>
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 40, marginBottom: 4 }}>📋</div>
          <h1 style={{ margin: 0, fontSize: 22, color: "#0f172a" }}>Registro de cliente</h1>
          <div style={{ fontSize: 14, color: "#64748b", marginTop: 2 }}>
            para facturarte en <strong>{empresa.nombre}</strong>
          </div>
        </div>

        <div style={{
          background: "#eff6ff", border: "1px solid #93c5fd",
          padding: 12, borderRadius: 8, fontSize: 13, color: "#1e40af",
          marginBottom: 16,
        }}>
          <strong>Cómo funciona:</strong> sube tu <strong>Constancia de Situación Fiscal (SAT)</strong> en
          PDF o foto. Leemos tus datos automáticamente — <strong>no tienes que capturar nada</strong>.
        </div>

        <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          Constancia de Situación Fiscal *
        </label>
        <div
          onClick={() => inputFileRef.current?.click()}
          style={{
            border: `2px dashed ${archivo ? "#059669" : "#cbd5e1"}`,
            background: archivo ? "#f0fdf4" : "#f8fafc",
            padding: "26px 14px", borderRadius: 10, textAlign: "center",
            cursor: "pointer", marginBottom: 14,
          }}>
          {archivo ? (
            <>
              <div style={{ fontSize: 36 }}>✓</div>
              <div style={{ fontWeight: 700, color: "#059669", fontSize: 14 }}>
                {archivo.name}
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                {Math.round(archivo.size / 1024)} KB · Toca para cambiar
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 36 }}>📎</div>
              <div style={{ color: "#334155", fontWeight: 700, fontSize: 14, marginTop: 6 }}>
                Toca para subir
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                PDF o foto · máx 10 MB
              </div>
            </>
          )}
          <input ref={inputFileRef} type="file" style={{ display: "none" }}
            accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
            onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
        </div>

        <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6, marginTop: 8 }}>
          WhatsApp <span style={{ color: "#64748b", fontWeight: 400 }}>(opcional)</span>
        </label>
        <input className="input" inputMode="tel" value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="8341234567"
          style={{ width: "100%", padding: "10px 12px", fontSize: 15,
            border: "1px solid #cbd5e1", borderRadius: 6, marginBottom: 10 }} />

        <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          Correo <span style={{ color: "#64748b", fontWeight: 400 }}>(para enviarte CFDI)</span>
        </label>
        <input className="input" type="email" value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          placeholder="tucorreo@ejemplo.com"
          style={{ width: "100%", padding: "10px 12px", fontSize: 15,
            border: "1px solid #cbd5e1", borderRadius: 6, marginBottom: 16 }} />

        {/* Preferencias de facturacion */}
        <details style={{
          marginBottom: 16, background: "#f8fafc", padding: 12, borderRadius: 8,
          border: "1px solid #e2e8f0",
        }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
            ⚙ Preferencias de facturación (opcional)
          </summary>
          <div style={{ marginTop: 10 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4, color: "#334155" }}>
              Uso del CFDI
            </label>
            <select value={usoCfdi} onChange={(e) => setUsoCfdi(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", fontSize: 14,
                border: "1px solid #cbd5e1", borderRadius: 6, marginBottom: 10 }}>
              <option value="G01">G01 - Adquisición de mercancías</option>
              <option value="G02">G02 - Devoluciones / descuentos</option>
              <option value="G03">G03 - Gastos en general</option>
              <option value="I01">I01 - Construcciones</option>
              <option value="I02">I02 - Mobiliario y equipo</option>
              <option value="I03">I03 - Equipo de transporte</option>
              <option value="I04">I04 - Equipo de cómputo</option>
              <option value="I08">I08 - Otra maquinaria</option>
              <option value="D01">D01 - Honorarios médicos</option>
              <option value="D10">D10 - Pagos por servicios educativos</option>
              <option value="S01">S01 - Sin efectos fiscales</option>
              <option value="CP01">CP01 - Pagos</option>
              <option value="P01">P01 - Por definir</option>
            </select>

            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4, color: "#334155" }}>
              Método de pago preferido
            </label>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <button type="button" onClick={() => setMetodoPago("PUE")}
                style={{
                  flex: 1, padding: "10px", border: 0, borderRadius: 6, cursor: "pointer",
                  fontSize: 13, fontWeight: 700,
                  background: metodoPago === "PUE" ? "#059669" : "#e2e8f0",
                  color: metodoPago === "PUE" ? "white" : "#334155",
                }}>
                PUE - Contado
              </button>
              <button type="button" onClick={() => setMetodoPago("PPD")}
                style={{
                  flex: 1, padding: "10px", border: 0, borderRadius: 6, cursor: "pointer",
                  fontSize: 13, fontWeight: 700,
                  background: metodoPago === "PPD" ? "#f59e0b" : "#e2e8f0",
                  color: metodoPago === "PPD" ? "white" : "#334155",
                }}>
                PPD - Crédito
              </button>
            </div>

            {metodoPago === "PUE" && (
              <>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4, color: "#334155" }}>
                  Forma de pago
                </label>
                <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", fontSize: 14,
                    border: "1px solid #cbd5e1", borderRadius: 6 }}>
                  <option value="01">01 - Efectivo</option>
                  <option value="03">03 - Transferencia</option>
                  <option value="04">04 - Tarjeta de crédito</option>
                  <option value="28">28 - Tarjeta de débito</option>
                  <option value="02">02 - Cheque</option>
                </select>
              </>
            )}
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 6 }}>
              Estos valores se usarán al facturarte. Puedes cambiarlos luego pidiéndolo al vendedor.
            </div>
          </div>
        </details>

        {error && (
          <div style={{
            background: "#fee2e2", color: "#991b1b",
            padding: 10, borderRadius: 6, fontSize: 13, marginBottom: 10,
          }}>{error}</div>
        )}

        <button onClick={enviar} disabled={!archivo || enviando}
          style={{
            width: "100%", padding: "14px 20px",
            background: !archivo || enviando ? "#94a3b8" : "#059669",
            color: "white", border: 0, borderRadius: 8,
            fontSize: 16, fontWeight: 800,
            cursor: !archivo || enviando ? "not-allowed" : "pointer",
          }}>
          {enviando ? "Procesando (10-30s)..." : "🚀 Registrarme"}
        </button>

        <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 14, textAlign: "center" }}>
          Al enviar aceptas que leamos los datos fiscales de tu Constancia para registrarte como cliente.
        </p>
      </div>
    </div>
  );
}

const pageWrap: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(135deg, #1e3a8a 0%, #312e81 100%)",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 16,
};

const cardStyle: React.CSSProperties = {
  background: "white",
  width: "100%", maxWidth: 440,
  padding: 24, borderRadius: 14,
  boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
};
