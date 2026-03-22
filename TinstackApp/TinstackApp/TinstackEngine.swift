import Foundation
import Observation

@Observable
@MainActor
final class TinstackEngine {
    var isRunning = false
    var port: Int = 4566
    var region: String = "us-east-1"
    var accountId: String = "000000000000"
    var storageMode: String = "memory"
    var logLevel: String = "info"
    var binaryPath: String = ""
    var requestLog: [RequestEntry] = []
    var serviceStats: [ServiceStat] = []
    var totalRequests: Int = 0
    var uptimeStart: Date?
    var errorMessage: String?

    private var process: Process?
    private var outputPipe: Pipe?
    private var logParseTask: Task<Void, Never>?

    struct RequestEntry: Identifiable {
        let id = UUID()
        let timestamp: Date
        let method: String
        let target: String
        let status: Int
        let duration: String
        let service: String
    }

    struct ServiceStat: Identifiable, Equatable {
        let id: String
        var name: String
        var requestCount: Int
        var lastRequest: Date?
        var errorCount: Int
    }

    init() {
        detectBinary()
    }

    private func detectBinary() {
        let candidates = [
            Bundle.main.bundlePath + "/Contents/Resources/tinstack",
            FileManager.default.currentDirectoryPath + "/tinstack",
            NSHomeDirectory() + "/projects/tinstack/tinstack",
        ]
        for path in candidates {
            if FileManager.default.isExecutableFile(atPath: path) {
                binaryPath = path
                return
            }
        }
    }

    func start() {
        guard !isRunning else { return }
        guard !binaryPath.isEmpty else {
            errorMessage = "Tinstack binary not found. Build it with: bun run build"
            return
        }

        errorMessage = nil
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: binaryPath)
        proc.environment = [
            "PORT": String(port),
            "TINSTACK_DEFAULT_REGION": region,
            "TINSTACK_DEFAULT_ACCOUNT_ID": accountId,
            "TINSTACK_STORAGE_MODE": storageMode,
            "TINSTACK_LOG_LEVEL": logLevel,
        ]

        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = pipe
        outputPipe = pipe

