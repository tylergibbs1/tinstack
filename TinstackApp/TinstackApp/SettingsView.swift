import SwiftUI

struct SettingsView: View {
    @Bindable var engine: TinstackEngine

    var body: some View {
        TabView {
            GeneralSettingsView(engine: engine)
                .tabItem {
                    Label("General", systemImage: "gear")
                }

            AdvancedSettingsView(engine: engine)
                .tabItem {
                    Label("Advanced", systemImage: "wrench")
                }
        }
        .frame(width: 450, height: 300)
    }
}

struct GeneralSettingsView: View {
    @Bindable var engine: TinstackEngine

    var body: some View {
        Form {
            Section {
                TextField("Port:", value: $engine.port, format: .number)
                    .help("HTTP listen port (default: 4566)")

                TextField("Region:", text: $engine.region)
                    .help("Default AWS region")

                TextField("Account ID:", text: $engine.accountId)
                    .help("Default AWS account ID")
            } header: {
                Text("Server Configuration")
            }

            Section {
                Picker("Storage Mode:", selection: $engine.storageMode) {
                    Text("Memory (fastest, volatile)").tag("memory")
                    Text("SQLite (persistent)").tag("sqlite")
                    Text("Hybrid (memory + periodic flush)").tag("hybrid")
                }
            } header: {
                Text("Storage")
            }

            Section {
                HStack {
                    TextField("Binary Path:", text: $engine.binaryPath)
                    Button("Browse...") {
                        let panel = NSOpenPanel()
                        panel.canChooseFiles = true
                        panel.canChooseDirectories = false
                        panel.allowsMultipleSelection = false
                        if panel.runModal() == .OK, let url = panel.url {
                            engine.binaryPath = url.path
                        }
                    }
                }
                .help("Path to the compiled tinstack binary")
            } header: {
                Text("Binary")
            }
        }
        .formStyle(.grouped)
        .padding()
    }
}

struct AdvancedSettingsView: View {
    @Bindable var engine: TinstackEngine

    var body: some View {
        Form {
            Section {
                Picker("Log Level:", selection: $engine.logLevel) {
                    Text("Debug").tag("debug")
                    Text("Info").tag("info")
                    Text("Warn").tag("warn")
                    Text("Error").tag("error")
                }
            } header: {
                Text("Logging")
            }

            Section {
                Text("Changes require a server restart to take effect.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Button("Restart Server") {
                    engine.restart()
                }
                .disabled(!engine.isRunning)
            } header: {
                Text("Actions")
            }
        }
        .formStyle(.grouped)
        .padding()
    }
}
