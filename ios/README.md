# iOS – RechnungsTransfer Share Extension

Ermöglicht das Teilen von PDFs aus **jeder App** (Safari, Dateien, Mail, …) direkt an das Backend.

## Voraussetzungen

| Was | Version |
|-----|---------|
| Mac mit Xcode | ≥ 15 |
| iPhone | iOS ≥ 16 |
| Apple Developer Account | kostenlos reicht für lokale Tests (7-Tage-Zertifikat) |

---

## Schritt 1 – Xcode-Projekt anlegen

1. Xcode öffnen → **File → New → Project**
2. Vorlage: **iOS → App**
3. Einstellungen:

   | Feld | Wert |
   |------|------|
   | Product Name | `RechnungsTransfer` |
   | Bundle Identifier | z. B. `de.deinname.RechnungsTransfer` |
   | Interface | SwiftUI |
   | Language | Swift |

4. Projekt-Ordner auf `ios/` in diesem Repo zeigen lassen.

---

## Schritt 2 – Share Extension Target hinzufügen

1. **File → New → Target**
2. Vorlage: **iOS → Share Extension**
3. Name: `RechnungsTransferShare`
4. Die vom Wizard erstellte `ShareViewController.swift` und `MainInterface.storyboard` **löschen** (wir nutzen eigene Dateien).

---

## Schritt 3 – Dateien ins Projekt einbinden

Ziehe folgende Ordner per Drag & Drop ins Xcode-Projekt-Navigator:

```
ios/
├── Shared/
│   ├── Invoice.swift               → beide Targets (Modell)
│   └── UploadService.swift         → beide Targets (App + Extension)
├── RechnungsTransfer/
│   ├── RechnungsTransferApp.swift  → Target: RechnungsTransfer
│   ├── ContentView.swift           → Target: RechnungsTransfer
│   ├── InvoiceStore.swift          → Target: RechnungsTransfer
│   ├── InvoiceListView.swift       → Target: RechnungsTransfer
│   ├── SettingsView.swift          → Target: RechnungsTransfer
│   ├── StatusBadge.swift           → Target: RechnungsTransfer
│   └── Info.plist                  → Target: RechnungsTransfer
└── RechnungsTransferShare/
    ├── ShareViewController.swift   → Target: RechnungsTransferShare
    ├── ShareView.swift             → Target: RechnungsTransferShare
    └── Info.plist                  → Target: RechnungsTransferShare
```

> **Wichtig:** `Invoice.swift` und `UploadService.swift` müssen bei **beiden Targets** als Member eingetragen sein.
> Datei anklicken → rechts unter „Target Membership" beide Haken setzen.

---

## Schritt 4 – App Group aktivieren (damit URL-Einstellung geteilt wird)

Beide Targets müssen dieselbe App Group kennen, damit die Haupt-App die Backend-URL speichert und die Extension sie lesen kann.

1. Haupt-App-Target → **Signing & Capabilities → + Capability → App Groups**
2. Neue Gruppe anlegen: `group.rechnungstransfer.shared`
3. Dasselbe für das `RechnungsTransferShare`-Target wiederholen – **exakt denselben** Group-Namen wählen.

Der Identifier in `UploadService.swift` und `ContentView.swift` ist bereits auf `group.rechnungstransfer.shared` gesetzt. Falls du einen anderen Namen vergibst, beide Dateien entsprechend anpassen.

---

## Schritt 5 – Bundle-Identifier der Extension eintragen

Das Extension-Bundle-Identifier muss ein Unter-Identifier des Haupt-App-Identifiers sein:

```
Haupt-App:  de.deinname.RechnungsTransfer
Extension:  de.deinname.RechnungsTransfer.Share
```

Einstellen unter: Extension-Target → **General → Bundle Identifier**

---

## Schritt 6 – Backend-URL einstellen

Das Backend läuft auf deinem Mac. Auf dem iPhone ist `localhost` das iPhone selbst, **nicht** dein Mac.

1. Mac-IP-Adresse herausfinden:
   - **Systemeinstellungen → WLAN → Details → IP-Adresse**
   - oder Terminal: `ipconfig getifaddr en0`
2. In der App unter **Backend-URL** eintragen:
   ```
   http://192.168.1.XXX:8000/api
   ```
3. iPhone und Mac müssen im selben WLAN sein.

### Für produktiven Betrieb

Hinterlege das Backend hinter einem Reverse-Proxy (nginx/Caddy) mit HTTPS und echter Domain. Dann kannst du die `NSAllowsArbitraryLoads`-Einträge aus beiden `Info.plist`-Dateien entfernen.

---

## Schritt 7 – Auf iPhone deployen

1. iPhone per Kabel oder WLAN verbinden
2. In Xcode oben das iPhone als Ziel wählen
3. **Product → Run** (⌘R)
4. Beim ersten Mal: **Settings → General → VPN & Device Management → Developer App → Trust**

---

## Verwendung

### In der App

1. App öffnen → Tab **Rechnungen**
2. Über **+** ein oder mehrere PDFs hochladen (Dateien-Auswahl)
3. Pro Rechnung Status für Lexware & Paperless sehen
4. **Übertragen** antippen, um den Transfer auszulösen
5. Nach links wischen zum **Löschen**
6. Tab **Einstellungen** → Backend-URL setzen und **Verbindung testen**

### Über die Teilen-Erweiterung

1. Ein oder mehrere PDFs in einer beliebigen App öffnen (Safari, Dateien, Mail, …)
2. Share-Symbol antippen  ☐
3. **RechnungsTransfer** aus der Liste wählen
4. Dateinamen prüfen → **Hochladen** antippen
5. ✅ Fertig – die Rechnung erscheint in der Web-App und in der App-Liste

---

## Projektstruktur

```
ios/
├── README.md                           ← diese Datei
├── Shared/
│   ├── Invoice.swift                   ← Codable-Modell (Status-Enum + Invoice)
│   └── UploadService.swift             ← API-Client (Liste, Upload, Transfer, Löschen)
├── RechnungsTransfer/                  ← Haupt-App (Rechnungsliste + Einstellungen)
│   ├── RechnungsTransferApp.swift
│   ├── ContentView.swift               ← TabView (Rechnungen / Einstellungen)
│   ├── InvoiceStore.swift              ← ObservableObject mit Lade-/Mutationslogik
│   ├── InvoiceListView.swift           ← Liste mit Status, Upload, Transfer, Löschen
│   ├── SettingsView.swift              ← Backend-URL + Verbindungstest
│   ├── StatusBadge.swift               ← Status-Pille (SwiftUI)
│   └── Info.plist
└── RechnungsTransferShare/             ← Share Extension
    ├── ShareViewController.swift       ← UIViewController-Wrapper
    ├── ShareView.swift                 ← SwiftUI-UI (Mehrfach-Upload)
    └── Info.plist                      ← Aktivierungsregel (nur PDFs)
```
