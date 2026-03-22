import SwiftUI

struct DashboardView: View {
    @Bindable var engine: TinstackEngine
    @State private var selectedService: ServiceTab = .s3
    @State private var selectedBucket: TinstackEngine.S3Bucket?
    @State private var selectedTable: TinstackEngine.DDBTable?
    @State private var selectedQueue: TinstackEngine.SQSQueue?

    enum ServiceTab: String, CaseIterable, Identifiable {
        case s3 = "S3"
        case dynamodb = "DynamoDB"
        case sqs = "SQS"
        var id: String { rawValue }

        var icon: String {
            switch self {
            case .s3: return "externaldrive"
            case .dynamodb: return "tablecells"
            case .sqs: return "tray.2"
            }
        }
    }

    var body: some View {
        NavigationSplitView {
            // Column 1: Service + resource list
            List(selection: $selectedService) {
                Section("Data Browser") {
                    ForEach(ServiceTab.allCases) { tab in
                        Label(tab.rawValue, systemImage: tab.icon)
                            .tag(tab)
                    }
                }
            }
            .listStyle(.sidebar)
            .navigationSplitViewColumnWidth(min: 140, ideal: 160)
        } content: {
            // Column 2: Resources for selected service
            resourceList
                .navigationSplitViewColumnWidth(min: 180, ideal: 220)
        } detail: {
            // Column 3: Detail/items view
            detailView
        }
        .navigationTitle("Tinstack")
        .toolbar { toolbarContent }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .navigation) {
            HStack(spacing: 6) {
                Circle()
                    .fill(engine.isRunning ? Color.green : Color.red)
                    .frame(width: 8, height: 8)
                Text(engine.isRunning ? ":\(engine.port)" : "Stopped")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        ToolbarItem {
            Button {
                engine.isRunning ? engine.stop() : engine.start()
            } label: {
                Label(engine.isRunning ? "Stop" : "Start",
                      systemImage: engine.isRunning ? "stop.fill" : "play.fill")
            }
            .accessibilityLabel(engine.isRunning ? "Stop server" : "Start server")
        }
        ToolbarItem {
            Button(action: refreshCurrent) {
                Label("Refresh", systemImage: "arrow.clockwise")
            }
            .keyboardShortcut("r")
            .accessibilityLabel("Refresh data")
        }
    }

    // MARK: - Column 2: Resource List

    @ViewBuilder
    private var resourceList: some View {
        if !engine.isRunning {
            ContentUnavailableView("Server Stopped", systemImage: "bolt.slash",
                                   description: Text("Start the server to browse data"))
        } else {
            switch selectedService {
            case .s3: S3ResourceList(engine: engine, selectedBucket: $selectedBucket)
            case .dynamodb: DDBResourceList(engine: engine, selectedTable: $selectedTable)
            case .sqs: SQSResourceList(engine: engine, selectedQueue: $selectedQueue)
            }
        }
    }

    // MARK: - Column 3: Detail

    @ViewBuilder
    private var detailView: some View {
        if !engine.isRunning {
            ContentUnavailableView("Server Stopped", systemImage: "bolt.slash")
        } else {
            switch selectedService {
            case .s3:
                if let bucket = selectedBucket {
                    S3ObjectsDetail(engine: engine, bucket: bucket)
                } else {
                    ContentUnavailableView("Select a Bucket", systemImage: "folder",
                                           description: Text("Choose a bucket to view its objects"))
                }
            case .dynamodb:
                if let table = selectedTable {
                    DDBItemsDetail(engine: engine, table: table)
                } else {
                    ContentUnavailableView("Select a Table", systemImage: "tablecells",
                                           description: Text("Choose a table to view its items"))
                }
            case .sqs:
                if let queue = selectedQueue {
                    SQSQueueDetail(engine: engine, queue: queue)
                } else {
                    ContentUnavailableView("Select a Queue", systemImage: "tray.2",
                                           description: Text("Choose a queue to manage it"))
                }
            }
        }
    }

    private func refreshCurrent() {
        Task {
            switch selectedService {
            case .s3: await engine.fetchS3Buckets()
            case .dynamodb: await engine.fetchDDBTables()
            case .sqs: await engine.fetchSQSQueues()
            }
        }
    }
}

// MARK: - S3 Resource List (Column 2)

private struct S3ResourceList: View {
    @Bindable var engine: TinstackEngine
    @Binding var selectedBucket: TinstackEngine.S3Bucket?

