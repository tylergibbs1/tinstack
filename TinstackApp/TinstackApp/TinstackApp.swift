import SwiftUI

@main
struct TinstackApp: App {
    @State private var engine = TinstackEngine()

    var body: some Scene {
        MenuBarExtra {
            MenuBarPopover(engine: engine)
                .frame(width: 340)
        } label: {
            Label {
                Text("Tinstack")
            } icon: {
                Image(systemName: engine.isRunning ? "cloud.fill" : "cloud")
            }
        }
        .menuBarExtraStyle(.window)

        Window("Tinstack Dashboard", id: "dashboard") {
            DashboardView(engine: engine)
        }
        .defaultSize(width: 900, height: 600)
        .commands {
            TinstackCommands(engine: engine)
        }

        Settings {
            SettingsView(engine: engine)
        }
    }
}

// MARK: - Keyboard Shortcuts

struct TinstackCommands: Commands {
    let engine: TinstackEngine

    var body: some Commands {
        CommandMenu("Server") {
            Button(engine.isRunning ? "Stop Server" : "Start Server") {
                engine.isRunning ? engine.stop() : engine.start()
            }
            .keyboardShortcut("R", modifiers: [.command, .shift])

            Button("Restart Server") {
                engine.restart()
            }
            .keyboardShortcut("R", modifiers: [.command, .option])
            .disabled(!engine.isRunning)

            Divider()

            Button("Copy Endpoint") {
                engine.copyEndpoint()
            }
            .keyboardShortcut("C", modifiers: [.command, .shift])

            Button("Copy SDK Config") {
                engine.copySdkConfig()
            }
            .keyboardShortcut("K", modifiers: [.command, .shift])

            Divider()

            Button("Reset All Data") {
                engine.resetAllData()
            }
            .disabled(!engine.isRunning)
        }
    }
}
