import SwiftUI

struct MenuBarPopover: View {
    @Bindable var engine: TinstackEngine
    @State private var copiedEndpoint = false
    @State private var copiedConfig = false

    var body: some View {
        VStack(spacing: 0) {
            // Header: status + start/stop
            ServerHeader(
                isRunning: engine.isRunning,
                port: engine.port,
                uptime: engine.uptime,
                totalRequests: engine.totalRequests,
                onToggle: { engine.isRunning ? engine.stop() : engine.start() }
            )
            .padding(12)

            if let error = engine.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
            }

            Divider()

            // Quick actions
            VStack(spacing: 2) {
                QuickAction(icon: "doc.on.clipboard", title: "Copy Endpoint",
                            subtitle: copiedEndpoint ? "Copied!" : engine.endpoint) {
                    engine.copyEndpoint()
                    copiedEndpoint = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { copiedEndpoint = false }
                }

                QuickAction(icon: "curlybraces", title: "Copy SDK Config",
                            subtitle: copiedConfig ? "Copied!" : "JS/TS client config") {
                    engine.copySdkConfig()
                    copiedConfig = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { copiedConfig = false }
                }

                Divider().padding(.horizontal, 12)

                QuickAction(icon: "arrow.counterclockwise", title: "Reset All Data",
                            subtitle: "Restart server with clean state", tint: .orange) {
                    engine.resetAllData()
                }

                QuickAction(icon: "rectangle.3.group", title: "Open Data Browser",
                            subtitle: "Browse S3, DynamoDB, SQS") {
                    openDashboard()
                }
            }
            .padding(.vertical, 4)

            Divider()

            // Active services summary
            if engine.isRunning && !engine.serviceStats.isEmpty {
                ActiveServicesSummary(stats: engine.serviceStats)
                    .padding(12)
                Divider()
            }

            // Footer
            HStack {
                SettingsLink {
                    Label("Settings", systemImage: "gear")
                        .font(.caption)
                }
                .buttonStyle(.plain)

                Spacer()

                Button {
                    NSApplication.shared.terminate(nil)
                } label: {
                    Label("Quit", systemImage: "power")
                        .font(.caption)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Quit Tinstack")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
    }

    private func openDashboard() {
        NSApplication.shared.activate(ignoringOtherApps: true)
        if let window = NSApplication.shared.windows.first(where: { $0.title.contains("Dashboard") }) {
            window.makeKeyAndOrderFront(nil)
        }
    }
}

// MARK: - Server Header

private struct ServerHeader: View {
    let isRunning: Bool
    let port: Int
    let uptime: String
    let totalRequests: Int
    let onToggle: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            // Status icon
            ZStack {
                Circle()
                    .fill(isRunning ? Color.green.opacity(0.15) : Color.gray.opacity(0.1))
                    .frame(width: 36, height: 36)
                Image(systemName: isRunning ? "bolt.fill" : "bolt.slash")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(isRunning ? Color.green : Color.gray)
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text("Tinstack")
                        .font(.headline)
                    if isRunning {
                        Text(":\(port)")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
                if isRunning {
                    Text("\(totalRequests) reqs \u{2022} \(uptime)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                } else {
                    Text("Stopped")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            Button(action: onToggle) {
                Image(systemName: isRunning ? "stop.circle.fill" : "play.circle.fill")
                    .font(.system(size: 24))
                    .foregroundStyle(isRunning ? Color.red : Color.green)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isRunning ? "Stop server" : "Start server")
        }
    }
}

// MARK: - Quick Action Row

private struct QuickAction: View {
    let icon: String
    let title: String
    let subtitle: String
    var tint: Color = .accentColor
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                    .foregroundStyle(tint)
                    .frame(width: 20)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.callout)
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(.quaternary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(title): \(subtitle)")
    }
}

// MARK: - Active Services Summary

private struct ActiveServicesSummary: View {
    let stats: [TinstackEngine.ServiceStat]

    private var active: [TinstackEngine.ServiceStat] {
        stats.filter { $0.requestCount > 0 }
            .sorted { $0.requestCount > $1.requestCount }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Active Services")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(active.count) / \(stats.count)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            if active.isEmpty {
                Text("No requests yet")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                // Show top 5 as compact pills
                FlowLayout(spacing: 4) {
                    ForEach(active.prefix(8)) { stat in
                        HStack(spacing: 3) {
                            Text(stat.name)
                                .font(.system(size: 10))
                            Text("\(stat.requestCount)")
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.accentColor.opacity(0.1), in: Capsule())
                    }
                    if active.count > 8 {
                        Text("+\(active.count - 8) more")
                            .font(.system(size: 9))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                    }
                }
            }
        }
    }
}

// MARK: - Flow Layout (wrapping horizontal layout)

struct FlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = computeRows(proposal: proposal, subviews: subviews)
        var height: CGFloat = 0
        for row in rows {
            height += row.map { $0.sizeThatFits(.unspecified).height }.max() ?? 0
        }
        height += CGFloat(max(0, rows.count - 1)) * spacing
        return CGSize(width: proposal.width ?? 0, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = computeRows(proposal: proposal, subviews: subviews)
        var y = bounds.minY
        for row in rows {
            let rowHeight = row.map { $0.sizeThatFits(.unspecified).height }.max() ?? 0
            var x = bounds.minX
            for view in row {
                let size = view.sizeThatFits(.unspecified)
                view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += rowHeight + spacing
        }
    }

    private func computeRows(proposal: ProposedViewSize, subviews: Subviews) -> [[LayoutSubviews.Element]] {
        let maxWidth = proposal.width ?? .infinity
        var rows: [[LayoutSubviews.Element]] = [[]]
        var currentWidth: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if currentWidth + size.width > maxWidth && !rows[rows.count - 1].isEmpty {
                rows.append([])
                currentWidth = 0
            }
            rows[rows.count - 1].append(view)
            currentWidth += size.width + spacing
        }
        return rows
    }
}
