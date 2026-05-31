import Foundation

// MARK: - Transfer status

/// Mirrors the Django `STATUS_CHOICES` (pending / processing / success / failed).
/// Decoding is lenient: an unknown value falls back to `.pending` so a backend
/// change never crashes the app.
enum TransferStatus: String, Codable, CaseIterable {
    case pending
    case processing
    case success
    case failed

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = TransferStatus(rawValue: raw) ?? .pending
    }

    /// German label for the UI.
    var label: String {
        switch self {
        case .pending:    return "Ausstehend"
        case .processing: return "Läuft…"
        case .success:    return "Erfolgreich"
        case .failed:     return "Fehlgeschlagen"
        }
    }
}

// MARK: - Invoice

/// Codable representation of the backend `Invoice` serializer.
/// Only the fields the iOS client actually needs are decoded.
struct Invoice: Identifiable, Codable, Equatable {
    let id: Int
    let filename: String
    let fileSize: Int
    let status: TransferStatus
    let lexwareStatus: TransferStatus
    let paperlessStatus: TransferStatus
    let paperlessDocumentId: Int?
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case filename
        case status
        case fileSize = "file_size"
        case lexwareStatus = "lexware_status"
        case paperlessStatus = "paperless_status"
        case paperlessDocumentId = "paperless_document_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    /// Human-readable file size, e.g. "1,2 MB".
    var formattedSize: String {
        ByteCountFormatter.string(fromByteCount: Int64(fileSize), countStyle: .file)
    }

    /// `true` while either transfer target is still in flight.
    var isProcessing: Bool {
        status == .processing || lexwareStatus == .processing || paperlessStatus == .processing
    }
}
