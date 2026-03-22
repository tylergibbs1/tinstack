import Foundation

/// Shared data model between the main app and widgets.
/// The app writes status to an App Group container; widgets read it.
struct TinstackStatus: Codable {
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

    struct ServiceSnapshot: Codable, Identifiable {
        var id: String { name }
        var name: String
        var requestCount: Int
        var errorCount: Int
    }

    struct RequestSnapshot: Codable, Identifiable {
        var id: String
        var method: String
        var service: String
        var target: String
        var status: Int
        var durationMs: String
        var timestamp: Date
    }

    static let empty = TinstackStatus(
        isRunning: false, port: 4566, region: "us-east-1",
        totalRequests: 0, totalErrors: 0, activeServiceCount: 0,
        uptimeSeconds: 0, topServices: [], recentRequests: [],
        lastUpdated: Date()
    )

    // MARK: - Persistence via App Group

    private static let suiteName = "group.com.tinstack.app"
    private static let key = "tinstack_status"

    static func load() -> TinstackStatus {
        guard let defaults = UserDefaults(suiteName: suiteName),
              let data = defaults.data(forKey: key),
              let status = try? JSONDecoder().decode(TinstackStatus.self, from: data)
        else { return .empty }
        return status
    }

    func save() {
        guard let defaults = UserDefaults(suiteName: TinstackStatus.suiteName),
              let data = try? JSONEncoder().encode(self)
        else { return }
        defaults.set(data, forKey: TinstackStatus.key)
    }
}
