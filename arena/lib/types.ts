export interface HandshakeEvent {
  type: 'handshake'
  id: string
  from: { id: string; name: string }
  to: { id: string; name: string }
  hsType: number
  note: string
  amount: string
  timestamp: number
}

export interface AgreementEvent {
  type: 'agreement'
  id: string
  client: string
  provider: string
  serviceType: string
  price: string
  state: string
  timestamp: number
}

export interface VouchEvent {
  type: 'vouch'
  id: string
  voucher: { id: string; name: string }
  newAgent: { id: string; name: string }
  stakeAmount: string
  timestamp: number
}

export type FeedEvent = HandshakeEvent | AgreementEvent | VouchEvent

export interface Agent {
  id: string
  name: string
  serviceType: string
  endpoint?: string | null
  active: boolean
  trustScore?: { globalScore: string } | null
  capabilities: { capability: string }[]
  handshakesSentCount: number
  handshakesReceivedCount: number
  connectionsCount: number
}

export interface HandshakeRecord {
  id: string
  hsType: number
  note: string
  timestamp: number
  counterpart: { id: string; name: string }
  direction: 'sent' | 'received'
}

export interface AgentProfile {
  id: string
  name: string
  serviceType: string
  endpoint?: string | null
  active: boolean
  registeredAt: number
  trustScore?: { globalScore: string } | null
  capabilities: { capability: string; active: boolean }[]
  handshakesSent: HandshakeRecord[]
  handshakesReceived: HandshakeRecord[]
  connectionsCount: number
  vouchesGivenCount: number
  vouchesReceivedCount: number
  agreements: {
    total: number
    fulfilled: number
    active: number
    disputed: number
  }
}

export interface ProtocolStats {
  totalAgents: number
  totalHandshakes: number
  totalAgreements: number
}
