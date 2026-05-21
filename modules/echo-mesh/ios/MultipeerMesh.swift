import Foundation
import MultipeerConnectivity

/**
 * iOS MultipeerConnectivity backend.
 *
 * Uses MCSession + MCNearbyServiceAdvertiser + MCNearbyServiceBrowser over
 * the `_echo._tcp` Bonjour service. MultipeerConnectivity gives us iOS↔iOS;
 * for iOS↔Android we fall back to [BleMesh].
 *
 * STAGE 2 status: skeleton. Module surface honoured (events emit, sendText
 * returns stable ID). The MCSession delegate, advertiser/browser callbacks,
 * and payload framing are TODO.
 */
final class MultipeerMesh: NSObject, MeshTransport {
  private let emit: EmitFn
  private let serviceType = "echo"
  private var peerId: MCPeerID?
  private var session: MCSession?
  private var advertiser: MCNearbyServiceAdvertiser?
  private var browser: MCNearbyServiceBrowser?

  private var started = false
  private var selfIdentity = SelfIdentity(senderId: "00", name: "YOU")
  private var peers: [String: [String: Any]] = [:]

  init(emit: @escaping EmitFn) { self.emit = emit }

  func isAvailable() -> Bool { true }

  func start(_ identity: SelfIdentity) {
    if started { return }
    selfIdentity = identity
    started = true

    let pid = MCPeerID(displayName: "\(identity.name)#\(identity.senderId)")
    peerId = pid
    session = MCSession(peer: pid, securityIdentity: nil, encryptionPreference: .required)
    // TODO(stage-2): assign session.delegate = self after conforming to MCSessionDelegate.

    advertiser = MCNearbyServiceAdvertiser(peer: pid, discoveryInfo: ["id": identity.senderId], serviceType: serviceType)
    // TODO(stage-2): advertiser?.delegate = self ; advertiser?.startAdvertisingPeer()

    browser = MCNearbyServiceBrowser(peer: pid, serviceType: serviceType)
    // TODO(stage-2): browser?.delegate = self ; browser?.startBrowsingForPeers()

    emitState("discovering")
  }

  func stop() {
    guard started else { return }
    started = false
    advertiser?.stopAdvertisingPeer()
    browser?.stopBrowsingForPeers()
    session?.disconnect()
    peers.removeAll()
    emitState("offline")
  }

  func joinGroup(_ groupId: String) {
    // Carried in HELLO frame; no transport-level switch.
  }

  func sendText(groupId: String, body: String) -> String {
    let id = "M_" + String(UUID().uuidString.prefix(8))
    // TODO(stage-2): encode Frame(TEXT) and session.send(data, toPeers:, with: .reliable)
    emit("onMessage", [
      "id": id,
      "groupId": groupId,
      "senderId": selfIdentity.senderId,
      "senderName": selfIdentity.name,
      "kind": "text",
      "body": body,
      "ts": Date().timeIntervalSince1970 * 1000,
      "mine": true,
      "status": peers.isEmpty ? "queued" : "sent",
      "peerCount": peers.count,
    ])
    return id
  }

  func startVoice(_ groupId: String) {
    // TODO(stage-2): hook EchoAudio frame stream → session.send(frame, .unreliable)
    emit("onVoiceActivity", [
      "active": true,
      "talkerSenderId": selfIdentity.senderId,
      "talkerName": selfIdentity.name,
    ])
  }

  func stopVoice(_ groupId: String) {
    emit("onVoiceActivity", ["active": false])
  }

  func triggerSOS(groupId: String) -> String {
    let id = "SOS_" + String(UUID().uuidString.prefix(8))
    // TODO(stage-2): high-priority SOS frame, retransmit until ACKed.
    emit("onMessage", [
      "id": id,
      "groupId": groupId,
      "senderId": selfIdentity.senderId,
      "senderName": selfIdentity.name,
      "kind": "sos",
      "body": "SOS — broadcasting location to the group.",
      "ts": Date().timeIntervalSince1970 * 1000,
      "mine": true,
      "status": peers.isEmpty ? "queued" : "delivered",
      "peerCount": peers.count,
      "deliveredCount": peers.count,
    ])
    return id
  }

  func snapshotPeers() -> [[String: Any]] { Array(peers.values) }

  private func emitState(_ conn: String) {
    let maxHops = peers.values.map { ($0["hops"] as? Int) ?? 0 }.max() ?? 0
    emit("onState", [
      "conn": conn,
      "peerCount": peers.count,
      "hops": maxHops,
      "selfRole": "relay",
      "backend": "multipeer",
    ])
  }
}
