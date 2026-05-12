import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../api/client";

const fmt = (n: number) =>
  "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Concepto = {
  variante_id: number;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
};

type Preview = {
  cliente: {
    id: number; nombre: string; rfc: string | null;
    razon_social: string | null; regimen_fiscal: string | null;
    codigo_postal: string | null; correo: string | null;
    uso_cfdi_default: string | null;
  };
  remisiones: { id: number; folio: string; total: number }[];
  conceptos: Concepto[];
};

export default function ConvertirRemisiones() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const ids = sp.get("ids") || "";

  const [data, setData] = useState<Preview | null>(null);
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [tipoDestino, setTipoDestino] = useState<"TICKET" | "FACTURA">("FACTURA");
  const [metodoPago, setMetodoPago] = useState<"PUE" | "PPD">("PPD");
  const [formaPago, setFormaPago] = useState("99");
  const [usoCfdi, setUsoCfdi] = useState("G03");
  const [timbrar, setTimbrar] = useState(true);
  const [notas, setNotas] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ids) { setError("Sin IDs de remisión"); return; }
    api.get(`/api/ventas/preview-conversion?remision_ids=${ids}`)
      .then((r) => {
        setData(r.data);
        setConceptos(r.data.conceptos);
        if (r.data.cliente.uso_cfdi_default) setUsoCfdi(r.data.cliente.uso_cfdi_default);
      })
      .catch((e) => setError(e.response?.data?.detail || "Error al cargar remisiones"));
  }, [ids]);

  const subtotal = conceptos.reduce((a, c) => a + c.cantidad * c.precio_unitario, 0);
  const iva = subtotal * 0.16;
  const total = subtotal + iva;

  function setC(idx: number, patch: Partial<Concepto>) {
    setConceptos(conceptos.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function quitar(idx: number) {
    setConceptos(conceptos.filter((_, i) => i !== idx));
  }

  async function guardar() {
    if (conceptos.length === 0) return alert("Sin conceptos");
    if (tipoDestino === "FACTURA" && !data?.cliente.rfc) {
      return alert("Para FACTURA el cliente necesita RFC");
    }
    setBusy(true);
    try {
      const payload: any = {
        remision_ids: ids.split(",").map((x) => +x),
        tipo_destino: tipoDestino,
        metodo_pago_sat: metodoPago,
        forma_pago_sat: tipoDestino === "FACTURA" && metodoPago === "PPD" ? "99" : formaPago,
        uso_cfdi: tipoDestino === "FACTURA" ? usoCfdi : null,
        conceptos: conceptos.map((c) => ({
          variante_id: c.variante_id,
          descripcion: c.descripcion,
          cantidad: +c.cantidad,
          precio_unitario: +c.precio_unitario,
        })),
        timbrar: tipoDestino === "FACTURA" && timbrar,
        notas: notas || null,
      };
      const r = await api.post("/api/ventas/desde-remisiones", payload);
      let msg = `${r.data.tipo} ${r.data.folio} creada por ${fmt(r.data.total)}`;
      msg += `\nRemisiones cerradas: ${r.data.remisiones_facturadas.join(", ")}`;
      if (r.data.cfdi) msg += `\n\nCFDI timbrado: ${r.data.cfdi.uuid}`;
      if (r.data.cfdi_error) msg += `\n\nERROR al timbrar:\n${r.data.cfdi_error}`;
      alert(msg);
      nav("/ventas");
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(false);
    }
  }

  if (error) return (
    <Layout title="Convertir remisiones" subtitle={error}>
      <button className="btn-icon" onClick={() => nav("/ventas")}>← Volver a Mis ventas</button>
    </Layout>
  );
  if (!data) return <Layout title="Convertir remisiones" subtitle="Cargando..."><p>Cargando...</p></Layout>;

  return (
    <Layout title="Convertir remisiones"
      subtitle={`Cliente: ${data.cliente.nombre}${data.cliente.rfc ? " · " + data.cliente.rfc : ""}`}>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="card-header">Remisiones origen</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.remisiones.map((r) => (
            <span key={r.id} className="badge badge-warning" style={{ fontSize: 12 }}>
              {r.folio} · {fmt(r.total)}
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="card-header">Conceptos (ajusta cantidades y precios)</h3>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th style={{ textAlign: "right" }}>Cantidad</th>
              <th style={{ textAlign: "right" }}>P. Unit</th>
              <th style={{ textAlign: "right" }}>Importe</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {conceptos.map((c, i) => (
              <tr key={i}>
                <td>{c.descripcion}</td>
                <td>
                  <input className="input" type="number" step="0.01" value={c.cantidad}
                    style={{ width: 100, textAlign: "right" }}
                    onChange={(e) => setC(i, { cantidad: +e.target.value })} />
                </td>
                <td>
                  <input className="input" type="number" step="0.01" value={c.precio_unitario}
                    style={{ width: 120, textAlign: "right" }}
                    onChange={(e) => setC(i, { precio_unitario: +e.target.value })} />
                </td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>
                  {fmt(c.cantidad * c.precio_unitario)}
                </td>
                <td><button className="btn-icon" onClick={() => quitar(i)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <div style={{ minWidth: 260 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>Subtotal<span>{fmt(subtotal)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>IVA 16%<span>{fmt(iva)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, fontWeight: 700,
              borderTop: "2px solid var(--color-border)", paddingTop: 6, marginTop: 4 }}>
              <span>Total</span><span>{fmt(total)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-header">Tipo de documento a generar</h3>
        <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div>
            <label>Generar como</label>
            <select className="input" value={tipoDestino} onChange={(e) => setTipoDestino(e.target.value as any)}>
              <option value="TICKET">Ticket (sin CFDI)</option>
              <option value="FACTURA">Factura CFDI</option>
            </select>
          </div>
          {tipoDestino === "FACTURA" && (
            <>
              <div>
                <label>Método de pago</label>
                <select className="input" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value as any)}>
                  <option value="PUE">PUE (al contado)</option>
                  <option value="PPD">PPD (a crédito)</option>
                </select>
              </div>
              <div>
                <label>Uso CFDI</label>
                <select className="input" value={usoCfdi} onChange={(e) => setUsoCfdi(e.target.value)}>
                  <option value="G01">G01 - Adquisición</option>
                  <option value="G03">G03 - Gastos en general</option>
                  <option value="P01">P01 - Por definir</option>
                  <option value="S01">S01 - Sin efectos fiscales</option>
                </select>
              </div>
              {metodoPago === "PUE" && (
                <div>
                  <label>Forma de pago</label>
                  <select className="input" value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
                    <option value="01">Efectivo</option>
                    <option value="03">Transferencia</option>
                    <option value="04">Tarjeta crédito</option>
                    <option value="28">Tarjeta débito</option>
                  </select>
                </div>
              )}
              <div className="form-grid-full" style={{ background: "#dcfce7", padding: 12, borderRadius: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={timbrar} onChange={(e) => setTimbrar(e.target.checked)} />
                  <strong>Timbrar CFDI ahora</strong>
                </label>
              </div>
            </>
          )}
          <div className="form-grid-full">
            <label>Notas (opcional)</label>
            <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button className="btn" disabled={busy} onClick={guardar} style={{ flex: 1, justifyContent: "center" }}>
            {busy ? "Procesando..." : `Generar ${tipoDestino}`}
          </button>
          <button className="btn-icon" onClick={() => nav("/ventas")}>Cancelar</button>
        </div>
      </div>
    </Layout>
  );
}
