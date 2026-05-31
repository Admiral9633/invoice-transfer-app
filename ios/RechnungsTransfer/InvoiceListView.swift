import SwiftUI
import UniformTypeIdentifiers

/// Home tab: the list of all invoices with status, transfer and delete actions,
/// plus an in-app PDF upload via the system file importer.
struct InvoiceListView: View {
    @EnvironmentObject private var store: InvoiceStore
    @State private var showImporter = false
    @State private var pendingDelete: Invoice?

    var body: some View {
        NavigationStack {
            Group {
                if store.invoices.isEmpty && !store.isLoading {
                    emptyState
                } else {
                    list
                }
            }
            .navigationTitle("Rechnungen")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showImporter = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("PDF hochladen")
                }
            }
            .refreshable { await store.refresh() }
            .overlay {
                if store.isLoading && store.invoices.isEmpty {
                    ProgressView("Wird geladen…")
                }
            }
            .fileImporter(
                isPresented: $showImporter,
                allowedContentTypes: [.pdf],
                allowsMultipleSelection: true
            ) { result in
                switch result {
                case .success(let urls):
                    Task { await store.uploadFiles(urls) }
                case .failure(let error):
                    store.errorMessage = error.localizedDescription
                }
            }
            .alert(
                "Rechnung löschen?",
                isPresented: Binding(
                    get: { pendingDelete != nil },
                    set: { if !$0 { pendingDelete = nil } }
                ),
                presenting: pendingDelete
            ) { invoice in
                Button("Löschen", role: .destructive) {
                    Task { await store.delete(invoice) }
                }
                Button("Abbrechen", role: .cancel) { }
            } message: { invoice in
                Text(invoice.filename)
            }
            .alert(
                "Fehler",
                isPresented: Binding(
                    get: { store.errorMessage != nil },
                    set: { if !$0 { store.errorMessage = nil } }
                )
            ) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(store.errorMessage ?? "")
            }
        }
        .task { await store.refresh() }
    }

    // MARK: - List

    private var list: some View {
        List {
            ForEach(store.invoices) { invoice in
                InvoiceRow(
                    invoice: invoice,
                    isBusy: store.busyIDs.contains(invoice.id),
                    onTransfer: { Task { await store.transfer(invoice) } }
                )
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        pendingDelete = invoice
                    } label: {
                        Label("Löschen", systemImage: "trash")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Empty state

    private var emptyState: some View {
        ContentUnavailableViewCompat(
            title: "Keine Rechnungen",
            systemImage: "tray",
            description: "Lade ein PDF über das Plus-Symbol hoch oder teile es aus einer anderen App."
        )
    }
}

// MARK: - Row

private struct InvoiceRow: View {
    let invoice: Invoice
    let isBusy: Bool
    let onTransfer: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "doc.fill")
                    .foregroundStyle(.accent)
                    .font(.title3)
                VStack(alignment: .leading, spacing: 2) {
                    Text(invoice.filename)
                        .font(.subheadline.weight(.medium))
                        .lineLimit(2)
                    Text("\(invoice.formattedSize) · \(invoice.createdAt.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            HStack(spacing: 6) {
                StatusBadge(title: "Lexware", status: invoice.lexwareStatus)
                StatusBadge(title: "Paperless", status: invoice.paperlessStatus)
            }

            HStack {
                StatusBadge(title: invoice.status.label, status: invoice.status)
                Spacer()
                if isBusy || invoice.isProcessing {
                    ProgressView()
                } else if invoice.status != .success {
                    Button(action: onTransfer) {
                        Label("Übertragen", systemImage: "paperplane.fill")
                            .font(.caption.weight(.semibold))
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Compatibility helper

/// `ContentUnavailableView` is iOS 17+. This wrapper falls back to a simple
/// stack on iOS 16 so the project still builds against the documented minimum.
private struct ContentUnavailableViewCompat: View {
    let title: String
    let systemImage: String
    let description: String

    var body: some View {
        if #available(iOS 17.0, *) {
            ContentUnavailableView {
                Label(title, systemImage: systemImage)
            } description: {
                Text(description)
            }
        } else {
            VStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.system(size: 52))
                    .foregroundStyle(.secondary)
                Text(title).font(.title3.bold())
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }
        }
    }
}
