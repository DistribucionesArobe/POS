import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api/client";

type Item = {
  variante_id: number; producto_id: number;
  nombre: string; sku: string; presentacion: string;
  unidad: string; stock_sistema: number; costo_unit: number;
};
type Grupo = { categoria: string; items: Item[] };
type Plantilla = { categorias: string[]; grupos: Grupo[]; total_items: number };
type Categoria = { categoria: string; n_productos: number };

const fmt = (n: number) => n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtMoney = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ConteoInventario() {
  const [cats, setCats] = useState<Categoria[]>([]);
  const [plantilla, setPlantilla] = useState<Plantilla | null>(null);
  const [categoria, setCategoria] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [soloConStock, setSoloConStock] = useState(false);
  const [contados, setContados] = useState<Record<number, string>>({});
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargarCats() {
    const r = await api.get("/api/conteo-inventario/categorias");
    setCats(r.data);
  }
  async function cargarPlantilla() {
    const r = await api.get("/api/conteo-inventario/plantilla", {
      params: {
        categoria: categoria || undefined,
        busqueda: busqueda || undefined,
        solo_con_stock: soloConStock,
      },
    });
    setPlantilla(r.data);
    setContados({});
  }
  useEffect(() => { cargarCats(); }, []);
  useEffect(() => { cargarPlantilla(); }, [categoria, soloConStock]);

  const itemsConCambio = useMemo(() => {
    if (!plantilla) return [];
    const all: (Item & { contado: number; diferencia: number; valorDif: number })[] = [];
    for (const g of plantilla.grupos) {
      for (const it of g.items) {
        const v = contados[it.variante_id];
        if (v === undefined || v === "") continue;
        const contado = parseFloat(v);
        if (isNaN(contado)) continue;
        const dif = contado - it.stock_sistema;
        all.push({ ...it, contado, diferencia: dif, valorDif: dif * it.costo_unit });
      }
    }
    return all;
  }, [contados, plantilla]);

  const stats = useMemo(() => {
    const conDif = itemsConCambio.filter(i => Math.abs(i.diferencia) > 0.0001);
    const valor = conDif.reduce((s, i) => s + i.valorDif, 0);
    return { total: itemsConCambio.length, conDif: conDif.length, valor };
  }, [itemsConCambio]);

  async function guardar() {
    if (itemsConCambio.length === 0) {
      setError("No capturaste ningún producto");
      return;
    }
    if (!confirm(
      `Vas a aplicar el ajuste a inventario:\n\n` +
      `• ${stats.total} productos contados\n` +
      `• ${stats.conDif} con diferencia\n` +
      `• Valor ajuste: ${fmtMoney(stats.valor)}\n\n` +
      `¿Confirmas?`
    )) return;

    setGuardando(true); setError(null);
    try {
      const r = await api.post("/api/conteo-inventario/registrar", {
        categoria_filtro: categoria || null,
        busqueda_filtro: busqueda || null,
        notas: notas || null,
        aplicar_ajustes: true,
        items: itemsConCambio.map(i => ({
          variante_id: i.variante_id,
          stock_contado: i.contado,
        })),
      });
      setMsg(`Conteo #${r.data.conteo_id} aplicado. ${r.data.con_diferencia} ajustes.`);
      setContados({});
      cargarPlantilla();
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally { setGuardando(false); }
  }

  function imprimirHoja() {
    if (!plantilla) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    const cajero = localStorage.getItem("nombre") || "";
    const fecha = new Date().toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });
    let html = `<!DOCTYPE html><html><head><title>Hoja de conteo</title><style>
      body { font-family: 'Helvetica', sans-serif; font-size: 11px; padding: 20px; color: #000; }
      h1 { font-size: 16px; margin: 0; }
      h2 { font-size: 13px; margin: 18px 0 4px; background: #000; color: #fff; padding: 4px 8px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
      th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; }
      th { background: #e8e8e8; font-size: 10px; text-transform: uppercase; }
      td.stock, td.contado { text-align: right; font-variant-numeric: tabular-nums; }
      td.contado { height: 22px; }
      .meta { font-size: 11px; margin: 4px 0; color: #333; }
      .firmas { margin-top: 30px; font-size: 11px; display: flex; gap: 60px; justify-content: center; }
      .firma { text-align: center; }
      .firma .linea { border-top: 1px solid #000; width: 220px; margin-bottom: 4px; }
      @media print { @page { size: letter; margin: 15mm; } }
    </style></head><body>
    <h1>HOJA DE CONTEO DE INVENTARIO</h1>
    <div class="meta">Fecha: ${fecha} · Cajero/contador: ${cajero}${categoria ? ` · Categoría: ${categoria}` : ""}</div>`;

    for (const g of plantilla.grupos) {
      if (g.items.length === 0) continue;
      html += `<h2>${g.categoria} (${g.items.length})</h2>`;
      html += `<table><thead><tr>
        <th style="width:50%">Producto</th>
        <th style="width:15%">SKU</th>
        <th style="width:12%; text-align:right">Stock sistema</th>
        <th style="width:15%; text-align:right">Contado físico</th>
        <th style="width:8%">Dif.</th>
      </tr></thead><tbody>`;
      for (const it of g.items) {
        html += `<tr>
          <td>${it.nombre}${it.presentacion && it.presentacion !== "Unico" ? " · " + it.presentacion : ""}</td>
          <td>${it.sku}</td>
          <td class="stock">${fmt(it.stock_sistema)} ${it.unidad || ""}</td>
          <td class="contado"></td>
          <td></td>
        </tr>`;
      }
      html += `</tbody></table>`;
    }

    html += `<div class="firmas">
      <div class="firma"><div class="linea"></div>Firma contador</div>
      <div class="firma"><div class="linea"></div>Firma supervisor</div>
    </div></body></html>`;

    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  return (
    <Layout title="Conteo de Inventario" subtitle="Captura digital o impresión de hojas para contar en bodega"
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={imprimirHoja}
            style={{ background: "#1e40af", color: "white", border: 0,
              padding: "10px 18px", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            🖨️ Imprimir hoja
          </button>
          {itemsConCambio.length > 0 && (
            <button onClick={guardar} disabled={guardando}
              style={{ background: guardando ? "#94a3b8" : "#059669", color: "white", border: 0,
                padding: "10px 18px", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              ✓ Aplicar ajustes ({itemsConCambio.length})
            </button>
          )}
        </div>
      }>

      {msg && <div style={{ background: "#dcfce7", color: "#065f46", padding: 10, borderRadius: 6, marginBottom: 12 }}>{msg}</div>}
      {error && <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 6, marginBottom: 12 }}>{error}</div>}

      {/* Filtros */}
      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Categoría</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}
              style={{ display: "block", padding: 8, border: "1px solid #cbd5e1", borderRadius: 4, minWidth: 180 }}>
              <option value="">Todas ({cats.reduce((s, c) => s + c.n_productos, 0)})</option>
              {cats.map(c => (
                <option key={c.categoria} value={c.categoria}>
                  {c.categoria} ({c.n_productos})
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Buscar</label>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && cargarPlantilla()}
              placeholder="Nombre o SKU..."
              style={{ display: "block", width: "100%", padding: 8, border: "1px solid #cbd5e1", borderRadius: 4 }} />
          </div>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, marginTop: 16 }}>
            <input type="checkbox" checked={soloConStock} onChange={(e) => setSoloConStock(e.target.checked)} />
            Solo con stock {">"} 0
          </label>
          <button onClick={cargarPlantilla}
            style={{ background: "#0f172a", color: "white", border: 0,
              padding: "8px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer", marginTop: 16 }}>
            Buscar
          </button>
        </div>
      </div>

      {/* Resumen vivo */}
      {itemsConCambio.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
          <MiniCard label="Capturados" valor={stats.total.toString()} />
          <MiniCard label="Con diferencia" valor={stats.conDif.toString()} color={stats.conDif > 0 ? "#dc2626" : "#059669"} />
          <MiniCard label="Valor ajuste" valor={fmtMoney(stats.valor)} color={stats.valor < 0 ? "#dc2626" : "#059669"} />
        </div>
      )}

      {/* Tabla agrupada por categoria */}
      {plantilla?.grupos.map(g => (
        <div key={g.categoria} className="card" style={{ padding: 0, marginBottom: 12, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", background: "#0f172a", color: "white", fontSize: 14, fontWeight: 700 }}>
            {g.categoria} ({g.items.length})
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                <th style={th}>Producto</th>
                <th style={{ ...th, width: 110 }}>SKU</th>
                <th style={{ ...th, textAlign: "right", width: 110 }}>Sistema</th>
                <th style={{ ...th, textAlign: "right", width: 130 }}>Contado</th>
                <th style={{ ...th, textAlign: "right", width: 100 }}>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {g.items.map(it => {
                const v = contados[it.variante_id];
                const contado = v === undefined || v === "" ? null : parseFloat(v);
                const dif = contado !== null && !isNaN(contado) ? contado - it.stock_sistema : null;
                return (
                  <tr key={it.variante_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ ...td, fontWeight: 600 }}>
                      {it.nombre}
                      {it.presentacion && it.presentacion !== "Unico" && (
                        <span style={{ color: "#64748b", fontSize: 11 }}> · {it.presentacion}</span>
                      )}
                    </td>
                    <td style={{ ...td, fontSize: 11, color: "#64748b" }}>{it.sku}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {fmt(it.stock_sistema)} <span style={{ color: "#94a3b8", fontSize: 11 }}>{it.unidad}</span>
                    </td>
                    <td style={td}>
                      <input type="number" value={v ?? ""} inputMode="decimal"
                        onChange={(e) => setContados({ ...contados, [it.variante_id]: e.target.value })}
                        placeholder="—"
                        style={{ width: "100%", padding: "6px 8px", textAlign: "right",
                          border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 14,
                          fontVariantNumeric: "tabular-nums",
                          background: contado !== null ? "#f0fdf4" : "white" }} />
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums",
                      fontWeight: 700,
                      color: dif === null ? "#94a3b8" : Math.abs(dif) < 0.0001 ? "#059669" : dif > 0 ? "#1e40af" : "#dc2626" }}>
                      {dif === null ? "—" : (dif > 0 ? "+" : "") + fmt(dif)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {plantilla && plantilla.total_items === 0 && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
          Sin productos con los filtros actuales
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Notas del conteo (opcional)</label>
        <input value={notas} onChange={(e) => setNotas(e.target.value)}
          placeholder="Ej: conteo del lunes 7 de octubre, bodega principal"
          style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 4, marginTop: 4 }} />
      </div>
    </Layout>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: 0.5, textAlign: "left" };
const td: React.CSSProperties = { padding: "8px 12px", fontSize: 13 };

function MiniCard({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div style={{ background: "white", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: color || "#0f172a", fontVariantNumeric: "tabular-nums" }}>{valor}</div>
    </div>
  );
}
