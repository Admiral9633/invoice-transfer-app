import SwiftUI
import UniformTypeIdentifiers

struct ShareView: View {
    let extensionContext: NSExtensionContext
    let onDone: () -> Void
    let onCancel: () -> Void

    /// One PDF pulled from the share payload.
    private struct SharedPDF: Identifiable {
        let id = UUID()
        let data: Data
        let filename: String
    }

    @State private var documents: [SharedPDF] = []
    @State private var viewState: ViewState = .loading
    @State private var uploadedCount = 0

    enum ViewState {
        case loading
        case ready
        case uploading
        case success
        case failure(String)
    }

    private var totalCount: Int { documents.count }

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
                    VStack(spacing: 24) {
                        Spacer()
                        Image(systemName: totalCount > 1 ? "doc.on.doc.fill" : "doc.fill")
                            .font(.system(size: 64))
                            .foregroundStyle(.accent)

                        if totalCount > 1 {
                            Text("\(totalCount) PDFs bereit")
                                .font(.headline)
                        }

                        VStack(spacing: 4) {
                            ForEach(documents) { doc in
                                Text(doc.filename)
                                    .font(totalCount > 1 ? .caption : .headline)
                                    .multilineTextAlignment(.center)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                            }
                        }
                        .padding(.horizontal)

                        Button {
                            Task { await uploadAll() }
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
                        if totalCount > 1 {
                            Text("\(uploadedCount) von \(totalCount)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                // ── Success ────────────────────────────────────────────────
                case .success:
                    VStack(spacing: 24) {
                        Spacer()
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 72))
                            .foregroundStyle(.green)
                        Text(totalCount > 1 ? "\(totalCount) PDFs hochgeladen!" : "Erfolgreich hochgeladen!")
                            .font(.title3.bold())
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
                                viewState = documents.isEmpty ? .loading : .ready
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
        .task { await loadPDFs() }
    }

    // MARK: - Load PDFs from NSExtensionItems

    private func loadPDFs() async {
        let pdfUTI = UTType.pdf.identifier
        var loaded: [SharedPDF] = []

        let attachments = (extensionContext.inputItems as? [NSExtensionItem])?
            .compactMap { $0.attachments }
            .flatMap { $0 } ?? []

        for attachment in attachments where attachment.hasItemConformingToTypeIdentifier(pdfUTI) {
            do {
                let result = try await attachment.loadItem(forTypeIdentifier: pdfUTI)
                if let fileURL = result as? URL {
                    let data = try Data(contentsOf: fileURL)
                    loaded.append(SharedPDF(data: data, filename: fileURL.lastPathComponent))
                } else if let data = result as? Data {
                    loaded.append(SharedPDF(data: data, filename: "dokument-\(loaded.count + 1).pdf"))
                }
            } catch {
                // Skip a single failing attachment but keep the rest.
                continue
            }
        }

        if loaded.isEmpty {
            viewState = .failure("Keine PDF-Datei gefunden.")
        } else {
            documents = loaded
            viewState = .ready
        }
    }

    // MARK: - Upload

    private func uploadAll() async {
        guard !documents.isEmpty else { return }
        viewState = .uploading
        uploadedCount = 0
        do {
            for doc in documents {
                try await UploadService.upload(pdfData: doc.data, filename: doc.filename)
                uploadedCount += 1
            }
            viewState = .success
        } catch {
            viewState = .failure(error.localizedDescription)
        }
    }
}
