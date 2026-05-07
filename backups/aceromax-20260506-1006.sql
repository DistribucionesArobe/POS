--
-- PostgreSQL database cluster dump
--

\restrict OB4wDv5shOWDsGRqqNe89w1B12G3xr1bR4cWUxvHSvbcfZ1t8L7beMEl9NW1Svy

SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

--
-- Roles
--

CREATE ROLE aceromax;
ALTER ROLE aceromax WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:nUw+qyTU1+CaK1ggaBNdtQ==$S993uhFN0tuO3/8mEfPMAEC72GeQVB3g2qDbYsbiEf0=:/dUSBA04TqO3ID3yekn2j0Yac174Hv785DGtisvp+P4=';

--
-- User Configurations
--








\unrestrict OB4wDv5shOWDsGRqqNe89w1B12G3xr1bR4cWUxvHSvbcfZ1t8L7beMEl9NW1Svy

--
-- Databases
--

--
-- Database "template1" dump
--

\connect template1

--
-- PostgreSQL database dump
--

\restrict etnMJ7je7nivwC7Mtn3OJzTDCWk7RurJTIvR199aWQZJtaNt4l7JinhycZaTnv4

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg13+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- PostgreSQL database dump complete
--

\unrestrict etnMJ7je7nivwC7Mtn3OJzTDCWk7RurJTIvR199aWQZJtaNt4l7JinhycZaTnv4

--
-- Database "aceromax" dump
--

--
-- PostgreSQL database dump
--

\restrict dcIKRL9mxFEBJuzAz7gGlgG7kLDioRX1iJyrJudbhRNUweZs6goaPevVJEUT1a0

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg13+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: aceromax; Type: DATABASE; Schema: -; Owner: aceromax
--

CREATE DATABASE aceromax WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.utf8';


ALTER DATABASE aceromax OWNER TO aceromax;

\unrestrict dcIKRL9mxFEBJuzAz7gGlgG7kLDioRX1iJyrJudbhRNUweZs6goaPevVJEUT1a0
\connect aceromax
\restrict dcIKRL9mxFEBJuzAz7gGlgG7kLDioRX1iJyrJudbhRNUweZs6goaPevVJEUT1a0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: aceromax
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO aceromax;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: aceromax
--

COMMENT ON SCHEMA public IS '';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: abonos_cxc; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.abonos_cxc (
    id integer NOT NULL,
    cxc_id integer NOT NULL,
    monto numeric(14,2) NOT NULL,
    fecha timestamp without time zone NOT NULL,
    forma_pago character varying(32) NOT NULL,
    referencia character varying(120),
    origen character varying(32) NOT NULL,
    notas text,
    usuario_id integer
);


ALTER TABLE public.abonos_cxc OWNER TO aceromax;

--
-- Name: abonos_cxc_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.abonos_cxc_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.abonos_cxc_id_seq OWNER TO aceromax;

--
-- Name: abonos_cxc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.abonos_cxc_id_seq OWNED BY public.abonos_cxc.id;


--
-- Name: abonos_cxp; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.abonos_cxp (
    id integer NOT NULL,
    cxp_id integer NOT NULL,
    monto numeric(14,2) NOT NULL,
    fecha timestamp without time zone NOT NULL,
    forma_pago character varying(32) NOT NULL,
    referencia character varying(120),
    notas text,
    usuario_id integer
);


ALTER TABLE public.abonos_cxp OWNER TO aceromax;

--
-- Name: abonos_cxp_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.abonos_cxp_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.abonos_cxp_id_seq OWNER TO aceromax;

--
-- Name: abonos_cxp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.abonos_cxp_id_seq OWNED BY public.abonos_cxp.id;


--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO aceromax;

--
-- Name: cfdis; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.cfdis (
    id integer NOT NULL,
    documento_venta_id integer NOT NULL,
    uuid character varying(40) NOT NULL,
    serie character varying(10) NOT NULL,
    folio character varying(20) NOT NULL,
    fecha_timbrado timestamp without time zone NOT NULL,
    rfc_emisor character varying(13) NOT NULL,
    rfc_receptor character varying(13) NOT NULL,
    total numeric(14,2) NOT NULL,
    tipo_comprobante character varying(1) NOT NULL,
    xml_url character varying(500),
    pdf_url character varying(500),
    cancelado boolean NOT NULL,
    motivo_cancelacion character varying(2),
    uuid_sustituye character varying(40),
    fecha_cancelacion timestamp without time zone,
    respuesta_pac json,
    creado_en timestamp without time zone NOT NULL
);


ALTER TABLE public.cfdis OWNER TO aceromax;

--
-- Name: cfdis_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.cfdis_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cfdis_id_seq OWNER TO aceromax;

--
-- Name: cfdis_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.cfdis_id_seq OWNED BY public.cfdis.id;


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.clientes (
    id integer NOT NULL,
    nombre character varying(255) NOT NULL,
    rfc character varying(13),
    razon_social character varying(255),
    regimen_fiscal character varying(8),
    codigo_postal character varying(5),
    uso_cfdi_default character varying(8),
    correo character varying(255),
    telefono character varying(32),
    whatsapp character varying(32),
    direccion text,
    limite_credito numeric(14,2),
    dias_credito integer NOT NULL,
    activo boolean NOT NULL,
    notas text,
    creado_en timestamp without time zone NOT NULL
);


ALTER TABLE public.clientes OWNER TO aceromax;

--
-- Name: clientes_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.clientes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clientes_id_seq OWNER TO aceromax;

--
-- Name: clientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.clientes_id_seq OWNED BY public.clientes.id;


