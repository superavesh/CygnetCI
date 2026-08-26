"""
Publishes outbound email jobs to RabbitMQ for the CygnetCI EmailEngine to send.

Best-effort: never raises to the caller (endpoints must not fail because email is
down); logs on failure. `pika` is imported lazily so the API still starts if pika
or RabbitMQ is not available yet.
"""
import json
import logging
import uuid as _uuid
from typing import Optional, List, Dict, Any

from config import app_config

logger = logging.getLogger("email_publisher")


def publish_email(
    email_type: str,
    to: List[str],
    template: str,
    data: Optional[Dict[str, Any]] = None,
    subject: Optional[str] = None,
    cc: Optional[List[str]] = None,
    priority: str = "normal",
    idempotency_key: Optional[str] = None,
) -> bool:
    """Queue an email job. Returns True if published, False otherwise (logged)."""
    cfg = app_config.get_rabbitmq()
    if not cfg["enabled"]:
        logger.warning("RabbitMQ disabled; email '%s' to %s not queued", template, to)
        return False

    message = {
        "type": email_type,
        "to": to,
        "cc": cc or [],
        "subject": subject,
        "template": template,
        "data": data or {},
        "priority": priority,
        "idempotency_key": idempotency_key or str(_uuid.uuid4()),
    }

    try:
        import pika  # lazy import — API boots even if pika isn't installed yet
    except ImportError:
        logger.error("pika is not installed; cannot queue email '%s' to %s", template, to)
        return False

    conn = None
    try:
        credentials = pika.PlainCredentials(cfg["username"], cfg["password"])
        params = pika.ConnectionParameters(
            host=cfg["host"],
            port=cfg["port"],
            virtual_host=cfg["vhost"],
            credentials=credentials,
            blocked_connection_timeout=10,
            socket_timeout=10,
            connection_attempts=1,
        )
        conn = pika.BlockingConnection(params)
        ch = conn.channel()

        # Declare topology (idempotent). MUST match the EmailEngine consumer exactly.
        ch.exchange_declare(exchange=cfg["exchange"], exchange_type="direct", durable=True)
        ch.queue_declare(queue=cfg["dlq"], durable=True)
        ch.queue_declare(
            queue=cfg["queue"],
            durable=True,
            arguments={
                "x-dead-letter-exchange": "",
                "x-dead-letter-routing-key": cfg["dlq"],
            },
        )
        ch.queue_bind(queue=cfg["queue"], exchange=cfg["exchange"], routing_key=cfg["routing_key"])

        ch.basic_publish(
            exchange=cfg["exchange"],
            routing_key=cfg["routing_key"],
            body=json.dumps(message).encode("utf-8"),
            properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
        )
        logger.info("Queued email '%s' to %s", template, to)
        return True
    except Exception as e:  # noqa: BLE001 - best effort
        logger.error("Failed to queue email '%s' to %s: %s", template, to, e)
        return False
    finally:
        try:
            if conn is not None and conn.is_open:
                conn.close()
        except Exception:
            pass
