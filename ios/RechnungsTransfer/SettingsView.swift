import SwiftUI

/// Settings tab: configure the backend URL (shared with the Share Extension via
/// the App Group) and run a connection test.
struct SettingsView: View {
    @AppStorage("backendURL", store: UserDefaults(suiteName: "group.rechnungstransfer.shared"))
    private var backendURL: String = "http://localhost:8000/api"

    @State private var testState: TestState = .idle

    private enum TestState: Equatable {
        case idle
        case testing
        case success
        case failure(String)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://server:8000/api", text: $backendURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                } header: {
                    Text("Backend-URL")
                } footer: {
                    Text("Basis-Adresse der Django-API. Endet üblicherweise auf /api. Wird auch von der Teilen-Erweiterung verwendet.")
                }

                Section {
                    Button {
                        runTest()
                    } label: {
                        HStack {
                            Label("Verbindung testen", systemImage: "antenna.radiowaves.left.and.right")
                            Spacer()
                            switch testState {
                            case .idle:
                                EmptyView()
                            case .testing:
                                ProgressView()
                            case .success:
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.green)
                            case .failure:
                                Image(systemName: "xmark.octagon.fill")
                                    .foregroundStyle(.red)
                            }
                        }
                    }
                    .disabled(testState == .testing)

                    if case .failure(let message) = testState {
                        Text(message)
                            .font(.caption)
                            .foregroundStyle(.red)
                    } else if testState == .success {
                        Text("Verbindung erfolgreich.")
                            .font(.caption)
                            .foregroundStyle(.green)
                    }
                }

                Section {
                    LabeledContent("Version", value: appVersion)
                } header: {
                    Text("Info")
                }
            }
            .navigationTitle("Einstellungen")
        }
    }

    private var appVersion: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "–"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "–"
        return "\(v) (\(b))"
    }

    private func runTest() {
        testState = .testing
        Task {
            do {
                try await UploadService.testConnection()
                testState = .success
            } catch {
                testState = .failure(error.localizedDescription)
            }
        }
    }
}

#Preview {
    SettingsView()
}
