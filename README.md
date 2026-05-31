# Invoice Transfer App

Moderne Full-Stack-Anwendung zur automatischen Übertragung von PDF-Rechnungen an Lexware Office und Paperless-ngx.

## 🚀 Features

- **Drag & Drop Upload**: Intuitive PDF-Rechnungs-Upload mit Drag & Drop
- **Parallele Übertragung**: Gleichzeitige Übertragung zu Lexware Office und Paperless-ngx
- **Status-Tracking**: Echtzeit-Verfolgung des Upload- und Übertragungsstatus
- **REST API**: Vollständige RESTful API mit Django REST Framework
- **Moderne UI**: Responsive Design mit Shadcn UI und Tailwind CSS

## 📁 Projektstruktur

```
invoice-transfer-app/
├── backend/          # Django + DRF API
│   ├── config/      # Django Settings
│   └── invoices/    # Invoice App
└── frontend/        # Next.js + TypeScript
    ├── app/         # Next.js App Router
    ├── components/  # React Komponenten
    └── lib/         # API & Utils
```

## 🛠️ Tech Stack

### Backend
- Django 6.0
- Django REST Framework
- CORS Headers
- SQLite (Development)

### Frontend
- Next.js 15
- TypeScript
- Tailwind CSS 4
- Shadcn UI
- React Dropzone

## 🚦 Installation & Setup

### Backend (Django)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### Frontend (Next.js)

```powershell
cd frontend
npm install
npm run dev
```

## 🔑 Konfiguration

### Backend (.env)

Erstelle eine `.env` Datei im `backend/` Verzeichnis:

```env
SECRET_KEY=your-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

CORS_ALLOWED_ORIGINS=http://localhost:3000

LEXWARE_API_URL=https://api.lexware.de/v1
LEXWARE_API_KEY=your-api-key
LEXWARE_CLIENT_ID=your-client-id

PAPERLESS_URL=http://localhost:8000
PAPERLESS_TOKEN=your-token
```

### Frontend (.env.local)

Erstelle eine `.env.local` Datei im `frontend/` Verzeichnis:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

## 📡 API Endpoints

- `POST /api/invoices/upload/` - PDF hochladen
- `GET /api/invoices/` - Alle Rechnungen
- `GET /api/invoices/{id}/` - Einzelne Rechnung
- `DELETE /api/invoices/{id}/` - Rechnung löschen

## 🌐 URLs

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000/api
- **Django Admin**: http://localhost:8000/admin

## 📝 Verwendung

1. Öffne die Frontend-App (http://localhost:3000)
2. Ziehe PDF-Rechnungen in den Upload-Bereich oder klicke zum Auswählen
3. Die Rechnung wird automatisch hochgeladen
4. Die App überträgt die Rechnung parallel zu Lexware Office und Paperless-ngx
5. Verfolge den Status in der Übersicht

## 🔒 Sicherheit

- CORS-Konfiguration für sichere Cross-Origin-Requests
- File-Upload-Validierung (nur PDF, max. 10MB)
- Django CSRF-Protection
- Environment Variables für sensitive Daten

## 📄 Lizenz

MIT License