--
-- Name: complementos_pago; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.complementos_pago (
    id integer NOT NULL,
    cfdi_origen_id integer NOT NULL,
    abono_cxc_id integer,
    uuid_complemento character varying(40) NOT NULL,
    monto_pagado numeric(14,2) NOT NULL,
    fecha_pago timestamp without time zone NOT NULL,
    forma_pago_sat character varying(2) NOT NULL,
    moneda character varying(3) NOT NULL,
    xml_url character varying(500),
    creado_en timestamp without time zone NOT NULL
);


ALTER TABLE public.complementos_pago OWNER TO aceromax;

--
-- Name: complementos_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.complementos_pago_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.complementos_pago_id_seq OWNER TO aceromax;

--
-- Name: complementos_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.complementos_pago_id_seq OWNED BY public.complementos_pago.id;


--
-- Name: compras; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.compras (
    id integer NOT NULL,
    folio_interno character varying(32) NOT NULL,
    proveedor_id integer NOT NULL,
    uuid_cfdi character varying(40),
    folio_factura_proveedor character varying(40),
    fecha_factura timestamp without time zone,
    fecha_recepcion timestamp without time zone NOT NULL,
    subtotal numeric(14,2) NOT NULL,
    iva numeric(14,2) NOT NULL,
    total numeric(14,2) NOT NULL,
    estatus character varying(16) NOT NULL,
    notas text,
    creado_en timestamp without time zone NOT NULL
);


ALTER TABLE public.compras OWNER TO aceromax;

--
-- Name: compras_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.compras_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.compras_id_seq OWNER TO aceromax;

--
-- Name: compras_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.compras_id_seq OWNED BY public.compras.id;


--
-- Name: conceptos_compra; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.conceptos_compra (
    id integer NOT NULL,
    compra_id integer NOT NULL,
    variante_id integer NOT NULL,
    descripcion character varying(500) NOT NULL,
    cantidad numeric(14,4) NOT NULL,
    costo_unitario numeric(14,4) NOT NULL,
    importe numeric(14,2) NOT NULL
);


ALTER TABLE public.conceptos_compra OWNER TO aceromax;

--
-- Name: conceptos_compra_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.conceptos_compra_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.conceptos_compra_id_seq OWNER TO aceromax;

--
-- Name: conceptos_compra_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.conceptos_compra_id_seq OWNED BY public.conceptos_compra.id;


--
-- Name: conceptos_venta; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.conceptos_venta (
    id integer NOT NULL,
    documento_id integer NOT NULL,
    variante_id integer NOT NULL,
    descripcion character varying(500) NOT NULL,
    cantidad numeric(14,4) NOT NULL,
    precio_unitario numeric(14,4) NOT NULL,
    descuento numeric(14,2) NOT NULL,
    importe numeric(14,2) NOT NULL,
    clave_prod_serv_sat character varying(8),
    clave_unidad_sat character varying(3),
    tasa_iva numeric(6,4) NOT NULL
);


ALTER TABLE public.conceptos_venta OWNER TO aceromax;

--
-- Name: conceptos_venta_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.conceptos_venta_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.conceptos_venta_id_seq OWNER TO aceromax;

--
-- Name: conceptos_venta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.conceptos_venta_id_seq OWNED BY public.conceptos_venta.id;


--
-- Name: cotizaciones; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.cotizaciones (
    id integer NOT NULL,
    folio character varying(32) NOT NULL,
    cliente_id integer,
    whatsapp_origen character varying(32),
    nombre_libre character varying(255),
    fecha timestamp without time zone NOT NULL,
    vigencia_hasta timestamp without time zone,
    conceptos json NOT NULL,
    subtotal numeric(14,2) NOT NULL,
    iva numeric(14,2) NOT NULL,
    total numeric(14,2) NOT NULL,
    estatus character varying(16) NOT NULL,
    documento_venta_id integer,
    pdf_url character varying(500),
    notas text
);


ALTER TABLE public.cotizaciones OWNER TO aceromax;

--
-- Name: cotizaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.cotizaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cotizaciones_id_seq OWNER TO aceromax;

--
-- Name: cotizaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.cotizaciones_id_seq OWNED BY public.cotizaciones.id;


--
-- Name: cuentas_por_cobrar; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.cuentas_por_cobrar (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    documento_id integer NOT NULL,
    monto_original numeric(14,2) NOT NULL,
    saldo numeric(14,2) NOT NULL,
    fecha_emision timestamp without time zone NOT NULL,
    fecha_vencimiento timestamp without time zone,
    pagado boolean NOT NULL
);


ALTER TABLE public.cuentas_por_cobrar OWNER TO aceromax;

--
-- Name: cuentas_por_cobrar_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.cuentas_por_cobrar_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cuentas_por_cobrar_id_seq OWNER TO aceromax;

--
-- Name: cuentas_por_cobrar_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.cuentas_por_cobrar_id_seq OWNED BY public.cuentas_por_cobrar.id;


--
-- Name: cuentas_por_pagar; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.cuentas_por_pagar (
    id integer NOT NULL,
    proveedor_id integer NOT NULL,
    compra_id integer NOT NULL,
    monto_original numeric(14,2) NOT NULL,
    saldo numeric(14,2) NOT NULL,
    fecha_vencimiento timestamp without time zone,
    pagado boolean NOT NULL
);


ALTER TABLE public.cuentas_por_pagar OWNER TO aceromax;

--
-- Name: cuentas_por_pagar_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.cuentas_por_pagar_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cuentas_por_pagar_id_seq OWNER TO aceromax;

--
-- Name: cuentas_por_pagar_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.cuentas_por_pagar_id_seq OWNED BY public.cuentas_por_pagar.id;


