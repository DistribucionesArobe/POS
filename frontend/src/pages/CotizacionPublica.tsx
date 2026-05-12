import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicApi } from "../api/public";

const fmt = (n: number) =>
  "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Cot = {
  folio: string;
  fecha: string;
  vigencia_hasta: string | null;
  emisor: { nombre: string; razon_social: string; rfc: string };
  cliente: string;
  conceptos: { descripcion: string; cantidad: number; precio_unitario: number; importe: number; unidad?: string }[];
  subtotal: number;
  iva: number;
  total: number;
  estatus: string;
  notas: string | null;
};

export default function CotizacionPublica() {
  const { folio } = useParams<{ folio: string }>();
  const [cot, setCot] = useState<Cot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!folio) return;
    publicApi.get(`/api/cotizaciones/publica/${folio}`)
      .then((r) => setCot(r.data))
      .catch((e) => setErr(e.response?.data?.detail || "Cotización no encontrada"));
  }, [folio]);

  const pdfUrl = (publicApi.defaults.baseURL || "") + `/api/cotizaciones/publica/${folio}/pdf`;

  if (err) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ color: "#dc2626", textAlign: "center" }}>Cotización no encontrada</h1>
          <p style={{ textAlign: "center", color: "#6b7280" }}>{err}</p>
        </div>
      </div>
    );
  }
  if (!cot) return <div style={pageStyle}><p>Cargando...</p></div>;

  const vencida = cot.vigencia_hasta && new Date(cot.vigencia_hasta) < new Date();

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 28, letterSpacing: "0.05em" }}>
            {cot.emisor.nombre.toUpperCase()}
          </h1>
          <p style={{ margin: "4px 0", color: "#6b7280", fontSize: 13 }}>
            {cot.emisor.razon_social} · RFC {cot.emisor.rfc}
          </p>
          <h2 style={{ margin: "20px 0 4px", fontSize: 22, color: "#1f2937" }}>
            Cotización {cot.folio}
          </h2>
          <p style={{ margin: 0, color: vencida ? "#dc2626" : "#16a34a", fontSize: 13, fontWeight: 600 }}>
            {vencida ? "VENCIDA" : `Vigente hasta ${new Date(cot.vigencia_hasta!).toLocaleDateString("es-MX")}`}
          </p>
        </div>

        <div style={{ background: "#f9fafb", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          <div><strong>Cliente:</strong> {cot.cliente}</div>
          <div><strong>Fecha:</strong> {new Date(cot.fecha).toLocaleDateString("es-MX")}</div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#1f2937", color: "white" }}>
              <th style={th}>Cant.</th>
              <th style={th}>Descripción</th>
              <th style={{ ...th, textAlign: "right" }}>P. Unit</th>
              <th style={{ ...th, textAlign: "right" }}>Importe</th>
            </tr>
          </thead>
          <tbody>
            {cot.conceptos.map((c, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={td}>{c.cantidad}</td>
                <td style={td}>{c.descripcion}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmt(c.precio_unitario)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{fmt(c.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <div style={{ minWidth: 240 }}>
            <div style={total}><span>Subtotal</span><span>{fmt(cot.subtotal)}</span></div>
            <div style={total}><span>IVA 16%</span><span>{fmt(cot.iva)}</span></div>
            <div style={{ ...total, fontSize: 22, fontWeight: 800, borderTop: "2px solid #1f2937", paddingTop: 8, marginTop: 4 }}>
              <span>TOTAL</span><span>{fmt(cot.total)}</span>
            </div>
          </div>
        </div>

        {cot.notas && (
          <div style={{ marginTop: 16, padding: 12, background: "#fef3c7", borderRadius: 8, fontSize: 13 }}>
            <strong>Notas:</strong> {cot.notas}
          </div>
        )}

        <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href={pdfUrl} target="_blank" rel="noopener" style={btn}>📄 Descargar PDF</a>
          <a href="https://wa.me/528348528236?text=Hola%2C%20tengo%20dudas%20sobre%20mi%20cotizaci%C3%B3n"
             target="_blank" rel="noopener" style={{ ...btn, background: "#16a34a" }}>
            💬 Contactar por WhatsApp
          </a>
        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", marginTop: 24 }}>
          Esta cotización no es factura. Precios sujetos a confirmación al momento de la compra.
        </p>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh", background: "#f3f4f6",
  display: "flex", alignItems: "flex-start", justifyContent: "center",
  padding: "32px 16px",
};
const cardStyle: React.CSSProperties = {
  background: "white", maxWidth: 720, width: "100%",
  borderRadius: 12, padding: 28, boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
};
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: 13 };
const td: React.CSSProperties = { padding: "10px 12px" };
const total: React.CSSProperties = {
  display: "flex", justifyContent: "space-between",
  fontSize: 15, padding: "4px 0",
};
const btn: React.CSSProperties = {
  display: "inline-block", padding: "12px 24px",
  background: "#2563eb", color: "white", textDecoration: "none",
  borderRadius: 8, fontWeight: 600, fontSize: 15,
};
