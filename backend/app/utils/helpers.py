import logging


def get_logger(name: str) -> logging.Logger:
    """Central place for loggers (keeps logging usage consistent)."""
    return logging.getLogger(name)

