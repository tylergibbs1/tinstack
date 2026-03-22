import SwiftUI

struct DashboardView: View {
    @Bindable var engine: TinstackEngine
    @State private var selectedTab: BrowserTab = .s3

    enum BrowserTab: String, CaseIterable {
        case s3 = "S3"
        case dynamodb = "DynamoDB"
        case sqs = "SQS"
    }

    var body: some View {
        NavigationSplitView {
            List(selection: $selectedTab) {
                Section("Data Browser") {
                    ForEach(BrowserTab.allCases, id: \.self) { tab in
                        Label(tab.rawValue, systemImage: iconFor(tab))
                            .tag(tab)
                    }
                }
            }
            .listStyle(.sidebar)
            .frame(minWidth: 160)
        } detail: {
            if !engine.isRunning {
                ContentUnavailableView {
                    Label("Server Not Running", systemImage: "bolt.slash")
                } description: {
                    Text("Start Tinstack to browse data")
                }
            } else {
                switch selectedTab {
                case .s3: S3BrowserView(engine: engine)
                case .dynamodb: DynamoDBBrowserView(engine: engine)
                case .sqs: SQSBrowserView(engine: engine)
                }
            }
        }
        .navigationTitle("Tinstack")
        .toolbar {
            ToolbarItem(placement: .navigation) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(engine.isRunning ? Color.green : Color.gray)
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
            }
        }
    }

    private func iconFor(_ tab: BrowserTab) -> String {
        switch tab {
        case .s3: return "externaldrive"
        case .dynamodb: return "tablecells"
        case .sqs: return "tray.2"
        }
    }
}

// MARK: - S3 Browser

struct S3BrowserView: View {
    @Bindable var engine: TinstackEngine
    @State private var selectedBucket: TinstackEngine.S3Bucket?

