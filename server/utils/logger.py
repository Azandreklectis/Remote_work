"""
Application-wide logging configuration for the Game Stream server.
"""

import logging
import sys


def setup_logger(name: str = "game-stream") -> logging.Logger:
    """
    Create and configure the application logger.

    The logger writes timestamped messages to stdout so that
    server activity is visible directly in the terminal.
    """

    logger = logging.getLogger(name)

    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    handler.setFormatter(formatter)
    logger.addHandler(handler)

    logger.propagate = False

    return logger


logger = setup_logger()