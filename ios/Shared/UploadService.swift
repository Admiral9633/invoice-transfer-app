import Foundation

// MARK: - Errors

enum UploadError: LocalizedError {
    case invalidURL
    case noData
    case serverError(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Ungültige Backend-URL. Bitte in der App prüfen."
        case .noData:
            return "Keine PDF-Daten empfangen."
        case .serverError(let code, let body):
            return "Server-Fehler \(code): \(body)"
        }
    }
}

// MARK: - Service

struct UploadService {

    /// Shared UserDefaults via App Group – both the main app and the
    /// Share Extension read/write the backend URL here.
    private static let defaults = UserDefaults(suiteName: "group.rechnungstransfer.shared")

    static var backendBaseURL: String {
        defaults?.string(forKey: "backendURL") ?? "http://localhost:8000/api"
    }

    /// Upload a PDF to POST /api/invoices/upload/
    /// Field name must be "file" (matches the Django serializer).
    static func upload(pdfData: Data, filename: String) async throws {
        let urlString = "\(backendBaseURL)/invoices/upload/"
        guard let url = URL(string: urlString) else {
            throw UploadError.invalidURL
        }

        var request = URLRequest(url: url, timeoutInterval: 60)
        request.httpMethod = "POST"

        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue(
            "multipart/form-data; boundary=\(boundary)",
            forHTTPHeaderField: "Content-Type"
        )

        // Build multipart body
        var body = Data()
        let safeFilename = filename.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? filename
        body.append("--\(boundary)\r\n")
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(safeFilename)\"\r\n")
        body.append("Content-Type: application/pdf\r\n\r\n")
        body.append(pdfData)
        body.append("\r\n--\(boundary)--\r\n")

        let (data, response) = try await URLSession.shared.upload(for: request, from: body)

        guard let http = response as? HTTPURLResponse else {
            throw UploadError.serverError(0, "Keine HTTP-Antwort")
        }
        guard http.statusCode == 201 else {
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
