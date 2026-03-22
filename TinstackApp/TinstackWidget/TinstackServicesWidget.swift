import SwiftUI
import WidgetKit

// MARK: - Services Widget (medium + large)
// Shows top services with request counts as a visual bar chart

struct ServicesEntry: TimelineEntry {
    let date: Date
    let status: TinstackStatus
}

struct ServicesProvider: TimelineProvider {
    func placeholder(in context: Context) -> ServicesEntry {
        ServicesEntry(date: .now, status: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (ServicesEntry) -> Void) {
        completion(ServicesEntry(date: .now, status: TinstackStatus.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ServicesEntry>) -> Void) {
        let status = TinstackStatus.load()
        let entry = ServicesEntry(date: .now, status: status)
        let refreshInterval: TimeInterval = status.isRunning ? 30 : 300
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(refreshInterval))))
    }
}

struct TinstackServicesWidget: Widget {
    let kind = "TinstackServices"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ServicesProvider()) { entry in
            ServicesWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Tinstack Services")
        .description("Live view of your most active AWS services.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

// MARK: - Medium View

struct ServicesWidgetMediumView: View {
    let entry: ServicesEntry

    var body: some View {
        if !entry.status.isRunning {
            stoppedView
        } else if entry.status.topServices.isEmpty {
            emptyView
        } else {
            serviceChart
        }
    }

    private var stoppedView: some View {
        VStack(spacing: 6) {
            Image(systemName: "icloud.slash")
                .font(.title)
                .foregroundStyle(.secondary)
            Text("Tinstack is not running")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var emptyView: some View {
        VStack(spacing: 6) {
            Image(systemName: "network")
                .font(.title)
                .foregroundStyle(.secondary)
            Text("Waiting for requests...")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var serviceChart: some View {
        let services = Array(entry.status.topServices.prefix(6))
        let maxCount = services.first?.requestCount ?? 1

        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Active Services")
                    .font(.caption.weight(.semibold))
                Spacer()
                Text("\(entry.status.totalRequests) total")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            ForEach(services) { svc in
                HStack(spacing: 6) {
                    Text(svc.name)
                        .font(.system(size: 10))
                        .frame(width: 70, alignment: .trailing)
                        .lineLimit(1)

                    GeometryReader { geo in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(svc.errorCount > 0 ? Color.orange.gradient : Color.blue.gradient)
                            .frame(width: max(4, geo.size.width * CGFloat(svc.requestCount) / CGFloat(maxCount)))
                    }
                    .frame(height: 12)

                    Text("\(svc.requestCount)")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .frame(width: 30, alignment: .trailing)
                }
            }
        }
        .padding(2)
    }
}

// MARK: - Large View

struct ServicesWidgetLargeView: View {
    let entry: ServicesEntry

    var body: some View {
        if !entry.status.isRunning {
            VStack(spacing: 8) {
                Image(systemName: "icloud.slash")
                    .font(.largeTitle)
                    .foregroundStyle(.secondary)
                Text("Tinstack is not running")
                    .font(.body)
                    .foregroundStyle(.secondary)
                Text("Start the server to see live service metrics")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        } else {
            VStack(alignment: .leading, spacing: 8) {
                // Header
                HStack {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(.green)
                            .frame(width: 8, height: 8)
                        Text("Tinstack")
                            .font(.headline)
                        Text(":\(entry.status.port)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(formatUptime(entry.status.uptimeSeconds))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                // Stats row
                HStack(spacing: 16) {
                    StatBlock(value: "\(entry.status.totalRequests)", label: "Requests", color: .blue)
                    StatBlock(value: "\(entry.status.activeServiceCount)", label: "Services", color: .green)
                    StatBlock(value: "\(entry.status.totalErrors)", label: "Errors", color: entry.status.totalErrors > 0 ? .red : .green)
                    StatBlock(value: entry.status.region, label: "Region", color: .orange)
                }

                Divider()

                // Services chart
                if entry.status.topServices.isEmpty {
                    Spacer()
                    HStack {
                        Spacer()
                        Text("Waiting for requests...")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                    Spacer()
                } else {
                    let services = Array(entry.status.topServices.prefix(10))
                    let maxCount = services.first?.requestCount ?? 1

                    ForEach(services) { svc in
                        HStack(spacing: 8) {
                            Text(svc.name)
                                .font(.system(size: 11))
                                .frame(width: 90, alignment: .trailing)
                                .lineLimit(1)

                            GeometryReader { geo in
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(svc.errorCount > 0 ? Color.orange.gradient : Color.blue.gradient)
                                    .frame(width: max(4, geo.size.width * CGFloat(svc.requestCount) / CGFloat(maxCount)))
                            }
                            .frame(height: 14)

                            HStack(spacing: 4) {
                                Text("\(svc.requestCount)")
                                    .font(.system(size: 10, design: .monospaced))
                                if svc.errorCount > 0 {
                                    Text("(\(svc.errorCount)err)")
                                        .font(.system(size: 8))
                                        .foregroundStyle(.red)
                                }
                            }
                            .frame(width: 60, alignment: .trailing)
                        }
                    }
                }

                // Recent requests
                if !entry.status.recentRequests.isEmpty {
                    Divider()
                    Text("Recent")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)

                    ForEach(entry.status.recentRequests.prefix(3)) { req in
                        HStack(spacing: 4) {
                            Text(req.method)
                                .font(.system(size: 8, weight: .bold, design: .monospaced))
                                .padding(.horizontal, 3)
                                .padding(.vertical, 1)
                                .background(methodColor(req.method).opacity(0.2), in: RoundedRectangle(cornerRadius: 2))
                            Text(req.service)
                                .font(.system(size: 9))
                                .foregroundStyle(.secondary)
                            Text(req.target)
                                .font(.system(size: 9, design: .monospaced))
                                .lineLimit(1)
                                .truncationMode(.middle)
                            Spacer()
                            Text("\(req.status)")
                                .font(.system(size: 9, weight: .medium, design: .monospaced))
                                .foregroundStyle(req.status < 400 ? .green : .red)
                        }
                    }
                }
            }
            .padding(2)
        }
    }

    private func methodColor(_ method: String) -> Color {
        switch method {
        case "GET": return .blue
        case "POST": return .green
        case "PUT": return .orange
        case "DELETE": return .red
        default: return .gray
        }
    }
}

struct StatBlock: View {
    let value: String
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.caption.weight(.bold).monospacedDigit())
                .foregroundStyle(color)
            Text(label)
                .font(.system(size: 8))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Unified View

struct ServicesWidgetView: View {
    let entry: ServicesEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemMedium:
            ServicesWidgetMediumView(entry: entry)
        case .systemLarge:
            ServicesWidgetLargeView(entry: entry)
        default:
            ServicesWidgetMediumView(entry: entry)
        }
    }
}

// MARK: - Previews

#Preview("Services Medium", as: .systemMedium) {
    TinstackServicesWidget()
} timeline: {
    ServicesEntry(date: .now, status: TinstackStatus(
        isRunning: true, port: 4566, region: "us-east-1",
        totalRequests: 2847, totalErrors: 12, activeServiceCount: 38,
        uptimeSeconds: 14520,
        topServices: [
            .init(name: "S3", requestCount: 823, errorCount: 0),
            .init(name: "DynamoDB", requestCount: 612, errorCount: 3),
            .init(name: "SQS", requestCount: 498, errorCount: 0),
            .init(name: "Lambda", requestCount: 356, errorCount: 5),
            .init(name: "IAM", requestCount: 189, errorCount: 0),
            .init(name: "KMS", requestCount: 145, errorCount: 0),
        ],
        recentRequests: [],
        lastUpdated: .now
    ))
}

#Preview("Services Large", as: .systemLarge) {
    TinstackServicesWidget()
} timeline: {
    ServicesEntry(date: .now, status: TinstackStatus(
        isRunning: true, port: 4566, region: "us-east-1",
        totalRequests: 2847, totalErrors: 12, activeServiceCount: 38,
        uptimeSeconds: 14520,
        topServices: [
            .init(name: "S3", requestCount: 823, errorCount: 0),
            .init(name: "DynamoDB", requestCount: 612, errorCount: 3),
            .init(name: "SQS", requestCount: 498, errorCount: 0),
            .init(name: "Lambda", requestCount: 356, errorCount: 5),
            .init(name: "IAM", requestCount: 189, errorCount: 0),
            .init(name: "KMS", requestCount: 145, errorCount: 0),
            .init(name: "ECS", requestCount: 98, errorCount: 1),
            .init(name: "CloudWatch", requestCount: 87, errorCount: 0),
            .init(name: "SNS", requestCount: 76, errorCount: 3),
            .init(name: "EventBridge", requestCount: 54, errorCount: 0),
        ],
        recentRequests: [
            .init(id: "1", method: "PUT", service: "S3", target: "/bucket/key.json", status: 200, durationMs: "0.3", timestamp: .now),
            .init(id: "2", method: "POST", service: "DynamoDB", target: "DynamoDB_20120810.PutItem", status: 200, durationMs: "0.1", timestamp: .now),
            .init(id: "3", method: "POST", service: "SQS", target: "AmazonSQS.SendMessage", status: 200, durationMs: "0.2", timestamp: .now),
        ],
        lastUpdated: .now
    ))
}
