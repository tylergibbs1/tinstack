import SwiftUI

@main
struct TinstackApp: App {
    @State private var engine = TinstackEngine()

    var body: some Scene {
        MenuBarExtra {
            MenuBarPopover(engine: engine)
                .frame(width: 420, height: 520)
        } label: {
            Label {
                Text("Tinstack")
            } icon: {
                Image(systemName: engine.isRunning ? "cloud.fill" : "cloud")
            }
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView(engine: engine)
        }

        Window("Tinstack Dashboard", id: "dashboard") {
            DashboardView(engine: engine)
        }
        .defaultSize(width: 900, height: 600)
    }
}
