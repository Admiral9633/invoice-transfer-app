import SwiftUI

// MARK: - Status presentation

extension TransferStatus {
    /// Tint colour used for badges and icons.
    var color: Color {
        switch self {
        case .pending:    return .secondary
        case .processing: return .orange
        case .success:    return .green
        case .failed:     return .red
        }
    }

    /// SF Symbol representing the status.
    var systemImage: String {
        switch self {
        case .pending:    return "clock"
        case .processing: return "arrow.triangle.2.circlepath"
        case .success:    return "checkmark.circle.fill"
        case .failed:     return "xmark.octagon.fill"
        }
    }
}

// MARK: - Badge

/// Compact pill that shows a labelled transfer status.
struct StatusBadge: View {
    let title: String
    let status: TransferStatus

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: status.systemImage)
                .imageScale(.small)
            Text(title)
                .font(.caption2.weight(.semibold))
        }
        .foregroundStyle(status.color)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(status.color.opacity(0.12), in: Capsule())
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 8) {
        StatusBadge(title: "Lexware", status: .success)
        StatusBadge(title: "Paperless", status: .processing)
        StatusBadge(title: "Gesamt", status: .failed)
        StatusBadge(title: "Gesamt", status: .pending)
    }
    .padding()
}
