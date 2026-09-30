"""Modulo Gmail Sync - conexion OAuth + log de facturas importadas."""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Numeric, DateTime, ForeignKey, Boolean, Text,
    UniqueConstraint, Index,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.db import Base


class GmailConexion(Base):
    """Una conexion Gmail por empresa (multi-tenant SaaS)."""
    __tablename__ = "gmail_conexiones"

    id = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, unique=True, index=True)
    email_conectado = Column(String(255), nullable=False)
    # refresh_token encriptado con Fernet (GMAIL_ENCRYPTION_KEY)
    refresh_token_encrypted = Column(Text, nullable=False)
    access_token = Column(Text)
    access_token_expira_en = Column(DateTime)
    scopes = Column(Text, nullable=False, default="gmail.readonly")
    ultima_sync_en = Column(DateTime)
    # ID del ultimo mensaje procesado (para incremental sync via Gmail historyId futuro)
    ultimo_mensaje_procesado = Column(String(50))
    activo = Column(Boolean, nullable=False, default=True)
    # modo: aprobacion | auto
    modo = Column(String(20), nullable=False, default="aprobacion")
    frecuencia_min = Column(Integer, nullable=False, default=60)
    # filtros JSON: {"solo_ppd": true, "excluir_rfcs": [...], "excluir_dominios": [...]}
    filtros = Column(JSONB)
    creado_por = Column(Integer, ForeignKey("usuarios.id"))
    creado_en = Column(DateTime, nullable=False, default=datetime.utcnow)
    actualizado_en = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class GmailImportacionLog(Base):
    """Cada CFDI detectado en un correo procesado. Un registro por mensaje unico."""
    __tablename__ = "gmail_importacion_log"
    __table_args__ = (
        UniqueConstraint("empresa_id", "mensaje_gmail_id", name="uq_gmail_log_msg"),
        Index("ix_gmail_log_empresa_estado", "empresa_id", "estado"),
    )

    id = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False)
    mensaje_gmail_id = Column(String(50), nullable=False)
    thread_gmail_id = Column(String(50))
    remitente_email = Column(String(255))
    remitente_nombre = Column(String(255))
    asunto = Column(String(500))
    fecha_correo = Column(DateTime)
    xml_uuid = Column(String(50))
    xml_folio = Column(String(50))
    xml_serie = Column(String(20))
    proveedor_rfc = Column(String(15))
    proveedor_nombre_xml = Column(String(255))
    total = Column(Numeric(14, 2))
    subtotal = Column(Numeric(14, 2))
    iva = Column(Numeric(14, 2))
    metodo_pago_sat = Column(String(5))  # PUE | PPD
    forma_pago_sat = Column(String(5))
    moneda = Column(String(3))
    fecha_emision = Column(DateTime)
    tipo_comprobante = Column(String(2))  # I | E | P | N
    xml_raw = Column(Text)  # se guarda para auditoria / reprocesar
    proveedor_id = Column(Integer, ForeignKey("proveedores.id"))
    cxp_id = Column(Integer)  # FK a cuentas_por_pagar sin constraint (evitar circular)
    # estado: pendiente | importado | rechazado | error | descartado
    estado = Column(String(30), nullable=False, default="pendiente")
    razon_descartado = Column(String(255))
    procesado_en = Column(DateTime, nullable=False, default=datetime.utcnow)
    aprobado_por = Column(Integer, ForeignKey("usuarios.id"))
    aprobado_en = Column(DateTime)
