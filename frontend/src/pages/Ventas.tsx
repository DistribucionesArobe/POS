import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type VentaT = {
  id: number; folio: string; tipo: string; estatus: string;
  cliente_id: number; fecha: string; total: number;
  cfdi?: { uuid: string; serie: string; folio: string; cancelado: boolean } | null;
};

const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Ventas() {
  const [ventas, setVentas] = useState<VentaT[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [busy, setBusy] = useState<number | null>(null);

  async function cargar() {
    const r = await api.get("/api/ventas", {
      params: { tipo: filtroTipo || undefined, limit: 100 },
    });
    const ventas: VentaT[] = r.data;
    // Para FACTURAs, intentar obtener su CFDI
    await Promise.all(
      ventas
        .filter((v) => v.tipo === "FACTURA")
        .map(async (v) => {
          try {
            const cf = await api.get(`/api/cfdi/documento/${v.id}`);
            v.cfdi = cf.data;
          } catch {
            v.cfdi = null;
          }
        })
    );
    setVentas(ventas);
  }

  useEffect(() => { cargar(); }, [filtroTipo]);

  async function timbrar(documento_id: number) {
    if (!confirm("Timbrar esta factura ahora? Se emitira un CFDI real.")) return;
    setBusy(documento_id);
    try {
      const r = await api.post(`/api/cfdi/timbrar/${documento_id}`);
      alert(`Timbrado OK\nUUID: ${r.data.uuid}\nFolio fiscal: ${r.data.serie}-${r.data.folio}`);
      cargar();
    } catch (err: any) {
      alert("Error al timbrar: " + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(null);
    }
  }

  function descargarPdfInterno(id: number, folio: string) {
    const base = api.defaults.baseURL || "";
    window.open(`${base}/api/ventas/${id}/pdf`, "_blank");
  }

  async function descargarCfdi(cfdi_id: number, tipo: "xml" | "pdf") {
    const base = api.defaults.baseURL || "";
    // Use blob with auth header (window.open no manda Authorization)
    try {
      const r = await api.get(`/api/cfdi/${cfdi_id}/${tipo}`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      window.open(url, "_blank");
    } catch (err: any) {
      alert("Error al descargar: " + (err.response?.data?.detail || err.message));
    }
  }

  return (
    <Layout title="Ventas" subtitle={`${ventas.length} documentos`}>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <select className="input" style={{ maxWidth: 240 }} value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            <option value="TICKET">Tickets</option>
            <option value="REMISION">Remisiones</option>
            <option value="FACTURA">Facturas</option>
            <option value="NOTA_CREDITO">Notas de credito</option>
          </select>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Folio</th><th>Tipo</th><th>Estatus</th>
              <th>Cliente</th><th>Fecha</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th>CFDI</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((v) => {
              const tipoBadge = {
                TICKET: "badge-info",
                REMISION: "badge-warning",
                FACTURA: "badge-success",
                NOTA_CREDITO: "badge-danger",
              }[v.tipo] || "";
              const isFactura = v.tipo === "FACTURA";
              const timbrada = isFactura && v.cfdi && !v.cfdi.cancelado;
              return (
                <tr key={v.id}>
                  <td><code>{v.folio}</code></td>
                  <td><span className={`badge ${tipoBadge}`}>{v.tipo}</span></td>
                  <td>{v.estatus}</td>
                  <td>#{v.cliente_id}</td>
                  <td>{new Date(v.fecha).toLocaleDateString("es-MX")}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(v.total)}</td>
                  <td>
                    {!isFactura ? <span style={{ color: "var(--color-text-muted)" }}>—</span> :
                      timbrada ? (
                        <span className="badge badge-success" title={v.cfdi!.uuid}>
                          {v.cfdi!.uuid.slice(0, 8)}…
                        </span>
                      ) : v.cfdi?.cancelado ? (
                        <span className="badge badge-danger">cancelado</span>
                      ) : (
                        <span className="badge badge-warning">sin timbrar</span>
                      )
                    }
                  </td>
                  <td style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <button className="btn-icon" onClick={() => descargarPdfInterno(v.id, v.folio)}>
                      PDF
                    </button>
                    {isFactura && !timbrada && !v.cfdi?.cancelado && (
                      <button
                        className="btn btn-sm"
                        disabled={busy === v.id}
                        onClick={() => timbrar(v.id)}
                      >
                        {busy === v.id ? "..." : "Timbrar"}
                      </button>
                    )}
                    {timbrada && v.cfdi && (
                      <>
                        <button className="btn-icon" onClick={() => descargarCfdi((v.cfdi as any).cfdi_id ?? v.id, "xml")}>
                          XML
                        </button>
                        <button className="btn-icon" onClick={() => descargarCfdi((v.cfdi as any).cfdi_id ?? v.id, "pdf")}>
                          PDF SAT
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
