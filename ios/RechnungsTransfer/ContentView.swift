import SwiftUI

struct ContentView: View {
    // Shared with the Share Extension via App Group
    @AppStorage(
        "backendURL",
        store: UserDefaults(suiteName: "group.rechnungstransfer.shared")
    )
    private var backendURL: String = "http://192.168.1.100:8000/api"

    var body: some View {
        NavigationView {
            Form {
                Section {
                    TextField("http://192.168.1.100:8000/api", text: $backendURL)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("Backend-URL")
                } footer: {
                    Text("Trage hier die IP-Adresse deines Macs ein (nicht localhost). Du findest sie unter Systemeinstellungen → WLAN → Details.")
                }

                Section("So verwendest du die Share-Extension") {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "1.circle.fill").foregroundColor(.accentColor)
                        Text("Öffne ein PDF in einer beliebigen App (Safari, Dateien, Mail …)")
                    }
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "2.circle.fill").foregroundColor(.accentColor)
                        Text("Tippe auf das Teilen-Symbol")
                    }
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "3.circle.fill").foregroundColor(.accentColor)
                        Text("Wähle „RechnungsTransfer" aus der Liste")
                    }
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "4.circle.fill").foregroundColor(.accentColor)
                        Text("Tippe auf „Hochladen" – fertig!")
                    }
                }
            }
            .navigationTitle("RechnungsTransfer")
        }
    }
}

#Preview {
    ContentView()
}
