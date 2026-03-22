import SwiftUI

struct SettingsView: View {
    @Bindable var engine: TinstackEngine

    @AppStorage("tinstackPort") private var port = 4566
    @AppStorage("tinstackRegion") private var region = "us-east-1"
    @AppStorage("tinstackAccountId") private var accountId = "000000000000"
    @AppStorage("tinstackStorageMode") private var storageMode = "memory"
    @AppStorage("tinstackLogLevel") private var logLevel = "info"
    @AppStorage("tinstackBinaryPath") private var binaryPath = ""

    var body: some View {
        TabView {
            GeneralTab(
                port: $port,
                region: $region,
                accountId: $accountId,
                storageMode: $storageMode,
                binaryPath: $binaryPath
            )
            .tabItem { Label("General", systemImage: "gear") }

            AdvancedTab(
                logLevel: $logLevel,
                isRunning: engine.isRunning,
                onRestart: { engine.restart() }
            )
            .tabItem { Label("Advanced", systemImage: "wrench") }
        }
        .scenePadding()
        .frame(maxWidth: 480, minHeight: 280)
        .onChange(of: port) { engine.port = port }
        .onChange(of: region) { engine.region = region }
        .onChange(of: accountId) { engine.accountId = accountId }
        .onChange(of: storageMode) { engine.storageMode = storageMode }
        .onChange(of: logLevel) { engine.logLevel = logLevel }
        .onChange(of: binaryPath) { engine.binaryPath = binaryPath }
        .onAppear { syncFromEngine() }
    }

    private func syncFromEngine() {
        if !engine.binaryPath.isEmpty { binaryPath = engine.binaryPath }
        port = engine.port
        region = engine.region
        accountId = engine.accountId
        storageMode = engine.storageMode
        logLevel = engine.logLevel
    }
}

// MARK: - General Tab

private struct GeneralTab: View {
    @Binding var port: Int
    @Binding var region: String
    @Binding var accountId: String
    @Binding var storageMode: String
    @Binding var binaryPath: String

    var body: some View {
        Form {
            Section("Server") {
                TextField("Port:", value: $port, format: .number)
                TextField("Region:", text: $region)
                TextField("Account ID:", text: $accountId)
            }

            Section("Storage") {
                Picker("Mode:", selection: $storageMode) {
                    Text("Memory (fastest, volatile)").tag("memory")
                    Text("SQLite (persistent)").tag("sqlite")
                    Text("Hybrid (memory + flush)").tag("hybrid")
                }
            }

            Section("Binary") {
                HStack {
                    TextField("Path:", text: $binaryPath)
                        .textFieldStyle(.roundedBorder)
                    Button("Browse...") {
                        let panel = NSOpenPanel()
                        panel.canChooseFiles = true
                        panel.canChooseDirectories = false
                        if panel.runModal() == .OK, let url = panel.url {
                            binaryPath = url.path
                        }
                    }
                }
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - Advanced Tab

private struct AdvancedTab: View {
    @Binding var logLevel: String
    let isRunning: Bool
    let onRestart: () -> Void

    var body: some View {
        Form {
            Section("Logging") {
                Picker("Log Level:", selection: $logLevel) {
                    Text("Debug").tag("debug")
                    Text("Info").tag("info")
                    Text("Warn").tag("warn")
                    Text("Error").tag("error")
                }
            }

            Section {
                HStack {
                    Text("Changes take effect on next server start.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Restart Now", action: onRestart)
                        .disabled(!isRunning)
                }
            }
        }
        .formStyle(.grouped)
    }
}
