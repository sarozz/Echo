import Foundation
import MultipeerConnectivity
import UIKit
import os.log

/**
 * iOS MultipeerConnectivity backend — mirrors the Android Nearby flow.
 *
 * Each device runs both an advertiser and a browser over the `_echo`
 * service type. When a browser finds a peer, the device with the lower
 * peerID hash sends an invitation; the other side auto-accepts. On
 * connect, both sides exchange a HELLO frame carrying name/platform/role/
 * battery as JSON.
 *
 * Frames are sent via session.send(.reliable). Receive via
 * MCSessionDelegate.didReceive. Dedup + hop-relay mirror the Android side.
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
  private var currentGroup = "main"

  /// peerID.displayName -> PeerState
  private var peers: [String: PeerState] = [:]
  private var seq: UInt32 = 1
  private let seen = SeenSet(capacity: 512)
  private let queue = DispatchQueue(label: "echo.multipeer", qos: .userInitiated)
  private let log = OSLog(subsystem: "app.echo.prototype", category: "Multipeer")

  init(emit: @escaping EmitFn) { self.emit = emit }

  func isAvailable() -> Bool { true }

  func start(_ identity: SelfIdentity) {
    if started { return }
    selfIdentity = identity
    started = true

    let pid = MCPeerID(displayName: localName())
    peerId = pid
    let s = MCSession(peer: pid, securityIdentity: nil, encryptionPreference: .required)
    s.delegate = self
    session = s

    let adv = MCNearbyServiceAdvertiser(peer: pid, discoveryInfo: ["id": identity.senderId], serviceType: serviceType)
    adv.delegate = self
    adv.startAdvertisingPeer()
    advertiser = adv

    let br = MCNearbyServiceBrowser(peer: pid, serviceType: serviceType)
    br.delegate = self
    br.startBrowsingForPeers()
    browser = br

    UIDevice.current.isBatteryMonitoringEnabled = true
    emitState("discovering")
    os_log("start sender=%{public}@ name=%{public}@", log: log, type: .info, identity.senderId, identity.name)
  }

  func stop() {
    guard started else { return }
    started = false
    advertiser?.stopAdvertisingPeer()
    browser?.stopBrowsingForPeers()
    session?.disconnect()
    advertiser = nil
    browser = nil
    session = nil
    peers.removeAll()
    seen.clear()
    emitPeers()
    emitState("offline")
  }

  func joinGroup(_ groupId: String) {
    currentGroup = groupId
    // Re-announce ourselves so peers learn the new group from us.
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
    emit("onMessage", outboundEventMap(jsId: jsId, frame: frame, body: body, status: n == 0 ? "queued" : "sent"))
    return jsId
  }

  func startVoice(_ groupId: String) {
    // Fanout happens via relayVoiceFrame; this call only signals UI state.
    emit("onVoiceActivity", [
      "active": true,
      "talkerSenderId": selfIdentity.senderId,
      "talkerName": selfIdentity.name,
    ])
  }

  func stopVoice(_ groupId: String) {
    emit("onVoiceActivity", ["active": false])
  }

  func relayVoiceFrame(groupId: String, dataB64: String) {
    guard let payload = Data(base64Encoded: dataB64) else { return }
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
    emit("onMessage", [
      "id": jsId,
      "groupId": frame.groupId,
      "senderId": selfIdentity.senderId,
      "senderName": selfIdentity.name,
      "kind": "sos",
      "body": body,
      "ts": Date().timeIntervalSince1970 * 1000,
      "mine": true,
      "status": n == 0 ? "queued" : "delivered",
      "peerCount": peers.count,
      "deliveredCount": n,
    ])
    return jsId
  }

  func snapshotPeers() -> [[String: Any]] {
    return peers.values.map { $0.toDict() }
  }

  // --- send helpers ------------------------------------------------------

  @discardableResult
  private func broadcastFrame(_ frame: Frame) -> Int {
    guard let s = session, !s.connectedPeers.isEmpty else { return 0 }
    let data = frame.encode()
    do {
      try s.send(data, toPeers: s.connectedPeers, with: .reliable)
      return s.connectedPeers.count
    } catch {
      os_log("send failed: %{public}@", log: log, type: .error, "\(error)")
      return 0
    }
  }

  private func sendFrame(_ frame: Frame, to peer: MCPeerID) {
    guard let s = session else { return }
    do {
      try s.send(frame.encode(), toPeers: [peer], with: .reliable)
    } catch {
      os_log("send to %{public}@ failed: %{public}@", log: log, type: .error, peer.displayName, "\(error)")
    }
  }

  private func relayFrame(_ frame: Frame, exceptPeer: MCPeerID) {
    guard frame.hopCount < Frame.maxHops else { return }
    guard let s = session else { return }
    let bumped = frame.bumpedHop()
    let targets = s.connectedPeers.filter { $0 != exceptPeer }
    if targets.isEmpty { return }
    do {
      try s.send(bumped.encode(), toPeers: targets, with: .reliable)
    } catch {
      os_log("relay failed: %{public}@", log: log, type: .error, "\(error)")
    }
  }

  // --- HELLO + frame dispatch -------------------------------------------

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
      payload: payload,
    )
  }

  private func handleIncomingFrame(from peer: MCPeerID, frame: Frame) {
    if frame.senderId == selfIdentity.senderId { return }
    let key = messageKey(frame)
    if !seen.add(key) { return }

    switch frame.kind {
    case Frame.KIND_HELLO:
      applyHello(peer: peer, frame: frame)
    case Frame.KIND_TEXT, Frame.KIND_SOS:
      emit("onMessage", incomingEventMap(frame: frame))
      relayFrame(frame, exceptPeer: peer)
    case Frame.KIND_VOICE:
      emit("onVoiceFrame", [
        "senderId": frame.senderId,
        "data": frame.payload.base64EncodedString(),
        "ts": Date().timeIntervalSince1970 * 1000,
        "durationMs": 20,
      ])
      relayFrame(frame, exceptPeer: peer)
    case Frame.KIND_ACK:
      // TODO(stage-2): bump delivery state on matching mine messages.
      break
    case Frame.KIND_PEER_ADV:
      // TODO(stage-2): multi-hop peer advertisement.
      break
    default:
      break
    }
  }

  private func applyHello(peer: MCPeerID, frame: Frame) {
    guard let json = try? JSONSerialization.jsonObject(with: frame.payload, options: []) as? [String: Any] else {
      return
    }
    let name = (json["name"] as? String) ?? peers[peer.displayName]?.name ?? "PEER"
    let platform = (json["platform"] as? String) ?? "ios"
    let role = (json["role"] as? String) ?? "relay"
    let battery = (json["battery"] as? Int) ?? 0

    let existing = peers[peer.displayName]
    peers[peer.displayName] = PeerState(
      senderId: frame.senderId,
      name: name,
      platform: platform,
      role: role,
      battery: battery,
      hops: existing?.hops ?? 1
    )
    emitPeers()
  }

  // --- emit helpers ------------------------------------------------------

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
      "backend": "multipeer",
    ])
  }

  private func outboundEventMap(jsId: String, frame: Frame, body: String, status: String) -> [String: Any] {
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
      "deliveredCount": (status == "delivered" || status == "sent") ? peers.count : 0,
    ]
  }

  private func incomingEventMap(frame: Frame) -> [String: Any] {
    let sender = peers.values.first { $0.senderId == frame.senderId }
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
    ]
  }

  // --- naming + utils ----------------------------------------------------

  private func localName() -> String { "\(selfIdentity.senderId):\(selfIdentity.name)" }

  private func parseLocalName(_ s: String) -> SelfIdentity {
    if let colonIdx = s.firstIndex(of: ":"), s.distance(from: s.startIndex, to: colonIdx) > 0 {
      let sid = String(s[s.startIndex..<colonIdx]).prefix(2)
      let name = String(s[s.index(after: colonIdx)..<s.endIndex])
      return SelfIdentity(senderId: String(sid), name: name)
    }
    return SelfIdentity(senderId: String(s.prefix(2)), name: s)
  }

  private func nextSeq() -> UInt32 {
    let v = seq
    seq &+= 1
    return v
  }

  private func messageKey(_ frame: Frame) -> String {
    return "\(frame.senderId):\(frame.messageId)"
  }

  private func batteryPercent() -> Int {
    UIDevice.current.isBatteryMonitoringEnabled = true
    let lvl = UIDevice.current.batteryLevel
    if lvl < 0 { return 0 }  // .unknown == -1
    return Int(lvl * 100)
  }

  struct PeerState {
    let senderId: String
    let name: String
    let platform: String
    let role: String
    let battery: Int
    let hops: Int
    func toDict() -> [String: Any] {
      return [
        "senderId": senderId,
        "name": name,
        "platform": platform,
        "role": role,
        "battery": battery,
        "hops": hops,
        "backend": "multipeer",
      ]
    }
  }
}

// MARK: - MCSessionDelegate

extension MultipeerMesh: MCSessionDelegate {
  func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
    queue.async { [weak self] in
      guard let self = self else { return }
      switch state {
      case .connected:
        os_log("session connected: %{public}@", log: self.log, type: .info, peerID.displayName)
        // Pre-populate from displayName until HELLO refines it.
        let parsed = self.parseLocalName(peerID.displayName)
        if self.peers[peerID.displayName] == nil {
          self.peers[peerID.displayName] = PeerState(
            senderId: parsed.senderId,
            name: parsed.name,
            platform: "ios",
            role: "relay",
            battery: 0,
            hops: 1
          )
          self.emitPeers()
        }
        self.sendFrame(self.makeHelloFrame(), to: peerID)
      case .connecting:
        os_log("session connecting: %{public}@", log: self.log, type: .info, peerID.displayName)
      case .notConnected:
        os_log("session disconnected: %{public}@", log: self.log, type: .info, peerID.displayName)
        self.peers.removeValue(forKey: peerID.displayName)
        self.emitPeers()
      @unknown default:
        break
      }
    }
  }

  func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
    guard let frame = Frame.decode(data) else {
      os_log("bad frame from %{public}@ (%d bytes)", log: log, type: .error, peerID.displayName, data.count)
      return
    }
    queue.async { [weak self] in
      self?.handleIncomingFrame(from: peerID, frame: frame)
    }
  }

  // Stream + resource handlers — unused, frames flow only over .send(...).
  func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
  func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
  func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}

// MARK: - Advertiser delegate

extension MultipeerMesh: MCNearbyServiceAdvertiserDelegate {
  func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID, withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
    // Auto-accept. STAGE 2: trust the mesh; consider authentication context
    // bytes for a future shared-secret check.
    invitationHandler(true, session)
  }

  func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
    os_log("advertise failed: %{public}@", log: log, type: .error, "\(error)")
    emitState("offline")
  }
}

// MARK: - Browser delegate

extension MultipeerMesh: MCNearbyServiceBrowserDelegate {
  func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
    guard let session = session else { return }
    // Both devices browse + advertise. To avoid two crossed invitations,
    // only invite when our own displayName sorts lower than theirs. The
    // peer with the higher name passively waits for the invitation.
    guard let ours = self.peerId?.displayName else { return }
    if ours < peerID.displayName {
      os_log("invite %{public}@", log: log, type: .info, peerID.displayName)
      browser.invitePeer(peerID, to: session, withContext: nil, timeout: 30)
    } else {
      os_log("wait-for-invite from %{public}@", log: log, type: .info, peerID.displayName)
    }
  }

  func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
    os_log("lost peer: %{public}@", log: log, type: .info, peerID.displayName)
  }

  func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
    os_log("browse failed: %{public}@", log: log, type: .error, "\(error)")
    emitState("offline")
  }
}
