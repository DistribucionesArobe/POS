"""Modulo Mensajes Ventas (Inbox) - integracion WhatsApp Cloud API + Facebook Messenger.

Estructura:
- CanalMensajeria: cada numero WA o pagina FB. Multi-empresa.
- Conversacion: hilo con un contacto externo. Se puede asignar a un agente.
- Mensaje: cada texto/adjunto in/out o nota interna.
- PlantillaWa: plantillas pre-aprobadas de Meta para mensajes proactivos.
"""
from datetime import datetime
from sqlalchemy import (
    String, Boolean, DateTime, Integer, Text, ForeignKey, Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class CanalMensajeria(Base):
    """Un canal de mensajeria (numero WA o pagina FB) por empresa.
    Cada empresa puede tener varios canales."""
    __tablename__ = "canales_mensajeria"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(
        ForeignKey("empresas.id"), index=True
    )

    # 'whatsapp' o 'facebook'
    tipo: Mapped[str] = mapped_column(String(16), index=True)

    # Nombre descriptivo para la UI, ej: "WhatsApp Ventas Aceromax"
    nombre: Mapped[str] = mapped_column(String(120))

    # ID del canal en Meta:
    #  - Para WA: phone_number_id (numero largo)
    #  - Para FB: page_id
    externo_id: Mapped[str] = mapped_column(String(120), index=True)

    # Access token largo (Bearer) de Meta Graph API. Se guarda encriptado
    # en un futuro; por ahora en texto claro para MVP.
    access_token: Mapped[str] = mapped_column(Text)

    # Verify token que definimos nosotros y ponemos en Meta developer
    # para validar el webhook GET al configurarlo.
    verify_token: Mapped[str] = mapped_column(String(64))

    # WABA ID (WhatsApp Business Account ID) - solo aplica a WA
    waba_id: Mapped[str | None] = mapped_column(String(120), nullable=True)

    activo: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    conversaciones: Mapped[list["Conversacion"]] = relationship(back_populates="canal")


class Conversacion(Base):
    """Hilo de mensajes con un contacto externo (telefono WA o PSID FB)."""
    __tablename__ = "conversaciones"
    __table_args__ = (
        Index("ix_conv_empresa_estado_ult", "empresa_id", "estado", "ultimo_mensaje_en"),
        Index("ix_conv_canal_contacto", "canal_id", "contacto_externo"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(
        ForeignKey("empresas.id"), index=True
    )
    canal_id: Mapped[int] = mapped_column(
        ForeignKey("canales_mensajeria.id"), index=True
    )

    # Identificador del contacto en el canal:
    # WA: numero E.164 sin '+' (ej. 528341234567)
    # FB: PSID del usuario
    contacto_externo: Mapped[str] = mapped_column(String(64), index=True)

    # Nombre que llegó de Meta (perfil de WA o de FB)
    contacto_nombre: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Si logramos matchear el contacto con un Cliente del POS por telefono
    cliente_id: Mapped[int | None] = mapped_column(
        ForeignKey("clientes.id"), nullable=True, index=True
    )

    # Agente asignado (usuario del sistema). Nullable si nadie tomó
    agente_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True, index=True
    )

    # 'nueva' | 'en_curso' | 'resuelta' | 'archivada'
    estado: Mapped[str] = mapped_column(String(16), default="nueva", index=True)

    # Para ordenar la lista y mostrar preview
    ultimo_mensaje_en: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )
    ultimo_mensaje_preview: Mapped[str | None] = mapped_column(
        String(200), nullable=True
    )
    # 'in' = el cliente escribió | 'out' = un agente respondió
    ultimo_mensaje_direccion: Mapped[str] = mapped_column(String(4), default="in")

    # Contador de mensajes no leídos por el agente asignado (o cualquiera)
    no_leidos: Mapped[int] = mapped_column(Integer, default=0)

    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    canal: Mapped[CanalMensajeria] = relationship(back_populates="conversaciones")
    mensajes: Mapped[list["Mensaje"]] = relationship(
        back_populates="conversacion", cascade="all, delete-orphan",
        order_by="Mensaje.creado_en",
    )


class Mensaje(Base):
    """Cada mensaje individual: texto entrante, saliente, o nota interna."""
    __tablename__ = "mensajes_inbox"
    __table_args__ = (
        Index("ix_msg_conv_fecha", "conversacion_id", "creado_en"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    conversacion_id: Mapped[int] = mapped_column(
        ForeignKey("conversaciones.id", ondelete="CASCADE"), index=True
    )

    # 'in' = del cliente | 'out' = del agente | 'nota' = nota interna invisible al cliente
    direccion: Mapped[str] = mapped_column(String(8), index=True)

    # Tipo: 'texto' | 'imagen' | 'audio' | 'video' | 'documento' | 'ubicacion' | 'plantilla'
    tipo: Mapped[str] = mapped_column(String(16), default="texto")

    # Contenido de texto o caption del adjunto
    contenido: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Adjunto (si aplica)
    adjunto_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    adjunto_mime: Mapped[str | None] = mapped_column(String(64), nullable=True)
    adjunto_nombre: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # ID del mensaje en Meta (wamid) - para trackear estados y evitar duplicados
    externo_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    # Estado del mensaje out: 'enviando' | 'enviado' | 'entregado' | 'leido' | 'error'
    # Para in: siempre 'entregado' (ya llegó)
    estado: Mapped[str] = mapped_column(String(16), default="enviado")
    error_detalle: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Agente que envió (para out y nota)
    agente_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )

    creado_en: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )

    conversacion: Mapped[Conversacion] = relationship(back_populates="mensajes")


class PlantillaWa(Base):
    """Plantillas pre-aprobadas de Meta para mensajes proactivos (fuera de 24h)."""
    __tablename__ = "plantillas_wa"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(
        ForeignKey("empresas.id"), index=True
    )
    canal_id: Mapped[int] = mapped_column(
        ForeignKey("canales_mensajeria.id"), index=True
    )

    # Nombre exacto en Meta (snake_case, sin acentos)
    nombre: Mapped[str] = mapped_column(String(120), index=True)

    # 'es' o 'es_MX'
    idioma: Mapped[str] = mapped_column(String(8), default="es_MX")

    # 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
    categoria: Mapped[str] = mapped_column(String(32), default="UTILITY")

    # Cuerpo de la plantilla (con placeholders {{1}}, {{2}}...)
    contenido: Mapped[str] = mapped_column(Text)

    # 'pendiente' | 'aprobada' | 'rechazada'
    estado: Mapped[str] = mapped_column(String(16), default="pendiente")

    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
