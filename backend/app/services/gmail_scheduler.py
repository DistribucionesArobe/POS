"""Scheduler que corre Gmail sync automatico cada N minutos para todas
las empresas con conexion activa.

Usa APScheduler dentro del backend (no requiere servicio Render extra).
Arranca en on_startup de FastAPI.
"""
import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import (
    GmailConexion, GmailImportacionLog, Empresa, Proveedor,
)
from app.services import gmail_sync_service as svc

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _sync_una_empresa(db: Session, conn: GmailConexion) -> dict:
    """Corre sync para una sola empresa. Regresa stats."""
    empresa = db.get(Empresa, conn.empresa_id)
    if not empresa:
        return {"skip": "empresa no existe"}

    receptor_rfc = empresa.rfc

    # Refresh token si necesario
    if not conn.access_token or not conn.access_token_expira_en or \
       datetime.utcnow() >= conn.access_token_expira_en:
        refresh = svc.desencriptar_token(conn.refresh_token_encrypted)
        tokens = svc.refresh_access_token(refresh)
        conn.access_token = tokens["access_token"]
        conn.access_token_expira_en = datetime.utcnow() + timedelta(
            seconds=tokens.get("expires_in", 3600) - 60
        )
        db.commit()

    access_token = conn.access_token
    stats = {
        "empresa": empresa.nombre, "buscados": 0, "sin_xml": 0,
        "ya_procesados": 0, "descartados": 0,
        "guardados_pendientes": 0, "auto_importados": 0, "errores": 0,
    }

    # Sync incremental: si hay ultima_sync usar 2 dias atras (overlap seguro)
    # si no, primera vez = 1 dia
    dias = 2 if conn.ultima_sync_en else 1
    mensajes = svc.buscar_mensajes_con_xml(access_token, dias_atras=dias)
    stats["buscados"] = len(mensajes)

    for m in mensajes:
        msg_id = m["id"]
        exists = db.query(GmailImportacionLog).filter(
            GmailImportacionLog.empresa_id == conn.empresa_id,
            GmailImportacionLog.mensaje_gmail_id == msg_id,
        ).first()
        if exists:
            stats["ya_procesados"] += 1
            continue

        try:
            msg = svc.obtener_mensaje(access_token, msg_id)
            headers = svc.extraer_headers(msg)
            adjuntos = svc.encontrar_adjuntos_xml(msg)
            if not adjuntos:
                stats["sin_xml"] += 1
                continue

            xml_bytes = svc.obtener_adjunto(access_token, msg_id, adjuntos[0]["attachmentId"])
            cfdi = svc.parsear_cfdi(xml_bytes)

            valido, razon = svc.es_mercancia_credito(cfdi, receptor_rfc)
            estado = "descartado" if not valido else ("importado" if conn.modo == "auto" else "pendiente")

            log = GmailImportacionLog(
                empresa_id=conn.empresa_id,
                mensaje_gmail_id=msg_id,
                thread_gmail_id=msg.get("threadId"),
                remitente_email=(headers.get("from") or "")[:255],
                asunto=(headers.get("subject") or "")[:500],
                fecha_correo=_parse_email_date(headers.get("date")),
                xml_uuid=cfdi["uuid"],
                xml_folio=cfdi["folio"],
                xml_serie=cfdi["serie"],
                proveedor_rfc=cfdi["emisor_rfc"],
                proveedor_nombre_xml=(cfdi["emisor_nombre"] or "")[:255],
                total=cfdi["total"], subtotal=cfdi["subtotal"], iva=cfdi["iva"],
                metodo_pago_sat=cfdi["metodo_pago"],
                forma_pago_sat=cfdi["forma_pago"],
                moneda=cfdi["moneda"],
                fecha_emision=_parse_fecha_cfdi(cfdi["fecha"]),
                tipo_comprobante=cfdi["tipo"],
                xml_raw=xml_bytes.decode("utf-8-sig", errors="replace")[:100000],
                estado=estado, razon_descartado=razon,
            )

            if valido and cfdi["emisor_rfc"]:
                prov = db.query(Proveedor).filter(
                    Proveedor.empresa_id == conn.empresa_id,
                    Proveedor.rfc == cfdi["emisor_rfc"],
                ).first()
                if prov:
                    log.proveedor_id = prov.id

            db.add(log)
            db.commit()

            if not valido:
                stats["descartados"] += 1
            elif estado == "importado":
                # modo auto: crear CxP directo (a implementar futuro)
                stats["guardados_pendientes"] += 1
            else:
                stats["guardados_pendientes"] += 1

        except Exception as e:
            logger.error("Sync msg %s empresa %s fallo: %s", msg_id, conn.empresa_id, e)
            stats["errores"] += 1
            db.rollback()

    conn.ultima_sync_en = datetime.utcnow()
    db.commit()
    return stats


def _job_sync_todas():
    """Job que corre cada hora: recorre todas las conexiones activas."""
    hora = datetime.utcnow().hour
    # Convertir a hora Ciudad de Mexico (UTC-6)
    hora_mx = (hora - 6) % 24
    # Solo correr en horario laboral MX 8am-8pm
    if hora_mx < 8 or hora_mx >= 20:
        logger.info("Gmail sync scheduler: fuera de horario (%dh MX), skip", hora_mx)
        return

    db = SessionLocal()
    try:
        conexiones = db.query(GmailConexion).filter(GmailConexion.activo == True).all()
        logger.info("Gmail sync scheduler: %d empresas activas", len(conexiones))
        for conn in conexiones:
            try:
                stats = _sync_una_empresa(db, conn)
                logger.info("Sync empresa %s: %s", conn.empresa_id, stats)
            except Exception as e:
                logger.error("Sync empresa %s crash: %s", conn.empresa_id, e)
                db.rollback()
    finally:
        db.close()


def _parse_email_date(s):
    if not s: return None
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(s).replace(tzinfo=None)
    except Exception:
        return None


def _parse_fecha_cfdi(s):
    if not s: return None
    try:
        return datetime.fromisoformat(s.replace("Z", ""))
    except Exception:
        return None


def start_scheduler():
    """Arranca el scheduler. Se llama desde main.py on_startup."""
    global _scheduler
    if _scheduler and _scheduler.running:
        return
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        _job_sync_todas,
        IntervalTrigger(minutes=60),
        id="gmail_sync_hourly",
        max_instances=1,     # no overlap si un run tarda mas de 1h
        coalesce=True,       # si perdimos varios ticks, correr solo 1
        misfire_grace_time=600,
    )
    _scheduler.start()
    logger.info("Gmail scheduler iniciado (cada 60 min, 8am-8pm MX)")


def stop_scheduler():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Gmail scheduler detenido")
