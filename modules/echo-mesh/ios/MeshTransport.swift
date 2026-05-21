import Foundation

typealias EmitFn = (String, [String: Any]) -> Void

/**
 * Internal per-backend interface. JS only sees the EchoMesh module surface.
 */
protocol MeshTransport: AnyObject {
  func isAvailable() -> Bool
  func start(_ identity: SelfIdentity)
  func stop()
  func joinGroup(_ groupId: String)
  func sendText(groupId: String, body: String) -> String
  func startVoice(_ groupId: String)
  func stopVoice(_ groupId: String)
  func triggerSOS(groupId: String) -> String
  /// Broadcasts a captured Opus frame as a VOICE wire frame.
  func relayVoiceFrame(groupId: String, dataB64: String)
  func snapshotPeers() -> [[String: Any]]
}

/** Single emit channel for transports — bound by the module. */
final class MeshEventBus {
  static let shared = MeshEventBus()
  private var emit: EmitFn?
  func bind(_ fn: @escaping EmitFn) { emit = fn }
  func unbind() { emit = nil }
  func send(_ name: String, _ payload: [String: Any]) { emit?(name, payload) }
}
