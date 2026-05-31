# Invoice Transfer App - Backend

Django REST API für PDF-Rechnungsübertragung zu Lexware Office und Paperless-ngx.

## Setup

1. **Virtual Environment erstellen und aktivieren:**
```powershell
python -m venv venv
.\venv\Scripts\activate
```

2. **Dependencies installieren:**
```powershell
pip install -r requirements.txt
```

3. **Umgebungsvariablen konfigurieren:**
- Kopiere `.env.example` zu `.env`
- Trage deine API-Credentials ein

4. **Datenbank migrieren:**
```powershell
python manage.py makemigrations
python manage.py migrate
```

5. **Admin-User erstellen:**
```powershell
python manage.py createsuperuser
```

6. **Server starten:**
```powershell
python manage.py runserver
```

## API Endpoints

- `POST /api/invoices/upload/` - PDF-Rechnung hochladen
- `GET /api/invoices/` - Alle Rechnungen auflisten
- `GET /api/invoices/{id}/` - Einzelne Rechnung abrufen
- `DELETE /api/invoices/{id}/` - Rechnung löschen

## Technologie-Stack

- Django 6.0
- Django REST Framework
- CORS Headers
- SQLite (Development)
