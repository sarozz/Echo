import Foundation
import CoreBluetooth

/**
 * iOS Core Bluetooth backend — cross-platform fallback (mirrors Android BleMesh.kt).
 *
 * Each device runs both a CBPeripheralManager (advertises Echo's service +
 * exposes write + notify characteristics) and a CBCentralManager (scans,
 * connects, subscribes). UUIDs MUST match the Android side bit-for-bit.
 *
 * STAGE 2 status: skeleton. Module surface honoured. The advertise/scan/
 * subscribe/write loop is TODO.
 */
final class BleMesh: NSObject, MeshTransport {
  private let emit: EmitFn

  // Must match Android BleMesh.kt SERVICE_UUID / CHAR_*_UUID.
  static let serviceUUID = CBUUID(string: "E3000001-1C01-7E57-B1AD-1EA5DEADBEEF")
  static let writeUUID   = CBUUID(string: "E3000002-1C01-7E57-B1AD-1EA5DEADBEEF")
  static let notifyUUID  = CBUUID(string: "E3000003-1C01-7E57-B1AD-1EA5DEADBEEF")

  private var central: CBCentralManager?
  private var peripheral: CBPeripheralManager?
  private var started = false
  private var selfIdentity = SelfIdentity(senderId: "00", name: "YOU")
  private var peers: [String: [String: Any]] = [:]

  init(emit: @escaping EmitFn) { self.emit = emit }

  func isAvailable() -> Bool { true }

  func start(_ identity: SelfIdentity) {
    if started { return }
    selfIdentity = identity
    started = true
    central = CBCentralManager(delegate: nil, queue: nil)
    peripheral = CBPeripheralManager(delegate: nil, queue: nil)
    // TODO(stage-2):
    //  1. wait for poweredOn -> peripheral.add(service) + peripheral.startAdvertising
    //  2. central.scanForPeripherals(withServices: [serviceUUID])
    //  3. discover -> connect -> discoverServices -> subscribe to notifyUUID
    //  4. inbound bytes -> Frame.parse -> dispatch via emit
    emitState("discovering")
  }

  func stop() {
    guard started else { return }
    started = false
    central?.stopScan()
    peripheral?.stopAdvertising()
    peers.removeAll()
    emitState("offline")
  }

  func joinGroup(_ groupId: String) { /* HELLO frame */ }

  func sendText(groupId: String, body: String) -> String {
    let id = "M_" + String(UUID().uuidString.prefix(8))
    // TODO(stage-2): chunk Frame into MTU-sized writes; write to each peer.
    emit("onMessage", [
      "id": id, "groupId": groupId, "senderId": selfIdentity.senderId,
      "senderName": selfIdentity.name, "kind": "text", "body": body,
      "ts": Date().timeIntervalSince1970 * 1000, "mine": true,
      "status": peers.isEmpty ? "queued" : "sent",
      "peerCount": peers.count,
    ])
    return id
  }

  func startVoice(_ groupId: String) {
    // TODO(stage-2): mark voice channel open; EchoAudio publishes Opus frames
    //                that we chunk into BLE writes (<=180 bytes/frame).
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
    // TODO(stage-2): high-priority SOS, retransmit until ACKed.
    emit("onMessage", [
      "id": id, "groupId": groupId, "senderId": selfIdentity.senderId,
      "senderName": selfIdentity.name, "kind": "sos",
      "body": "SOS — broadcasting location to the group.",
      "ts": Date().timeIntervalSince1970 * 1000, "mine": true,
      "status": peers.isEmpty ? "queued" : "delivered",
      "peerCount": peers.count, "deliveredCount": peers.count,
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
      "backend": "ble",
    ])
  }
}
