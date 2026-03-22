import SwiftUI
import WidgetKit

// MARK: - Status Widget (small + medium)
// Shows: running/stopped, request count, uptime, error count

struct StatusEntry: TimelineEntry {
    let date: Date
    let status: TinstackStatus
}

struct StatusProvider: TimelineProvider {
    func placeholder(in context: Context) -> StatusEntry {
        StatusEntry(date: .now, status: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (StatusEntry) -> Void) {
        completion(StatusEntry(date: .now, status: TinstackStatus.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StatusEntry>) -> Void) {
        let status = TinstackStatus.load()
        let entry = StatusEntry(date: .now, status: status)
        // Refresh every 30 seconds when running, every 5 minutes when stopped
        let refreshInterval: TimeInterval = status.isRunning ? 30 : 300
        let nextUpdate = Date().addingTimeInterval(refreshInterval)
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

struct TinstackStatusWidget: Widget {
    let kind = "TinstackStatus"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StatusProvider()) { entry in
            StatusWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Tinstack Status")
        .description("Server status, requests, and uptime at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Small View

struct StatusWidgetSmallView: View {
    let entry: StatusEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Status indicator
            HStack(spacing: 6) {
                Circle()
                    .fill(entry.status.isRunning ? .green : .gray)
                    .frame(width: 10, height: 10)
                Text("Tinstack")
                    .font(.headline)
            }

            if entry.status.isRunning {
                // Uptime
                Label(formatUptime(entry.status.uptimeSeconds), systemImage: "clock")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                // Key metrics
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(entry.status.totalRequests)")
                            .font(.title2.weight(.bold).monospacedDigit())
                        Text("Requests")
                            .font(.system(size: 9))
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(entry.status.totalErrors)")
                            .font(.title2.weight(.bold).monospacedDigit())
                            .foregroundStyle(entry.status.totalErrors > 0 ? .red : .green)
                        Text("Errors")
                            .font(.system(size: 9))
                            .foregroundStyle(.secondary)
                    }
                }
            } else {
                Spacer()
                Text("Server stopped")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(":\(entry.status.port)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                Spacer()
            }
        }
        .padding(2)
    }
}

// MARK: - Medium View

struct StatusWidgetMediumView: View {
    let entry: StatusEntry

    var body: some View {
        HStack(spacing: 16) {
            // Left: status + metrics
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(entry.status.isRunning ? .green : .gray)
                        .frame(width: 10, height: 10)
                    Text("Tinstack")
                        .font(.headline)
                    if entry.status.isRunning {
                        Text(":\(entry.status.port)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                if entry.status.isRunning {
                    Label(formatUptime(entry.status.uptimeSeconds), systemImage: "clock")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Spacer()

                    HStack(spacing: 12) {
                        MetricPill(value: "\(entry.status.totalRequests)", label: "Requests", icon: "arrow.up.arrow.down")
                        MetricPill(value: "\(entry.status.activeServiceCount)", label: "Services", icon: "cube.box")
                        MetricPill(value: "\(entry.status.totalErrors)", label: "Errors", icon: "exclamationmark.triangle", color: entry.status.totalErrors > 0 ? .red : .green)
                    }
                } else {
                    Spacer()
                    Text("Server stopped")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
            }

            if entry.status.isRunning && !entry.status.topServices.isEmpty {
                Divider()

                // Right: top services
                VStack(alignment: .leading, spacing: 3) {
                    Text("Top Services")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)

                    ForEach(entry.status.topServices.prefix(5)) { svc in
                        HStack(spacing: 4) {
                            Text(svc.name)
                                .font(.system(size: 10))
                                .lineLimit(1)
                            Spacer()
                            Text("\(svc.requestCount)")
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(2)
    }
}

struct MetricPill: View {
    let value: String
    let label: String
    let icon: String
    var color: Color = .primary

    var body: some View {
        VStack(spacing: 1) {
            Image(systemName: icon)
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption.weight(.bold).monospacedDigit())
                .foregroundStyle(color)
            Text(label)
                .font(.system(size: 8))
                .foregroundStyle(.tertiary)
        }
    }
}

// MARK: - Unified Entry View

struct StatusWidgetView: View {
    let entry: StatusEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall:
            StatusWidgetSmallView(entry: entry)
        case .systemMedium:
            StatusWidgetMediumView(entry: entry)
        default:
            StatusWidgetSmallView(entry: entry)
        }
    }
}

// MARK: - Helper

func formatUptime(_ seconds: Int) -> String {
    if seconds < 60 { return "\(seconds)s" }
    if seconds < 3600 { return "\(seconds / 60)m \(seconds % 60)s" }
    return "\(seconds / 3600)h \((seconds % 3600) / 60)m"
}

// MARK: - Preview

#Preview("Small", as: .systemSmall) {
    TinstackStatusWidget()
} timeline: {
    StatusEntry(date: .now, status: TinstackStatus(
        isRunning: true, port: 4566, region: "us-east-1",
        totalRequests: 1247, totalErrors: 3, activeServiceCount: 42,
        uptimeSeconds: 7832, topServices: [], recentRequests: [],
        lastUpdated: .now
    ))
    StatusEntry(date: .now, status: .empty)
}

#Preview("Medium", as: .systemMedium) {
    TinstackStatusWidget()
} timeline: {
    StatusEntry(date: .now, status: TinstackStatus(
        isRunning: true, port: 4566, region: "us-east-1",
        totalRequests: 1247, totalErrors: 3, activeServiceCount: 42,
        uptimeSeconds: 7832,
        topServices: [
            .init(name: "S3", requestCount: 423, errorCount: 0),
            .init(name: "DynamoDB", requestCount: 312, errorCount: 1),
            .init(name: "SQS", requestCount: 198, errorCount: 0),
            .init(name: "Lambda", requestCount: 156, errorCount: 2),
            .init(name: "IAM", requestCount: 89, errorCount: 0),
        ],
        recentRequests: [],
        lastUpdated: .now
    ))
}
