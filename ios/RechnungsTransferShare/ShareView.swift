import SwiftUI
import UniformTypeIdentifiers

struct ShareView: View {
    let extensionContext: NSExtensionContext
    let onDone: () -> Void
    let onCancel: () -> Void

    @State private var pdfData: Data?
    @State private var filename: String = "dokument.pdf"
    @State private var viewState: ViewState = .loading

    enum ViewState {
        case loading
        case ready
        case uploading
        case success
        case failure(String)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                switch viewState {

                // ── Loading PDF from share payload ─────────────────────────
                case .loading:
                    VStack(spacing: 16) {
                        ProgressView()
                        Text("PDF wird geladen…")
                            .foregroundStyle(.secondary)
                    }

                // ── Ready to upload ────────────────────────────────────────
                case .ready:
                    VStack(spacing: 32) {
                        Spacer()
                        Image(systemName: "doc.fill")
                            .font(.system(size: 72))
                            .foregroundStyle(.accent)
                        Text(filename)
                            .font(.headline)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                        Button {
                            Task { await upload() }
                        } label: {
                            Label("Hochladen", systemImage: "arrow.up.circle.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .padding(.horizontal)
                        Spacer()
                    }

                // ── Upload in progress ─────────────────────────────────────
                case .uploading:
                    VStack(spacing: 16) {
                        ProgressView()
                            .scaleEffect(1.4)
                        Text("Wird hochgeladen…")
                        Text(filename)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                // ── Success ────────────────────────────────────────────────
                case .success:
                    VStack(spacing: 24) {
                        Spacer()
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 72))
                            .foregroundStyle(.green)
                        Text("Erfolgreich hochgeladen!")
                            .font(.title3.bold())
                        Text(filename)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button("Fertig", action: onDone)
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                        Spacer()
                    }

                // ── Failure ────────────────────────────────────────────────
                case .failure(let message):
                    VStack(spacing: 24) {
                        Spacer()
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 72))
                            .foregroundStyle(.red)
                        Text("Fehler beim Hochladen")
                            .font(.title3.bold())
                        Text(message)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                        HStack(spacing: 12) {
                            Button("Abbrechen", role: .cancel, action: onCancel)
                                .buttonStyle(.bordered)
                                .controlSize(.large)
                            Button("Nochmal") {
                                viewState = .ready
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                        }
                        Spacer()
                    }
                }
            }
            .navigationTitle("RechnungsTransfer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    switch viewState {
                    case .uploading, .success:
                        EmptyView()
                    default:
                        Button("Abbrechen", action: onCancel)
                    }
                }
            }
        }
        .task { await loadPDF() }
    }

    // MARK: - Load PDF from NSExtensionItem

    private func loadPDF() async {
        guard
            let item = extensionContext.inputItems.first as? NSExtensionItem,
            let attachment = item.attachments?.first
        else {
            viewState = .failure("Kein Anhang gefunden.")
            return
        }

        let pdfUTI = UTType.pdf.identifier

        // Some apps share PDFs as a URL, others as raw Data.
        if attachment.hasItemConformingToTypeIdentifier(pdfUTI) {
            do {
                let result = try await attachment.loadItem(forTypeIdentifier: pdfUTI)
                if let fileURL = result as? URL {
                    pdfData = try Data(contentsOf: fileURL)
                    filename = fileURL.lastPathComponent
                } else if let data = result as? Data {
                    pdfData = data
                } else {
                    throw UploadError.noData
                }
                viewState = .ready
            } catch {
                viewState = .failure(error.localizedDescription)
            }
        } else {
            viewState = .failure("Die geteilte Datei ist kein PDF.")
        }
    }

    // MARK: - Upload

    private func upload() async {
        guard let data = pdfData else { return }
        viewState = .uploading
        do {
            try await UploadService.upload(pdfData: data, filename: filename)
            viewState = .success
        } catch {
            viewState = .failure(error.localizedDescription)
        }
    }
}
