import Foundation

/// Observable store backing the invoice list. Runs all mutations on the main
/// actor so SwiftUI updates stay safe.
@MainActor
final class InvoiceStore: ObservableObject {
    @Published var invoices: [Invoice] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    /// IDs currently being transferred or deleted, used to show per-row spinners.
    @Published var busyIDs: Set<Int> = []

    // MARK: - Load

    func refresh() async {
        isLoading = true
        errorMessage = nil
        do {
            invoices = try await UploadService.list()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Transfer

    func transfer(_ invoice: Invoice) async {
        busyIDs.insert(invoice.id)
        defer { busyIDs.remove(invoice.id) }
        do {
            let updated = try await UploadService.transfer(id: invoice.id)
            replace(updated)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Delete

    func delete(_ invoice: Invoice) async {
        busyIDs.insert(invoice.id)
        defer { busyIDs.remove(invoice.id) }
        do {
            try await UploadService.delete(id: invoice.id)
            invoices.removeAll { $0.id == invoice.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Upload

    /// Uploads one or more PDF files, then reloads the list.
    func uploadFiles(_ urls: [URL]) async {
        isLoading = true
        errorMessage = nil
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            do {
                let data = try Data(contentsOf: url)
                try await UploadService.upload(pdfData: data, filename: url.lastPathComponent)
            } catch {
                errorMessage = "\(url.lastPathComponent): \(error.localizedDescription)"
            }
        }
        await refresh()
    }

    // MARK: - Helpers

    private func replace(_ invoice: Invoice) {
        if let idx = invoices.firstIndex(where: { $0.id == invoice.id }) {
            invoices[idx] = invoice
        }
    }
}
