import Foundation
import CoreBluetooth
import UIKit
import os.log

/**
 * iOS Core Bluetooth backend — mirrors Android BleMesh.kt.
 *
 * Each device runs both a CBPeripheralManager (advertises Echo's service +
 * exposes a writable characteristic) and a CBCentralManager (scans the same
 * service, connects, writes frames). The shared UUIDs MUST match Android
 * bit-for-bit (defined as constants below).
 *
 * Symmetric write topology: A writes Frame bytes into B's writable
 * characteristic; B's peripheralManager(_:didReceiveWrite:) decodes them.
 * The NOTIFY characteristic is reserved for future peripheral-pushed frames
 * and is not subscribed today — symmetric writes handle both directions.
 */
final class BleMesh: NSObject, MeshTransport {
  private let emit: EmitFn

  // Must match Android BleMesh.kt SERVICE_UUID / CHAR_*_UUID bit-for-bit.
  static let serviceUUID = CBUUID(string: "E3000001-1C01-7E57-B1AD-1EA5DEADBEEF")
  static let writeUUID   = CBUUID(string: "E3000002-1C01-7E57-B1AD-1EA5DEADBEEF")
  static let notifyUUID  = CBUUID(string: "E3000003-1C01-7E57-B1AD-1EA5DEADBEEF")

  private var central: CBCentralManager?
  private var peripheral: CBPeripheralManager?
  private var advertisedService: CBMutableService?
  private var writeChar: CBMutableCharacteristic?
  private var notifyChar: CBMutableCharacteristic?

  // Outbound — peripherals we connected to as central.
  private var outboundPeripherals: [UUID: PeripheralLink] = [:]
  // App-level peer table keyed by sender-id (post-HELLO).
  private var peers: [String: PeerState] = [:]

  private var seq: UInt32 = 1
  private let seen = SeenSet(capacity: 512)
  private let pending = PendingTable()
  private static let retryMs: TimeInterval = 3.0
  private static let maxAttempts = 2

  private var started = false
  private var pendingAdvertise = false
  private var pendingScan = false
  private var selfIdentity = SelfIdentity(senderId: "00", name: "YOU")
  private var currentGroup = "main"

  private let log = OSLog(subsystem: "app.echo.prototype", category: "Ble")
  private let cbQueue = DispatchQueue(label: "echo.ble.cb", qos: .userInitiated)

  init(emit: @escaping EmitFn) { self.emit = emit }

  func isAvailable() -> Bool { true }

  func start(_ identity: SelfIdentity) {
    if started { return }
    selfIdentity = identity
    started = true
    pendingAdvertise = true
    pendingScan = true
    central = CBCentralManager(delegate: self, queue: cbQueue, options: [CBCentralManagerOptionShowPowerAlertKey: true])
    peripheral = CBPeripheralManager(delegate: self, queue: cbQueue, options: nil)
    UIDevice.current.isBatteryMonitoringEnabled = true
    emitState("discovering")
  }

  func stop() {
    guard started else { return }
    started = false
    pendingAdvertise = false
    pendingScan = false
    central?.stopScan()
    peripheral?.stopAdvertising()
    for (_, link) in outboundPeripherals {
      if let p = link.peripheral, let c = central { c.cancelPeripheralConnection(p) }
    }
    outboundPeripherals.removeAll()
    peers.removeAll()
    seen.clear()
    if let svc = advertisedService { peripheral?.remove(svc) }
    advertisedService = nil
    writeChar = nil
    notifyChar = nil
    emitPeers()
    emitState("offline")
  }

  func joinGroup(_ groupId: String) {
    currentGroup = groupId
    broadcastFrame(makeHelloFrame())
  }

