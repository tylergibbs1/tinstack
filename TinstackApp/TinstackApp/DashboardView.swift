import SwiftUI

struct DashboardView: View {
    @Bindable var engine: TinstackEngine
    @State private var selectedTab = "services"
    @State private var searchText = ""
    @State private var selectedService: String?

    var body: some View {
        NavigationSplitView {
            sidebar
        } detail: {
            detailContent
        }
        .navigationTitle("Tinstack Dashboard")
        .toolbar {
            ToolbarItem(placement: .navigation) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(engine.isRunning ? Color.green : Color.gray)
                        .frame(width: 8, height: 8)
                    Text(engine.isRunning ? "Running on :\(engine.port)" : "Stopped")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            ToolbarItem {
                Button {
                    if engine.isRunning { engine.stop() } else { engine.start() }
                } label: {
                    Label(
                        engine.isRunning ? "Stop" : "Start",
                        systemImage: engine.isRunning ? "stop.fill" : "play.fill"
                    )
                }
            }
        }
    }

    // MARK: - Sidebar

    private var sidebar: some View {
        List(selection: $selectedTab) {
            Section("Monitor") {
                Label("Services", systemImage: "cube.box")
                    .tag("services")
                Label("Request Log", systemImage: "list.bullet.rectangle")
                    .tag("requests")
                Label("Metrics", systemImage: "chart.bar")
                    .tag("metrics")
            }

            Section("Browse") {
                Label("S3 Buckets", systemImage: "externaldrive")
                    .tag("s3")
                Label("DynamoDB Tables", systemImage: "tablecells")
                    .tag("dynamodb")
                Label("SQS Queues", systemImage: "tray.2")
                    .tag("sqs")
            }
        }
        .listStyle(.sidebar)
        .frame(minWidth: 180)
    }

    // MARK: - Detail Content

    @ViewBuilder
    private var detailContent: some View {
        switch selectedTab {
        case "services":
            ServicesListView(engine: engine, searchText: $searchText)
        case "requests":
            RequestLogView(engine: engine)
        case "metrics":
            MetricsView(engine: engine)
        default:
            ComingSoonView(feature: selectedTab)
        }
    }
}

// MARK: - Services List

struct ServicesListView: View {
    @Bindable var engine: TinstackEngine
    @Binding var searchText: String
    @State private var filteredServices: [TinstackEngine.ServiceStat] = []

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Filter services...", text: $searchText)
                    .textFieldStyle(.plain)
                if !searchText.isEmpty {
                    Button { searchText = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(8)
            .background(.quaternary.opacity(0.5))

            Divider()

            if filteredServices.isEmpty && !engine.isRunning {
                ContentUnavailableView {
                    Label("Server Not Running", systemImage: "icloud.slash")
                } description: {
                    Text("Start the server to see active services")
                }
            } else if filteredServices.isEmpty {
                ContentUnavailableView {
                    Label("No Matching Services", systemImage: "magnifyingglass")
                } description: {
                    Text("No services match \"\(searchText)\"")
                }
            } else {
                Table(filteredServices) {
                    TableColumn("Service") { stat in
                        HStack(spacing: 6) {
                            Circle()
                                .fill(.green)
                                .frame(width: 6, height: 6)
                            Text(stat.name)
                                .font(.body)
                        }
                    }
                    .width(min: 120, ideal: 180)

                    TableColumn("Requests") { stat in
                        Text("\(stat.requestCount)")
                            .font(.body.monospacedDigit())
                            .foregroundStyle(stat.requestCount > 0 ? Color.primary : Color.gray)
                    }
                    .width(ideal: 80)

                    TableColumn("Errors") { stat in
                        Text("\(stat.errorCount)")
                            .font(.body.monospacedDigit())
                            .foregroundStyle(stat.errorCount > 0 ? Color.red : Color.gray)
                    }
                    .width(ideal: 60)

                    TableColumn("Last Request") { stat in
                        if let last = stat.lastRequest {
                            Text(last, style: .relative)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            Text("—")
                                .foregroundStyle(.secondary)
                        }
                    }
                    .width(ideal: 120)
                }
            }
        }
        .onChange(of: searchText) { updateFilter() }
        .onChange(of: engine.serviceStats) { updateFilter() }
        .onAppear { updateFilter() }
    }

    private func updateFilter() {
        if searchText.isEmpty {
            filteredServices = engine.serviceStats
        } else {
            filteredServices = engine.serviceStats.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
        }
    }
}

// MARK: - Request Log

struct RequestLogView: View {
    @Bindable var engine: TinstackEngine
    @State private var filterService = "All"
    @State private var filterStatus = "All"
    @State private var filteredLog: [TinstackEngine.RequestEntry] = []
    @State private var availableServices: [String] = []

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Picker("Service:", selection: $filterService) {
                    Text("All").tag("All")
                    ForEach(availableServices, id: \.self) { svc in
                        Text(svc).tag(svc)
                    }
                }
                .frame(width: 200)

