import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import ClientePicker from "../components/ClientePicker";
import type { ClienteSel } from "../components/ClientePicker";

type Item = {
  variante_id: number;
  sku: string;
  nombre: string;
  precio: number;
  cantidad: number;
  stock: number;
  unidad?: string;
  tasa_iva?: number;  // 0 = exento, 0.16 = general (default)
};

const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FORMAS_PAGO_SAT = [
  { v: "01", t: "Efectivo" },
  { v: "03", t: "Transferencia" },
  { v: "04", t: "Tarjeta crédito" },
  { v: "28", t: "Tarjeta débito" },
];

type PagoRow = { forma_pago_sat: string; monto: number };

export default function Caja() {
  const nav = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<any[]>([]);
  const [showCobrar, setShowCobrar] = useState(false);
  // Tipo seleccionado en el dropdown. FACTURA_PUE vs FACTURA_PPD se diferencian
  // por el metodo de pago SAT que se mandara al timbrar.
  const [tipoSel, setTipoSel] = useState<"TICKET" | "REMISION" | "FACTURA_PUE" | "FACTURA_PPD">("TICKET");
  const tipo: "TICKET" | "REMISION" | "FACTURA" =
    tipoSel === "TICKET" ? "TICKET" :
    tipoSel === "REMISION" ? "REMISION" : "FACTURA";
  const esCredito = tipoSel === "REMISION" || tipoSel === "FACTURA_PPD";
  const metodoPagoSat = esCredito ? "PPD" : "PUE";
  const [cliente, setCliente] = useState<ClienteSel>({ id: 1, nombre: "Publico en General" });
  const [showClientePicker, setShowClientePicker] = useState(false);
  const [pagos, setPagos] = useState<PagoRow[]>([{ forma_pago_sat: "01", monto: 0 }]);
  const [procesando, setProcesando] = useState(false);
  const [empresaActiva, setEmpresaActiva] = useState<{
    id: number; nombre: string;
    razon_social?: string; rfc?: string;
    regimen_fiscal?: string; codigo_postal?: string;
  } | null>(null);
  const [favoritos, setFavoritos] = useState<any[]>([]);
  const [showImportar, setShowImportar] = useState(false);
  // Monedero del cliente activo
  const [puntosCliente, setPuntosCliente] = useState<number>(0);
  const [minCanje, setMinCanje] = useState<number>(200);
  const [puntosACanjear, setPuntosACanjear] = useState<number>(0);
  // Retencion IVA (caso CFE / gobierno comprando a PF)
  const [retenerIva, setRetenerIva] = useState<boolean>(false);
  // Datos CFDI seleccionados al cobrar (pre-llenados desde defaults del cliente)
  const [usoCfdiSel, setUsoCfdiSel] = useState<string>("G03");
  const [condicionesPagoSel, setCondicionesPagoSel] = useState<string>("");
  // Vista previa de la factura antes de timbrar
  const [mostrarPrevia, setMostrarPrevia] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recibidoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const ea = localStorage.getItem("empresa_activa");
      if (ea) setEmpresaActiva(JSON.parse(ea));
    } catch {}
    cargarFavoritos();
    cargarEmpresaActiva();
    focus();
  }, []);

  async function cargarEmpresaActiva() {
    try {
      const r = await api.get("/api/empresas/activa");
      setEmpresaActiva(r.data);
    } catch {
      // si falla queda con lo del localStorage
    }
  }

  async function cargarFavoritos() {
    try {
      const r = await api.get("/api/productos/favoritos-caja");
      setFavoritos(r.data || []);
    } catch {
      setFavoritos([]);
    }
  }

  async function cargarSaldoMonedero(clienteId: number) {
    // Solo si no es Publico en General (id=1)
    if (!clienteId || clienteId === 1) {
      setPuntosCliente(0);
      setPuntosACanjear(0);
      return;
    }
    try {
      const r = await api.get(`/api/monedero/saldo/${clienteId}`);
      setPuntosCliente(r.data?.saldo || 0);
      setMinCanje(r.data?.min_canje || 200);
    } catch {
      // Si la empresa no tiene monedero activo o el endpoint falla, dejamos saldo en 0
      setPuntosCliente(0);
    }
    setPuntosACanjear(0);
  }

  // Refresca saldo cada vez que cambia el cliente
  useEffect(() => {
    cargarSaldoMonedero(cliente.id);
    // Pre-cargar defaults CFDI del cliente
    setUsoCfdiSel(cliente.uso_cfdi_default || "G03");
    setCondicionesPagoSel(cliente.condiciones_pago || "");
    // Pre-cargar forma de pago default si el primer pago aún está en 0
    if (cliente.forma_pago_default) {
      setPagos((prev) => prev.map((p, i) => i === 0 && (!p.monto || p.monto === 0)
        ? { ...p, forma_pago_sat: cliente.forma_pago_default! }
        : p));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.id]);

  function focus() {
    setTimeout(() => inputRef.current?.focus(), 80);
  }

  const subtotal = items.reduce((a, i) => a + i.cantidad * i.precio, 0);
  // Calculo de IVA respetando la tasa por linea (0% para exentos, 16% para el resto)
  const iva = items.reduce((a, i) => {
    const t = i.tasa_iva !== undefined ? i.tasa_iva : 0.16;
    return a + i.cantidad * i.precio * t;
  }, 0);
  // Base gravada = subtotal de items que SI causan IVA (usado para retencion)
  const baseGravada = items.reduce((a, i) => {
    const t = i.tasa_iva !== undefined ? i.tasa_iva : 0.16;
    return a + (t > 0 ? i.cantidad * i.precio : 0);
  }, 0);
  // Retencion solo aplica a FACTURA con cliente con RFC y cuando el toggle esta activo
  const retencionAplica = retenerIva && tipo === "FACTURA" && !!cliente.rfc;
  const ivaRetenido = retencionAplica ? +(baseGravada * 0.16).toFixed(2) : 0;
  const total = +(subtotal + iva - ivaRetenido).toFixed(2);

  async function buscarOAgregar() {
    const q = busqueda.trim();
    if (!q) return;
    try {
      // Match exacto por SKU (lo mas comun con barcode scanner)
      const r = await api.get(`/api/productos/sku/${encodeURIComponent(q)}`);
      agregar(r.data);
    } catch {
      // Fallback: busqueda por texto
      try {
        const r = await api.get("/api/productos/buscar-variante", { params: { q } });
        if (r.data.length === 1) {
          agregar(r.data[0]);
        } else if (r.data.length === 0) {
          alert(`No se encontro "${q}"`);
          setBusqueda(""); focus();
        } else {
          setSugerencias(r.data);
        }
      } catch (err: any) {
        alert("Error: " + (err.response?.data?.detail || err.message));
      }
    }
  }

  function agregar(s: any) {
    const idx = items.findIndex((i) => i.variante_id === s.id);
    if (idx >= 0) {
      const c = [...items];
      c[idx].cantidad += 1;
      setItems(c);
    } else {
      setItems([...items, {
        variante_id: s.id, sku: s.sku, nombre: s.nombre,
        precio: s.precio, cantidad: 1, stock: s.stock,
        unidad: s.unidad,
        tasa_iva: s.tasa_iva !== undefined ? s.tasa_iva : 0.16,
      }]);
    }
    setBusqueda("");
    setSugerencias([]);
    focus();
  }

  function eliminar(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
    focus();
  }

  async function salirDeCaja() {
    if (items.length === 0) { nav("/"); return; }
    const opcion = window.confirm(
      `Tienes ${items.length} producto(s) en el carrito.\n\n` +
      "OK = Guardar como COTIZACIÓN antes de salir (puedes seguirla después)\n" +
      "Cancelar = Salir sin guardar (perderás el carrito)"
    );
    if (opcion === false) {
      // Cancelar = salir sin guardar
      if (!window.confirm("¿Seguro que quieres salir sin guardar? Se perderán los items.")) return;
      nav("/");
      return;
    }
    // Guardar como cotizacion
    try {
      const payload = {
        cliente_id: cliente.id === 1 ? null : cliente.id, // 1 = Publico en General
        nombre_libre: cliente.id === 1 ? null : cliente.nombre,
        vigencia_dias: 15,
        conceptos: items.map((i) => ({
          variante_id: i.variante_id,
          cantidad: i.cantidad,
          precio_unitario: i.precio,
        })),
        notas: "Guardada desde Caja al salir",
      };
      const r = await api.post("/api/cotizaciones", payload);
      alert(`Cotización guardada con folio ${r.data.folio}\nLa encuentras en el módulo Cotizaciones.`);
      nav("/cotizaciones");
    } catch (err: any) {
      alert("Error al guardar cotización: " + (err.response?.data?.detail || err.message));
    }
  }

  function cambiarCantidad(idx: number, nueva: number) {
    if (nueva <= 0) return eliminar(idx);
    const c = [...items];
    c[idx].cantidad = nueva;
    setItems(c);
  }

  function cambiarPrecio(idx: number, nuevo: number) {
    if (isNaN(nuevo) || nuevo < 0) return;
    const c = [...items];
    c[idx].precio = nuevo;
    setItems(c);
  }

  function imprimirCotizacion() {
    if (items.length === 0) {
      alert("Agrega items al carrito antes de generar la cotización.");
      return;
    }
    const ventana = window.open("", "_blank");
    if (!ventana) return;
    const html = construirHtmlCotizacion({
      emisor: {
        nombre: empresaActiva?.nombre || "Mi empresa",
        razon_social: empresaActiva?.razon_social || "",
        rfc: empresaActiva?.rfc || "",
        regimen: empresaActiva?.regimen_fiscal || "",
        cp: empresaActiva?.codigo_postal || "",
      },
      cliente,
      items,
      subtotal,
      iva,
      total,
    });
    ventana.document.write(html);
    ventana.document.close();
  }

  function abrirCobrar() {
    if (items.length === 0) return;
    setPagos([{ forma_pago_sat: tipoSel === "FACTURA_PUE" ? "03" : "01", monto: total }]);
    setShowCobrar(true);
    setTimeout(() => recibidoRef.current?.select(), 100);
  }

  const sumaPagos = +pagos.reduce((a, p) => a + (p.monto || 0), 0).toFixed(2);
  // Canje valido solo si >= minCanje y aplica al tipo
  const canjeValido = puntosACanjear >= minCanje
    && (tipoSel === "TICKET" || tipoSel === "REMISION")
    && cliente.id !== 1;
  const canjeMonto = canjeValido ? Math.min(puntosACanjear, Math.floor(total)) : 0;
  const totalAPagar = +(total - canjeMonto).toFixed(2);
  const faltante = +(totalAPagar - sumaPagos).toFixed(2);
  const usaSplit = pagos.length > 1;

  function setPago(idx: number, patch: Partial<PagoRow>) {
    setPagos(pagos.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function agregarPago() {
    if (pagos.length >= 2) return;
    setPagos([...pagos, { forma_pago_sat: "03", monto: Math.max(0, faltante) }]);
  }
  function quitarPago(idx: number) {
    const nuevos = pagos.filter((_, i) => i !== idx);
    if (nuevos.length === 1) nuevos[0].monto = total;
    setPagos(nuevos.length ? nuevos : [{ forma_pago_sat: "01", monto: total }]);
  }

  async function cobrar(confirmadoDesdePrevia: boolean = false) {
    if (procesando) return;
    // Si es FACTURA y no se ha confirmado la vista previa, mostrarla en vez de timbrar
    if (tipo === "FACTURA" && !confirmadoDesdePrevia) {
      // Pre-validaciones rápidas antes de mostrar la previa
      if (!cliente.rfc) {
        alert("Para facturar el cliente necesita RFC. Click 'cambiar' en el campo Cliente.");
        return;
      }
      if (!esCredito && sumaPagos < totalAPagar - 0.01) {
        alert(`Faltan ${fmt(totalAPagar - sumaPagos)} por cubrir`);
        return;
      }
      setMostrarPrevia(true);
      return;
    }
    // Validar pagos solo si se cobra al contado (PUE).
    // REMISION y FACTURA PPD son a credito, se cobraran despues desde Cartera.
    if (!esCredito) {
      if (sumaPagos < totalAPagar - 0.01) {
        alert(`Faltan ${fmt(totalAPagar - sumaPagos)} por cubrir`);
        return;
      }
      if (pagos.some((p) => p.monto <= 0) && totalAPagar > 0) {
        alert("Cada método de pago debe ser mayor a $0");
        return;
      }
    }
    if (tipo === "FACTURA" && !cliente.rfc) {
      alert("Para facturar el cliente necesita RFC. Click 'cambiar' en el campo Cliente.");
      return;
    }
    // Validacion adicional canje
    if (canjeMonto > 0) {
      if (canjeMonto > puntosCliente) {
        alert(`Saldo insuficiente. Solo tienes ${puntosCliente} puntos.`);
        return;
      }
      if (puntosACanjear > 0 && puntosACanjear < minCanje) {
        alert(`Mínimo de canje: ${minCanje} puntos.`);
        return;
      }
    }
    setProcesando(true);
    const payload: any = {
      tipo, cliente_id: cliente.id,
      // En PPD el SAT exige forma "99" Por definir
      forma_pago_sat: esCredito ? "99" : (pagos[0]?.forma_pago_sat || "01"),
      metodo_pago_sat: metodoPagoSat,
      conceptos: items.map((i) => ({
        variante_id: i.variante_id, cantidad: i.cantidad, precio_unitario: i.precio,
        unidad: i.unidad || undefined,
      })),
      iva_retenido_pct: retencionAplica ? 0.16 : 0,
      uso_cfdi: tipo === "FACTURA" ? usoCfdiSel : undefined,
      notas: condicionesPagoSel ? `Condiciones de pago: ${condicionesPagoSel}` : undefined,
    };
    if (!esCredito) {
      const pagosFinales = pagos
        .filter((p) => p.monto > 0)
        .map((p) => ({ forma_pago_sat: p.forma_pago_sat, monto: +p.monto }));
      // Si hay canje, agregamos un pago tipo Monedero (05) que cubre la parte del canje
      if (canjeMonto > 0) {
        pagosFinales.push({ forma_pago_sat: "05", monto: canjeMonto });
      }
      payload.pagos = pagosFinales;
    }
    try {
      const r = await api.post("/api/ventas", payload);
      const ventaId = r.data.id;

      // Registrar canje de monedero si aplica (solo TICKET/REMISION)
      if (canjeMonto > 0) {
        try {
          await api.post("/api/monedero/canje", {
            cliente_id: cliente.id,
            puntos: canjeMonto,
            documento_venta_id: ventaId,
          });
        } catch (err: any) {
          // No bloquea la venta - solo loggea
          console.error("Error registrando canje:", err);
        }
      }

      // Si es FACTURA, timbrar al toque
      let cfdiOk: any = null;
      let cfdiErr: string | null = null;
      if (tipo === "FACTURA") {
        try {
          const t = await api.post(`/api/cfdi/timbrar/${ventaId}`);
          cfdiOk = t.data;
        } catch (err: any) {
          cfdiErr = err.response?.data?.detail || err.message;
        }
      }

      // Imprimir PDF: descarga blob con auth y abre/imprime
      try {
        const pdfRes = await api.get(`/api/ventas/${ventaId}/pdf`, { responseType: "blob" });
        const pdfUrl = URL.createObjectURL(pdfRes.data);
        const w = window.open(pdfUrl, "_blank");
        if (w) {
          w.onload = () => {
            try { w.print(); } catch {}
          };
        }
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
      } catch {}

      // Cambio si pagó de más
      const cambioLinea = sumaPagos > totalAPagar + 0.01
        ? `\n\n💵 CAMBIO A DAR: ${fmt(sumaPagos - totalAPagar)}`
        : "";

      if (cfdiOk) {
        const corr = cfdiOk.correo_enviado_a ? `\nEnviada a ${cfdiOk.correo_enviado_a}` : "";
        alert(`Factura ${r.data.folio} timbrada.\nUUID: ${cfdiOk.uuid}${corr}${cambioLinea}`);
      } else if (cfdiErr) {
        alert(`Venta ${r.data.folio} creada pero NO se timbró:\n${cfdiErr}\n\nReintenta desde Mis ventas.${cambioLinea}`);
      } else if (cambioLinea) {
        alert(`Ticket ${r.data.folio} cobrado.${cambioLinea}`);
      }

      // Reset
      setItems([]);
      setShowCobrar(false);
      setBusqueda("");
      setSugerencias([]);
      setPagos([{ forma_pago_sat: "01", monto: 0 }]);
      setTipoSel("TICKET");
      setPuntosACanjear(0);
      setRetenerIva(false);
      setMostrarPrevia(false);
      // Refresca saldo del cliente (despues del canje y de la ganancia automatica)
      if (cliente.id !== 1) {
        setTimeout(() => cargarSaldoMonedero(cliente.id), 300);
      }
      focus();
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setProcesando(false);
    }
  }

  // Atajos teclado globales
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showCobrar) {
        if (e.key === "Escape") { e.preventDefault(); setShowCobrar(false); focus(); }
        return;
      }
      if (e.key === "F5") { e.preventDefault(); setTipoSel("TICKET"); abrirCobrar(); }
      if (e.key === "F4") {
        // F4 = cobrar como Remisión (a crédito)
        e.preventDefault();
        if (items.length === 0) return;
        setTipoSel("REMISION");
        // pequeno delay para que el state se aplique antes de abrir modal
        setTimeout(() => abrirCobrar(), 0);
      }
      if (e.key === "F7") {
        e.preventDefault();
        if (items.length === 0) return;
        setTipoSel("FACTURA_PUE");
        setTimeout(() => abrirCobrar(), 0);
      }
      if (e.key === "F8") {
        e.preventDefault();
        if (items.length === 0) return;
        setTipoSel("FACTURA_PPD");
        setTimeout(() => abrirCobrar(), 0);
      }
      if (e.key === "F9") {
        // Limpiar venta actual
        e.preventDefault();
        if (items.length > 0 && confirm("Limpiar venta actual?")) {
          setItems([]); focus();
        }
      }
      if (e.key === "F2") {
        e.preventDefault();
        setShowClientePicker(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [items, showCobrar, cliente.id]);

  function quickAction(tipo: typeof tipoSel) {
    if (items.length === 0) {
      alert("Agrega al menos un producto primero");
      return;
    }
    setTipoSel(tipo);
    setTimeout(() => abrirCobrar(), 0);
  }

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto auto 1fr", height: "100vh", background: "var(--color-bg)" }}>
      {/* Header */}
      <div style={{
        background: "var(--color-sidebar-bg)", color: "white",
        padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-primary)" }}></span>
          <strong style={{ letterSpacing: "0.05em" }}>ACEROMAX · CAJA</strong>
          {empresaActiva && (
            <span style={{ fontSize: 12, color: "#94a3b8", paddingLeft: 12, borderLeft: "1px solid #334155" }}>
              Operando como: <strong style={{ color: "white" }}>{empresaActiva.nombre}</strong>
            </span>
          )}
          <span style={{ fontSize: 12, color: "#94a3b8", paddingLeft: 12, borderLeft: "1px solid #334155" }}>
            Cliente: <button type="button" onClick={() => setShowClientePicker(true)}
              style={{ background: "transparent", border: "1px solid #334155", color: "white",
                padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
              {cliente.nombre}{cliente.rfc ? ` · ${cliente.rfc}` : ""} ✎
            </button> <span style={{ opacity: 0.6 }}>(F2)</span>
          </span>
          {puntosCliente > 0 && (
            <span style={{
              fontSize: 12, padding: "4px 10px", borderRadius: 4,
              background: "#065f46", color: "white", fontWeight: 600,
              marginLeft: 8,
            }} title={`Saldo del monedero · mínimo de canje ${minCanje} pts`}>
              💰 {puntosCliente.toLocaleString("es-MX")} pts · ${puntosCliente.toLocaleString("es-MX")}
            </span>
          )}
        </div>
        <button onClick={() => salirDeCaja()}
          style={{
            background: "transparent", color: "white", border: "1px solid #334155",
            padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13,
          }}>
          Salir de caja
        </button>
      </div>

      {/* Barra de atajos rapidos */}
      <div style={{
        background: "#0f172a", padding: "8px 24px",
        display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
        borderTop: "1px solid #1e293b",
      }}>
        <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 4 }}>
          Cobrar como:
        </span>
        <QuickBtn k="F5" label="🧾 Ticket"     color="#3b82f6" onClick={() => quickAction("TICKET")} />
        <QuickBtn k="F4" label="📋 Remisión"   color="#f59e0b" onClick={() => quickAction("REMISION")} />
        <QuickBtn k="F7" label="🧾 Factura PUE" color="#10b981" onClick={() => quickAction("FACTURA_PUE")} />
        <QuickBtn k="F8" label="📋 Factura PPD" color="#8b5cf6" onClick={() => quickAction("FACTURA_PPD")} />

        <span style={{ flex: 1 }}></span>

        <span style={{ fontSize: 11, color: "#64748b", marginRight: 4 }}>Otros:</span>
        <QuickBtn k="F2" label="Cliente" color="transparent" onClick={() => setShowClientePicker(true)} />
        <QuickBtn k="" label="📎 Importar cotización" color="transparent" onClick={() => setShowImportar(true)} />
        <QuickBtn k="F9" label="🗑 Limpiar" color="transparent"
          onClick={() => { if (items.length > 0 && confirm("Limpiar venta?")) setItems([]); }} />
      </div>

      {/* Main: scanner | cart */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", overflow: "hidden" }}>
        {/* Izquierda */}
        <div style={{ padding: 24, background: "white", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <input
            ref={inputRef}
            value={busqueda}
            placeholder="Escanea código o teclea SKU/nombre y Enter..."
            style={{
              width: "100%", padding: "20px 24px", fontSize: 22, fontWeight: 500,
              border: "3px solid var(--color-primary)", borderRadius: 12,
              outline: "none",
            }}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); buscarOAgregar(); }
            }}
          />

          {sugerencias.length > 0 && (
            <div style={{ marginTop: 16, border: "1px solid var(--color-border)", borderRadius: 8, overflow: "auto", maxHeight: 400 }}>
              {sugerencias.map((s) => (
                <div key={s.id}
                  onClick={() => agregar(s)}
                  style={{
                    padding: 16, cursor: "pointer",
                    borderBottom: "1px solid var(--color-border)",
                    fontSize: 16,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "white")}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <strong style={{ fontFamily: "monospace" }}>{s.sku}</strong>
                      <span style={{ marginLeft: 12 }}>{s.nombre}</span>
                    </div>
                    <div>
                      <span style={{ color: "var(--color-primary)", fontWeight: 700, fontSize: 18 }}>{fmt(s.precio)}</span>
                      <span style={{ marginLeft: 8, fontSize: 12, color: "var(--color-text-muted)" }}>stock {s.stock}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ padding: 8, textAlign: "center", fontSize: 12, color: "var(--color-text-muted)" }}>
                Click para agregar
              </div>
            </div>
          )}

          {/* Panel de favoritos rapidos */}
          {favoritos.length > 0 && sugerencias.length === 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px dashed var(--color-border)" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span>⭐ Favoritos · click para agregar</span>
                <span style={{ marginLeft: "auto", color: "var(--color-text-muted)", fontSize: 10 }}>
                  Marca con ★ en Productos
                </span>
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 8,
                maxHeight: 240,
                overflow: "auto",
              }}>
                {favoritos.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => agregar(f)}
                    title={`${f.sku} · stock ${f.stock}`}
                    style={{
                      background: "white",
                      border: "2px solid var(--color-primary)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      transition: "transform 0.08s, box-shadow 0.08s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 4px 10px rgba(0,0,0,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text)", lineHeight: 1.2 }}>
                      {f.nombre}
                    </span>
                    <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ color: "var(--color-primary)", fontWeight: 700 }}>{fmt(f.precio)}</span>
                      <span style={{ color: "var(--color-text-muted)" }}>stk {f.stock}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Atajos */}
          <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--color-border)", display: "flex", gap: 16, color: "var(--color-text-secondary)", fontSize: 12, flexWrap: "wrap" }}>
            <span><kbd style={kbdStyle}>Enter</kbd> agregar/buscar</span>
            <span><kbd style={kbdStyle}>F2</kbd> cambiar cliente</span>
            <span><kbd style={kbdStyle}>F4</kbd> remisión (crédito)</span>
            <span><kbd style={kbdStyle}>F5</kbd> ticket</span>
            <span><kbd style={kbdStyle}>F7</kbd> factura PUE</span>
            <span><kbd style={kbdStyle}>F8</kbd> factura PPD</span>
            <span><kbd style={kbdStyle}>F9</kbd> limpiar</span>
            <span><kbd style={kbdStyle}>Esc</kbd> cerrar dialog</span>
          </div>
        </div>

        {/* Derecha: cart */}
        <div style={{ background: "var(--color-sidebar-bg)", padding: 16, display: "flex", flexDirection: "column", color: "white" }}>
          <div style={{ flex: 1, overflow: "auto", marginBottom: 12 }}>
            {items.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
                Sin productos.<br/>
                Escanea o busca arriba.
              </div>
            ) : (
              items.map((i, idx) => (
                <div key={idx} style={{
                  background: "var(--color-sidebar-active)", padding: 12, marginBottom: 8, borderRadius: 8,
                  display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center",
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.nombre}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace", display: "flex", gap: 6, alignItems: "center" }}>
                      <span>{i.sku} ·</span>
                      <span style={{ color: "#94a3b8" }}>$</span>
                      <input type="number" min="0" step="0.01" value={i.precio}
                        onChange={(e) => cambiarPrecio(idx, +e.target.value)}
                        onFocus={(e) => e.target.select()}
                        title="Click para modificar el precio"
                        style={{
                          width: 88, padding: "2px 4px", fontSize: 11, fontFamily: "monospace",
                          textAlign: "right", background: "transparent",
                          border: "1px solid #334155", color: "#e2e8f0", borderRadius: 3,
                        }} />
                    </div>
                  </div>
                  <input type="number" min="0.01" step="0.01" value={i.cantidad}
                    style={{
                      width: 64, padding: 6, textAlign: "right", fontSize: 14,
                      border: "1px solid #334155", background: "#0f172a", color: "white", borderRadius: 4,
                    }}
                    onChange={(e) => cambiarCantidad(idx, +e.target.value)} />
                  <button onClick={() => eliminar(idx)}
                    style={{
                      background: "transparent", color: "#ef4444", border: "1px solid #334155",
                      padding: "6px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12,
                    }}>×</button>
                </div>
              ))
            )}
          </div>

          {/* Total */}
          <div style={{ background: "white", color: "var(--color-text-primary)", padding: 16, borderRadius: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Subtotal</span>
              <span>{fmt(subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--color-text-muted)" }}>
              <span>IVA 16%</span><span>{fmt(iva)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 32, fontWeight: 800, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-border)" }}>
              <span>TOTAL</span><span>{fmt(total)}</span>
            </div>
            <button
              onClick={abrirCobrar}
              disabled={items.length === 0}
              style={{
                width: "100%", marginTop: 12, padding: "16px",
                fontSize: 18, fontWeight: 700, color: "white",
                background: items.length === 0 ? "#94a3b8" : "var(--color-primary)",
                border: 0, borderRadius: 8,
                cursor: items.length === 0 ? "not-allowed" : "pointer",
              }}>
              COBRAR (F5)
            </button>
            <button
              onClick={imprimirCotizacion}
              disabled={items.length === 0}
              style={{
                width: "100%", marginTop: 8, padding: "10px",
                fontSize: 13, fontWeight: 600, color: "#0f172a",
                background: items.length === 0 ? "#f1f5f9" : "#e0f2fe",
                border: "1px solid #93c5fd", borderRadius: 8,
                cursor: items.length === 0 ? "not-allowed" : "pointer",
              }}>
              Imprimir COTIZACIÓN (PDF)
            </button>
          </div>
        </div>
      </div>

      {/* Modal cobrar */}
      {showCobrar && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        }} onClick={() => !procesando && setShowCobrar(false)}>
          <div style={{ background: "white", maxWidth: 560, width: "92%", padding: 28, borderRadius: 14 }}
            onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 4px", fontSize: 18, color: "var(--color-text-secondary)" }}>Cobrar — Total</h2>
            <h1 style={{ margin: "0 0 20px", fontSize: 40, fontWeight: 800 }}>{fmt(total)}</h1>
            <div className="form-grid">
              <div>
                <label>Tipo de documento</label>
                <select className="input" value={tipoSel} onChange={(e) => setTipoSel(e.target.value as any)} style={{ fontSize: 16, padding: 10 }}>
                  <option value="TICKET">Ticket (pago al contado)</option>
                  <option value="REMISION">Remisión (a crédito, sin CFDI)</option>
                  <option value="FACTURA_PUE">Factura CFDI - PUE (pago al contado)</option>
                  <option value="FACTURA_PPD">Factura CFDI - PPD (a crédito)</option>
                </select>
              </div>
              <div>
                <label>Cliente</label>
                <button type="button" onClick={() => setShowClientePicker(true)}
                  style={{ width: "100%", padding: 10, fontSize: 14, textAlign: "left",
                    border: "1px solid var(--color-border)", borderRadius: 6, background: "white", cursor: "pointer" }}>
                  {cliente.nombre}{cliente.rfc ? ` · ${cliente.rfc}` : ""}
                  <span style={{ float: "right", color: "var(--color-text-muted)" }}>cambiar ✎</span>
                </button>
                {tipo === "FACTURA" && !cliente.rfc && (
                  <p style={{ color: "var(--color-danger)", fontSize: 12, margin: "4px 0 0" }}>
                    Para facturar, el cliente debe tener RFC. Click "cambiar" para seleccionar o crear.
                  </p>
                )}
              </div>
            </div>
            {esCredito && (
              <div style={{ marginTop: 16, padding: 14, background: "#fef3c7", borderRadius: 8, fontSize: 13 }}>
                <strong>{tipoSel === "REMISION" ? "Remisión a crédito" : "Factura PPD a crédito"}:</strong>{" "}
                no se cobra al momento. Se generará una cuenta por cobrar y la cobrarás desde
                <strong> Cartera → Abonar</strong>{tipoSel === "FACTURA_PPD" ? ", donde podrás emitir el complemento de pago." : "."}
              </div>
            )}

            {/* Selectores CFDI - solo factura */}
            {tipo === "FACTURA" && cliente.rfc && (
              <div style={{
                marginTop: 12, padding: 12, background: "#f8fafc",
                border: "1px solid #cbd5e1", borderRadius: 6,
              }}>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, fontWeight: 700, letterSpacing: "0.04em" }}>
                  DATOS CFDI · PRE-LLENADOS DEL CLIENTE · EDITABLES
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, color: "#475569" }}>Uso CFDI</label>
                    <select className="input" value={usoCfdiSel}
                      onChange={(e) => setUsoCfdiSel(e.target.value)} style={{ fontSize: 13 }}>
                      <option value="G01">G01 - Adquisición de mercancías</option>
                      <option value="G02">G02 - Devoluciones, descuentos</option>
                      <option value="G03">G03 - Gastos en general</option>
                      <option value="I01">I01 - Construcciones</option>
                      <option value="I02">I02 - Mobiliario y equipo</option>
                      <option value="I03">I03 - Equipo de transporte</option>
                      <option value="I04">I04 - Equipo cómputo</option>
                      <option value="I08">I08 - Otra maquinaria</option>
                      <option value="D01">D01 - Honorarios médicos</option>
                      <option value="D10">D10 - Servicios educativos</option>
                      <option value="S01">S01 - Sin efectos fiscales</option>
                      <option value="CP01">CP01 - Pagos</option>
                      <option value="P01">P01 - Por definir</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#475569" }}>Método de pago (CFDI)</label>
                    <select className="input" value={tipoSel === "FACTURA_PUE" ? "PUE" : "PPD"}
                      onChange={(e) => setTipoSel(e.target.value === "PUE" ? "FACTURA_PUE" : "FACTURA_PPD")}
                      style={{ fontSize: 13 }}>
                      <option value="PUE">PUE - Pago en una sola exhibición</option>
                      <option value="PPD">PPD - Pago en parcialidades / diferido</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / span 2" }}>
                    <label style={{ fontSize: 12, color: "#475569" }}>Condiciones de pago (texto libre, va en CFDI)</label>
                    <input className="input" value={condicionesPagoSel}
                      onChange={(e) => setCondicionesPagoSel(e.target.value)}
                      placeholder="ej. 30 días neto, contraentrega, etc."
                      style={{ fontSize: 13 }} />
                  </div>
                </div>
              </div>
            )}

            {/* Retencion IVA - solo factura con cliente RFC (caso CFE / gobierno) */}
            {tipo === "FACTURA" && cliente.rfc && (
              <div style={{
                marginTop: 12, padding: 12, background: "#eff6ff",
                border: "1px solid #93c5fd", borderRadius: 6,
              }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={retenerIva}
                    onChange={(e) => setRetenerIva(e.target.checked)} />
                  <strong>Retener IVA 16%</strong>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                    (caso CFE / gobierno que retiene el IVA a PF)
                  </span>
                </label>
                {retencionAplica && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#1e40af" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Subtotal:</span> <strong>{fmt(subtotal)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>IVA trasladado (16%):</span> <strong>{fmt(iva)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#dc2626" }}>
                      <span>IVA retenido (-16%):</span> <strong>-{fmt(ivaRetenido)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between",
                      borderTop: "1px dashed #93c5fd", paddingTop: 4, marginTop: 4 }}>
                      <strong>Total CFE deposita:</strong> <strong>{fmt(total)}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Canje de puntos: solo TICKET o REMISION con cliente real y saldo */}
            {puntosCliente > 0 && (tipoSel === "TICKET" || tipoSel === "REMISION") && cliente.id !== 1 && (
              <div style={{ marginTop: 16, padding: 14, background: "#dcfce7", border: "1px solid #86efac", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <strong style={{ fontSize: 14, color: "#065f46" }}>💰 Canjear puntos del monedero</strong>
                  <span style={{ fontSize: 12, color: "#065f46" }}>
                    Saldo: <strong>{puntosCliente.toLocaleString("es-MX")} pts</strong> ({fmt(puntosCliente)})
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, alignItems: "center" }}>
                  <input type="number" min={0} step={1}
                    value={puntosACanjear || ""}
                    placeholder={`Puntos a canjear (mín ${minCanje})`}
                    onChange={(e) => {
                      const n = Math.max(0, Math.floor(+e.target.value || 0));
                      const maxCanje = Math.min(puntosCliente, Math.floor(total));
                      setPuntosACanjear(Math.min(n, maxCanje));
                    }}
                    style={{ padding: 8, fontSize: 16, fontWeight: 600, textAlign: "right",
                      border: "1px solid #86efac", borderRadius: 4 }} />
                  <button onClick={() => {
                    const maxCanje = Math.min(puntosCliente, Math.floor(total));
                    setPuntosACanjear(maxCanje);
                  }} type="button"
                    style={{ background: "white", border: "1px solid #86efac", color: "#065f46",
                      padding: "6px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                    Máximo
                  </button>
                  <button onClick={() => setPuntosACanjear(0)} type="button"
                    style={{ background: "transparent", border: "1px solid #cbd5e1", color: "#475569",
                      padding: "6px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                    Limpiar
                  </button>
                  <strong style={{ fontSize: 16, color: "#065f46" }}>
                    -{fmt(puntosACanjear)}
                  </strong>
                </div>
                {puntosACanjear > 0 && puntosACanjear < minCanje && (
                  <div style={{ fontSize: 11, color: "#dc2626", marginTop: 6 }}>
                    Mínimo de canje: {minCanje} puntos
                  </div>
                )}
                {puntosACanjear >= minCanje && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginTop: 8, fontWeight: 600 }}>
                    <span style={{ color: "#065f46" }}>Total después del canje:</span>
                    <span style={{ color: "#065f46", fontSize: 20 }}>{fmt(Math.max(0, total - puntosACanjear))}</span>
                  </div>
                )}
              </div>
            )}

            {!esCredito && (
              <div style={{ marginTop: 16, padding: 12, background: "var(--color-bg)", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong style={{ fontSize: 14 }}>Forma(s) de pago</strong>
                  {pagos.length < 2 && (
                    <button onClick={agregarPago}
                      style={{ fontSize: 12, padding: "4px 10px", border: "1px dashed var(--color-border)",
                        background: "white", borderRadius: 4, cursor: "pointer" }}>
                      + 2do método
                    </button>
                  )}
                </div>
                {pagos.map((p, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 140px auto", gap: 8, marginBottom: 6 }}>
                    <select className="input" value={p.forma_pago_sat}
                      onChange={(e) => setPago(idx, { forma_pago_sat: e.target.value })}>
                      {FORMAS_PAGO_SAT.map((f) => <option key={f.v} value={f.v}>{f.t}</option>)}
                    </select>
                    <input ref={idx === 0 ? recibidoRef : undefined} className="input" type="number" step="0.01"
                      value={p.monto}
                      onChange={(e) => setPago(idx, { monto: +e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && sumaPagos >= totalAPagar - 0.01 && cobrar()}
                      style={{ fontSize: 16, padding: 10, textAlign: "right", fontWeight: 600 }} />
                    {pagos.length > 1 && (
                      <button onClick={() => quitarPago(idx)}
                        style={{ background: "transparent", border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer", padding: "0 10px" }}>×</button>
                    )}
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    {usaSplit ? "Suma pagos" : (tipo === "TICKET" ? "Recibido" : "Pago")}
                  </span>
                  <span>{fmt(sumaPagos)}</span>
                </div>
                {!usaSplit && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 800,
                    color: faltante > 0.01 ? "var(--color-danger)" : "var(--color-success)" }}>
                    <span>{faltante > 0.01 ? "Falta" : "Cambio"}</span>
                    <span>{fmt(Math.abs(faltante))}</span>
                  </div>
                )}
                {usaSplit && faltante > 0.01 && (
                  <div style={{ fontSize: 13, color: "var(--color-danger)", marginTop: 4 }}>
                    Falta: {fmt(faltante)} — ajusta los montos
                  </div>
                )}
                {usaSplit && faltante < -0.01 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700,
                    color: "var(--color-success)", marginTop: 4 }}>
                    <span>Cambio</span>
                    <span>{fmt(-faltante)}</span>
                  </div>
                )}
                {usaSplit && (
                  <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "8px 0 0" }}>
                    Pago combinado: el CFDI usará Forma de pago "99 — Por definir" según SAT 4.0
                  </p>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => cobrar()}
                disabled={procesando || (!esCredito && sumaPagos < totalAPagar - 0.01)}
                style={{
                  flex: 1, padding: 18, fontSize: 18, fontWeight: 700, color: "white",
                  background: procesando ? "#94a3b8" : "var(--color-primary)",
                  border: 0, borderRadius: 8, cursor: procesando ? "wait" : "pointer",
                }}>
                {procesando ? "Procesando..." : "CONFIRMAR (Enter)"}
              </button>
              <button onClick={() => setShowCobrar(false)} disabled={procesando}
                style={{
                  padding: "16px 24px", fontSize: 14,
                  background: "white", border: "1px solid var(--color-border)", borderRadius: 8, cursor: "pointer",
                }}>
                Cancelar (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal selector de cliente */}
      {showClientePicker && (
        <ClientePicker
          requiereRfc={tipo === "FACTURA"}
          onClose={() => { setShowClientePicker(false); focus(); }}
          onSelect={(c) => { setCliente(c); setShowClientePicker(false); focus(); }}
        />
      )}

      {/* Modal vista previa de factura antes de timbrar */}
      {mostrarPrevia && (
        <PreviaFacturaModal
          empresa={empresaActiva}
          cliente={cliente}
          items={items}
          subtotal={subtotal}
          iva={iva}
          ivaRetenido={ivaRetenido}
          total={total}
          usoCfdi={usoCfdiSel}
          tipoSel={tipoSel}
          condicionesPago={condicionesPagoSel}
          retencionAplica={retencionAplica}
          procesando={procesando}
          onCambiarUnidad={(idx, unidad) => {
            const c = [...items];
            c[idx].unidad = unidad;
            setItems(c);
          }}
          onCambiarCantidad={(idx, cantidad) => {
            if (cantidad <= 0) return;
            const c = [...items];
            c[idx].cantidad = cantidad;
            setItems(c);
          }}
          onCambiarPrecio={(idx, precio) => {
            if (isNaN(precio) || precio < 0) return;
            const c = [...items];
            c[idx].precio = precio;
            setItems(c);
          }}
          onCancelar={() => setMostrarPrevia(false)}
          onConfirmar={() => cobrar(true)}
        />
      )}

      {/* Modal importar cotizacion */}
      {showImportar && (
        <ImportarCotizacionModal
          onClose={() => { setShowImportar(false); focus(); }}
          onAgregar={(items_nuevos) => {
            // Mergea con items existentes (suma cantidades si ya estaba)
            const merged = [...items];
            for (const nuevo of items_nuevos) {
              const idx = merged.findIndex((i) => i.variante_id === nuevo.variante_id);
              if (idx >= 0) merged[idx].cantidad += nuevo.cantidad;
              else merged.push(nuevo);
            }
            setItems(merged);
            setShowImportar(false);
            focus();
          }}
        />
      )}
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: 4,
  padding: "2px 6px",
  fontSize: 11,
  fontFamily: "monospace",
};

function QuickBtn({ k, label, color, onClick }: {
  k: string; label: string; color: string; onClick: () => void;
}) {
  const filled = color !== "transparent";
  return (
    <button onClick={onClick} type="button"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "5px 10px", fontSize: 13, fontWeight: 600,
        background: filled ? color : "transparent",
        color: "white",
        border: filled ? "none" : "1px solid #334155",
        borderRadius: 6, cursor: "pointer",
      }}>
      {k && (
        <span style={{
          background: filled ? "rgba(0,0,0,0.25)" : "#1e293b",
          padding: "1px 6px", borderRadius: 3, fontSize: 10,
          fontFamily: "monospace",
        }}>{k}</span>
      )}
      <span>{label}</span>
    </button>
  );
}


// ===== Modal: vista previa de factura antes de timbrar =====

function PreviaFacturaModal({
  empresa, cliente, items, subtotal, iva, ivaRetenido, total,
  usoCfdi, tipoSel, condicionesPago, retencionAplica,
  procesando, onCambiarUnidad, onCambiarCantidad, onCambiarPrecio,
  onCancelar, onConfirmar,
}: {
  empresa: { id: number; nombre: string } | null;
  cliente: ClienteSel;
  items: Item[];
  subtotal: number;
  iva: number;
  ivaRetenido: number;
  total: number;
  usoCfdi: string;
  tipoSel: string;
  condicionesPago: string;
  retencionAplica: boolean;
  procesando: boolean;
  onCambiarUnidad: (idx: number, unidad: string) => void;
  onCambiarCantidad: (idx: number, cantidad: number) => void;
  onCambiarPrecio: (idx: number, precio: number) => void;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const metodoPago = tipoSel === "FACTURA_PUE" ? "PUE" : "PPD";

  function imprimirPrevia() {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    const html = construirHtmlPrevia({
      empresa: empresa?.nombre || "—",
      cliente, items, subtotal, iva, ivaRetenido, total,
      usoCfdi, metodoPago, condicionesPago, retencionAplica,
    });
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch {} }, 250);
  }

  const usoCfdiNombre: Record<string, string> = {
    G01: "Adquisición de mercancías",
    G02: "Devoluciones, descuentos",
    G03: "Gastos en general",
    I01: "Construcciones",
    I02: "Mobiliario y equipo",
    I03: "Equipo de transporte",
    I04: "Equipo cómputo",
    I08: "Otra maquinaria",
    D01: "Honorarios médicos",
    D10: "Servicios educativos",
    S01: "Sin efectos fiscales",
    CP01: "Pagos",
    P01: "Por definir",
  };

  return (
    <div onClick={onCancelar} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "white", borderRadius: 10, padding: 0,
        width: "95%", maxWidth: 920, maxHeight: "95vh", overflow: "auto",
      }}>
        {/* Header */}
        <div style={{
          background: "#0f172a", color: "white", padding: "14px 20px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          borderRadius: "10px 10px 0 0",
        }}>
          <div>
            <strong style={{ fontSize: 16 }}>👁 Vista previa de factura</strong>
            <div style={{ fontSize: 11, opacity: 0.8 }}>
              Revisa los datos antes de timbrar. Una vez timbrado el CFDI no se puede modificar.
            </div>
          </div>
          <button onClick={onCancelar} style={{ background: "transparent", border: 0, color: "white", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Emisor + Receptor */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={{ padding: 12, background: "#f1f5f9", borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.05em" }}>EMISOR</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{empresa?.nombre || "—"}</div>
            </div>
            <div style={{ padding: 12, background: "#dbeafe", borderRadius: 6, border: "1px solid #93c5fd" }}>
              <div style={{ fontSize: 10, color: "#1e40af", letterSpacing: "0.05em" }}>RECEPTOR (cliente)</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{cliente.razon_social || cliente.nombre}</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
                <strong>RFC:</strong> {cliente.rfc || "—"} · <strong>CP:</strong> {cliente.codigo_postal || "—"}
              </div>
              <div style={{ fontSize: 11, color: "#475569" }}>
                <strong>Régimen:</strong> {cliente.regimen_fiscal || "—"}
              </div>
            </div>
          </div>

          {/* Conceptos */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, fontWeight: 700, letterSpacing: "0.05em" }}>
              CONCEPTOS ({items.length})
            </div>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  <th style={{ ...thP, textAlign: "left" }}>Descripción</th>
                  <th style={{ ...thP, textAlign: "right", width: 60 }}>Cant</th>
                  <th style={{ ...thP, textAlign: "left", width: 70 }}>Unidad</th>
                  <th style={{ ...thP, textAlign: "right", width: 110 }}>Precio</th>
                  <th style={{ ...thP, textAlign: "right", width: 110 }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td style={tdP}>
                      <div>{it.nombre}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>SKU {it.sku}</div>
                    </td>
                    <td style={{ ...tdP, textAlign: "right" }}>
                      <input type="number" min="0.01" step="0.01" value={it.cantidad}
                        onChange={(e) => onCambiarCantidad(i, +e.target.value)}
                        style={{
                          width: 60, padding: "3px 6px", fontSize: 12, fontWeight: 600,
                          textAlign: "right", border: "1px solid #cbd5e1", borderRadius: 4,
                        }} />
                    </td>
                    <td style={tdP}>
                      <input type="text" value={it.unidad || ""} list={`unid-${i}`}
                        placeholder="Pieza"
                        onChange={(e) => onCambiarUnidad(i, e.target.value)}
                        style={{
                          width: 80, padding: "3px 6px", fontSize: 12,
                          border: "1px solid #cbd5e1", borderRadius: 4,
                        }} />
                      <datalist id={`unid-${i}`}>
                        <option value="Pieza" />
                        <option value="Kg" />
                        <option value="Kit" />
                        <option value="Paquete" />
                        <option value="Caja" />
                        <option value="Litro" />
                        <option value="Metro" />
                        <option value="m2" />
                        <option value="m3" />
                        <option value="Servicio" />
                        <option value="Hora" />
                        <option value="Galón" />
                        <option value="Tonelada" />
                      </datalist>
                    </td>
                    <td style={{ ...tdP, textAlign: "right" }}>
                      <input type="number" min="0" step="0.01" value={it.precio}
                        onChange={(e) => onCambiarPrecio(i, +e.target.value)}
                        style={{
                          width: 90, padding: "3px 6px", fontSize: 12,
                          textAlign: "right", border: "1px solid #cbd5e1", borderRadius: 4,
                        }} />
                    </td>
                    <td style={{ ...tdP, textAlign: "right", fontWeight: 700 }}>{fmt(it.cantidad * it.precio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totales + datos CFDI */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
            <div style={{ padding: 12, background: "#f8fafc", borderRadius: 6, border: "1px solid #cbd5e1" }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, fontWeight: 700, letterSpacing: "0.05em" }}>
                DATOS CFDI
              </div>
              <DatoCFDI label="Uso CFDI" valor={`${usoCfdi} — ${usoCfdiNombre[usoCfdi] || ""}`} />
              <DatoCFDI label="Método de pago" valor={`${metodoPago} — ${metodoPago === "PUE" ? "Una sola exhibición" : "Parcialidades / diferido"}`} />
              {condicionesPago && (
                <DatoCFDI label="Condiciones de pago" valor={condicionesPago} />
              )}
              {retencionAplica && (
                <div style={{
                  marginTop: 8, padding: 8, background: "#fee2e2",
                  border: "1px solid #fca5a5", borderRadius: 4, fontSize: 11,
                }}>
                  <strong style={{ color: "#991b1b" }}>⚠ Retención IVA 16% aplicada</strong>
                  <div style={{ color: "#7f1d1d" }}>
                    CFE retiene el IVA y lo entera al SAT por ti.
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding: 12, background: "#0f172a", color: "white", borderRadius: 6 }}>
              <FilaTotal label="Subtotal" valor={subtotal} />
              <FilaTotal label="IVA trasladado (16%)" valor={iva} />
              {ivaRetenido > 0 && (
                <FilaTotal label="IVA retenido (-16%)" valor={-ivaRetenido} color="#fca5a5" />
              )}
              <div style={{ borderTop: "1px dashed rgba(255,255,255,0.3)", marginTop: 6, paddingTop: 6 }}>
                <FilaTotal label="TOTAL CFDI" valor={total} grande />
              </div>
            </div>
          </div>
        </div>

        {/* Footer con botones */}
        <div style={{
          padding: "14px 20px", borderTop: "1px solid #e5e7eb",
          display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center",
        }}>
          <button onClick={onCancelar} disabled={procesando}
            style={{
              background: "transparent", border: "1px solid #cbd5e1",
              padding: "10px 18px", borderRadius: 6, fontSize: 14, cursor: "pointer",
              color: "#475569",
            }}>
            ← Editar / Cancelar
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={imprimirPrevia} disabled={procesando} type="button"
              style={{
                background: "white", border: "1px solid #0ea5e9", color: "#0ea5e9",
                padding: "10px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
              title="Imprime o guarda como PDF antes de timbrar">
              🖨 Imprimir previa
            </button>
            <button onClick={onConfirmar} disabled={procesando}
              style={{
                background: procesando ? "#94a3b8" : "#10b981", color: "white",
                border: 0, padding: "10px 22px", borderRadius: 6, fontSize: 15, fontWeight: 700,
                cursor: procesando ? "wait" : "pointer",
              }}>
              {procesando ? "Timbrando..." : "✓ Confirmar y timbrar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// Construye un HTML imprimible self-contained de la previa de factura
function construirHtmlPrevia(d: {
  empresa: string;
  cliente: ClienteSel;
  items: Item[];
  subtotal: number;
  iva: number;
  ivaRetenido: number;
  total: number;
  usoCfdi: string;
  metodoPago: string;
  condicionesPago: string;
  retencionAplica: boolean;
}): string {
  const fmtN = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const escapar = (s: string) => String(s || "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
  const itemsRows = d.items.map((it) => `
    <tr>
      <td>${escapar(it.nombre)}<br/><span class="muted">SKU ${escapar(it.sku)}</span></td>
      <td class="r">${it.cantidad}</td>
      <td>${escapar(it.unidad || "—")}</td>
      <td class="r">${fmtN(it.precio)}</td>
      <td class="r b">${fmtN(it.cantidad * it.precio)}</td>
    </tr>`).join("");
  const filaRet = d.retencionAplica ? `
    <tr><td>IVA retenido (-16%)</td><td class="r" style="color:#991b1b">-${fmtN(d.ivaRetenido)}</td></tr>` : "";
  const fechaImpresion = new Date().toLocaleString("es-MX", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<title>Previa de factura — ${escapar(d.cliente.razon_social || d.cliente.nombre)}</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; font-size: 12px; padding: 30px; color: #0f172a; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .muted { color: #94a3b8; font-size: 10px; }
  .aviso { background: #fef3c7; border: 1px solid #f59e0b; padding: 8px 12px; border-radius: 4px;
           margin-bottom: 16px; font-size: 11px; color: #92400e; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .box { padding: 10px; border: 1px solid #e5e7eb; border-radius: 4px; }
  .label { font-size: 9px; color: #64748b; letter-spacing: 0.04em; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th { background: #f1f5f9; padding: 6px 8px; text-align: left; font-size: 10px;
       text-transform: uppercase; color: #475569; border-bottom: 1px solid #cbd5e1; }
  td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .r { text-align: right; }
  .b { font-weight: 700; }
  .totales { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .totales table { width: 100%; }
  .totales td { padding: 4px 0; border: 0; }
  .total-final { background: #0f172a; color: white; padding: 10px 14px; border-radius: 4px;
                 display: flex; justify-content: space-between; font-size: 18px; margin-top: 6px; }
  .retencion { background: #fee2e2; border: 1px solid #fca5a5; padding: 8px;
               border-radius: 4px; font-size: 10px; color: #991b1b; margin-top: 8px; }
  @media print { body { padding: 14px; } .no-print { display: none; } }
</style></head><body>
<div class="aviso"><strong>📄 VISTA PREVIA — NO ES UNA FACTURA TIMBRADA.</strong>
 Generado: ${escapar(fechaImpresion)}. Una vez confirmes en el sistema, se genera el CFDI real con UUID del SAT.</div>
<h1>${escapar(d.empresa)}</h1>
<div class="muted">Emisor</div>
<div class="grid2">
  <div class="box">
    <div class="label">RECEPTOR</div>
    <div class="b" style="font-size:13px">${escapar(d.cliente.razon_social || d.cliente.nombre)}</div>
    <div class="muted" style="margin-top:4px">
      <strong>RFC:</strong> ${escapar(d.cliente.rfc || "—")} ·
      <strong>CP:</strong> ${escapar(d.cliente.codigo_postal || "—")}<br/>
      <strong>Régimen:</strong> ${escapar(d.cliente.regimen_fiscal || "—")}
    </div>
  </div>
  <div class="box">
    <div class="label">DATOS CFDI</div>
    <div><strong>Uso CFDI:</strong> ${escapar(d.usoCfdi)}</div>
    <div><strong>Método pago:</strong> ${escapar(d.metodoPago)}${d.metodoPago === "PUE" ? " — Una sola exhibición" : " — Parcialidades"}</div>
    ${d.condicionesPago ? `<div><strong>Condiciones:</strong> ${escapar(d.condicionesPago)}</div>` : ""}
  </div>
</div>
<div class="label" style="margin-bottom:4px">CONCEPTOS (${d.items.length})</div>
<table>
  <thead><tr>
    <th>Descripción</th><th class="r" style="width:50px">Cant</th>
    <th style="width:60px">Unidad</th>
    <th class="r" style="width:90px">Precio</th><th class="r" style="width:100px">Importe</th>
  </tr></thead>
  <tbody>${itemsRows}</tbody>
</table>
<div class="totales">
  <div>${d.retencionAplica ? `<div class="retencion"><strong>⚠ RETENCIÓN IVA 16%</strong><br/>
       El cliente retiene el IVA y lo entera al SAT por ti. Cobrarías solo el subtotal.</div>` : ""}</div>
  <div>
    <table>
      <tr><td>Subtotal</td><td class="r b">${fmtN(d.subtotal)}</td></tr>
      <tr><td>IVA trasladado (16%)</td><td class="r">${fmtN(d.iva)}</td></tr>
      ${filaRet}
    </table>
    <div class="total-final">
      <span>TOTAL CFDI</span><span>${fmtN(d.total)}</span>
    </div>
  </div>
</div>
<div class="no-print" style="text-align:center; margin-top:20px">
  <button onclick="window.print()" style="padding:10px 20px;font-size:14px;background:#0ea5e9;color:white;border:0;border-radius:4px;cursor:pointer">
    Imprimir / Guardar como PDF
  </button>
  <button onclick="window.close()" style="padding:10px 20px;font-size:14px;background:transparent;border:1px solid #ccc;border-radius:4px;cursor:pointer;margin-left:8px">
    Cerrar
  </button>
</div>
</body></html>`;
}


function construirHtmlCotizacion(d: {
  emisor: {
    nombre: string;
    razon_social: string;
    rfc: string;
    regimen: string;
    cp: string;
  };
  cliente: ClienteSel;
  items: Item[];
  subtotal: number;
  iva: number;
  total: number;
}): string {
  const fmtN = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const escapar = (s: string) => String(s || "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
  const itemsRows = d.items.map((it, i) => `
    <tr>
      <td style="text-align:center;color:#94a3b8">${i + 1}</td>
      <td>${escapar(it.nombre)}${it.sku ? `<br/><span class="muted">SKU ${escapar(it.sku)}</span>` : ""}</td>
      <td class="r">${it.cantidad}</td>
      <td>${escapar(it.unidad || "—")}</td>
      <td class="r">${fmtN(it.precio)}</td>
      <td class="r b">${fmtN(it.cantidad * it.precio)}</td>
    </tr>`).join("");
  const fechaEmision = new Date();
  const fmtFecha = (f: Date) => f.toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
  const folioPreview = "COT-" + fechaEmision.getFullYear() + String(fechaEmision.getMonth() + 1).padStart(2, "0") +
                       String(fechaEmision.getDate()).padStart(2, "0") + "-" +
                       String(fechaEmision.getHours()).padStart(2, "0") + String(fechaEmision.getMinutes()).padStart(2, "0");
  const emisorTitulo = d.emisor.razon_social || d.emisor.nombre;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<title>Cotización ${folioPreview} — ${escapar(d.cliente.razon_social || d.cliente.nombre)}</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; font-size: 12px; padding: 30px; color: #0f172a; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #0f172a; }
  h2 { font-size: 14px; margin: 0; color: #475569; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #94a3b8; font-size: 10px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px;
            padding-bottom: 14px; border-bottom: 2px solid #0f172a; }
  .header .right { text-align: right; }
  .folio { font-size: 20px; font-weight: 800; color: #0ea5e9; letter-spacing: 0.04em; }
  .emisor-datos { font-size: 11px; color: #475569; margin-top: 6px; line-height: 1.5; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .box { padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 4px; background: #fafafa; }
  .label { font-size: 9px; color: #64748b; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th { background: #0f172a; padding: 8px 8px; text-align: left; font-size: 10px;
       text-transform: uppercase; color: white; letter-spacing: 0.04em; }
  td { padding: 7px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .r { text-align: right; }
  .b { font-weight: 700; }
  .totales { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .totales table { width: 100%; }
  .totales td { padding: 5px 8px; border: 0; }
  .total-final { background: #0f172a; color: white; padding: 12px 16px; border-radius: 4px;
                 display: flex; justify-content: space-between; font-size: 20px; margin-top: 8px; font-weight: 800; }
  .notas { margin-top: 16px; padding: 10px; background: #f8fafc; border-left: 3px solid #cbd5e1;
           font-size: 11px; color: #475569; }
  .firma { margin-top: 40px; padding-top: 8px; border-top: 1px solid #cbd5e1;
           width: 60%; text-align: center; font-size: 10px; color: #64748b; }
  @media print { body { padding: 14px; } .no-print { display: none; } }
</style></head><body>
<div class="header">
  <div style="flex:1">
    <h1>${escapar(emisorTitulo)}</h1>
    <div class="muted">Emisor de la cotización</div>
    <div class="emisor-datos">
      ${d.emisor.rfc ? `<strong>RFC:</strong> ${escapar(d.emisor.rfc)}` : ""}
      ${d.emisor.regimen ? ` &nbsp;·&nbsp; <strong>Régimen:</strong> ${escapar(d.emisor.regimen)}` : ""}
      ${d.emisor.cp ? ` &nbsp;·&nbsp; <strong>CP:</strong> ${escapar(d.emisor.cp)}` : ""}
    </div>
  </div>
  <div class="right">
    <h2>Cotización</h2>
    <div class="folio">${folioPreview}</div>
    <div class="muted">Emitida: ${escapar(fmtFecha(fechaEmision))}</div>
  </div>
</div>

<div class="grid2">
  <div class="box">
    <div class="label">EMISOR (DATOS FISCALES)</div>
    <div class="b" style="font-size:13px">${escapar(d.emisor.razon_social || d.emisor.nombre)}</div>
    ${d.emisor.rfc ? `<div class="muted" style="margin-top:4px"><strong>RFC:</strong> ${escapar(d.emisor.rfc)}</div>` : ""}
    ${d.emisor.cp ? `<div class="muted"><strong>CP:</strong> ${escapar(d.emisor.cp)}</div>` : ""}
    ${d.emisor.regimen ? `<div class="muted"><strong>Régimen fiscal:</strong> ${escapar(d.emisor.regimen)}</div>` : ""}
  </div>
  <div class="box">
    <div class="label">CLIENTE (DATOS FISCALES)</div>
    <div class="b" style="font-size:13px">${escapar(d.cliente.razon_social || d.cliente.nombre)}</div>
    ${d.cliente.rfc ? `<div class="muted" style="margin-top:4px"><strong>RFC:</strong> ${escapar(d.cliente.rfc)}</div>` : ""}
    ${d.cliente.codigo_postal ? `<div class="muted"><strong>CP:</strong> ${escapar(d.cliente.codigo_postal)}</div>` : ""}
    ${d.cliente.regimen_fiscal ? `<div class="muted"><strong>Régimen fiscal:</strong> ${escapar(d.cliente.regimen_fiscal)}</div>` : ""}
  </div>
</div>

<div class="label" style="margin-bottom:4px">CONCEPTOS (${d.items.length})</div>
<table>
  <thead><tr>
    <th style="width:30px;text-align:center">#</th>
    <th>Descripción</th>
    <th class="r" style="width:50px;color:white">Cant</th>
    <th style="width:60px;color:white">Unidad</th>
    <th class="r" style="width:90px;color:white">P. Unit.</th>
    <th class="r" style="width:100px;color:white">Importe</th>
  </tr></thead>
  <tbody>${itemsRows}</tbody>
</table>

<div class="totales">
  <div>
    <div class="notas">
      <strong>NOTAS:</strong><br/>
      • Esta cotización NO es un comprobante fiscal.<br/>
      • Precios sujetos a cambio sin previo aviso.<br/>
      • Disponibilidad sujeta a existencias al momento de la confirmación.
    </div>
  </div>
  <div>
    <table>
      <tr><td>Subtotal</td><td class="r b">${fmtN(d.subtotal)}</td></tr>
      <tr><td>IVA 16%</td><td class="r">${fmtN(d.iva)}</td></tr>
    </table>
    <div class="total-final">
      <span>TOTAL</span><span>${fmtN(d.total)}</span>
    </div>
  </div>
</div>

<div class="firma">
  Atención y servicio<br/>
  ${escapar(emisorTitulo)}
</div>

<div class="no-print" style="text-align:center; margin-top:20px">
  <button onclick="window.print()" style="padding:10px 20px;font-size:14px;background:#0ea5e9;color:white;border:0;border-radius:4px;cursor:pointer">
    Imprimir / Guardar como PDF
  </button>
  <button onclick="window.close()" style="padding:10px 20px;font-size:14px;background:transparent;border:1px solid #ccc;border-radius:4px;cursor:pointer;margin-left:8px">
    Cerrar
  </button>
</div>
</body></html>`;
}


function DatoCFDI({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase" }}>{label}: </span>
      <strong style={{ fontSize: 12 }}>{valor}</strong>
    </div>
  );
}


function FilaTotal({ label, valor, color, grande }: { label: string; valor: number; color?: string; grande?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
      <span style={{ fontSize: grande ? 13 : 11, opacity: 0.85 }}>{label}</span>
      <strong style={{ fontSize: grande ? 22 : 14, color: color || "white" }}>{fmt(valor)}</strong>
    </div>
  );
}


const thP: React.CSSProperties = {
  padding: "6px 8px", fontSize: 10, color: "#475569",
  textTransform: "uppercase", letterSpacing: "0.04em",
  borderBottom: "1px solid #e5e7eb",
};
const tdP: React.CSSProperties = {
  padding: "6px 8px", fontSize: 12,
  borderBottom: "1px solid #f1f5f9",
};


// ===== Modal: importar cotizacion desde XLSX o imagen/PDF =====

type LineaCot = {
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio: number;
  monto: number;
  match_variante_id: number | null;
  match_score: number;
  match_nombre: string | null;
  match_sku: string | null;
  match_precio_catalogo: number | null;
  match_stock: number | null;
};

function ImportarCotizacionModal({ onClose, onAgregar }: {
  onClose: () => void;
  onAgregar: (items: Item[]) => void;
}) {
  const [modo, setModo] = useState<"archivo" | "pegar">("archivo");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [textoPegado, setTextoPegado] = useState<string>("");
  const [procesando, setProcesando] = useState(false);
  const [lineas, setLineas] = useState<LineaCot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usarPrecioCatalogo, setUsarPrecioCatalogo] = useState(false);
  // Si esta marcado, los precios de la cotizacion ya incluyen IVA -> dividir / 1.16
  const [preciosConIva, setPreciosConIva] = useState(false);
  // Selecciono que lineas voy a agregar (por index) - solo las matcheadas activadas
  const [omitidos, setOmitidos] = useState<Set<number>>(new Set());
  // Index de la linea con el form de creacion abierto
  const [creandoIdx, setCreandoIdx] = useState<number | null>(null);

  async function procesar() {
    if (!archivo) return;
    setProcesando(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", archivo);
      const r = await api.post("/api/productos/parsear-cotizacion", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });
      setLineas(r.data.lineas || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setProcesando(false);
    }
  }

  function parsearTextoPegado(texto: string): Array<{descripcion: string; cantidad: number; precio: number; monto: number}> {
    const limpiarNum = (s: string): number => {
      if (!s) return 0;
      // Quita $, comas, espacios, NBSP
      const limpio = s.replace(/[\$,\s ]/g, "").trim();
      const n = parseFloat(limpio);
      return isNaN(n) ? 0 : n;
    };
    const filas: Array<{descripcion: string; cantidad: number; precio: number; monto: number}> = [];
    for (const linea of texto.split(/\r?\n/)) {
      if (!linea.trim()) continue;
      // Excel pega con tab \t entre columnas
      const cols = linea.split("\t");
      if (cols.length < 2) continue;
      // Esquemas soportados:
      // [desc, cantidad, precio, monto] (4 cols)
      // [desc, cantidad, precio]        (3 cols)
      // [desc, cantidad, monto]         (3 cols - calcula precio = monto/cantidad)
      const desc = (cols[0] || "").trim();
      if (!desc) continue;
      const cantidad = limpiarNum(cols[1] || "");
      if (cantidad <= 0) continue;
      let precio = 0;
      let monto = 0;
      if (cols.length >= 4) {
        precio = limpiarNum(cols[2]);
        monto = limpiarNum(cols[3]);
      } else if (cols.length === 3) {
        const c2 = limpiarNum(cols[2]);
        // Heuristica: si col 2 ≈ col 1 * algun precio bajo, asumimos que es precio
        // Si c2 es mucho mas grande que cantidad, probablemente es monto
        if (c2 > cantidad * 100) {
          monto = c2;
          precio = monto / cantidad;
        } else {
          precio = c2;
          monto = cantidad * precio;
        }
      }
      if (!monto) monto = cantidad * precio;
      if (!precio && monto) precio = monto / cantidad;
      filas.push({ descripcion: desc, cantidad, precio: +precio.toFixed(4), monto: +monto.toFixed(2) });
    }
    return filas;
  }

  async function procesarTextoPegado() {
    if (!textoPegado.trim()) return;
    setProcesando(true);
    setError(null);
    try {
      const filas = parsearTextoPegado(textoPegado);
      if (filas.length === 0) {
        setError("No se pudieron extraer líneas del texto pegado. Asegúrate de pegar desde Excel con columnas separadas por tab.");
        setProcesando(false);
        return;
      }
      const r = await api.post("/api/productos/matchear-lineas-cotizacion", { lineas: filas });
      setLineas(r.data.lineas || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setProcesando(false);
    }
  }

  function toggleOmitir(i: number) {
    setOmitidos((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  }

  function onProductoCreado(idx: number, varianteId: number, sku: string, nombreFinal: string, precioFinal: number) {
    // Marca la linea como matcheada con la nueva variante creada
    setLineas((prev) => {
      if (!prev) return prev;
      const n = [...prev];
      n[idx] = {
        ...n[idx],
        match_variante_id: varianteId,
        match_sku: sku,
        match_nombre: nombreFinal,
        match_precio_catalogo: precioFinal,
        match_stock: 0,
        match_score: 1.0,
      };
      return n;
    });
    setCreandoIdx(null);
  }

  function ajustarPrecio(p: number): number {
    // Si los precios en la cotizacion ya traen IVA, le dividimos 1.16 para obtener
    // el precio subtotal (que es como el sistema maneja precios internos).
    return preciosConIva ? +(p / 1.16).toFixed(4) : p;
  }

  function agregarTodos() {
    if (!lineas) return;
    const items: Item[] = [];
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      if (omitidos.has(i)) continue;
      if (!l.match_variante_id) continue;
      const precioBase = usarPrecioCatalogo && l.match_precio_catalogo != null
        ? l.match_precio_catalogo  // precio catalogo siempre se asume subtotal
        : ajustarPrecio(l.precio); // precio cotizacion segun toggle IVA
      items.push({
        variante_id: l.match_variante_id,
        sku: l.match_sku || "",
        nombre: l.match_nombre || l.descripcion,
        precio: precioBase,
        cantidad: l.cantidad,
        stock: l.match_stock || 0,
        unidad: l.unidad,
      });
    }
    if (items.length === 0) {
      alert("No hay líneas matcheadas para agregar.");
      return;
    }
    onAgregar(items);
  }

  const matched = lineas?.filter((l) => l.match_variante_id) || [];
  const unmatched = lineas?.filter((l) => !l.match_variante_id) || [];
  const totalMatched = matched.reduce((a, l) => a + (l.cantidad * (
    usarPrecioCatalogo && l.match_precio_catalogo != null
      ? l.match_precio_catalogo
      : ajustarPrecio(l.precio)
  )), 0);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "white", borderRadius: 10, padding: 20,
        width: "90%", maxWidth: 1000, maxHeight: "90vh", overflow: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>📎 Importar cotización</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {!lineas ? (
          <div style={{ padding: 0 }}>
            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--color-border)" }}>
              <button onClick={() => setModo("archivo")}
                style={{
                  flex: 1, padding: "12px 16px", fontSize: 13, fontWeight: 600,
                  background: modo === "archivo" ? "white" : "#f8fafc",
                  border: 0, borderBottom: modo === "archivo" ? "3px solid var(--color-primary)" : "3px solid transparent",
                  cursor: "pointer", color: modo === "archivo" ? "var(--color-primary)" : "#64748b",
                }}>
                📁 Subir archivo (XLSX / PDF / imagen)
              </button>
              <button onClick={() => setModo("pegar")}
                style={{
                  flex: 1, padding: "12px 16px", fontSize: 13, fontWeight: 600,
                  background: modo === "pegar" ? "white" : "#f8fafc",
                  border: 0, borderBottom: modo === "pegar" ? "3px solid var(--color-primary)" : "3px solid transparent",
                  cursor: "pointer", color: modo === "pegar" ? "var(--color-primary)" : "#64748b",
                }}>
                📋 Pegar desde Excel
              </button>
            </div>

            {modo === "archivo" ? (
              <div style={{ padding: 24 }}>
                <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>
                  Sube un archivo <strong>XLSX</strong>, <strong>PDF</strong> o <strong>imagen (PNG/JPG)</strong> de una cotización.
                  El sistema extrae las líneas y las matchea contra el catálogo de productos.
                </p>
                <input type="file" accept=".xlsx,.xlsm,.pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
                  onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                  style={{ marginBottom: 16, fontSize: 14 }} />
                {archivo && (
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
                    Archivo: <strong>{archivo.name}</strong> ({(archivo.size / 1024).toFixed(1)} KB)
                  </div>
                )}
                {error && (
                  <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
                    {error}
                  </div>
                )}
                <button onClick={procesar} disabled={!archivo || procesando}
                  style={{
                    background: archivo && !procesando ? "var(--color-primary)" : "#ccc",
                    color: "white", border: 0, padding: "10px 20px",
                    borderRadius: 6, cursor: archivo && !procesando ? "pointer" : "not-allowed",
                    fontSize: 14, fontWeight: 600,
                  }}>
                  {procesando ? "Procesando..." : "Procesar archivo"}
                </button>
                <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 12 }}>
                  Tip: XLSX se parsea instantáneo. PDF/imagen usa Claude Vision (~3-8 seg, ~$0.01 USD).
                </p>
              </div>
            ) : (
              <div style={{ padding: 24 }}>
                <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 12 }}>
                  Selecciona y copia (Ctrl+C / Cmd+C) las celdas desde Excel y pégalas (Ctrl+V / Cmd+V) abajo.
                  Formato esperado: <strong>Descripción · Cantidad · Precio · Monto</strong> separados por tab.
                </p>
                <textarea value={textoPegado}
                  onChange={(e) => setTextoPegado(e.target.value)}
                  placeholder={`TUBO CONDUIT FIERRO GALV 21 MM	216.35	$265.01	$57,334.91
CABLE DE COBRE #10 600V	649.05	$50.55	$32,809.48
...`}
                  style={{
                    width: "100%", minHeight: 220, fontSize: 12, padding: 10,
                    fontFamily: "monospace", border: "1px solid var(--color-border)",
                    borderRadius: 6, resize: "vertical",
                  }} />
                {error && (
                  <div style={{ background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 6, fontSize: 13, marginTop: 12 }}>
                    {error}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                  <button onClick={procesarTextoPegado} disabled={!textoPegado.trim() || procesando}
                    style={{
                      background: textoPegado.trim() && !procesando ? "var(--color-primary)" : "#ccc",
                      color: "white", border: 0, padding: "10px 20px",
                      borderRadius: 6, cursor: textoPegado.trim() && !procesando ? "pointer" : "not-allowed",
                      fontSize: 14, fontWeight: 600,
                    }}>
                    {procesando ? "Procesando..." : "Procesar texto pegado"}
                  </button>
                  <button onClick={() => setTextoPegado("")} type="button"
                    style={{ background: "transparent", border: "1px solid #cbd5e1", padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                    Limpiar
                  </button>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>
                    {textoPegado.split(/\r?\n/).filter((l) => l.trim()).length} líneas detectadas
                  </span>
                </div>
                <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 12 }}>
                  Tip: si tu Excel tiene la descripción con saltos de línea, copia solo las celdas (no la fila completa).
                  Funciona con 3 o 4 columnas. Los símbolos $, comas y espacios se limpian automáticamente.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10,
              marginBottom: 12, fontSize: 13,
            }}>
              <ChipResumen label="Líneas totales" valor={lineas.length} />
              <ChipResumen label="Matcheadas ✓" valor={matched.length} color="#065f46" />
              <ChipResumen label="Sin match ⚠" valor={unmatched.length} color="#991b1b" />
              <ChipResumen label="Total a agregar" valor={fmt(totalMatched)} color="#1e40af" />
            </div>

            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 10, fontSize: 12, color: "var(--color-text-muted)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={usarPrecioCatalogo}
                  onChange={(e) => setUsarPrecioCatalogo(e.target.checked)} />
                Usar precio del catálogo en lugar del de la cotización
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={preciosConIva}
                  onChange={(e) => setPreciosConIva(e.target.checked)} />
                Los precios de la cotización <strong>YA INCLUYEN IVA</strong> (dividir entre 1.16)
              </label>
            </div>

            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  <th style={{ ...thMini, width: 30 }}></th>
                  <th style={thMini}>Descripción cotización</th>
                  <th style={{ ...thMini, textAlign: "right", width: 60 }}>Cant</th>
                  <th style={{ ...thMini, textAlign: "right", width: 90 }}>Precio cot.</th>
                  <th style={thMini}>Match catálogo</th>
                  <th style={{ ...thMini, textAlign: "right", width: 90 }}>Precio cat.</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => {
                  const omitido = omitidos.has(i);
                  const sinMatch = !l.match_variante_id;
                  return (
                    <React.Fragment key={i}>
                      <tr style={{
                        background: omitido ? "#f3f4f6" : sinMatch ? "#fef3c7" : "white",
                        opacity: omitido ? 0.5 : 1,
                      }}>
                        <td style={{ ...tdMini, textAlign: "center" }}>
                          {sinMatch ? (
                            <span title="No match en catálogo">⚠</span>
                          ) : (
                            <input type="checkbox" checked={!omitido}
                              onChange={() => toggleOmitir(i)}
                              style={{ cursor: "pointer" }} />
                          )}
                        </td>
                        <td style={tdMini}>
                          <div>{l.descripcion}</div>
                          {l.unidad && <div style={{ fontSize: 10, color: "#6b7280" }}>{l.unidad}</div>}
                        </td>
                        <td style={{ ...tdMini, textAlign: "right", fontWeight: 600 }}>{l.cantidad}</td>
                        <td style={{ ...tdMini, textAlign: "right" }}>{fmt(l.precio)}</td>
                        <td style={tdMini}>
                          {l.match_nombre ? (
                            <>
                              <div style={{ fontSize: 11 }}>{l.match_nombre}</div>
                              <div style={{ fontSize: 10, color: "#6b7280" }}>
                                SKU {l.match_sku} · score {l.match_score} · stock {l.match_stock ?? 0}
                              </div>
                            </>
                          ) : (
                            <button onClick={() => setCreandoIdx(creandoIdx === i ? null : i)}
                              style={{
                                background: creandoIdx === i ? "#92400e" : "var(--color-primary)",
                                color: "white", border: 0, padding: "4px 10px",
                                borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 600,
                              }}>
                              {creandoIdx === i ? "Cancelar" : "+ Crear producto"}
                            </button>
                          )}
                        </td>
                        <td style={{ ...tdMini, textAlign: "right", color: "#475569" }}>
                          {l.match_precio_catalogo != null ? fmt(l.match_precio_catalogo) : "—"}
                        </td>
                      </tr>
                      {creandoIdx === i && sinMatch && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0, background: "#eff6ff" }}>
                            <FormCrearProducto
                              linea={l}
                              onCancelar={() => setCreandoIdx(null)}
                              onCreado={(varianteId, sku, nombre, precio) => onProductoCreado(i, varianteId, sku, nombre, precio)}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, gap: 8 }}>
              <button onClick={() => { setLineas(null); setArchivo(null); setTextoPegado(""); setOmitidos(new Set()); }}
                style={{ background: "transparent", border: "1px solid #ccc", padding: "8px 14px", borderRadius: 6, cursor: "pointer" }}>
                ← Subir otro
              </button>
              <button onClick={agregarTodos}
                style={{ background: "var(--color-primary)", color: "white", border: 0, padding: "8px 18px", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
                Agregar al carrito ({matched.filter((_, i) => !omitidos.has(lineas.indexOf(matched[i]))).length})
              </button>
            </div>

            {unmatched.length > 0 && (
              <div style={{ marginTop: 12, padding: 10, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, fontSize: 12, color: "#92400e" }}>
                <strong>⚠ {unmatched.length} línea(s) sin match.</strong> Da de alta esos productos en Productos
                (con su clave SAT correcta) antes de timbrar. Mientras tanto se quedan fuera del carrito.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


function ChipResumen({ label, valor, color }: { label: string; valor: number | string; color?: string }) {
  return (
    <div style={{
      background: color || "#f3f4f6", color: color ? "white" : "#475569",
      padding: "8px 12px", borderRadius: 6,
      display: "flex", flexDirection: "column",
    }}>
      <span style={{ fontSize: 10, opacity: 0.8, letterSpacing: "0.04em" }}>{label}</span>
      <strong style={{ fontSize: 16 }}>{valor}</strong>
    </div>
  );
}


const thMini: React.CSSProperties = {
  padding: "5px 8px", textAlign: "left", fontSize: 10,
  textTransform: "uppercase", color: "#475569",
  borderBottom: "1px solid #e5e7eb",
};
const tdMini: React.CSSProperties = {
  padding: "6px 8px", borderBottom: "1px solid #f1f5f9", fontSize: 12,
};


// Mapeo unidad descriptiva -> clave SAT c_ClaveUnidad
function unidadToClaveSat(unidad: string): { unidad: string; clave: string } {
  const u = (unidad || "").trim().toLowerCase();
  if (!u) return { unidad: "PZA", clave: "H87" };
  if (u.startsWith("kit")) return { unidad: "KIT", clave: "XKI" };
  if (u.startsWith("paq")) return { unidad: "PAQUETE", clave: "XPK" };
  if (u.startsWith("caja")) return { unidad: "CAJA", clave: "XBX" };
  if (u.startsWith("bult")) return { unidad: "BULTO", clave: "XBG" };
  if (u.startsWith("kg") || u.includes("kilo")) return { unidad: "KG", clave: "KGM" };
  if (u === "m" || u.includes("metro")) return { unidad: "M", clave: "MTR" };
  if (u.startsWith("lt") || u.includes("litro") || u === "l") return { unidad: "LT", clave: "LTR" };
  if (u.startsWith("ton")) return { unidad: "TON", clave: "TNE" };
  // Default: pieza
  return { unidad: "PZA", clave: "H87" };
}


function FormCrearProducto({ linea, onCancelar, onCreado }: {
  linea: LineaCot;
  onCancelar: () => void;
  onCreado: (varianteId: number, sku: string, nombre: string, precio: number) => void;
}) {
  const unidadInicial = unidadToClaveSat(linea.unidad);
  // SKU sugerido: primeras letras de cada palabra + timestamp corto
  const skuSugerido = (() => {
    const palabras = linea.descripcion
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 1)
      .slice(0, 4);
    const prefijo = palabras.map((p) => p.slice(0, 3)).join("-");
    const sufijo = Date.now().toString().slice(-4);
    return `${prefijo}-${sufijo}`.slice(0, 30);
  })();

  const [nombre, setNombre] = useState(linea.descripcion);
  const [sku, setSku] = useState(skuSugerido);
  const [precio, setPrecio] = useState(linea.precio);
  const [costo, setCosto] = useState(0);
  const [unidad, setUnidad] = useState(unidadInicial.unidad);
  const [claveUnidad, setClaveUnidad] = useState(unidadInicial.clave);
  const [claveSat, setClaveSat] = useState("");
  const [satConfianza, setSatConfianza] = useState<string | null>(null);
  const [satDescripcion, setSatDescripcion] = useState<string | null>(null);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sugerirSat() {
    setSugiriendo(true);
    setError(null);
    try {
      const r = await api.post("/api/productos/sugerir-clave-sat", {
        nombre, categoria: null, marca: null,
      });
      setClaveSat(r.data.clave || "");
      setSatConfianza(r.data.confianza || null);
      setSatDescripcion(r.data.descripcion || null);
    } catch (err: any) {
      setError("No pude sugerir clave SAT: " + (err.response?.data?.detail || err.message));
    } finally {
      setSugiriendo(false);
    }
  }

  async function guardar() {
    if (!nombre.trim() || !sku.trim()) {
      setError("Nombre y SKU son obligatorios");
      return;
    }
    if (!claveSat || claveSat.length !== 8) {
      setError("Necesitas una clave SAT de 8 dígitos (usa el botón 'Sugerir')");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await api.post("/api/productos/simple", {
        nombre: nombre.trim(),
        sku: sku.trim(),
        presentacion: "Default",
        unidad,
        clave_unidad_sat: claveUnidad,
        precio_publico: precio,
        costo_promedio: costo,
        stock_minimo: 0,
        categoria: null,
        marca: null,
        clave_prod_serv_sat: claveSat,
      });
      onCreado(r.data.variante_id, r.data.sku, nombre.trim(), precio);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setGuardando(false);
    }
  }

  // Sugerir SAT al abrir
  useEffect(() => {
    sugerirSat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colorConfianza = satConfianza === "alta" ? "#065f46"
    : satConfianza === "media" ? "#92400e" : "#991b1b";

  return (
    <div style={{ padding: 12, border: "1px solid #93c5fd", borderTop: 0, fontSize: 12 }}>
      <div style={{ fontSize: 11, color: "#1e40af", marginBottom: 8, fontWeight: 600 }}>
        Crear producto nuevo en el catálogo
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 100px 100px", gap: 8, marginBottom: 8 }}>
        <Campo label="Nombre">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)}
            style={inputStyle} />
        </Campo>
        <Campo label="SKU">
          <input value={sku} onChange={(e) => setSku(e.target.value)}
            style={inputStyle} />
        </Campo>
        <Campo label="Precio">
          <input type="number" step="0.01" value={precio}
            onChange={(e) => setPrecio(+e.target.value)}
            style={{ ...inputStyle, textAlign: "right" }} />
        </Campo>
        <Campo label="Costo">
          <input type="number" step="0.01" value={costo}
            onChange={(e) => setCosto(+e.target.value)}
            style={{ ...inputStyle, textAlign: "right" }} />
        </Campo>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "140px 110px 1fr 140px", gap: 8, marginBottom: 10 }}>
        <Campo label="Unidad">
          <input value={unidad} onChange={(e) => setUnidad(e.target.value)}
            style={inputStyle} />
        </Campo>
        <Campo label="Clave unidad SAT">
          <input value={claveUnidad} onChange={(e) => setClaveUnidad(e.target.value)}
            style={inputStyle} title="H87=Pza, XKI=Kit, XPK=Paquete, KGM=Kg, MTR=Metro, LTR=Litro" />
        </Campo>
        <Campo label="Clave SAT (8 dígitos)">
          <div style={{ display: "flex", gap: 4 }}>
            <input value={claveSat} onChange={(e) => setClaveSat(e.target.value)}
              maxLength={8} placeholder="ej. 42272003"
              style={{ ...inputStyle, fontFamily: "monospace", width: 100 }} />
            <button onClick={sugerirSat} disabled={sugiriendo} type="button"
              style={{
                background: "#1e40af", color: "white", border: 0,
                padding: "4px 10px", borderRadius: 4, fontSize: 11,
                cursor: sugiriendo ? "wait" : "pointer", whiteSpace: "nowrap",
              }}>
              {sugiriendo ? "..." : "🤖 Sugerir IA"}
            </button>
            {satDescripcion && (
              <div style={{ fontSize: 10, color: colorConfianza, alignSelf: "center" }}>
                <strong>{satConfianza?.toUpperCase()}</strong> · {satDescripcion}
              </div>
            )}
          </div>
        </Campo>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
          <button onClick={onCancelar} type="button" disabled={guardando}
            style={{ background: "transparent", border: "1px solid #cbd5e1", padding: "5px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>
            Cancelar
          </button>
          <button onClick={guardar} type="button" disabled={guardando}
            style={{
              background: guardando ? "#94a3b8" : "var(--color-primary)",
              color: "white", border: 0, padding: "5px 14px",
              borderRadius: 4, fontSize: 11, fontWeight: 600,
              cursor: guardando ? "wait" : "pointer",
            }}>
            {guardando ? "Guardando..." : "✓ Crear"}
          </button>
        </div>
      </div>
      {error && (
        <div style={{
          background: "#fee2e2", color: "#991b1b", padding: 6, borderRadius: 4,
          fontSize: 11, marginTop: 4,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}


function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</span>
      {children}
    </div>
  );
}


const inputStyle: React.CSSProperties = {
  padding: "4px 6px", fontSize: 12,
  border: "1px solid #cbd5e1", borderRadius: 3,
  width: "100%",
};
