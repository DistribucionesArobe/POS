import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type Canal = {
  id: number; tipo: string; nombre: string; activo: boolean; externo_id: string;
};

type Conv = {
  id: number;
  canal_id: number;
  canal_nombre: string;
  canal_tipo: string;
  contacto_externo: string;
  contacto_nombre: string | null;
  cliente_id: number | null;
  agente_id: number | null;
  agente_nombre?: string;
  estado: string;
  ultimo_mensaje_en: string | null;
  ultimo_mensaje_preview: string | null;
  ultimo_mensaje_direccion: string;
  no_leidos: number;
  cliente?: {
    id: number; nombre: string; razon_social: string | null;
    rfc: string | null; telefono: string | null; correo: string | null;
  };
};

type Mensaje = {
  id: number;
  direccion: "in" | "out" | "nota";
  tipo: string;
  contenido: string | null;
  adjunto_url: string | null;
  adjunto_mime: string | null;
  adjunto_nombre: string | null;
  estado: string;
  error_detalle: string | null;
  agente_id: number | null;
  creado_en: string;
};

const fmtHora = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) {
    return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
};

const iconoCanal = (tipo: string) => tipo === "whatsapp" ? "💬" : tipo === "facebook" ? "📘" : "✉";

export default function Inbox() {
  const [canales, setCanales] = useState<Canal[]>([]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [convSel, setConvSel] = useState<Conv | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<string>("");
  const [filtroCanal, setFiltroCanal] = useState<number | "">("");
  const [filtroAsignado, setFiltroAsignado] = useState<string>("");
  const [busqueda, setBusqueda] = useState<string>("");
  const [textoRespuesta, setTextoRespuesta] = useState<string>("");
  const [enviando, setEnviando] = useState(false);
  const [modoNota, setModoNota] = useState(false);
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function cargarCanales() {
    try {
      const r = await api.get("/api/inbox/canales");
      setCanales(r.data);
    } catch (err: any) {
      // silent
    }
  }

  async function cargarConversaciones() {
    try {
      const params: any = { limit: 200 };
      if (filtroEstado) params.estado = filtroEstado;
      if (filtroCanal) params.canal_id = filtroCanal;
      if (filtroAsignado) params.asignada_a = filtroAsignado;
      if (busqueda.trim()) params.q = busqueda.trim();
      const r = await api.get("/api/inbox/conversaciones", { params });
      setConvs(r.data);
    } catch (err: any) {
      setConvs([]);
    }
  }

  async function cargarMensajes(conv: Conv) {
    try {
      const r = await api.get(`/api/inbox/conversaciones/${conv.id}/mensajes`);
      setMensajes(r.data);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err: any) {
      setMensajes([]);
    }
  }

  async function seleccionarConv(c: Conv) {
    setConvSel(c);
    await cargarMensajes(c);
    // Marcar como leido
    try {
      await api.post(`/api/inbox/conversaciones/${c.id}/marcar-leido`);
      // Optimista: quitar contador local
      setConvs(prev => prev.map(x => x.id === c.id ? { ...x, no_leidos: 0 } : x));
    } catch {}
  }

  async function enviarRespuesta() {
    if (!convSel || !textoRespuesta.trim()) return;
    setEnviando(true);
    try {
      const url = modoNota
        ? `/api/inbox/conversaciones/${convSel.id}/nota`
        : `/api/inbox/conversaciones/${convSel.id}/responder`;
      const payload: any = modoNota
        ? { contenido: textoRespuesta.trim() }
        : { contenido: textoRespuesta.trim(), tipo: "texto" };
      await api.post(url, payload);
      setTextoRespuesta("");
      await cargarMensajes(convSel);
      cargarConversaciones();
    } catch (err: any) {
      alert("Error al enviar: " + (err.response?.data?.detail || err.message));
    } finally {
      setEnviando(false);
    }
  }

  async function cambiarEstado(estado: string) {
    if (!convSel) return;
    try {
      await api.patch(`/api/inbox/conversaciones/${convSel.id}/estado`, { estado });
      setConvSel({ ...convSel, estado });
      cargarConversaciones();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  useEffect(() => { cargarCanales(); }, []);
  useEffect(() => { cargarConversaciones(); }, [filtroEstado, filtroCanal, filtroAsignado]);
  useEffect(() => {
    const t = setTimeout(() => cargarConversaciones(), 300);
    return () => clearTimeout(t);
  }, [busqueda]);
  // Poll cada 10s para nuevos mensajes
  useEffect(() => {
    const iv = setInterval(() => {
      cargarConversaciones();
      if (convSel) cargarMensajes(convSel);
    }, 10000);
    return () => clearInterval(iv);
  }, [convSel]);

  const canalesActivos = useMemo(() => canales.filter(c => c.activo), [canales]);

  return (
    <Layout title="Mensajes Ventas" subtitle={`${convs.length} conversaciones`}
      actions={
        <button className="btn-icon" onClick={() => setMostrarConfig(true)}>⚙ Canales</button>
      }
    >
      <div style={{
        display: "grid", gridTemplateColumns: "340px 1fr 320px",
        gap: 0, height: "calc(100vh - 130px)", background: "white",
        borderRadius: 8, overflow: "hidden",
        border: "1px solid var(--color-border)",
      }}>
        {/* COLUMNA 1: Lista de conversaciones */}
        <div style={{ borderRight: "1px solid var(--color-border)", display: "flex", flexDirection: "column" }}>
          {/* Filtros */}
          <div style={{ padding: 10, borderBottom: "1px solid var(--color-border)", background: "#f8fafc" }}>
            <input placeholder="Buscar contacto..." value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", fontSize: 13,
                border: "1px solid #cbd5e1", borderRadius: 4, marginBottom: 6 }} />
            <div style={{ display: "flex", gap: 4, fontSize: 11 }}>
              <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}
                style={{ flex: 1, padding: 4, fontSize: 11, border: "1px solid #cbd5e1", borderRadius: 4 }}>
                <option value="">Estado (todos)</option>
                <option value="nueva">Nueva</option>
                <option value="en_curso">En curso</option>
                <option value="resuelta">Resuelta</option>
                <option value="archivada">Archivada</option>
              </select>
              <select value={filtroCanal} onChange={(e) => setFiltroCanal(e.target.value ? +e.target.value : "")}
                style={{ flex: 1, padding: 4, fontSize: 11, border: "1px solid #cbd5e1", borderRadius: 4 }}>
                <option value="">Canal (todos)</option>
                {canalesActivos.map(c => (
                  <option key={c.id} value={c.id}>{iconoCanal(c.tipo)} {c.nombre}</option>
                ))}
              </select>
              <select value={filtroAsignado} onChange={(e) => setFiltroAsignado(e.target.value)}
                style={{ flex: 1, padding: 4, fontSize: 11, border: "1px solid #cbd5e1", borderRadius: 4 }}>
                <option value="">Agente</option>
                <option value="me">Mías</option>
                <option value="sin_asignar">Sin asignar</option>
              </select>
            </div>
          </div>
          {/* Lista scrollable */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {convs.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                No hay conversaciones{busqueda ? " que coincidan" : ""}.
              </div>
            )}
            {convs.map(c => {
              const activa = convSel?.id === c.id;
              return (
                <div key={c.id} onClick={() => seleccionarConv(c)}
                  style={{
                    padding: "10px 12px", borderBottom: "1px solid #f1f5f9",
                    cursor: "pointer",
                    background: activa ? "#dbeafe" : (c.no_leidos > 0 ? "#fef9c3" : "white"),
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: c.no_leidos > 0 ? 700 : 500, fontSize: 13 }}>
                      <span style={{ marginRight: 4 }}>{iconoCanal(c.canal_tipo)}</span>
                      {c.contacto_nombre || c.contacto_externo}
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>
                      {fmtHora(c.ultimo_mensaje_en)}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 2,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.ultimo_mensaje_direccion === "out" && <span style={{ color: "#94a3b8" }}>✓ </span>}
                    {c.ultimo_mensaje_preview || "(sin mensajes)"}
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 4, alignItems: "center" }}>
                    <span style={{
                      fontSize: 9, padding: "1px 5px", borderRadius: 2,
                      background: c.estado === "nueva" ? "#fef3c7"
                        : c.estado === "en_curso" ? "#dbeafe"
                        : c.estado === "resuelta" ? "#dcfce7" : "#e2e8f0",
                      color: c.estado === "nueva" ? "#92400e"
                        : c.estado === "en_curso" ? "#1e40af"
                        : c.estado === "resuelta" ? "#166534" : "#475569",
                    }}>{c.estado.toUpperCase()}</span>
                    {c.agente_nombre && (
                      <span style={{ fontSize: 9, color: "#64748b" }}>
                        · {c.agente_nombre}
                      </span>
                    )}
                    {c.no_leidos > 0 && (
                      <span style={{
                        marginLeft: "auto",
                        fontSize: 10, fontWeight: 700, padding: "1px 6px",
                        background: "#dc2626", color: "white", borderRadius: 10,
                      }}>{c.no_leidos}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMNA 2: Chat */}
        <div style={{ display: "flex", flexDirection: "column", background: "#f1f5f9" }}>
          {!convSel ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              color: "#94a3b8", fontSize: 14 }}>
              Selecciona una conversación
            </div>
          ) : (
            <>
              {/* Header del chat */}
              <div style={{ padding: 12, background: "white", borderBottom: "1px solid #cbd5e1",
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {iconoCanal(convSel.canal_tipo)} {convSel.contacto_nombre || convSel.contacto_externo}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    {convSel.canal_nombre} · {convSel.contacto_externo}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {convSel.estado !== "resuelta" && (
                    <button onClick={() => cambiarEstado("resuelta")}
                      style={{ padding: "6px 12px", fontSize: 12, background: "#10b981",
                        color: "white", border: 0, borderRadius: 4, cursor: "pointer" }}>
                      ✓ Marcar resuelta
                    </button>
                  )}
                  {convSel.estado === "resuelta" && (
                    <button onClick={() => cambiarEstado("en_curso")}
                      style={{ padding: "6px 12px", fontSize: 12, background: "#0ea5e9",
                        color: "white", border: 0, borderRadius: 4, cursor: "pointer" }}>
                      ↩ Reabrir
                    </button>
                  )}
                </div>
              </div>
              {/* Burbujas */}
              <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                {mensajes.map(m => (
                  <BurbujaMensaje key={m.id} m={m} />
                ))}
                <div ref={bottomRef} />
              </div>
              {/* Input */}
              <div style={{ padding: 10, background: "white", borderTop: "1px solid #cbd5e1" }}>
                <div style={{ display: "flex", gap: 4, marginBottom: 6, fontSize: 11 }}>
                  <button onClick={() => setModoNota(false)}
                    style={{ padding: "3px 10px", background: modoNota ? "transparent" : "#0f172a",
                      color: modoNota ? "#0f172a" : "white", border: "1px solid #0f172a",
                      borderRadius: 3, fontSize: 11, cursor: "pointer" }}>
                    💬 Responder al cliente
                  </button>
                  <button onClick={() => setModoNota(true)}
                    style={{ padding: "3px 10px", background: modoNota ? "#f59e0b" : "transparent",
                      color: modoNota ? "white" : "#92400e", border: "1px solid #f59e0b",
                      borderRadius: 3, fontSize: 11, cursor: "pointer" }}>
                    📝 Nota interna
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <textarea value={textoRespuesta}
                    onChange={(e) => setTextoRespuesta(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        enviarRespuesta();
                      }
                    }}
                    placeholder={modoNota ? "Nota interna (solo agentes)" : "Escribe tu respuesta..."}
                    style={{ flex: 1, padding: "8px 10px", fontSize: 13, border: "1px solid #cbd5e1",
                      borderRadius: 4, resize: "none", minHeight: 60,
                      background: modoNota ? "#fef3c7" : "white" }} />
                  <button onClick={enviarRespuesta} disabled={enviando || !textoRespuesta.trim()}
                    style={{ padding: "0 20px", background: modoNota ? "#f59e0b" : "#10b981",
                      color: "white", border: 0, borderRadius: 4, fontWeight: 600,
                      cursor: enviando ? "wait" : "pointer" }}>
                    {enviando ? "..." : "Enviar"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* COLUMNA 3: Tarjeta cliente */}
        <div style={{ borderLeft: "1px solid var(--color-border)", padding: 12, overflowY: "auto",
          background: "#f8fafc" }}>
          {convSel ? (
            <SidebarCliente conv={convSel} />
          ) : (
            <div style={{ color: "#94a3b8", fontSize: 12, textAlign: "center", marginTop: 20 }}>
              Sin conversación seleccionada
            </div>
          )}
        </div>
      </div>

      {mostrarConfig && <ConfigCanalesModal onClose={() => { setMostrarConfig(false); cargarCanales(); }} />}
    </Layout>
  );
}


function BurbujaMensaje({ m }: { m: Mensaje }) {
  const esNota = m.direccion === "nota";
  const esOut = m.direccion === "out";
  return (
    <div style={{
      display: "flex",
      justifyContent: esNota ? "center" : (esOut ? "flex-end" : "flex-start"),
      marginBottom: 8,
    }}>
      <div style={{
        maxWidth: "72%",
        padding: "8px 12px",
        background: esNota ? "#fef3c7" : (esOut ? "#dcfce7" : "white"),
        border: esNota ? "1px solid #fbbf24" : "1px solid #e2e8f0",
        borderRadius: esNota ? 6 : (esOut ? "10px 10px 2px 10px" : "10px 10px 10px 2px"),
        fontSize: 13, color: "#0f172a", lineHeight: 1.4,
      }}>
        {esNota && <div style={{ fontSize: 10, color: "#92400e", fontWeight: 700, marginBottom: 2 }}>📝 NOTA INTERNA</div>}
        {m.adjunto_url && m.tipo === "imagen" && (
          <img src={m.adjunto_url} style={{ maxWidth: "100%", borderRadius: 4, marginBottom: 4 }} alt="" />
        )}
        {m.adjunto_url && m.tipo === "documento" && (
          <a href={m.adjunto_url} target="_blank" rel="noreferrer"
            style={{ display: "block", padding: 6, background: "#e2e8f0", borderRadius: 4, fontSize: 12 }}>
            📄 {m.adjunto_nombre || "Documento"}
          </a>
        )}
        <div style={{ whiteSpace: "pre-wrap" }}>{m.contenido}</div>
        <div style={{ fontSize: 9, color: "#94a3b8", textAlign: "right", marginTop: 3 }}>
          {fmtHora(m.creado_en)}
          {esOut && m.estado === "error" && <span style={{ color: "#dc2626" }}> · Error</span>}
          {esOut && m.estado === "enviando" && <span> · Enviando…</span>}
        </div>
      </div>
    </div>
  );
}


function SidebarCliente({ conv }: { conv: Conv }) {
  const [ventas, setVentas] = useState<any[]>([]);
  useEffect(() => {
    if (conv.cliente_id) {
      api.get("/api/ventas", { params: { cliente_id: conv.cliente_id, limit: 5 } })
        .then(r => setVentas(r.data))
        .catch(() => setVentas([]));
    } else {
      setVentas([]);
    }
  }, [conv.cliente_id]);
  return (
    <div>
      <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#475569" }}>CONTACTO</h4>
      <div style={{ padding: 10, background: "white", borderRadius: 4, border: "1px solid #e2e8f0" }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{conv.contacto_nombre || "Sin nombre"}</div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{conv.contacto_externo}</div>
      </div>

      {conv.cliente ? (
        <>
          <h4 style={{ margin: "12px 0 8px", fontSize: 13, color: "#475569" }}>CLIENTE POS</h4>
          <div style={{ padding: 10, background: "white", borderRadius: 4, border: "1px solid #e2e8f0" }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{conv.cliente.razon_social || conv.cliente.nombre}</div>
            {conv.cliente.rfc && <div style={{ fontSize: 11, color: "#64748b" }}>RFC: {conv.cliente.rfc}</div>}
            {conv.cliente.correo && <div style={{ fontSize: 11, color: "#64748b" }}>{conv.cliente.correo}</div>}
          </div>
          {ventas.length > 0 && (
            <>
              <h4 style={{ margin: "12px 0 8px", fontSize: 13, color: "#475569" }}>ULTIMAS VENTAS</h4>
              {ventas.slice(0, 5).map(v => (
                <div key={v.id} style={{ padding: 8, background: "white", borderRadius: 4,
                  border: "1px solid #e2e8f0", marginBottom: 4, fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{v.folio}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    {v.tipo} · ${(+v.total).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      ) : (
        <div style={{ padding: 10, marginTop: 12, background: "#fef9c3", borderRadius: 4,
          fontSize: 11, color: "#92400e" }}>
          Este contacto NO está registrado como cliente del POS. Puedes crearlo desde Clientes.
        </div>
      )}
    </div>
  );
}


function ConfigCanalesModal({ onClose }: { onClose: () => void }) {
  const [canales, setCanales] = useState<Canal[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({
    tipo: "whatsapp",
    nombre: "",
    externo_id: "",
    access_token: "",
    waba_id: "",
  });
  const [creado, setCreado] = useState<any | null>(null);

  async function cargar() {
    try {
      const r = await api.get("/api/inbox/canales");
      setCanales(r.data);
    } catch {}
  }
  useEffect(() => { cargar(); }, []);

  async function crear() {
    if (!form.nombre || !form.externo_id || !form.access_token) {
      alert("Faltan campos");
      return;
    }
    try {
      const r = await api.post("/api/inbox/canales", form);
      setCreado(r.data);
      setMostrarForm(false);
      setForm({ tipo: "whatsapp", nombre: "", externo_id: "", access_token: "", waba_id: "" });
      cargar();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  }

  const base = window.location.origin.replace("frontend", "backend");

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1500,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "white", padding: 20, borderRadius: 8, width: "94%", maxWidth: 700,
        maxHeight: "90vh", overflow: "auto",
      }}>
        <h3 style={{ margin: "0 0 12px" }}>⚙ Canales de mensajería</h3>
        {creado && (
          <div style={{ padding: 12, background: "#dcfce7", borderRadius: 4, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>✓ Canal creado (ID {creado.id})</div>
            <div style={{ fontSize: 12 }}>
              <strong>Verify Token:</strong> <code style={{ background: "white", padding: "1px 5px" }}>{creado.verify_token}</code>
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              <strong>Webhook URL:</strong> <code style={{ background: "white", padding: "1px 5px" }}>
                {base}/api/inbox{creado.webhook_url_ejemplo?.replace("/api/inbox", "")}
              </code>
            </div>
            <div style={{ fontSize: 11, color: "#166534", marginTop: 6 }}>
              Copia estos datos y configuralos en Meta Developer &gt; Webhooks del canal.
            </div>
          </div>
        )}

        {!mostrarForm && (
          <button onClick={() => setMostrarForm(true)} style={{
            padding: "8px 16px", background: "#0ea5e9", color: "white",
            border: 0, borderRadius: 4, marginBottom: 12, cursor: "pointer",
          }}>+ Nuevo canal</button>
        )}

        {mostrarForm && (
          <div style={{ padding: 12, background: "#f8fafc", borderRadius: 4, marginBottom: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11 }}>Tipo</label>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                style={{ width: "100%", padding: 6, marginTop: 3 }}>
                <option value="whatsapp">WhatsApp Business (Cloud API)</option>
                <option value="facebook">Facebook Messenger</option>
              </select>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11 }}>Nombre descriptivo</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej. WhatsApp Ventas Aceromax"
                style={{ width: "100%", padding: 6, marginTop: 3 }} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11 }}>
                {form.tipo === "whatsapp" ? "Phone Number ID" : "Page ID"}
              </label>
              <input value={form.externo_id} onChange={(e) => setForm({ ...form, externo_id: e.target.value })}
                style={{ width: "100%", padding: 6, marginTop: 3 }} />
            </div>
            {form.tipo === "whatsapp" && (
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11 }}>WABA ID (opcional)</label>
                <input value={form.waba_id} onChange={(e) => setForm({ ...form, waba_id: e.target.value })}
                  style={{ width: "100%", padding: 6, marginTop: 3 }} />
              </div>
            )}
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11 }}>Access Token (Bearer)</label>
              <textarea value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })}
                style={{ width: "100%", padding: 6, marginTop: 3, minHeight: 60, fontFamily: "monospace", fontSize: 11 }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={crear} style={{
                padding: "6px 14px", background: "#10b981", color: "white",
                border: 0, borderRadius: 4, cursor: "pointer",
              }}>Crear canal</button>
              <button onClick={() => setMostrarForm(false)} style={{
                padding: "6px 14px", background: "transparent", border: "1px solid #cbd5e1",
                borderRadius: 4, cursor: "pointer",
              }}>Cancelar</button>
            </div>
          </div>
        )}

        <table style={{ width: "100%", fontSize: 12 }}>
          <thead><tr style={{ background: "#f1f5f9" }}>
            <th style={{ padding: 8, textAlign: "left" }}>Canal</th>
            <th style={{ padding: 8, textAlign: "left" }}>Tipo</th>
            <th style={{ padding: 8, textAlign: "left" }}>ID Meta</th>
            <th style={{ padding: 8 }}>Estado</th>
          </tr></thead>
          <tbody>
            {canales.map(c => (
              <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: 8 }}>{iconoCanal(c.tipo)} {c.nombre}</td>
                <td style={{ padding: 8 }}>{c.tipo}</td>
                <td style={{ padding: 8, fontFamily: "monospace" }}>{c.externo_id}</td>
                <td style={{ padding: 8, textAlign: "center" }}>
                  {c.activo ? "✓" : "✗"}
                </td>
              </tr>
            ))}
            {canales.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 16, textAlign: "center", color: "#94a3b8" }}>
                Aún no tienes canales configurados.
              </td></tr>
            )}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", background: "transparent", border: "1px solid #cbd5e1",
            borderRadius: 4, cursor: "pointer",
          }}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