                Picker("Status:", selection: $filterStatus) {
                    Text("All").tag("All")
                    Text("Success").tag("Success")
                    Text("Error").tag("Error")
                }
                .frame(width: 140)

                Spacer()

                Text("\(filteredLog.count) requests")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Button("Clear") { engine.clearLog() }
                    .font(.caption)
            }
            .padding(8)
            .background(.quaternary.opacity(0.5))

            Divider()

            if filteredLog.isEmpty {
                ContentUnavailableView {
                    Label("No Requests", systemImage: "network.slash")
                } description: {
                    Text("Requests will appear here as they come in")
                }
            } else {
                Table(filteredLog) {
                    TableColumn("Time") { entry in
                        Text(entry.timestamp, style: .time)
                            .font(.system(.caption, design: .monospaced))
                    }
                    .width(ideal: 80)

                    TableColumn("Method") { entry in
                        Text(entry.method)
                            .font(.system(.caption, design: .monospaced, weight: .bold))
                            .foregroundStyle(methodColor(entry.method))
                    }
                    .width(ideal: 50)

                    TableColumn("Service") { entry in
                        Text(entry.service)
                            .font(.caption)
                    }
                    .width(ideal: 100)

                    TableColumn("Target") { entry in
                        Text(entry.target)
                            .font(.system(.caption, design: .monospaced))
                            .lineLimit(1)
                    }
                    .width(min: 150, ideal: 300)

                    TableColumn("Status") { entry in
                        Text("\(entry.status)")
                            .font(.system(.caption, design: .monospaced, weight: .semibold))
                            .foregroundStyle(entry.status < 400 ? .green : .red)
                    }
                    .width(ideal: 50)

                    TableColumn("Duration") { entry in
                        Text("\(entry.duration)ms")
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                    .width(ideal: 60)
                }
            }
        }
        .onChange(of: filterService) { updateLogFilter() }
        .onChange(of: filterStatus) { updateLogFilter() }
        .onChange(of: engine.requestLog.count) { updateLogFilter() }
        .onAppear { updateLogFilter() }
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

    private func updateLogFilter() {
        filteredLog = engine.requestLog.filter { entry in
            (filterService == "All" || entry.service == filterService) &&
            (filterStatus == "All" ||
             (filterStatus == "Success" && entry.status < 400) ||
             (filterStatus == "Error" && entry.status >= 400))
        }
        availableServices = Array(Set(engine.requestLog.map(\.service))).sorted()
    }
}

// MARK: - Metrics

struct MetricsView: View {
    @Bindable var engine: TinstackEngine
    @State private var topServices: [TinstackEngine.ServiceStat] = []
    @State private var activeCount = 0
    @State private var errorTotal = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 16) {
                    MetricCard(title: "Total Requests", value: "\(engine.totalRequests)", icon: "arrow.up.arrow.down", color: .blue)
                    MetricCard(title: "Active Services", value: "\(activeCount)", icon: "cube.box.fill", color: .green)
                    MetricCard(title: "Total Errors", value: "\(errorTotal)", icon: "exclamationmark.triangle.fill", color: .red)
                    MetricCard(title: "Uptime", value: engine.uptime, icon: "clock.fill", color: .orange)
                }
                .padding(.horizontal)

                if !topServices.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Top Services by Request Count")
                            .font(.headline)
                            .padding(.horizontal)

                        let maxCount = topServices.first?.requestCount ?? 1
                        ForEach(topServices) { stat in
                            HStack(spacing: 8) {
                                Text(stat.name)
                                    .font(.caption)
                                    .frame(width: 120, alignment: .trailing)

                                GeometryReader { geo in
                                    RoundedRectangle(cornerRadius: 3)
                                        .fill(.blue.gradient)
                                        .frame(width: max(4, geo.size.width * CGFloat(stat.requestCount) / CGFloat(maxCount)))
                                }
                                .frame(height: 16)

                                Text("\(stat.requestCount)")
                                    .font(.caption.monospacedDigit())
                                    .foregroundStyle(.secondary)
                                    .frame(width: 40, alignment: .trailing)
                            }
                            .padding(.horizontal)
                        }
                    }
                }
            }
            .padding(.vertical)
        }
        .onChange(of: engine.serviceStats) { updateMetrics() }
        .onAppear { updateMetrics() }
    }

    private func updateMetrics() {
        topServices = engine.serviceStats
            .filter { $0.requestCount > 0 }
            .sorted { $0.requestCount > $1.requestCount }
            .prefix(15)
            .map { $0 }
        activeCount = topServices.count
        errorTotal = engine.serviceStats.reduce(0) { $0 + $1.errorCount }
    }
}

struct MetricCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(color)
            Text(value)
                .font(.title3.weight(.semibold).monospacedDigit())
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Coming Soon

struct ComingSoonView: View {
    let feature: String

    var body: some View {
        ContentUnavailableView {
            Label("\(feature.capitalized) Browser", systemImage: "wrench.and.screwdriver")
        } description: {
            Text("Data browser coming soon")
        }
    }
}
