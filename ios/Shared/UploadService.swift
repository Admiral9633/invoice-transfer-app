import Foundation

// MARK: - Errors

enum UploadError: LocalizedError {
    case invalidURL
    case noData
    case notPDF
    case serverError(Int, String)
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Ungültige Backend-URL. Bitte in den Einstellungen prüfen."
        case .noData:
            return "Keine PDF-Daten empfangen."
        case .notPDF:
            return "Die ausgewählte Datei ist kein PDF."
        case .serverError(let code, let body):
            return "Server-Fehler \(code): \(body)"
        case .decoding(let detail):
            return "Antwort konnte nicht gelesen werden: \(detail)"
        }
    }
}

// MARK: - Service / API client

/// Networking layer shared by the main app and the Share Extension.
/// The backend base URL is stored in the shared App Group so both targets
/// read the same value.
struct UploadService {

    /// Shared UserDefaults via App Group – both the main app and the
    /// Share Extension read/write the backend URL here.
    private static let defaults = UserDefaults(suiteName: "group.rechnungstransfer.shared")

    static var backendBaseURL: String {
        let stored = defaults?.string(forKey: "backendURL") ?? "http://localhost:8000/api"
        // Strip a trailing slash so we can append paths predictably.
        return stored.hasSuffix("/") ? String(stored.dropLast()) : stored
    }

    // MARK: JSON decoding

    /// Decoder that understands Django REST Framework ISO-8601 timestamps,
    /// with or without fractional seconds.
    private static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()

        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]

        decoder.dateDecodingStrategy = .custom { dec in
            let raw = try dec.singleValueContainer().decode(String.self)
            if let date = withFraction.date(from: raw) ?? plain.date(from: raw) {
                return date
            }
            throw DecodingError.dataCorrupted(
                .init(codingPath: dec.codingPath, debugDescription: "Ungültiges Datum: \(raw)")
            )
        }
        return decoder
    }

    // MARK: - List

    /// GET /api/invoices/ — returns all stored invoices (newest first).
    static func list() async throws -> [Invoice] {
        guard let url = URL(string: "\(backendBaseURL)/invoices/") else {
            throw UploadError.invalidURL
        }
        var request = URLRequest(url: url, timeoutInterval: 30)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        try ensureSuccess(response, data: data, expected: 200)

        do {
            return try makeDecoder().decode([Invoice].self, from: data)
        } catch {
            throw UploadError.decoding(error.localizedDescription)
        }
    }

    // MARK: - Upload

    /// POST /api/invoices/upload/ — multipart upload.
    /// Field name must be "file" (matches the Django serializer).
    static func upload(pdfData: Data, filename: String) async throws {
        guard let url = URL(string: "\(backendBaseURL)/invoices/upload/") else {
            throw UploadError.invalidURL
        }

        var request = URLRequest(url: url, timeoutInterval: 120)
        request.httpMethod = "POST"

        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue(
            "multipart/form-data; boundary=\(boundary)",
            forHTTPHeaderField: "Content-Type"
        )

        var body = Data()
        let safeFilename = filename.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? filename
        body.append("--\(boundary)\r\n")
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(safeFilename)\"\r\n")
        body.append("Content-Type: application/pdf\r\n\r\n")
        body.append(pdfData)
        body.append("\r\n--\(boundary)--\r\n")

        let (data, response) = try await URLSession.shared.upload(for: request, from: body)
        try ensureSuccess(response, data: data, expected: 201)
    }

    // MARK: - Transfer

    /// POST /api/invoices/{id}/transfer/ — kicks off the Lexware + Paperless transfer.
    /// Returns the updated invoice (HTTP 202).
    @discardableResult
    static func transfer(id: Int) async throws -> Invoice {
        guard let url = URL(string: "\(backendBaseURL)/invoices/\(id)/transfer/") else {
            throw UploadError.invalidURL
        }
        var request = URLRequest(url: url, timeoutInterval: 30)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        try ensureSuccess(response, data: data, expected: 202)

        do {
            return try makeDecoder().decode(Invoice.self, from: data)
        } catch {
            throw UploadError.decoding(error.localizedDescription)
        }
    }

    // MARK: - Delete

    /// DELETE /api/invoices/{id}/
    static func delete(id: Int) async throws {
        guard let url = URL(string: "\(backendBaseURL)/invoices/\(id)/") else {
            throw UploadError.invalidURL
        }
        var request = URLRequest(url: url, timeoutInterval: 30)
        request.httpMethod = "DELETE"

        let (data, response) = try await URLSession.shared.data(for: request)
        try ensureSuccess(response, data: data, expected: 204)
    }

    // MARK: - Connection test

    /// Lightweight reachability check used by the settings screen.
    static func testConnection() async throws {
        _ = try await list()
    }

    // MARK: - Helpers

    /// Throws a descriptive error unless the response status matches `expected`.
    private static func ensureSuccess(_ response: URLResponse, data: Data, expected: Int) throws {
        guard let http = response as? HTTPURLResponse else {
            throw UploadError.serverError(0, "Keine HTTP-Antwort")
        }
        guard http.statusCode == expected else {
            let body = String(data: data, encoding: .utf8) ?? "–"
            throw UploadError.serverError(http.statusCode, body)
        }
    }
}

// MARK: - Data helper

private extension Data {
    mutating func append(_ string: String) {
        if let data = string.data(using: .utf8) {
            append(data)
        }
    }
}
