# 🚀 Schnellstart Guide

## Backend starten (Django)

1. **Terminal 1 öffnen und Backend starten:**

```powershell
cd backend
python manage.py runserver
```

✅ Backend läuft auf: http://localhost:8000
✅ Admin-Panel: http://localhost:8000/admin
✅ API: http://localhost:8000/api

## Frontend starten (Next.js)

2. **Terminal 2 öffnen und Frontend starten:**

```powershell
cd frontend
npm run dev
```

✅ Frontend läuft auf: http://localhost:3000

## 🎯 Verwendung

1. Öffne http://localhost:3000 im Browser
2. Ziehe PDF-Dateien in den Upload-Bereich
3. Beobachte die automatische Übertragung

## ⚙️ Optional: Admin-User erstellen

Für Zugriff auf Django Admin Panel:

```powershell
cd backend
python manage.py createsuperuser
```

Dann öffne: http://localhost:8000/admin

## 🔌 API-Credentials konfigurieren

Bearbeite `backend/.env` und füge deine Credentials ein:

```env
# Lexware Office
LEXWARE_API_URL=https://api.lexware.de/v1
LEXWARE_API_KEY=dein-api-key
LEXWARE_CLIENT_ID=deine-client-id

# Paperless-ngx
PAPERLESS_URL=http://deine-paperless-url
PAPERLESS_TOKEN=dein-token
```

**Hinweis:** Die App funktioniert auch ohne API-Credentials zum Testen. Die Übertragungen werden dann als "fehlgeschlagen" angezeigt.

## 🐛 Troubleshooting

### Backend startet nicht
- Stelle sicher, dass Python 3.12+ installiert ist
- Führe `pip install -r requirements.txt` erneut aus

### Frontend startet nicht
- Stelle sicher, dass Node.js installiert ist
- Führe `npm install` erneut aus

### CORS-Fehler
- Prüfe, ob beide Server laufen
- Prüfe die `CORS_ALLOWED_ORIGINS` in `backend/.env`