        proc.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                self?.isRunning = false
                self?.uptimeStart = nil
            }
        }

        do {
            try proc.run()
            process = proc
            isRunning = true
            uptimeStart = Date()
            requestLog = []
            totalRequests = 0
            serviceStats = []
            startLogParsing(pipe: pipe)
        } catch {
            errorMessage = "Failed to start: \(error.localizedDescription)"
        }
    }

    func stop() {
        outputPipe?.fileHandleForReading.readabilityHandler = nil
        logParseTask?.cancel()
        logParseTask = nil
        process?.terminate()
        process = nil
        isRunning = false
        uptimeStart = nil
    }

    func restart() {
        stop()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.start()
        }
    }

    func clearLog() {
        requestLog = []
    }

    var uptime: String {
        guard let start = uptimeStart else { return "—" }
        let elapsed = Date().timeIntervalSince(start)
        let hours = Int(elapsed) / 3600
        let minutes = (Int(elapsed) % 3600) / 60
        let seconds = Int(elapsed) % 60
        if hours > 0 {
            return String(format: "%dh %dm %ds", hours, minutes, seconds)
        } else if minutes > 0 {
            return String(format: "%dm %ds", minutes, seconds)
        }
        return String(format: "%ds", seconds)
    }

    // MARK: - Log Parsing

    private func startLogParsing(pipe: Pipe) {
        let handle = pipe.fileHandleForReading
        handle.readabilityHandler = { [weak self] fileHandle in
            let data = fileHandle.availableData
            guard !data.isEmpty,
                  let text = String(data: data, encoding: .utf8)
            else { return }
            for singleLine in text.split(separator: "\n") {
                let line = String(singleLine)
                Task { @MainActor [weak self] in
                    self?.parseLine(line)
                }
            }
        }
    }

    private static let logRegex: NSRegularExpression? = {
        try? NSRegularExpression(pattern: #"(\w+)\s+(.+?)\s+→\s+(\d+)\s+\(([\d.]+)ms\)"#)
    }()

    @MainActor
    private func parseLine(_ line: String) {
        guard line.contains("→") else {
            // Startup lines like "Services: S3, SQS, ..."
            if line.contains("Services:") {
                let parts = line.components(separatedBy: "Services: ")
                if parts.count > 1 {
                    let services = parts[1].components(separatedBy: ", ")
                    serviceStats = services.map {
                        ServiceStat(id: $0, name: $0, requestCount: 0, lastRequest: nil, errorCount: 0)
                    }
                }
            }
            return
        }

        guard let regex = Self.logRegex,
              let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
              match.numberOfRanges == 5 else { return }

        let method = String(line[Range(match.range(at: 1), in: line)!])
        let target = String(line[Range(match.range(at: 2), in: line)!])
        let status = Int(line[Range(match.range(at: 3), in: line)!]) ?? 0
        let duration = String(line[Range(match.range(at: 4), in: line)!])

        // Determine service from target
        let service = resolveService(target: target)

        let entry = RequestEntry(
            timestamp: Date(),
            method: method,
            target: target,
            status: status,
            duration: duration,
            service: service
        )

        requestLog.insert(entry, at: 0)
        if requestLog.count > 500 { requestLog.removeLast() }
        totalRequests += 1

        // Update service stats
        if let idx = serviceStats.firstIndex(where: { $0.name == service }) {
            serviceStats[idx].requestCount += 1
            serviceStats[idx].lastRequest = Date()
            if status >= 400 { serviceStats[idx].errorCount += 1 }
        }

        // Sync to widgets every 10 requests
        if totalRequests % 10 == 0 { syncToWidgets() }
    }

    private func syncToWidgets() {
        let topServices = serviceStats
            .filter { $0.requestCount > 0 }
            .sorted { $0.requestCount > $1.requestCount }
            .prefix(10)

        let widgetStatus = WidgetStatus(
            isRunning: isRunning,
            port: port,
            region: region,
            totalRequests: totalRequests,
            totalErrors: serviceStats.reduce(0) { $0 + $1.errorCount },
            activeServiceCount: serviceStats.filter { $0.requestCount > 0 }.count,
            uptimeSeconds: Int(Date().timeIntervalSince(uptimeStart ?? Date())),
            topServices: topServices.map {
                WidgetStatus.ServiceSnapshot(name: $0.name, requestCount: $0.requestCount, errorCount: $0.errorCount)
            },
            recentRequests: requestLog.prefix(5).map {
                WidgetStatus.RequestSnapshot(id: $0.id.uuidString, method: $0.method, service: $0.service, target: $0.target, status: $0.status, durationMs: $0.duration, timestamp: $0.timestamp)
            },
            lastUpdated: Date()
        )
        widgetStatus.save()
    }

    /// Lightweight Codable struct for sharing with the widget extension.
    struct WidgetStatus: Codable {
        var isRunning: Bool
        var port: Int
        var region: String
        var totalRequests: Int
        var totalErrors: Int
        var activeServiceCount: Int
        var uptimeSeconds: Int
        var topServices: [ServiceSnapshot]
        var recentRequests: [RequestSnapshot]
        var lastUpdated: Date

        struct ServiceSnapshot: Codable { var name: String; var requestCount: Int; var errorCount: Int }
        struct RequestSnapshot: Codable { var id: String; var method: String; var service: String; var target: String; var status: Int; var durationMs: String; var timestamp: Date }

        private static let suiteName = "group.com.tinstack.app"
        private static let key = "tinstack_status"

        func save() {
            guard let defaults = UserDefaults(suiteName: WidgetStatus.suiteName),
                  let data = try? JSONEncoder().encode(self)
            else { return }
            defaults.set(data, forKey: WidgetStatus.key)
        }
    }

    private func resolveService(target: String) -> String {
        // JSON targets like "AmazonSQS.SendMessage" or "DynamoDB_20120810.PutItem"
        let jsonPrefixes: [(String, String)] = [
            ("DynamoDB_20120810", "DynamoDB"),
            ("AmazonSQS", "SQS"),
            ("AmazonSSM", "SSM"),
            ("secretsmanager", "Secrets Manager"),
            ("TrentService", "KMS"),
            ("Logs_20140328", "CloudWatch Logs"),
            ("AWSEvents", "EventBridge"),
            ("Kinesis_20131202", "Kinesis"),
            ("AWSCognitoIdentityProviderService", "Cognito"),
            ("AWSStepFunctions", "Step Functions"),
            ("GraniteServiceVersion20100801", "CloudWatch Metrics"),
            ("CertificateManager", "ACM"),
            ("AmazonEC2ContainerRegistry", "ECR"),
            ("AmazonEC2ContainerService", "ECS"),
            ("Firehose_20150804", "Firehose"),
            ("AWSWAF_20190729", "WAFv2"),
            ("AmazonAthena", "Athena"),
            ("AWSGlue", "Glue"),
            ("Textract", "Textract"),
            ("ElasticMapReduce", "EMR"),
            ("SageMaker", "SageMaker"),
            ("SWBExternalService", "SSO Admin"),
            ("AWSShield", "Shield"),
            ("CloudTrail", "CloudTrail"),
            ("CodeBuild", "CodeBuild"),
            ("CodePipeline", "CodePipeline"),
            ("CodeDeploy", "CodeDeploy"),
        ]
        for (prefix, name) in jsonPrefixes {
            if target.hasPrefix(prefix) { return name }
        }

        // REST targets by path
        let pathPrefixes: [(String, String)] = [
            ("/2015-03-31/functions", "Lambda"),
            ("/v2/apis", "API Gateway"),
            ("/2013-04-01/", "Route 53"),
            ("/v2/email/", "SES"),
            ("/2020-05-31/distribution", "CloudFront"),
            ("/v1/apis", "AppSync"),
            ("/2017-08-29/", "MediaConvert"),
            ("/model/", "Bedrock"),
            ("/2015-02-01/", "EFS"),
            ("/applications", "AppConfig"),
            ("/schedules", "Scheduler"),
            ("/clusters", "EKS"),
        ]
        for (prefix, name) in pathPrefixes {
            if target.hasPrefix(prefix) { return name }
        }

        // S3 fallback
        if target.hasPrefix("/") { return "S3" }
        return "Unknown"
    }
}