--
-- Name: documentos_venta; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.documentos_venta (
    id integer NOT NULL,
    folio character varying(32) NOT NULL,
    tipo character varying(16) NOT NULL,
    estatus character varying(16) NOT NULL,
    cliente_id integer NOT NULL,
    vendedor_id integer,
    fecha timestamp without time zone NOT NULL,
    fecha_vencimiento timestamp without time zone,
    subtotal numeric(14,2) NOT NULL,
    descuento numeric(14,2) NOT NULL,
    iva numeric(14,2) NOT NULL,
    total numeric(14,2) NOT NULL,
    forma_pago_sat character varying(2) NOT NULL,
    metodo_pago_sat character varying(3) NOT NULL,
    moneda character varying(3) NOT NULL,
    uso_cfdi character varying(8),
    factura_padre_id integer,
    factura_relacionada_id integer,
    notas text,
    creado_en timestamp without time zone NOT NULL
);


ALTER TABLE public.documentos_venta OWNER TO aceromax;

--
-- Name: documentos_venta_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.documentos_venta_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.documentos_venta_id_seq OWNER TO aceromax;

--
-- Name: documentos_venta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.documentos_venta_id_seq OWNED BY public.documentos_venta.id;


--
-- Name: movimientos_inventario; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.movimientos_inventario (
    id integer NOT NULL,
    variante_id integer NOT NULL,
    tipo character varying(32) NOT NULL,
    cantidad numeric(14,4) NOT NULL,
    costo_unitario numeric(14,4) NOT NULL,
    fecha timestamp without time zone NOT NULL,
    referencia_tipo character varying(32),
    referencia_id integer,
    usuario_id integer,
    notas text
);


ALTER TABLE public.movimientos_inventario OWNER TO aceromax;

--
-- Name: movimientos_inventario_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.movimientos_inventario_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.movimientos_inventario_id_seq OWNER TO aceromax;

--
-- Name: movimientos_inventario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.movimientos_inventario_id_seq OWNED BY public.movimientos_inventario.id;


--
-- Name: productos; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.productos (
    id integer NOT NULL,
    nombre character varying(255) NOT NULL,
    descripcion text,
    categoria character varying(120),
    marca character varying(120),
    clave_prod_serv_sat character varying(8),
    objeto_impuesto_sat character varying(2) NOT NULL,
    activo boolean NOT NULL,
    creado_en timestamp without time zone NOT NULL
);


ALTER TABLE public.productos OWNER TO aceromax;

--
-- Name: productos_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.productos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.productos_id_seq OWNER TO aceromax;

--
-- Name: productos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.productos_id_seq OWNED BY public.productos.id;


--
-- Name: proveedores; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.proveedores (
    id integer NOT NULL,
    nombre character varying(255) NOT NULL,
    rfc character varying(13),
    razon_social character varying(255),
    correo character varying(255),
    telefono character varying(32),
    direccion text,
    dias_credito integer NOT NULL,
    activo boolean NOT NULL,
    creado_en timestamp without time zone NOT NULL
);


ALTER TABLE public.proveedores OWNER TO aceromax;

--
-- Name: proveedores_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.proveedores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.proveedores_id_seq OWNER TO aceromax;

--
-- Name: proveedores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.proveedores_id_seq OWNED BY public.proveedores.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    nombre character varying(120) NOT NULL,
    password_hash character varying(255) NOT NULL,
    rol character varying(32) NOT NULL,
    activo boolean NOT NULL,
    creado_en timestamp without time zone NOT NULL
);


ALTER TABLE public.usuarios OWNER TO aceromax;

--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.usuarios_id_seq OWNER TO aceromax;

--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: variantes_producto; Type: TABLE; Schema: public; Owner: aceromax
--

CREATE TABLE public.variantes_producto (
    id integer NOT NULL,
    producto_id integer NOT NULL,
    sku character varying(64) NOT NULL,
    presentacion character varying(64) NOT NULL,
    unidad character varying(32) NOT NULL,
    clave_unidad_sat character varying(3) NOT NULL,
    precio_publico numeric(14,4) NOT NULL,
    precio_mayoreo numeric(14,4),
    cantidad_mayoreo integer NOT NULL,
    costo_promedio numeric(14,4) NOT NULL,
    stock_actual numeric(14,4) NOT NULL,
    stock_minimo numeric(14,4) NOT NULL,
    derivada_id integer,
    factor_division integer NOT NULL,
    activo boolean NOT NULL
);


ALTER TABLE public.variantes_producto OWNER TO aceromax;

--
-- Name: variantes_producto_id_seq; Type: SEQUENCE; Schema: public; Owner: aceromax
--

CREATE SEQUENCE public.variantes_producto_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.variantes_producto_id_seq OWNER TO aceromax;

--
-- Name: variantes_producto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: aceromax
--

ALTER SEQUENCE public.variantes_producto_id_seq OWNED BY public.variantes_producto.id;


--
-- Name: abonos_cxc id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.abonos_cxc ALTER COLUMN id SET DEFAULT nextval('public.abonos_cxc_id_seq'::regclass);


--
-- Name: abonos_cxp id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.abonos_cxp ALTER COLUMN id SET DEFAULT nextval('public.abonos_cxp_id_seq'::regclass);


--
-- Name: cfdis id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cfdis ALTER COLUMN id SET DEFAULT nextval('public.cfdis_id_seq'::regclass);


--
-- Name: clientes id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.clientes ALTER COLUMN id SET DEFAULT nextval('public.clientes_id_seq'::regclass);


--
-- Name: complementos_pago id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.complementos_pago ALTER COLUMN id SET DEFAULT nextval('public.complementos_pago_id_seq'::regclass);


--
-- Name: compras id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.compras ALTER COLUMN id SET DEFAULT nextval('public.compras_id_seq'::regclass);


--
-- Name: conceptos_compra id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.conceptos_compra ALTER COLUMN id SET DEFAULT nextval('public.conceptos_compra_id_seq'::regclass);