  func sendText(groupId: String, body: String) -> String {
    let jsId = "M_" + String(UUID().uuidString.prefix(8))
    let frame = Frame(
      kind: Frame.KIND_TEXT,
      hopCount: 0,
      senderId: selfIdentity.senderId,
      groupId: groupId,
      messageId: nextSeq(),
      timestamp: UInt32(Date().timeIntervalSince1970),
      payload: Frame.textPayload(body)
    )
    _ = seen.add(messageKey(frame))
    let n = broadcastFrame(frame)
    if n > 0 {
      let entry = PendingTable.Entry(
        jsId: jsId, groupId: frame.groupId, body: body,
        kind: frame.kind, frame: frame, expectedAcks: peers.count
      )
      pending.put(frame.messageId, entry)
      scheduleBleRetransmit(entry)
    }
    emit("onMessage", outboundEventMap(jsId: jsId, frame: frame, body: body, status: n == 0 ? "queued" : "sent", delivered: 0))
    return jsId
  }

  func startVoice(_ groupId: String) {
    emit("onVoiceActivity", [
      "active": true,
      "talkerSenderId": selfIdentity.senderId,
      "talkerName": selfIdentity.name,
    ])
  }

  func stopVoice(_ groupId: String) {
    emit("onVoiceActivity", ["active": false])
  }

  func replay(groupId: String, senderId: String, wireMessageId: UInt32, ts: Double, kind: String, body: String) {
    if outboundPeripherals.isEmpty { return }
    let frameKind: UInt8 = (kind == "sos") ? Frame.KIND_SOS : Frame.KIND_TEXT
    let frame = Frame(
      kind: frameKind,
      hopCount: 0,
      senderId: senderId,
      groupId: groupId,
      messageId: wireMessageId,
      timestamp: UInt32(truncatingIfNeeded: Int64(ts / 1000)),
      payload: Frame.textPayload(body)
    )
    broadcastFrame(frame)
  }

  func relayVoiceFrame(groupId: String, dataB64: String) {
    guard let payload = Data(base64Encoded: dataB64) else { return }
    // TODO(stage-2): chunk if encoded frame > MTU.
    let frame = Frame(
      kind: Frame.KIND_VOICE,
      hopCount: 0,
      senderId: selfIdentity.senderId,
      groupId: groupId,
      messageId: nextSeq(),
      timestamp: UInt32(Date().timeIntervalSince1970),
      payload: payload
    )
    _ = seen.add(messageKey(frame))
    broadcastFrame(frame)
  }

  func triggerSOS(groupId: String) -> String {
    let jsId = "SOS_" + String(UUID().uuidString.prefix(8))
    let body = "SOS — broadcasting location to the group."
    let frame = Frame(
      kind: Frame.KIND_SOS,
      hopCount: 0,
      senderId: selfIdentity.senderId,
      groupId: groupId,
      messageId: nextSeq(),
      timestamp: UInt32(Date().timeIntervalSince1970),
      payload: Frame.textPayload(body)
    )
    _ = seen.add(messageKey(frame))
    let n = broadcastFrame(frame)
    if n > 0 {
      let entry = PendingTable.Entry(
        jsId: jsId, groupId: frame.groupId, body: body,
        kind: frame.kind, frame: frame, expectedAcks: peers.count
      )
      pending.put(frame.messageId, entry)
      scheduleBleRetransmit(entry)
    }
    emit("onMessage", outboundEventMap(jsId: jsId, frame: frame, body: body, status: n == 0 ? "queued" : "sent", delivered: 0))
    return jsId
  }

  func snapshotPeers() -> [[String: Any]] { return peers.values.map { $0.toDict() } }

  // --- frame helpers ----------------------------------------------------

  @discardableResult
  private func broadcastFrame(_ frame: Frame) -> Int {
    let bytes = frame.encode()
    var n = 0
    for (_, link) in outboundPeripherals {
      if link.write(bytes: bytes) { n += 1 }
    }
    return n
  }

  private func relayFrame(_ frame: Frame, exceptPeripheralId: UUID) {
    guard frame.hopCount < Frame.maxHops else { return }
    let bytes = frame.bumpedHop().encode()
    for (id, link) in outboundPeripherals {
      if id == exceptPeripheralId { continue }
      _ = link.write(bytes: bytes)
    }
  }

