import os

from django.apps import AppConfig


class InvoicesConfig(AppConfig):
    name = 'invoices'

    def ready(self):
        # RUN_MAIN wird von Djangos StatReloader nur im Hauptprozess gesetzt,
        # nicht im Reloader-Watcher – verhindert Doppelstart beim Entwicklungsserver.
        if os.environ.get('RUN_MAIN') != 'true':
            return

        from invoices.ftp_server import start_in_background
        start_in_background()
