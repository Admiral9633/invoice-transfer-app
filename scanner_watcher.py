"""
scanner_watcher.py
------------------
Standalone-Starter für den Brother ADS-2400N FTP-Receiver.
Normalerweise nicht nötig – der FTP-Server startet automatisch mit Django.
Nur verwenden, wenn Django nicht läuft.
"""

import sys
import time
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

from invoices.ftp_server import start_in_background  # noqa: E402

if __name__ == "__main__":
    start_in_background()
    print("FTP-Server läuft. Abbruch mit Strg+C.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Beendet.")

-------------------------------------
Startet einen einfachen FTP-Server, der Scans vom Brother ADS-2400N empfängt
und die PDF-Dateien automatisch in die Invoice-App hochlädt.

Verwendung:
    python scanner_watcher.py

Konfiguration über Umgebungsvariablen:
    FTP_HOST        IP-Adresse, auf der der FTP-Server lauscht (Standard: 0.0.0.0)
    FTP_PORT        Port (Standard: 21  – bei Bedarf z. B. 2121 ohne Admin-Rechte)
    FTP_USER        FTP-Benutzername für den Scanner (Standard: scanner)
    FTP_PASS        FTP-Passwort für den Scanner   (Standard: scanner123)
    FTP_UPLOAD_DIR  Temporärer Ordner für eingehende Dateien (Standard: .\ftp_inbox)
    API_URL         Django-Upload-Endpunkt (Standard: http://localhost:8000/api/invoices/upload/)
"""

import logging
import os
import sys
import tempfile
from pathlib import Path

import requests
from dotenv import load_dotenv
from pyftpdlib.handlers import FTPHandler
from pyftpdlib.servers import FTPServer
from pyftpdlib.authorizers import DummyAuthorizer

# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------

load_dotenv(dotenv_path=Path(__file__).parent / "backend" / ".env")

FTP_HOST = os.environ.get("FTP_HOST", "0.0.0.0")
FTP_PORT = int(os.environ.get("FTP_PORT", "21"))
FTP_USER = os.environ.get("FTP_USER", "scanner")
FTP_PASS = os.environ.get("FTP_PASS", "scanner123")
FTP_UPLOAD_DIR = Path(os.environ.get("FTP_UPLOAD_DIR", Path(__file__).parent / "ftp_inbox"))
API_URL = os.environ.get("API_URL", "http://localhost:8000/api/invoices/upload/")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(Path(__file__).parent / "scanner_ftp.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FTP-Handler mit Upload-Callback
# ---------------------------------------------------------------------------


class InvoiceHandler(FTPHandler):
    """FTP-Handler: lädt jede empfangene PDF sofort in die Invoice-App hoch."""

    def on_file_received(self, file: str) -> None:
        path = Path(file)
        if path.suffix.lower() != ".pdf":
            log.info("Ignoriere Nicht-PDF: %s", path.name)
            return

        log.info("→ Scan empfangen: %s (%.1f KB)", path.name, path.stat().st_size / 1024)
        self._upload(path)

    def _upload(self, path: Path) -> None:
        try:
            with open(path, "rb") as f:
                response = requests.post(
                    API_URL,
                    files={"file": (path.name, f, "application/pdf")},
                    timeout=60,
                )
            if response.ok:
                log.info("✓ Hochgeladen: %s", path.name)
                path.unlink(missing_ok=True)  # Aufräumen nach Erfolg
            else:
                log.error(
                    "✗ API-Fehler %s für %s: %s",
                    response.status_code,
                    path.name,
                    response.text[:300],
                )
        except requests.ConnectionError:
            log.error("✗ Keine Verbindung zur API (%s) – läuft Django?", API_URL)
        except Exception as exc:
            log.error("✗ Fehler beim Hochladen von %s: %s", path.name, exc)


# ---------------------------------------------------------------------------
# Einstiegspunkt
# ---------------------------------------------------------------------------


def main() -> None:
    FTP_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    authorizer = DummyAuthorizer()
    authorizer.add_user(
        FTP_USER,
        FTP_PASS,
        str(FTP_UPLOAD_DIR),
        perm="elradfmw",  # alle Schreibrechte
    )

    handler = InvoiceHandler
    handler.authorizer = authorizer
    handler.passive_ports = range(60000, 60100)  # Passiv-Modus für NAT/Firewall

    server = FTPServer((FTP_HOST, FTP_PORT), handler)

    log.info("=== Brother ADS-2400N FTP-Receiver ===")
    log.info("FTP-Server   : %s:%d", FTP_HOST, FTP_PORT)
    log.info("FTP-Benutzer : %s", FTP_USER)
    log.info("Inbox-Ordner : %s", FTP_UPLOAD_DIR)
    log.info("API-Endpunkt : %s", API_URL)
    log.info("Bereit – warte auf Scans … (Abbruch mit Strg+C)")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("FTP-Server beendet.")
        server.close_all()


if __name__ == "__main__":
    main()


import os
import sys
import time
import logging
from pathlib import Path

import requests
from dotenv import load_dotenv
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------

load_dotenv(dotenv_path=Path(__file__).parent / "backend" / ".env")

WATCH_FOLDER = Path(os.environ.get("SCANNER_WATCH_FOLDER", r"C:\Scans"))
DONE_FOLDER_RAW = os.environ.get("SCANNER_DONE_FOLDER", "")
DONE_FOLDER = Path(DONE_FOLDER_RAW) if DONE_FOLDER_RAW else None
API_URL = os.environ.get("API_URL", "http://localhost:8000/api/invoices/upload/")

# Wie lange (Sekunden) nach Erkennung gewartet wird, bis der Scanner fertig geschrieben hat
WRITE_SETTLE_DELAY = 2

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(Path(__file__).parent / "scanner_watcher.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


def wait_for_file_stable(path: Path, timeout: int = 30) -> bool:
    """Wartet, bis der Scanner mit dem Schreiben fertig ist (Dateigröße stabil)."""
    start = time.time()
    last_size = -1
    while time.time() - start < timeout:
        try:
            size = path.stat().st_size
        except FileNotFoundError:
            return False
        if size == last_size and size > 0:
            return True
        last_size = size
        time.sleep(0.5)
    return False


def upload_pdf(file_path: Path) -> bool:
    """Lädt eine PDF-Datei in die Invoice-App hoch. Gibt True bei Erfolg zurück."""
    try:
        with open(file_path, "rb") as f:
            response = requests.post(
                API_URL,
                files={"file": (file_path.name, f, "application/pdf")},
                timeout=60,
            )
        if response.ok:
            log.info("✓ Hochgeladen: %s", file_path.name)
            return True
        else:
            log.error(
                "✗ Fehler beim Hochladen (%s): %s\n%s",
                response.status_code,
                file_path.name,
                response.text[:500],
            )
            return False
    except requests.ConnectionError:
        log.error("✗ Verbindung zur API fehlgeschlagen (%s) – läuft der Django-Server?", API_URL)
        return False
    except Exception as exc:
        log.error("✗ Unerwarteter Fehler beim Hochladen von %s: %s", file_path.name, exc)
        return False


def process_file(path: Path) -> None:
    """Wartet auf Stabilität, lädt hoch, verschiebt ggf. in DONE_FOLDER."""
    log.info("→ Neue PDF erkannt: %s", path.name)

    if not wait_for_file_stable(path):
        log.warning("  Zeitüberschreitung beim Warten auf vollständige Datei: %s", path.name)
        return

    success = upload_pdf(path)

    if success and DONE_FOLDER is not None:
        DONE_FOLDER.mkdir(parents=True, exist_ok=True)
        dest = DONE_FOLDER / path.name
        # Falls Dateiname schon belegt ist, Suffix ergänzen
        if dest.exists():
            dest = DONE_FOLDER / f"{path.stem}_{int(time.time())}{path.suffix}"
        path.rename(dest)
        log.info("  → Verschoben nach: %s", dest)


# ---------------------------------------------------------------------------
# Watchdog-Handler
# ---------------------------------------------------------------------------


class PDFHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if path.suffix.lower() == ".pdf":
            process_file(path)

    def on_moved(self, event):
        """Manche Scanner schreiben zuerst eine Temp-Datei und benennen sie dann um."""
        if event.is_directory:
            return
        path = Path(event.dest_path)
        if path.suffix.lower() == ".pdf":
            process_file(path)


# ---------------------------------------------------------------------------
# Einstiegspunkt
# ---------------------------------------------------------------------------


def scan_existing(folder: Path) -> None:
    """Verarbeitet PDFs, die bereits im Ordner liegen (z. B. nach Neustart)."""
    pdfs = list(folder.glob("*.pdf"))
    if pdfs:
        log.info("Verarbeite %d vorhandene PDF(s) beim Start...", len(pdfs))
        for pdf in pdfs:
            process_file(pdf)


def main() -> None:
    if not WATCH_FOLDER.exists():
        log.error("Watch-Ordner existiert nicht: %s", WATCH_FOLDER)
        log.error("Bitte SCANNER_WATCH_FOLDER konfigurieren oder Ordner erstellen.")
        sys.exit(1)

    log.info("=== Scanner Watcher gestartet ===")
    log.info("Überwache Ordner : %s", WATCH_FOLDER)
    log.info("API-Endpunkt     : %s", API_URL)
    if DONE_FOLDER:
        log.info("Verarbeitete PDFs: %s", DONE_FOLDER)

    scan_existing(WATCH_FOLDER)

    handler = PDFHandler()
    observer = Observer()
    observer.schedule(handler, str(WATCH_FOLDER), recursive=False)
    observer.start()
    log.info("Warte auf neue Scans … (Abbruch mit Strg+C)")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("Beende Scanner Watcher …")
        observer.stop()
    observer.join()
    log.info("Scanner Watcher beendet.")


if __name__ == "__main__":
    main()