  private func handleIncomingFrame(fromPeripheralId: UUID?, frame: Frame) {
    if frame.senderId == selfIdentity.senderId { return }
    let key = messageKey(frame)
    if !seen.add(key) { return }

    switch frame.kind {
    case Frame.KIND_HELLO:
      applyHello(fromPeripheralId: fromPeripheralId, frame: frame)

    case Frame.KIND_TEXT, Frame.KIND_SOS:
      emit("onMessage", incomingEventMap(frame: frame))
      sendAck(fromPeripheralId: fromPeripheralId, ackTarget: frame)
      if let id = fromPeripheralId {
        relayFrame(frame, exceptPeripheralId: id)
      } else {
        // Came in via the GATT server side — we don't know which outbound
        // link to skip, so relay to all.
        broadcastFrame(frame.bumpedHop())
      }

    case Frame.KIND_VOICE:
      emit("onVoiceFrame", [
        "senderId": frame.senderId,
        "data": frame.payload.base64EncodedString(),
        "ts": Date().timeIntervalSince1970 * 1000,
        "durationMs": 20,
      ])
      if let id = fromPeripheralId {
        relayFrame(frame, exceptPeripheralId: id)
      }

    case Frame.KIND_ACK:
      guard let target = Frame.parseAck(frame.payload) else { break }
      guard let entry = pending.ack(target, by: frame.senderId) else { break }
      let done = entry.ackedBy.count >= entry.expectedAcks
      var m = outboundEventMap(
        jsId: entry.jsId,
        frame: entry.frame,
        body: entry.body,
        status: done ? "delivered" : "sent",
        delivered: entry.ackedBy.count
      )
      m["ackingSenderId"] = frame.senderId
      emit("onMessage", m)
      if done { _ = pending.remove(target) }

    default:
      break
    }
  }

  /// Sends a direct ACK back to the sender via the outbound link, if known.
  private func sendAck(fromPeripheralId: UUID?, ackTarget: Frame) {
    let ack = Frame(
      kind: Frame.KIND_ACK,
      hopCount: 0,
      senderId: selfIdentity.senderId,
      groupId: ackTarget.groupId,
      messageId: nextSeq(),
      timestamp: UInt32(Date().timeIntervalSince1970),
      payload: Frame.ackPayload(ackTarget.messageId)
    )
    let bytes = ack.encode()
    if let id = fromPeripheralId, let link = outboundPeripherals[id] {
      _ = link.write(bytes: bytes)
    } else {
      // Came via our peripheral with no outbound mapping; broadcast and let
      // dedup at the sender catch duplicates.
      for (_, link) in outboundPeripherals { _ = link.write(bytes: bytes) }
    }
  }

