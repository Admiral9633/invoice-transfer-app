import SwiftUI

struct ContentView: View {
    @StateObject private var store = InvoiceStore()

    var body: some View {
        TabView {
            InvoiceListView()
                .environmentObject(store)
                .tabItem {
                    Label("Rechnungen", systemImage: "doc.text")
                }

            SettingsView()
                .tabItem {
                    Label("Einstellungen", systemImage: "gear")
                }
        }
    }
}

#Preview {
    ContentView()
}