--
-- Name: conceptos_venta id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.conceptos_venta ALTER COLUMN id SET DEFAULT nextval('public.conceptos_venta_id_seq'::regclass);


--
-- Name: cotizaciones id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cotizaciones ALTER COLUMN id SET DEFAULT nextval('public.cotizaciones_id_seq'::regclass);


--
-- Name: cuentas_por_cobrar id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cuentas_por_cobrar ALTER COLUMN id SET DEFAULT nextval('public.cuentas_por_cobrar_id_seq'::regclass);


--
-- Name: cuentas_por_pagar id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cuentas_por_pagar ALTER COLUMN id SET DEFAULT nextval('public.cuentas_por_pagar_id_seq'::regclass);


--
-- Name: documentos_venta id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.documentos_venta ALTER COLUMN id SET DEFAULT nextval('public.documentos_venta_id_seq'::regclass);


--
-- Name: movimientos_inventario id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.movimientos_inventario ALTER COLUMN id SET DEFAULT nextval('public.movimientos_inventario_id_seq'::regclass);


--
-- Name: productos id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.productos ALTER COLUMN id SET DEFAULT nextval('public.productos_id_seq'::regclass);


--
-- Name: proveedores id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.proveedores ALTER COLUMN id SET DEFAULT nextval('public.proveedores_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: variantes_producto id; Type: DEFAULT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.variantes_producto ALTER COLUMN id SET DEFAULT nextval('public.variantes_producto_id_seq'::regclass);


--
-- Data for Name: abonos_cxc; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.abonos_cxc (id, cxc_id, monto, fecha, forma_pago, referencia, origen, notas, usuario_id) FROM stdin;
\.


--
-- Data for Name: abonos_cxp; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.abonos_cxp (id, cxp_id, monto, fecha, forma_pago, referencia, notas, usuario_id) FROM stdin;
\.


--
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.alembic_version (version_num) FROM stdin;
51e12d5fa70d
\.


--
-- Data for Name: cfdis; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.cfdis (id, documento_venta_id, uuid, serie, folio, fecha_timbrado, rfc_emisor, rfc_receptor, total, tipo_comprobante, xml_url, pdf_url, cancelado, motivo_cancelacion, uuid_sustituye, fecha_cancelacion, respuesta_pac, creado_en) FROM stdin;
\.


--
-- Data for Name: clientes; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.clientes (id, nombre, rfc, razon_social, regimen_fiscal, codigo_postal, uso_cfdi_default, correo, telefono, whatsapp, direccion, limite_credito, dias_credito, activo, notas, creado_en) FROM stdin;
1	Publico en general	XAXX010101000	PUBLICO EN GENERAL	616	00000	\N	\N	\N	\N	\N	\N	0	t	\N	2026-05-06 00:31:02.95413
2	Construcciones Perez SA	CPE850101AB1	CONSTRUCCIONES PEREZ SA DE CV	601	06000	\N	\N	\N	+5215555551234	\N	\N	30	t	\N	2026-05-06 00:31:02.961611
5	Cliente prueba PF	URE180429TM6	CLIENTE PRUEBA PF	612	87020	\N	\N	\N	\N	\N	\N	0	t	\N	2026-05-06 14:48:17.016671
6	EDGAR ALEJANDRO ROBLEDO BELTRAN	ROBE920216AT2	EDGAR ALEJANDRO ROBLEDO BELTRAN	612	87020	G01	ACERO2@ACEROMAX.MX		8118001161		\N	30	t		2026-05-06 15:21:06.773749
\.


--
-- Data for Name: complementos_pago; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.complementos_pago (id, cfdi_origen_id, abono_cxc_id, uuid_complemento, monto_pagado, fecha_pago, forma_pago_sat, moneda, xml_url, creado_en) FROM stdin;
\.


--
-- Data for Name: compras; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.compras (id, folio_interno, proveedor_id, uuid_cfdi, folio_factura_proveedor, fecha_factura, fecha_recepcion, subtotal, iva, total, estatus, notas, creado_en) FROM stdin;
\.


--
-- Data for Name: conceptos_compra; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.conceptos_compra (id, compra_id, variante_id, descripcion, cantidad, costo_unitario, importe) FROM stdin;
\.


--
-- Data for Name: conceptos_venta; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.conceptos_venta (id, documento_id, variante_id, descripcion, cantidad, precio_unitario, descuento, importe, clave_prod_serv_sat, clave_unidad_sat, tasa_iva) FROM stdin;
1	1	3	Cemento gris CPC 30R - Bulto 50kg	4.0000	290.0000	0.00	1160.00	30111601	XBG	0.1600
2	2	3	Cemento gris CPC 30R - Bulto 50kg	4.0000	290.0000	0.00	1160.00	30111601	XBG	0.1600
3	3	3	Cemento gris CPC 30R - Bulto 50kg	13.0000	290.0000	0.00	3770.00	30111601	XBG	0.1600
4	4	3	Cemento gris CPC 30R - Bulto 50kg	3.0000	290.0000	0.00	870.00	30111601	XBG	0.1600
5	4	1	Varilla corrugada 3/8 - Entera 12m	2.0000	180.0000	0.00	360.00	30102404	H87	0.1600
6	5	1	Varilla corrugada 3/8 - Entera 12m	13.0000	180.0000	0.00	2340.00	30102404	H87	0.1600
7	6	3	Cemento gris CPC 30R - Bulto 50kg	3.0000	290.0000	0.00	870.00	30111601	XBG	0.1600
8	7	3	Cemento gris CPC 30R - Bulto 50kg	1.0000	290.0000	0.00	290.00	30111601	XBG	0.1600
9	8	1	Varilla corrugada 3/8 - Entera 12m	1.0000	180.0000	0.00	180.00	30102404	H87	0.1600
10	9	3	Cemento gris CPC 30R - Bulto 50kg	1.0000	290.0000	0.00	290.00	30111601	XBG	0.1600
12	11	3	Cemento gris CPC 30R - Bulto 50kg	18.0000	290.0000	0.00	5220.00	30111601	XBG	0.1600
\.


--
-- Data for Name: cotizaciones; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.cotizaciones (id, folio, cliente_id, whatsapp_origen, nombre_libre, fecha, vigencia_hasta, conceptos, subtotal, iva, total, estatus, documento_venta_id, pdf_url, notas) FROM stdin;
\.


--
-- Data for Name: cuentas_por_cobrar; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.cuentas_por_cobrar (id, cliente_id, documento_id, monto_original, saldo, fecha_emision, fecha_vencimiento, pagado) FROM stdin;
1	1	3	4373.20	4373.20	2026-05-06 00:33:39.709731	\N	f
2	1	4	1426.80	1426.80	2026-05-06 00:34:49.140122	\N	f
\.


--
-- Data for Name: cuentas_por_pagar; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.cuentas_por_pagar (id, proveedor_id, compra_id, monto_original, saldo, fecha_vencimiento, pagado) FROM stdin;
\.


--
-- Data for Name: documentos_venta; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.documentos_venta (id, folio, tipo, estatus, cliente_id, vendedor_id, fecha, fecha_vencimiento, subtotal, descuento, iva, total, forma_pago_sat, metodo_pago_sat, moneda, uso_cfdi, factura_padre_id, factura_relacionada_id, notas, creado_en) FROM stdin;
1	T-000001	TICKET	CONFIRMADO	1	\N	2026-05-06 00:32:35.7278	\N	1160.00	0.00	185.60	1345.60	01	PUE	MXN	\N	\N	\N	\N	2026-05-06 00:32:35.736144
2	T-000002	TICKET	CONFIRMADO	1	\N	2026-05-06 00:33:14.544974	\N	1160.00	0.00	185.60	1345.60	01	PUE	MXN	\N	\N	\N	\N	2026-05-06 00:33:14.54759
3	R-000001	REMISION	CONFIRMADO	1	\N	2026-05-06 00:33:39.709731	\N	3770.00	0.00	603.20	4373.20	01	PPD	MXN	\N	\N	\N	\N	2026-05-06 00:33:39.711301
4	R-000002	REMISION	CONFIRMADO	1	\N	2026-05-06 00:34:49.140122	\N	1230.00	0.00	196.80	1426.80	01	PPD	MXN	\N	\N	\N	\N	2026-05-06 00:34:49.142955
5	T-000003	TICKET	CONFIRMADO	1	\N	2026-05-06 00:38:46.165706	\N	2340.00	0.00	374.40	2714.40	01	PUE	MXN	\N	\N	\N	\N	2026-05-06 00:38:46.171213
6	T-000004	TICKET	CONFIRMADO	1	\N	2026-05-06 00:43:36.763124	\N	870.00	0.00	139.20	1009.20	01	PUE	MXN	\N	\N	\N	\N	2026-05-06 00:43:36.765885
7	T-000005	TICKET	CONFIRMADO	1	\N	2026-05-06 00:44:47.794432	\N	290.00	0.00	46.40	336.40	01	PUE	MXN	\N	\N	\N	\N	2026-05-06 00:44:47.800892
8	T-000006	TICKET	CONFIRMADO	1	\N	2026-05-06 00:47:15.23721	\N	180.00	0.00	28.80	208.80	01	PUE	MXN	\N	\N	\N	\N	2026-05-06 00:47:15.240338
9	T-000007	TICKET	CONFIRMADO	1	\N	2026-05-06 00:48:06.664564	\N	290.00	0.00	46.40	336.40	01	PUE	MXN	\N	\N	\N	\N	2026-05-06 00:48:06.672889
11	F-000001	FACTURA	CONFIRMADO	1	\N	2026-05-06 14:52:45.897945	\N	5220.00	0.00	835.20	6055.20	03	PUE	MXN	\N	\N	\N	\N	2026-05-06 14:52:45.907662
\.


--
-- Data for Name: movimientos_inventario; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.movimientos_inventario (id, variante_id, tipo, cantidad, costo_unitario, fecha, referencia_tipo, referencia_id, usuario_id, notas) FROM stdin;
1	1	ENTRADA_COMPRA	50.0000	140.0000	2026-05-06 00:31:02.973352	\N	\N	\N	Carga inicial
2	2	ENTRADA_COMPRA	80.0000	70.0000	2026-05-06 00:31:02.97553	\N	\N	\N	Carga inicial
3	3	ENTRADA_COMPRA	200.0000	240.0000	2026-05-06 00:31:02.97644	\N	\N	\N	Carga inicial
4	3	SALIDA_VENTA	-4.0000	0.0000	2026-05-06 00:32:35.742904	DOCUMENTO_VENTA	1	\N	\N
5	3	SALIDA_VENTA	-4.0000	0.0000	2026-05-06 00:33:14.554132	DOCUMENTO_VENTA	2	\N	\N
6	3	SALIDA_REMISION	-13.0000	0.0000	2026-05-06 00:33:39.717611	DOCUMENTO_VENTA	3	\N	\N
7	3	SALIDA_REMISION	-3.0000	0.0000	2026-05-06 00:34:49.170994	DOCUMENTO_VENTA	4	\N	\N
8	1	SALIDA_REMISION	-2.0000	0.0000	2026-05-06 00:34:49.177193	DOCUMENTO_VENTA	4	\N	\N
9	1	SALIDA_VENTA	-13.0000	0.0000	2026-05-06 00:38:46.189363	DOCUMENTO_VENTA	5	\N	\N
10	3	SALIDA_VENTA	-3.0000	0.0000	2026-05-06 00:43:36.784833	DOCUMENTO_VENTA	6	\N	\N
11	3	SALIDA_VENTA	-1.0000	0.0000	2026-05-06 00:44:47.811564	DOCUMENTO_VENTA	7	\N	\N
12	1	SALIDA_VENTA	-1.0000	0.0000	2026-05-06 00:47:15.244627	DOCUMENTO_VENTA	8	\N	\N
13	3	SALIDA_VENTA	-1.0000	0.0000	2026-05-06 00:48:06.694738	DOCUMENTO_VENTA	9	\N	\N
14	3	SALIDA_VENTA	-18.0000	0.0000	2026-05-06 14:52:45.929803	DOCUMENTO_VENTA	11	\N	\N
\.


--
-- Data for Name: productos; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.productos (id, nombre, descripcion, categoria, marca, clave_prod_serv_sat, objeto_impuesto_sat, activo, creado_en) FROM stdin;
1	Varilla corrugada 3/8	\N	Aceros	\N	30102404	02	t	2026-05-06 00:31:02.962672
2	Cemento gris CPC 30R	\N	Cementos	\N	30111601	02	t	2026-05-06 00:31:02.962674
4	Tablaroca ultralight USG	\N	Tablaroca	USG		02	t	2026-05-06 00:54:22.48179
\.


--
-- Data for Name: proveedores; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.proveedores (id, nombre, rfc, razon_social, correo, telefono, direccion, dias_credito, activo, creado_en) FROM stdin;
\.


--
-- Data for Name: usuarios; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.usuarios (id, email, nombre, password_hash, rol, activo, creado_en) FROM stdin;
1	admin@aceromax.mx	Admin Aceromax	$2b$12$lXKHlbS3ioQJ56vDOMfvN.sSn0y1dF55nCDwBbPEChXc3wiUydhOC	admin	t	2026-05-06 00:31:02.964959
\.


--
-- Data for Name: variantes_producto; Type: TABLE DATA; Schema: public; Owner: aceromax
--

COPY public.variantes_producto (id, producto_id, sku, presentacion, unidad, clave_unidad_sat, precio_publico, precio_mayoreo, cantidad_mayoreo, costo_promedio, stock_actual, stock_minimo, derivada_id, factor_division, activo) FROM stdin;
2	1	VAR-3-8-6M	Mitad 6m	PZA	H87	95.0000	\N	0	70.0000	80.0000	0.0000	\N	1	t
1	1	VAR-3-8-12M	Entera 12m	PZA	H87	180.0000	\N	0	140.0000	34.0000	0.0000	2	2	t
4	4	TBL1244	Default	PZA	H87	240.0000	\N	0	170.0000	0.0000	0.0000	\N	1	t
3	2	CEM-CPC30R-50	Bulto 50kg	BULTO	XBG	290.0000	\N	0	240.0000	153.0000	0.0000	\N	1	t
\.


--
-- Name: abonos_cxc_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.abonos_cxc_id_seq', 1, false);


--
-- Name: abonos_cxp_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.abonos_cxp_id_seq', 1, false);


--
-- Name: cfdis_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.cfdis_id_seq', 1, false);


--
-- Name: clientes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.clientes_id_seq', 6, true);


--
-- Name: complementos_pago_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.complementos_pago_id_seq', 1, false);


--
-- Name: compras_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.compras_id_seq', 1, false);


--
-- Name: conceptos_compra_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.conceptos_compra_id_seq', 1, false);


--
-- Name: conceptos_venta_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.conceptos_venta_id_seq', 12, true);


--
-- Name: cotizaciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.cotizaciones_id_seq', 1, false);


--
-- Name: cuentas_por_cobrar_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.cuentas_por_cobrar_id_seq', 2, true);


--
-- Name: cuentas_por_pagar_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.cuentas_por_pagar_id_seq', 1, false);


--
-- Name: documentos_venta_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.documentos_venta_id_seq', 11, true);


--
-- Name: movimientos_inventario_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.movimientos_inventario_id_seq', 14, true);


--
-- Name: productos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.productos_id_seq', 4, true);


--
-- Name: proveedores_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.proveedores_id_seq', 1, false);


--
-- Name: usuarios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.usuarios_id_seq', 1, true);


--
-- Name: variantes_producto_id_seq; Type: SEQUENCE SET; Schema: public; Owner: aceromax
--

SELECT pg_catalog.setval('public.variantes_producto_id_seq', 4, true);


--
-- Name: abonos_cxc abonos_cxc_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.abonos_cxc
    ADD CONSTRAINT abonos_cxc_pkey PRIMARY KEY (id);


--
-- Name: abonos_cxp abonos_cxp_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.abonos_cxp
    ADD CONSTRAINT abonos_cxp_pkey PRIMARY KEY (id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: cfdis cfdis_documento_venta_id_key; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cfdis
    ADD CONSTRAINT cfdis_documento_venta_id_key UNIQUE (documento_venta_id);


--
-- Name: cfdis cfdis_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cfdis
    ADD CONSTRAINT cfdis_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: complementos_pago complementos_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.complementos_pago
    ADD CONSTRAINT complementos_pago_pkey PRIMARY KEY (id);


--
-- Name: complementos_pago complementos_pago_uuid_complemento_key; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.complementos_pago
    ADD CONSTRAINT complementos_pago_uuid_complemento_key UNIQUE (uuid_complemento);


--
-- Name: compras compras_folio_interno_key; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT compras_folio_interno_key UNIQUE (folio_interno);


--
-- Name: compras compras_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT compras_pkey PRIMARY KEY (id);


--
-- Name: compras compras_uuid_cfdi_key; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT compras_uuid_cfdi_key UNIQUE (uuid_cfdi);


--
-- Name: conceptos_compra conceptos_compra_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.conceptos_compra
    ADD CONSTRAINT conceptos_compra_pkey PRIMARY KEY (id);


--
-- Name: conceptos_venta conceptos_venta_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.conceptos_venta
    ADD CONSTRAINT conceptos_venta_pkey PRIMARY KEY (id);


--
-- Name: cotizaciones cotizaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_pkey PRIMARY KEY (id);


--
-- Name: cuentas_por_cobrar cuentas_por_cobrar_documento_id_key; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cuentas_por_cobrar
    ADD CONSTRAINT cuentas_por_cobrar_documento_id_key UNIQUE (documento_id);


--
-- Name: cuentas_por_cobrar cuentas_por_cobrar_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cuentas_por_cobrar
    ADD CONSTRAINT cuentas_por_cobrar_pkey PRIMARY KEY (id);


--
-- Name: cuentas_por_pagar cuentas_por_pagar_compra_id_key; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT cuentas_por_pagar_compra_id_key UNIQUE (compra_id);


--
-- Name: cuentas_por_pagar cuentas_por_pagar_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT cuentas_por_pagar_pkey PRIMARY KEY (id);


--
-- Name: documentos_venta documentos_venta_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.documentos_venta
    ADD CONSTRAINT documentos_venta_pkey PRIMARY KEY (id);


--
-- Name: movimientos_inventario movimientos_inventario_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_pkey PRIMARY KEY (id);


--
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (id);


--
-- Name: proveedores proveedores_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: variantes_producto variantes_producto_pkey; Type: CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.variantes_producto
    ADD CONSTRAINT variantes_producto_pkey PRIMARY KEY (id);


--
-- Name: ix_abonos_cxc_cxc_id; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_abonos_cxc_cxc_id ON public.abonos_cxc USING btree (cxc_id);


--
-- Name: ix_abonos_cxp_cxp_id; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_abonos_cxp_cxp_id ON public.abonos_cxp USING btree (cxp_id);


--
-- Name: ix_cfdis_uuid; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE UNIQUE INDEX ix_cfdis_uuid ON public.cfdis USING btree (uuid);


--
-- Name: ix_clientes_nombre; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_clientes_nombre ON public.clientes USING btree (nombre);


--
-- Name: ix_clientes_rfc; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_clientes_rfc ON public.clientes USING btree (rfc);


--
-- Name: ix_clientes_whatsapp; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_clientes_whatsapp ON public.clientes USING btree (whatsapp);


--
-- Name: ix_complementos_pago_cfdi_origen_id; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_complementos_pago_cfdi_origen_id ON public.complementos_pago USING btree (cfdi_origen_id);


--
-- Name: ix_compras_proveedor_id; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_compras_proveedor_id ON public.compras USING btree (proveedor_id);


--
-- Name: ix_conceptos_compra_compra_id; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_conceptos_compra_compra_id ON public.conceptos_compra USING btree (compra_id);


--
-- Name: ix_conceptos_venta_documento_id; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_conceptos_venta_documento_id ON public.conceptos_venta USING btree (documento_id);


--
-- Name: ix_cotizaciones_cliente_id; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_cotizaciones_cliente_id ON public.cotizaciones USING btree (cliente_id);


--
-- Name: ix_cotizaciones_folio; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE UNIQUE INDEX ix_cotizaciones_folio ON public.cotizaciones USING btree (folio);


--
-- Name: ix_cuentas_por_cobrar_cliente_id; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_cuentas_por_cobrar_cliente_id ON public.cuentas_por_cobrar USING btree (cliente_id);


--
-- Name: ix_cuentas_por_pagar_proveedor_id; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_cuentas_por_pagar_proveedor_id ON public.cuentas_por_pagar USING btree (proveedor_id);


--
-- Name: ix_documentos_venta_cliente_id; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_documentos_venta_cliente_id ON public.documentos_venta USING btree (cliente_id);


--
-- Name: ix_documentos_venta_factura_padre_id; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_documentos_venta_factura_padre_id ON public.documentos_venta USING btree (factura_padre_id);


--
-- Name: ix_documentos_venta_fecha; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_documentos_venta_fecha ON public.documentos_venta USING btree (fecha);


--
-- Name: ix_documentos_venta_folio; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE UNIQUE INDEX ix_documentos_venta_folio ON public.documentos_venta USING btree (folio);


--
-- Name: ix_docventa_cliente_estatus; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_docventa_cliente_estatus ON public.documentos_venta USING btree (cliente_id, estatus);


--
-- Name: ix_docventa_tipo_fecha; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_docventa_tipo_fecha ON public.documentos_venta USING btree (tipo, fecha);


--
-- Name: ix_mov_variante_fecha; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_mov_variante_fecha ON public.movimientos_inventario USING btree (variante_id, fecha);


--
-- Name: ix_movimientos_inventario_fecha; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_movimientos_inventario_fecha ON public.movimientos_inventario USING btree (fecha);


--
-- Name: ix_movimientos_inventario_variante_id; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_movimientos_inventario_variante_id ON public.movimientos_inventario USING btree (variante_id);


--
-- Name: ix_productos_categoria; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_productos_categoria ON public.productos USING btree (categoria);


--
-- Name: ix_productos_nombre; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_productos_nombre ON public.productos USING btree (nombre);


--
-- Name: ix_proveedores_nombre; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE INDEX ix_proveedores_nombre ON public.proveedores USING btree (nombre);


--
-- Name: ix_usuarios_email; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE UNIQUE INDEX ix_usuarios_email ON public.usuarios USING btree (email);


--
-- Name: ix_variantes_producto_sku; Type: INDEX; Schema: public; Owner: aceromax
--

CREATE UNIQUE INDEX ix_variantes_producto_sku ON public.variantes_producto USING btree (sku);


--
-- Name: abonos_cxc abonos_cxc_cxc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.abonos_cxc
    ADD CONSTRAINT abonos_cxc_cxc_id_fkey FOREIGN KEY (cxc_id) REFERENCES public.cuentas_por_cobrar(id) ON DELETE CASCADE;


--
-- Name: abonos_cxc abonos_cxc_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.abonos_cxc
    ADD CONSTRAINT abonos_cxc_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: abonos_cxp abonos_cxp_cxp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.abonos_cxp
    ADD CONSTRAINT abonos_cxp_cxp_id_fkey FOREIGN KEY (cxp_id) REFERENCES public.cuentas_por_pagar(id) ON DELETE CASCADE;


--
-- Name: abonos_cxp abonos_cxp_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.abonos_cxp
    ADD CONSTRAINT abonos_cxp_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: cfdis cfdis_documento_venta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cfdis
    ADD CONSTRAINT cfdis_documento_venta_id_fkey FOREIGN KEY (documento_venta_id) REFERENCES public.documentos_venta(id);


--
-- Name: complementos_pago complementos_pago_abono_cxc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.complementos_pago
    ADD CONSTRAINT complementos_pago_abono_cxc_id_fkey FOREIGN KEY (abono_cxc_id) REFERENCES public.abonos_cxc(id);


--
-- Name: complementos_pago complementos_pago_cfdi_origen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.complementos_pago
    ADD CONSTRAINT complementos_pago_cfdi_origen_id_fkey FOREIGN KEY (cfdi_origen_id) REFERENCES public.cfdis(id);


--
-- Name: compras compras_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT compras_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id);


--
-- Name: conceptos_compra conceptos_compra_compra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.conceptos_compra
    ADD CONSTRAINT conceptos_compra_compra_id_fkey FOREIGN KEY (compra_id) REFERENCES public.compras(id) ON DELETE CASCADE;


--
-- Name: conceptos_compra conceptos_compra_variante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.conceptos_compra
    ADD CONSTRAINT conceptos_compra_variante_id_fkey FOREIGN KEY (variante_id) REFERENCES public.variantes_producto(id);


--
-- Name: conceptos_venta conceptos_venta_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.conceptos_venta
    ADD CONSTRAINT conceptos_venta_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos_venta(id) ON DELETE CASCADE;


--
-- Name: conceptos_venta conceptos_venta_variante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.conceptos_venta
    ADD CONSTRAINT conceptos_venta_variante_id_fkey FOREIGN KEY (variante_id) REFERENCES public.variantes_producto(id);


--
-- Name: cotizaciones cotizaciones_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: cotizaciones cotizaciones_documento_venta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_documento_venta_id_fkey FOREIGN KEY (documento_venta_id) REFERENCES public.documentos_venta(id);


--
-- Name: cuentas_por_cobrar cuentas_por_cobrar_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cuentas_por_cobrar
    ADD CONSTRAINT cuentas_por_cobrar_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: cuentas_por_cobrar cuentas_por_cobrar_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cuentas_por_cobrar
    ADD CONSTRAINT cuentas_por_cobrar_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos_venta(id);


--
-- Name: cuentas_por_pagar cuentas_por_pagar_compra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT cuentas_por_pagar_compra_id_fkey FOREIGN KEY (compra_id) REFERENCES public.compras(id);


--
-- Name: cuentas_por_pagar cuentas_por_pagar_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT cuentas_por_pagar_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id);


