import SwiftUI

struct MenuBarPopover: View {
    @Bindable var engine: TinstackEngine

    var body: some View {
        VStack(spacing: 0) {
            HeaderSection(
                isRunning: engine.isRunning,
                port: engine.port,
                uptime: engine.uptime,
                onToggle: { engine.isRunning ? engine.stop() : engine.start() }
            )
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)

            Divider()

            StatsSection(
                totalRequests: engine.totalRequests,
                serviceCount: engine.serviceStats.count,
                errorCount: engine.serviceStats.reduce(0) { $0 + $1.errorCount },
                region: engine.region
            )
            .padding(.horizontal, 16)
            .padding(.vertical, 8)

            Divider()

            RequestListSection(
                requests: Array(engine.requestLog.prefix(50)),
                isRunning: engine.isRunning,
                onClear: { engine.clearLog() }
            )

            Divider()

            FooterSection(errorMessage: engine.errorMessage)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
        }
    }
}

// MARK: - Header

private struct HeaderSection: View {
    let isRunning: Bool
    let port: Int
    let uptime: String
    let onToggle: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(isRunning ? Color.green : Color.gray)
                        .frame(width: 8, height: 8)
                    Text("Tinstack")
                        .font(.headline)
                    Text(":\(port)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .opacity(isRunning ? 1 : 0)
                }
                Text(isRunning ? "Running \u{2022} \(uptime)" : "Stopped")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button(action: onToggle) {
                Image(systemName: isRunning ? "stop.fill" : "play.fill")
                    .font(.title3)
                    .foregroundStyle(isRunning ? Color.red : Color.green)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isRunning ? "Stop server" : "Start server")
        }
    }
}

// MARK: - Stats

private struct StatsSection: View {
    let totalRequests: Int
    let serviceCount: Int
    let errorCount: Int
    let region: String

    var body: some View {
        HStack(spacing: 16) {
            StatPill(label: "Requests", value: "\(totalRequests)", icon: "arrow.up.arrow.down")
            StatPill(label: "Services", value: "\(serviceCount)", icon: "cube.box")
            StatPill(label: "Errors", value: "\(errorCount)", icon: "exclamationmark.triangle", tint: .red)
            StatPill(label: "Region", value: region, icon: "globe")
        }
    }
}

// MARK: - Request List

private struct RequestListSection: View {
    let requests: [TinstackEngine.RequestEntry]
    let isRunning: Bool
    let onClear: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Recent Requests")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                if !requests.isEmpty {
                    Button("Clear", action: onClear)
                        .font(.caption)
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)

            if requests.isEmpty {
                EmptyRequestsView(isRunning: isRunning)
            } else {
                ScrollView {
                    LazyVStack(spacing: 1) {
                        ForEach(requests) { entry in
                            RequestRow(entry: entry)
                        }
                    }
                }
                .frame(maxHeight: 240)
            }
        }
    }
}

private struct EmptyRequestsView: View {
    let isRunning: Bool

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: isRunning ? "network" : "icloud.slash")
                .font(.title2)
                .foregroundStyle(.secondary)
            Text(isRunning ? "Waiting for requests..." : "Start the server to see requests")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Footer

private struct FooterSection: View {
    let errorMessage: String?

    var body: some View {
        HStack {
            if let error = errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(1)
            }
            Spacer()

            Button(action: openDashboard) {
                Label("Dashboard", systemImage: "rectangle.3.group")
                    .font(.caption)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open dashboard window")

            SettingsLink {
                Image(systemName: "gear")
                    .font(.caption)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open settings")

            Button(action: { NSApplication.shared.terminate(nil) }) {
                Image(systemName: "power")
                    .font(.caption)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Quit Tinstack")
        }
    }

    private func openDashboard() {
        NSApplication.shared.activate(ignoringOtherApps: true)
        if let window = NSApplication.shared.windows.first(where: { $0.title == "Tinstack Dashboard" }) {
            window.makeKeyAndOrderFront(nil)
        }
    }
}

// MARK: - Reusable Components

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
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)")
    }
}

struct RequestRow: View {
    let entry: TinstackEngine.RequestEntry

    var body: some View {
        HStack(spacing: 8) {
            Text(entry.method)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(.white)
                .padding(.horizontal, 4)
                .padding(.vertical, 1)
                .background(methodColor.opacity(0.8), in: RoundedRectangle(cornerRadius: 3))

            Text(entry.service)
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
                .frame(width: 60, alignment: .leading)
                .lineLimit(1)

            Text(entry.target)
                .font(.system(size: 10, design: .monospaced))
                .lineLimit(1)
                .truncationMode(.middle)

            Spacer()

            Text("\(entry.status)")
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundStyle(entry.status < 400 ? Color.green : Color.red)

            Text("\(entry.duration)ms")
                .font(.system(size: 9, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 40, alignment: .trailing)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 3)
        .background(entry.status >= 400 ? Color.red.opacity(0.05) : Color.clear)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(entry.method) \(entry.service) \(entry.target), status \(entry.status), \(entry.duration) milliseconds")
    }

    private var methodColor: Color {
        switch entry.method {
        case "GET": return .blue
        case "POST": return .green
        case "PUT": return .orange
        case "DELETE": return .red
        case "PATCH": return .purple
        case "HEAD": return .gray
        default: return .gray
        }
    }
}
