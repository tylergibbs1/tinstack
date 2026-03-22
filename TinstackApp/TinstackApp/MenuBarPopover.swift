import SwiftUI

struct MenuBarPopover: View {
    @Bindable var engine: TinstackEngine

    var body: some View {
        VStack(spacing: 0) {
            // Header
            header
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 8)

            Divider()

            // Quick stats
            statsBar
                .padding(.horizontal, 16)
                .padding(.vertical, 8)

            Divider()

            // Recent requests
            recentRequests

            Divider()

            // Footer actions
            footer
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(engine.isRunning ? Color.green : Color.gray)
                        .frame(width: 8, height: 8)
                    Text("Tinstack")
                        .font(.headline)
                    if engine.isRunning {
                        Text(":\(engine.port)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                if engine.isRunning {
                    Text("Running \u{2022} \(engine.uptime)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Stopped")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            Button {
                if engine.isRunning { engine.stop() } else { engine.start() }
            } label: {
                Image(systemName: engine.isRunning ? "stop.fill" : "play.fill")
                    .font(.title3)
                    .foregroundStyle(engine.isRunning ? .red : .green)
            }
            .buttonStyle(.plain)
            .help(engine.isRunning ? "Stop Tinstack" : "Start Tinstack")
        }
    }

    // MARK: - Stats Bar

    private var statsBar: some View {
        HStack(spacing: 16) {
            StatPill(label: "Requests", value: "\(engine.totalRequests)", icon: "arrow.up.arrow.down")
            StatPill(label: "Services", value: "\(engine.serviceStats.count)", icon: "cube.box")
            StatPill(
                label: "Errors",
                value: "\(engine.serviceStats.reduce(0) { $0 + $1.errorCount })",
                icon: "exclamationmark.triangle",
                tint: .red
            )
            StatPill(label: "Region", value: engine.region, icon: "globe")
        }
    }

    // MARK: - Recent Requests

    private var recentRequests: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Recent Requests")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                if !engine.requestLog.isEmpty {
                    Button("Clear") { engine.clearLog() }
                        .font(.caption)
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)

            if engine.requestLog.isEmpty {
                VStack(spacing: 4) {
                    Image(systemName: engine.isRunning ? "network" : "icloud.slash")
                        .font(.title2)
                        .foregroundStyle(.tertiary)
                    Text(engine.isRunning ? "Waiting for requests..." : "Start the server to see requests")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
            } else {
                ScrollView {
                    LazyVStack(spacing: 1) {
                        ForEach(engine.requestLog.prefix(50)) { entry in
                            RequestRow(entry: entry)
                        }
                    }
                }
                .frame(maxHeight: 240)
            }
        }
    }

    // MARK: - Footer

    private var footer: some View {
        HStack {
            if let error = engine.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(1)
            }
            Spacer()
            Button {
                NSApplication.shared.activate(ignoringOtherApps: true)
                if let window = NSApplication.shared.windows.first(where: { $0.title == "Tinstack Dashboard" }) {
                    window.makeKeyAndOrderFront(nil)
                } else {
                    NSWorkspace.shared.open(URL(string: "tinstack://dashboard")!)
                }
            } label: {
                Label("Dashboard", systemImage: "rectangle.3.group")
                    .font(.caption)
            }
            .buttonStyle(.plain)

            SettingsLink {
                Image(systemName: "gear")
                    .font(.caption)
            }
            .buttonStyle(.plain)
            .help("Settings")

            Button {
                NSApplication.shared.terminate(nil)
            } label: {
                Image(systemName: "power")
                    .font(.caption)
            }
            .buttonStyle(.plain)
            .help("Quit Tinstack")
        }
    }
}

// MARK: - Components

struct StatPill: View {
    let label: String
    let value: String
    let icon: String
    var tint: Color = .primary

    var body: some View {
        VStack(spacing: 2) {
            Image(systemName: icon)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(tint)
            Text(label)
                .font(.system(size: 9))
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity)
    }
}

struct RequestRow: View {
    let entry: TinstackEngine.RequestEntry

    var body: some View {
        HStack(spacing: 8) {
            // Method badge
            Text(entry.method)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(.white)
                .padding(.horizontal, 4)
                .padding(.vertical, 1)
                .background(methodColor.opacity(0.8), in: RoundedRectangle(cornerRadius: 3))

            // Service
            Text(entry.service)
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
                .frame(width: 60, alignment: .leading)
                .lineLimit(1)

            // Target
            Text(entry.target)
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .truncationMode(.middle)

            Spacer()

            // Status
            Text("\(entry.status)")
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundStyle(entry.status < 400 ? .green : .red)

            // Duration
            Text("\(entry.duration)ms")
                .font(.system(size: 9, design: .monospaced))
                .foregroundStyle(.tertiary)
                .frame(width: 40, alignment: .trailing)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 3)
        .background(entry.status >= 400 ? Color.red.opacity(0.05) : .clear)
    }

    private var methodColor: Color {
        switch entry.method {
        case "GET": return .blue
        case "POST": return .green
        case "PUT": return .orange
        case "DELETE": return .red
        case "PATCH": return .purple
        case "HEAD": return .gray
        default: return .secondary
        }
    }
}