    var body: some View {
        HSplitView {
            // Bucket list
            VStack(spacing: 0) {
                HStack {
                    Text("Buckets")
                        .font(.headline)
                    Spacer()
                    Button(action: { Task { await engine.fetchS3Buckets() } }) {
                        Image(systemName: "arrow.clockwise")
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Refresh buckets")
                }
                .padding(10)

                Divider()

                if engine.s3Buckets.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "externaldrive")
                            .font(.title)
                            .foregroundStyle(.secondary)
                        Text("No buckets")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(engine.s3Buckets, selection: $selectedBucket) { bucket in
                        HStack {
                            Image(systemName: "folder")
                                .foregroundStyle(.blue)
                            Text(bucket.name)
                                .font(.callout)
                        }
                        .tag(bucket)
                    }
                }
            }
            .frame(minWidth: 200, idealWidth: 240)

            // Object list
            VStack(spacing: 0) {
                if let bucket = selectedBucket {
                    HStack {
                        Image(systemName: "folder.fill")
                            .foregroundStyle(.blue)
                        Text(bucket.name)
                            .font(.headline)
                        Spacer()
                        Text("\(engine.s3Objects.count) objects")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button(action: { Task { await engine.fetchS3Objects(bucket: bucket.name) } }) {
                            Image(systemName: "arrow.clockwise")
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(10)

                    Divider()

                    if engine.s3Objects.isEmpty {
                        ContentUnavailableView {
                            Label("Empty Bucket", systemImage: "tray")
                        } description: {
                            Text("No objects in \(bucket.name)")
                        }
                    } else {
                        Table(engine.s3Objects) {
                            TableColumn("Key") { obj in
                                HStack(spacing: 4) {
                                    Image(systemName: fileIcon(obj.key))
                                        .foregroundStyle(.secondary)
                                        .font(.caption)
                                    Text(obj.key)
                                        .font(.callout.monospaced())
                                        .lineLimit(1)
                                }
                            }
                            .width(min: 200, ideal: 400)

                            TableColumn("Size") { obj in
                                Text(formatBytes(obj.size))
                                    .font(.callout.monospacedDigit())
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
                } else {
                    ContentUnavailableView {
                        Label("Select a Bucket", systemImage: "sidebar.left")
                    } description: {
                        Text("Choose a bucket from the list to view objects")
                    }
                }
            }
        }
        .task { await engine.fetchS3Buckets() }
        .onChange(of: selectedBucket) {
            if let bucket = selectedBucket {
                Task { await engine.fetchS3Objects(bucket: bucket.name) }
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
        default: return "doc"
        }
    }

    private func formatBytes(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return String(format: "%.1f KB", Double(bytes) / 1024) }
        return String(format: "%.1f MB", Double(bytes) / (1024 * 1024))
    }
}

// MARK: - DynamoDB Browser

struct DynamoDBBrowserView: View {
    @Bindable var engine: TinstackEngine
    @State private var selectedTable: TinstackEngine.DDBTable?

    var body: some View {
        HSplitView {
            // Table list
            VStack(spacing: 0) {
                HStack {
                    Text("Tables")
                        .font(.headline)
                    Spacer()
                    Button(action: { Task { await engine.fetchDDBTables() } }) {
                        Image(systemName: "arrow.clockwise")
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Refresh tables")
                }
                .padding(10)

                Divider()

                if engine.ddbTables.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "tablecells")
                            .font(.title)
                            .foregroundStyle(.secondary)
                        Text("No tables")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(engine.ddbTables, selection: $selectedTable) { table in
                        HStack {
                            Image(systemName: "tablecells")
                                .foregroundStyle(.orange)
                            Text(table.name)
                                .font(.callout)
                        }
                        .tag(table)
                    }
                }
            }
            .frame(minWidth: 200, idealWidth: 240)

            // Items view
            VStack(spacing: 0) {
                if let table = selectedTable {
                    HStack {
                        Image(systemName: "tablecells.fill")
                            .foregroundStyle(.orange)
                        Text(table.name)
                            .font(.headline)
                        Spacer()
                        Text("\(engine.ddbItems.count) items")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button(action: { Task { await engine.fetchDDBItems(table: table.name) } }) {
                            Image(systemName: "arrow.clockwise")
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(10)

                    Divider()

                    if engine.ddbItems.isEmpty {
                        ContentUnavailableView {
                            Label("Empty Table", systemImage: "tray")
                        } description: {
                            Text("No items in \(table.name)")
                        }
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 1) {
                                ForEach(engine.ddbItems) { item in
                                    DDBItemRow(item: item)
                                }
                            }
                        }
                    }
                } else {
                    ContentUnavailableView {
                        Label("Select a Table", systemImage: "sidebar.left")
                    } description: {
                        Text("Choose a table from the list to view items")
                    }
                }
            }
        }
        .task { await engine.fetchDDBTables() }
        .onChange(of: selectedTable) {
            if let table = selectedTable {
                Task { await engine.fetchDDBItems(table: table.name) }
            }
        }
    }
}

private struct DDBItemRow: View {
    let item: TinstackEngine.DDBItem

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(item.attributes, id: \.key) { attr in
                HStack(alignment: .top, spacing: 8) {
                    Text(attr.key)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 100, alignment: .trailing)
                    Text(attr.value)
                        .font(.caption.monospaced())
                        .lineLimit(2)
                        .textSelection(.enabled)
                }
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.02))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - SQS Browser

struct SQSBrowserView: View {
    @Bindable var engine: TinstackEngine

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Queues")
                    .font(.headline)
                Spacer()
                Button(action: { Task { await engine.fetchSQSQueues() } }) {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Refresh queues")
            }
            .padding(10)

            Divider()

            if engine.sqsQueues.isEmpty {
                ContentUnavailableView {
                    Label("No Queues", systemImage: "tray.2")
                } description: {
                    Text("Create queues via the AWS SDK to see them here")
                }
            } else {
                List(engine.sqsQueues) { queue in
                    HStack(spacing: 10) {
                        Image(systemName: queue.name.hasSuffix(".fifo") ? "list.number" : "tray")
                            .foregroundStyle(.purple)
                            .frame(width: 20)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(queue.name)
                                .font(.callout.weight(.medium))
                            Text(queue.url)
                                .font(.caption2.monospaced())
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .textSelection(.enabled)
                        }

                        Spacer()

                        Button("Purge") {
                            Task { await engine.purgeSQSQueue(url: queue.url) }
                        }
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .buttonStyle(.plain)
                        .accessibilityLabel("Purge queue \(queue.name)")
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .task { await engine.fetchSQSQueues() }
    }
}