--
-- Name: documentos_venta documentos_venta_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.documentos_venta
    ADD CONSTRAINT documentos_venta_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: documentos_venta documentos_venta_factura_padre_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.documentos_venta
    ADD CONSTRAINT documentos_venta_factura_padre_id_fkey FOREIGN KEY (factura_padre_id) REFERENCES public.documentos_venta(id);


--
-- Name: documentos_venta documentos_venta_factura_relacionada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.documentos_venta
    ADD CONSTRAINT documentos_venta_factura_relacionada_id_fkey FOREIGN KEY (factura_relacionada_id) REFERENCES public.documentos_venta(id);


--
-- Name: documentos_venta documentos_venta_vendedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.documentos_venta
    ADD CONSTRAINT documentos_venta_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES public.usuarios(id);


--
-- Name: movimientos_inventario movimientos_inventario_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: movimientos_inventario movimientos_inventario_variante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_variante_id_fkey FOREIGN KEY (variante_id) REFERENCES public.variantes_producto(id);


--
-- Name: variantes_producto variantes_producto_derivada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.variantes_producto
    ADD CONSTRAINT variantes_producto_derivada_id_fkey FOREIGN KEY (derivada_id) REFERENCES public.variantes_producto(id);


--
-- Name: variantes_producto variantes_producto_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aceromax
--

ALTER TABLE ONLY public.variantes_producto
    ADD CONSTRAINT variantes_producto_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: aceromax
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict dcIKRL9mxFEBJuzAz7gGlgG7kLDioRX1iJyrJudbhRNUweZs6goaPevVJEUT1a0

--
-- Database "postgres" dump
--

\connect postgres

--
-- PostgreSQL database dump
--

\restrict syg9cVHSewNfOUy61glasnXZ4yDpvTnSH8sjroL5QIpnJb9yQFYx1hCV37tPezN

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg13+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- PostgreSQL database dump complete
--

\unrestrict syg9cVHSewNfOUy61glasnXZ4yDpvTnSH8sjroL5QIpnJb9yQFYx1hCV37tPezN

--
-- PostgreSQL database cluster dump complete
--

