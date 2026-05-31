"""
invoices/ftp_server.py
----------------------
FTP-Server für den Brother ADS-2400N.
Wird automatisch beim Django-Start gestartet (via AppConfig.ready).
Kann auch standalone über scanner_watcher.py genutzt werden.
"""

import logging
import os
import threading
from pathlib import Path

import requests
from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import FTPHandler
from pyftpdlib.servers import FTPServer

log = logging.getLogger(__name__)

_server: FTPServer | None = None
_thread: threading.Thread | None = None


def _get_config() -> dict:
    base = Path(__file__).resolve().parent.parent  # backend/
    return {
        "host": os.environ.get("FTP_HOST", "0.0.0.0"),
        "port": int(os.environ.get("FTP_PORT", "21")),
        "user": os.environ.get("FTP_USER", "scanner"),
        "password": os.environ.get("FTP_PASS", "scanner123"),
        "inbox": Path(os.environ.get("FTP_UPLOAD_DIR", base.parent / "ftp_inbox")),
        "api_url": os.environ.get("API_URL", "http://localhost:8000/api/invoices/upload/"),
    }


class _InvoiceHandler(FTPHandler):
    api_url: str = ""

    def on_file_received(self, file: str) -> None:
        path = Path(file)
        if path.suffix.lower() != ".pdf":
            return
        log.info("FTP: Scan empfangen – %s (%.1f KB)", path.name, path.stat().st_size / 1024)
        threading.Thread(target=self._upload, args=(path,), daemon=True).start()

    def on_incomplete_file_received(self, file: str) -> None:
        Path(file).unlink(missing_ok=True)

    def _upload(self, path: Path) -> None:
        try:
            with open(path, "rb") as f:
                response = requests.post(
                    self.api_url,
                    files={"file": (path.name, f, "application/pdf")},
                    timeout=60,
                )
            if response.ok:
                log.info("FTP: ✓ Hochgeladen – %s", path.name)
                path.unlink(missing_ok=True)
            else:
                log.error("FTP: ✗ API-Fehler %s – %s", response.status_code, path.name)
        except requests.ConnectionError:
            log.error("FTP: ✗ Keine Verbindung zur API – läuft Django?")
        except Exception as exc:
            log.error("FTP: ✗ Fehler bei %s: %s", path.name, exc)


def start_in_background() -> None:
    """Startet den FTP-Server in einem Daemon-Thread."""
    global _server, _thread

    cfg = _get_config()
    cfg["inbox"].mkdir(parents=True, exist_ok=True)

    authorizer = DummyAuthorizer()
    authorizer.add_user(cfg["user"], cfg["password"], str(cfg["inbox"]), perm="elradfmw")

    handler = type("Handler", (_InvoiceHandler,), {"api_url": cfg["api_url"]})
    handler.authorizer = authorizer
    handler.passive_ports = range(60000, 60100)

    try:
        _server = FTPServer((cfg["host"], cfg["port"]), handler)
    except OSError as exc:
        log.error("FTP: Server konnte nicht gestartet werden – %s", exc)
        log.error("FTP: Tipp: Port %d belegt oder fehlende Berechtigungen.", cfg["port"])
        return

    log.info("FTP: Server gestartet auf %s:%d (Benutzer: %s)", cfg["host"], cfg["port"], cfg["user"])

    _thread = threading.Thread(target=_server.serve_forever, daemon=True)
    _thread.start()


def stop() -> None:
    if _server:
        _server.close_all()