  /// Schedule a single retransmit after retryMs if not all peers have ACKed.
  private func scheduleBleRetransmit(_ entry: PendingTable.Entry) {
    DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + BleMesh.retryMs) { [weak self] in
      guard let self = self else { return }
      guard let current = self.pending.get(entry.frame.messageId) else { return }
      if current.ackedBy.count >= current.expectedAcks { return }
      if current.attempt >= BleMesh.maxAttempts { return }
      current.attempt += 1
      let bytes = current.frame.encode()
      for (_, link) in self.outboundPeripherals {
        if let sid = link.peerSenderId, current.ackedBy.contains(sid) { continue }
        _ = link.write(bytes: bytes)
      }
    }
  }

  private func applyHello(fromPeripheralId: UUID?, frame: Frame) {
    guard let json = try? JSONSerialization.jsonObject(with: frame.payload, options: []) as? [String: Any] else {
      return
    }
    let name = (json["name"] as? String) ?? "PEER"
    let platform = (json["platform"] as? String) ?? "ios"
    let role = (json["role"] as? String) ?? "relay"
    let battery = (json["battery"] as? Int) ?? 0

    let existing = peers[frame.senderId]
    peers[frame.senderId] = PeerState(
      senderId: frame.senderId,
      name: name,
      platform: platform,
      role: role,
      battery: battery,
      hops: existing?.hops ?? 1,
      rssi: fromPeripheralId.flatMap { outboundPeripherals[$0]?.rssi }
    )
    if let id = fromPeripheralId, let link = outboundPeripherals[id] {
      link.peerSenderId = frame.senderId
    }
    emitPeers()
  }

  private func makeHelloFrame() -> Frame {
    let dict: [String: Any] = [
      "name": selfIdentity.name,
      "platform": "ios",
      "role": "relay",
      "battery": batteryPercent(),
    ]
    let payload = (try? JSONSerialization.data(withJSONObject: dict, options: [])) ?? Data()
    return Frame(
      kind: Frame.KIND_HELLO,
      hopCount: 0,
      senderId: selfIdentity.senderId,
      groupId: currentGroup,
      messageId: nextSeq(),
      timestamp: UInt32(Date().timeIntervalSince1970),
      payload: payload
    )
  }

  // --- emit helpers -----------------------------------------------------

  private func emitPeers() {
    emit("onPeers", ["peers": peers.values.map { $0.toDict() }])
    emitState(peers.isEmpty ? "discovering" : "connected")
  }

  private func emitState(_ conn: String) {
    let maxHops = peers.values.map { $0.hops }.max() ?? 0
    emit("onState", [
      "conn": conn,
      "peerCount": peers.count,
      "hops": maxHops,
      "selfRole": "relay",
      "backend": "ble",
    ])
  }

  private func outboundEventMap(jsId: String, frame: Frame, body: String, status: String, delivered: Int) -> [String: Any] {
    return [
      "id": jsId,
      "groupId": frame.groupId,
      "senderId": selfIdentity.senderId,
      "senderName": selfIdentity.name,
      "kind": Frame.kindWire(frame.kind),
      "body": body,
      "ts": Date().timeIntervalSince1970 * 1000,
      "mine": true,
      "status": status,
      "peerCount": peers.count,
      "deliveredCount": delivered,
      "wireMessageId": Double(frame.messageId),
    ]
  }

  private func incomingEventMap(frame: Frame) -> [String: Any] {
    let sender = peers[frame.senderId]
    return [
      "id": "M_\(frame.senderId)_\(frame.messageId)",
      "groupId": frame.groupId,
      "senderId": frame.senderId,
      "senderName": sender?.name ?? "PEER",
      "kind": Frame.kindWire(frame.kind),
      "body": Frame.textBody(frame.payload),
      "ts": Double(frame.timestamp) * 1000.0,
      "mine": false,
      "status": frame.hopCount > 0 ? "relayed" : "delivered",
      "relayedHops": frame.hopCount,
      "wireMessageId": Double(frame.messageId),
    ]
  }

  // --- utils ------------------------------------------------------------

  private func nextSeq() -> UInt32 {
    let v = seq
    seq &+= 1
    return v
  }

  private func messageKey(_ frame: Frame) -> String {
    return "\(frame.senderId):\(frame.messageId)"
  }

  private func batteryPercent() -> Int {
    let lvl = UIDevice.current.batteryLevel
    return lvl < 0 ? 0 : Int(lvl * 100)
  }

  struct PeerState {
    let senderId: String
    let name: String
    let platform: String
    let role: String
    let battery: Int
    let hops: Int
    let rssi: Int?
    func toDict() -> [String: Any] {
      var d: [String: Any] = [
        "senderId": senderId,
        "name": name,
        "platform": platform,
        "role": role,
        "battery": battery,
        "hops": hops,
        "backend": "ble",
      ]
      if let r = rssi { d["rssi"] = r }
      return d
    }
  }

  /// Per-peer outbound link state — peripheral + characteristic.
  final class PeripheralLink {
    let peripheral: CBPeripheral?
    var writeCharacteristic: CBCharacteristic?
    var rssi: Int = 0
    var peerSenderId: String? = nil

    init(peripheral: CBPeripheral?) { self.peripheral = peripheral }

    @discardableResult
    func write(bytes: Data) -> Bool {
      guard let p = peripheral, let c = writeCharacteristic else { return false }
      // .withResponse is reliable but slower; OK for TEXT/SOS.
      p.writeValue(bytes, for: c, type: .withResponse)
      return true
    }
  }
}

// MARK: - CBPeripheralManagerDelegate (we as peripheral)

