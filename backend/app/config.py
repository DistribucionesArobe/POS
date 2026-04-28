"""Configuracion central via variables de entorno (pydantic-settings)."""
from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    app_env: str = "development"
    app_secret_key: str = "change-me"
    app_timezone: str = "America/Mexico_City"

    # DB
    database_url: str

    # Auth
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    # Facturama
    facturama_api_url: str = "https://api.facturama.mx"
    facturama_user: str = ""
    facturama_password: str = ""
    facturama_rfc_emisor: str = ""
    facturama_regimen_fiscal: str = "612"
    facturama_lugar_expedicion: str = ""

    # Twilio
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_ventas_from: str = ""
    twilio_cobranza_from: str = ""

    # Claude
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    # CotizaExpress
    cotizaexpress_base_url: str = ""
    cotizaexpress_internal_token: str = ""

    # CORS
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
