import ExpoModulesCore

/**
 * EchoMesh — iOS side.
 *
 * Bridges JS to MultipeerConnectivity and Core Bluetooth. The Module DSL is
 * the stable JS↔native contract; per-backend code lives in MultipeerMesh.swift
 * and BleMesh.swift.
 *
 * STAGE 2 status: surface complete, transport implementations are skeletons.
 */
public class EchoMeshModule: Module {
  private var multipeer: MultipeerMesh?
  private var ble: BleMesh?
  private var active: Backend = .none
  private var currentGroup: String = "main"
  private var selfIdentity = SelfIdentity(senderId: "00", name: "YOU")

  public func definition() -> ModuleDefinition {
    Name("EchoMesh")

    Events("onPeers", "onMessage", "onState", "onVoiceActivity", "onVoiceFrame")

    OnCreate {
      let bus: EmitFn = { [weak self] name, payload in self?.sendEvent(name, payload) }
      MeshEventBus.shared.bind(bus)
      self.multipeer = MultipeerMesh(emit: bus)
      self.ble = BleMesh(emit: bus)
    }

    OnDestroy {
      self.stopInternal()
      MeshEventBus.shared.unbind()
    }

    AsyncFunction("start") { (opts: [String: Any]) -> Void in
      self.selfIdentity = SelfIdentity(
        senderId: (opts["selfSenderId"] as? String) ?? self.selfIdentity.senderId,
        name: (opts["selfName"] as? String) ?? self.selfIdentity.name
      )
      let prefer = (opts["prefer"] as? [String]) ?? ["multipeer", "ble"]
      self.active = self.chooseBackend(prefer)
      self.emitState(conn: "discovering")
      switch self.active {
      case .multipeer: self.multipeer?.start(self.selfIdentity)
      case .ble:       self.ble?.start(self.selfIdentity)
      case .none:      self.emitState(conn: "offline")
      }
    }

    AsyncFunction("stop") {
      self.stopInternal()
    }

    AsyncFunction("joinGroup") { (groupId: String) in
      self.currentGroup = groupId
      self.activeTransport()?.joinGroup(groupId)
    }

    AsyncFunction("sendText") { (groupId: String, body: String) -> String in
      guard let t = self.activeTransport() else { throw EchoMeshError.notStarted }
      return t.sendText(groupId: groupId, body: body)
    }

    AsyncFunction("startVoice") { (groupId: String) in
      self.activeTransport()?.startVoice(groupId)
    }

    AsyncFunction("stopVoice") { (groupId: String) in
      self.activeTransport()?.stopVoice(groupId)
    }

    AsyncFunction("triggerSOS") { (groupId: String) -> String in
      guard let t = self.activeTransport() else { throw EchoMeshError.notStarted }
      return t.triggerSOS(groupId: groupId)
    }

    AsyncFunction("relayVoiceFrame") { (groupId: String, dataB64: String) in
      self.activeTransport()?.relayVoiceFrame(groupId: groupId, dataB64: dataB64)
    }

    AsyncFunction("getCurrentPeers") { () -> [[String: Any]] in
      return self.activeTransport()?.snapshotPeers() ?? []
    }
  }

  private func chooseBackend(_ prefer: [String]) -> Backend {
    for name in prefer {
      switch name {
      case "multipeer": if multipeer?.isAvailable() == true { return .multipeer }
      case "ble":       if ble?.isAvailable() == true { return .ble }
      case "nearby":    continue  // Android-only
      default:          continue
      }
    }
    return .none
  }

  private func activeTransport() -> MeshTransport? {
    switch active {
    case .multipeer: return multipeer
    case .ble:       return ble
    case .none:      return nil
    }
  }

  private func stopInternal() {
    multipeer?.stop()
    ble?.stop()
    active = .none
    emitState(conn: "offline")
  }

  private func emitState(conn: String) {
    sendEvent("onState", [
      "conn": conn,
      "peerCount": 0,
      "hops": 0,
      "selfRole": "relay",
      "backend": active.wire,
    ])
  }
}

enum Backend: String {
  case multipeer
  case ble
  case none
  var wire: String { rawValue }
}

struct SelfIdentity {
  let senderId: String
  let name: String
}

enum EchoMeshError: Error {
  case notStarted
}
