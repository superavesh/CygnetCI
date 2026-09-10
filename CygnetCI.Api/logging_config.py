# logging_config.py - Structured logging setup for the API process
#
# configure_logging() must run before any other application module is imported,
# so startup-time log calls (e.g. database.py's connection banner) use this format
# instead of Python's unconfigured default.
import logging
import os


def configure_logging() -> None:
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