    var body: some View {
        List(engine.s3Buckets, selection: $selectedBucket) { bucket in
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text(bucket.name)
                        .font(.callout)
                    if !bucket.creationDate.isEmpty {
                        Text(bucket.creationDate.prefix(10))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            } icon: {
                Image(systemName: "folder.fill")
                    .foregroundStyle(.blue)
            }
            .tag(bucket)
        }
        .navigationTitle("Buckets")
        .task { await engine.fetchS3Buckets() }
    }
}

// MARK: - S3 Objects Detail (Column 3)

private struct S3ObjectsDetail: View {
    @Bindable var engine: TinstackEngine
    let bucket: TinstackEngine.S3Bucket
    @State private var searchText = ""

    private var filteredObjects: [TinstackEngine.S3Object] {
        if searchText.isEmpty { return engine.s3Objects }
        return engine.s3Objects.filter { $0.key.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        Group {
            if engine.s3Objects.isEmpty {
                ContentUnavailableView("Empty Bucket", systemImage: "tray",
                                       description: Text("No objects in \(bucket.name)"))
            } else {
                Table(filteredObjects) {
                    TableColumn("Key") { obj in
                        Label {
                            Text(obj.key)
                                .font(.system(.body, design: .monospaced))
                                .lineLimit(1)
                        } icon: {
                            Image(systemName: fileIcon(obj.key))
                                .foregroundStyle(.secondary)
                        }
                    }
                    .width(min: 200, ideal: 400)

                    TableColumn("Size") { obj in
                        Text(formatBytes(obj.size))
                            .font(.body.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                    .width(ideal: 80)

                    TableColumn("") { obj in
                        Button(role: .destructive) {
                            Task { await engine.deleteS3Object(bucket: bucket.name, key: obj.key) }
                        } label: {
                            Image(systemName: "trash")
                                .font(.caption)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(.red)
                        .accessibilityLabel("Delete \(obj.key)")
                    }
                    .width(30)
                }
            }
        }
        .navigationTitle(bucket.name)
        .searchable(text: $searchText, prompt: "Filter objects")
        .task(id: bucket.id) { await engine.fetchS3Objects(bucket: bucket.name) }
        .toolbar {
            ToolbarItem {
                Text("\(filteredObjects.count) objects")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func fileIcon(_ key: String) -> String {
        if key.hasSuffix("/") { return "folder" }
        let ext = key.split(separator: ".").last.map(String.init)?.lowercased() ?? ""
        switch ext {
        case "json": return "curlybraces"
        case "txt", "md", "csv": return "doc.text"
        case "png", "jpg", "jpeg", "gif", "svg": return "photo"
        case "pdf": return "doc.richtext"
        case "zip", "gz", "tar": return "doc.zipper"
        case "js", "ts", "py", "rb", "go": return "chevron.left.forwardslash.chevron.right"
        case "html", "css": return "globe"
        default: return "doc"
        }
    }

    private func formatBytes(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return String(format: "%.1f KB", Double(bytes) / 1024) }
        return String(format: "%.1f MB", Double(bytes) / (1024 * 1024))
    }
}

// MARK: - DynamoDB Resource List (Column 2)

private struct DDBResourceList: View {
    @Bindable var engine: TinstackEngine
    @Binding var selectedTable: TinstackEngine.DDBTable?

    var body: some View {
        List(engine.ddbTables, selection: $selectedTable) { table in
            Label {
                Text(table.name)
                    .font(.callout)
            } icon: {
                Image(systemName: "tablecells.fill")
                    .foregroundStyle(.orange)
            }
            .tag(table)
        }
        .navigationTitle("Tables")
        .task { await engine.fetchDDBTables() }
    }
}

// MARK: - DynamoDB Items Detail (Column 3)

private struct DDBItemsDetail: View {
    @Bindable var engine: TinstackEngine
    let table: TinstackEngine.DDBTable
    @State private var searchText = ""

    private var filteredItems: [TinstackEngine.DDBItem] {
        if searchText.isEmpty { return engine.ddbItems }
        return engine.ddbItems.filter { item in
            item.attributes.contains { $0.value.localizedCaseInsensitiveContains(searchText) }
        }
    }

    var body: some View {
        Group {
            if engine.ddbItems.isEmpty {
                ContentUnavailableView("Empty Table", systemImage: "tray",
                                       description: Text("No items in \(table.name)"))
            } else {
                ScrollView {
                    LazyVStack(spacing: 1) {
                        ForEach(filteredItems) { item in
                            DDBItemCard(item: item)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
            }
        }
        .navigationTitle(table.name)
        .searchable(text: $searchText, prompt: "Filter items")
        .task(id: table.id) { await engine.fetchDDBItems(table: table.name) }
        .toolbar {
            ToolbarItem {
                Text("\(filteredItems.count) items")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct DDBItemCard: View {
    let item: TinstackEngine.DDBItem

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(item.attributes, id: \.key) { attr in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(attr.key)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                        .frame(minWidth: 80, alignment: .trailing)
                    Text(attr.value)
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                        .lineLimit(3)
                    Spacer()
                }
            }
        }
        .padding(10)
        .background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: 6))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - SQS Resource List (Column 2)

private struct SQSResourceList: View {
    @Bindable var engine: TinstackEngine
    @Binding var selectedQueue: TinstackEngine.SQSQueue?

    var body: some View {
        List(engine.sqsQueues, selection: $selectedQueue) { queue in
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text(queue.name)
                        .font(.callout)
                    if queue.name.hasSuffix(".fifo") {
                        Text("FIFO")
                            .font(.system(size: 9, weight: .semibold))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(.purple.opacity(0.15), in: Capsule())
                            .foregroundStyle(.purple)
                    }
                }
            } icon: {
                Image(systemName: queue.name.hasSuffix(".fifo") ? "list.number" : "tray.fill")
                    .foregroundStyle(.purple)
            }
            .tag(queue)
        }
        .navigationTitle("Queues")
        .task { await engine.fetchSQSQueues() }
    }
}

// MARK: - SQS Queue Detail (Column 3)

private struct SQSQueueDetail: View {
    @Bindable var engine: TinstackEngine
    let queue: TinstackEngine.SQSQueue

    var body: some View {
        VStack(spacing: 0) {
            // Queue info card
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: queue.name.hasSuffix(".fifo") ? "list.number" : "tray.fill")
                        .font(.title2)
                        .foregroundStyle(.purple)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(queue.name)
                            .font(.title3.weight(.semibold))
                        Text(queue.url)
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                }

                Divider()

                HStack(spacing: 16) {
                    Button {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(queue.url, forType: .string)
                    } label: {
                        Label("Copy URL", systemImage: "doc.on.clipboard")
                    }
                    .accessibilityLabel("Copy queue URL")

                    Button(role: .destructive) {
                        Task { await engine.purgeSQSQueue(url: queue.url) }
                    } label: {
                        Label("Purge Queue", systemImage: "trash")
                    }
                    .foregroundStyle(.orange)
                    .accessibilityLabel("Purge all messages from queue")
                }
                .buttonStyle(.bordered)
            }
            .padding(20)

            Spacer()
        }
        .navigationTitle(queue.name)
    }
}