extension BleMesh: CBPeripheralManagerDelegate {
  func peripheralManagerDidUpdateState(_ pm: CBPeripheralManager) {
    guard pm.state == .poweredOn else {
      os_log("peripheral state %{public}@", log: log, type: .info, "\(pm.state.rawValue)")
      emitState("offline")
      return
    }
    let svc = CBMutableService(type: BleMesh.serviceUUID, primary: true)
    let w = CBMutableCharacteristic(
      type: BleMesh.writeUUID,
      properties: [.write],
      value: nil,
      permissions: [.writeable]
    )
    let n = CBMutableCharacteristic(
      type: BleMesh.notifyUUID,
      properties: [.notify],
      value: nil,
      permissions: [.readable]
    )
    svc.characteristics = [w, n]
    pm.add(svc)
    advertisedService = svc
    writeChar = w
    notifyChar = n

    if pendingAdvertise {
      pm.startAdvertising([
        CBAdvertisementDataServiceUUIDsKey: [BleMesh.serviceUUID],
      ])
      pendingAdvertise = false
    }
  }

  func peripheralManager(_ pm: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
    for req in requests {
      guard req.characteristic.uuid == BleMesh.writeUUID, let value = req.value else { continue }
      if let frame = Frame.decode(value) {
        handleIncomingFrame(fromPeripheralId: nil, frame: frame)
      } else {
        os_log("bad frame on peripheral write (%d bytes)", log: log, type: .error, value.count)
      }
      pm.respond(to: req, withResult: .success)
    }
  }
}

// MARK: - CBCentralManagerDelegate (we as central)

extension BleMesh: CBCentralManagerDelegate {
  func centralManagerDidUpdateState(_ cm: CBCentralManager) {
    guard cm.state == .poweredOn else {
      os_log("central state %{public}@", log: log, type: .info, "\(cm.state.rawValue)")
      emitState("offline")
      return
    }
    if pendingScan {
      cm.scanForPeripherals(withServices: [BleMesh.serviceUUID], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
      pendingScan = false
    }
  }

  func centralManager(_ cm: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
    let id = peripheral.identifier
    if outboundPeripherals[id] != nil { return }
    os_log("discover %{public}@ rssi=%d", log: log, type: .info, peripheral.identifier.uuidString, RSSI.intValue)
    peripheral.delegate = self
    let link = PeripheralLink(peripheral: peripheral)
    link.rssi = RSSI.intValue
    outboundPeripherals[id] = link
    cm.connect(peripheral, options: nil)
  }

  func centralManager(_ cm: CBCentralManager, didConnect peripheral: CBPeripheral) {
    os_log("connected %{public}@", log: log, type: .info, peripheral.identifier.uuidString)
    peripheral.discoverServices([BleMesh.serviceUUID])
  }

  func centralManager(_ cm: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    os_log("connect failed %{public}@", log: log, type: .info, "\(error.debugDescription)")
    outboundPeripherals.removeValue(forKey: peripheral.identifier)
  }

  func centralManager(_ cm: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    os_log("disconnect %{public}@", log: log, type: .info, peripheral.identifier.uuidString)
    if let link = outboundPeripherals.removeValue(forKey: peripheral.identifier),
       let sid = link.peerSenderId {
      peers.removeValue(forKey: sid)
      emitPeers()
    }
  }
}

// MARK: - CBPeripheralDelegate (we as central, for each connected peer)

extension BleMesh: CBPeripheralDelegate {
  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard error == nil, let services = peripheral.services else {
      os_log("discoverServices error: %{public}@", log: log, type: .error, "\(String(describing: error))")
      return
    }
    for svc in services where svc.uuid == BleMesh.serviceUUID {
      peripheral.discoverCharacteristics([BleMesh.writeUUID], for: svc)
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    guard error == nil, let chars = service.characteristics else { return }
    guard let writeChar = chars.first(where: { $0.uuid == BleMesh.writeUUID }) else { return }
    if let link = outboundPeripherals[peripheral.identifier] {
      link.writeCharacteristic = writeChar
      // Send HELLO as soon as we have a write channel.
      _ = link.write(bytes: makeHelloFrame().encode())
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
    if let error = error {
      os_log("write error: %{public}@", log: log, type: .error, "\(error)")
    }
  }
}
