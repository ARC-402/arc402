import type { FeedEvent, Agent, AgentProfile, HandshakeRecord, ProtocolStats } from './types'

const SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/1744310/arc-402/v0.2.0'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gql(query: string): Promise<any> {
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Subgraph HTTP ${res.status}`)
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

export async function getStats(): Promise<ProtocolStats> {
  const data = await gql(`{
    protocolStats(id: "global") {
      totalAgents totalHandshakes totalAgreements
    }
  }`)
  const s = data?.protocolStats
  if (!s) return { totalAgents: 0, totalHandshakes: 0, totalAgreements: 0 }
  return {
    totalAgents: parseInt(s.totalAgents),
    totalHandshakes: parseInt(s.totalHandshakes),
    totalAgreements: parseInt(s.totalAgreements),
  }
}

export async function getFeedEvents(limit = 30): Promise<FeedEvent[]> {
  const [hsData, aggData, vouchData] = await Promise.all([
    gql(`{
      handshakes(first: 30, orderBy: timestamp, orderDirection: desc) {
        id
        from { id name }
        to { id name }
        hsType note amount timestamp
      }
    }`),
    gql(`{
      agreements(first: 15, orderBy: updatedAt, orderDirection: desc, where: { state: "FULFILLED" }) {
        id client provider serviceType price state updatedAt
      }
    }`),
    gql(`{
      vouches(first: 15, orderBy: createdAt, orderDirection: desc) {
        id
        voucher { id name }
        newAgent { id name }
        stakeAmount createdAt
      }
    }`),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: FeedEvent[] = [
    ...(hsData?.handshakes || []).map((h: any) => ({
      type: 'handshake' as const,
      id: h.id,
      from: h.from,
      to: h.to,
      hsType: parseInt(h.hsType),
      note: h.note || '',
      amount: h.amount || '0',
      timestamp: parseInt(h.timestamp),
    })),
    ...(aggData?.agreements || []).map((a: any) => ({
      type: 'agreement' as const,
      id: a.id,
      client: a.client,
      provider: a.provider,
      serviceType: a.serviceType,
      price: a.price || '0',
      state: a.state,
      timestamp: parseInt(a.updatedAt),
    })),
    ...(vouchData?.vouches || []).map((v: any) => ({
      type: 'vouch' as const,
      id: v.id,
      voucher: v.voucher,
      newAgent: v.newAgent,
      stakeAmount: v.stakeAmount || '0',
      timestamp: parseInt(v.createdAt),
    })),
  ]

  return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit)
}

export async function getAgents(): Promise<Agent[]> {
  const data = await gql(`{
    agents(first: 100, orderBy: registeredAt, orderDirection: desc, where: { active: true }) {
      id name serviceType endpoint active
      trustScore { globalScore }
      capabilities(where: { active: true }) { capability }
      handshakesSent { id }
      handshakesReceived { id }
      connections { id }
    }
  }`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data?.agents || []).map((a: any): Agent => ({
    id: a.id,
    name: a.name,
    serviceType: a.serviceType,
    endpoint: a.endpoint,
    active: a.active,
    trustScore: a.trustScore,
    capabilities: a.capabilities || [],
    handshakesSentCount: a.handshakesSent?.length || 0,
    handshakesReceivedCount: a.handshakesReceived?.length || 0,
    connectionsCount: a.connections?.length || 0,
  }))
}

export async function getAgent(address: string): Promise<AgentProfile | null> {
  const addr = address.toLowerCase()

  const [agentData, clientAgreements, providerAgreements] = await Promise.all([
    gql(`{
      agent(id: "${addr}") {
        id name serviceType endpoint active registeredAt
        trustScore { globalScore }
        capabilities { capability active }
        handshakesSent(first: 20, orderBy: timestamp, orderDirection: desc) {
          id hsType note timestamp
          to { id name }
        }
        handshakesReceived(first: 20, orderBy: timestamp, orderDirection: desc) {
          id hsType note timestamp
          from { id name }
        }
        connections { id }
        vouchesGiven { id }
        vouchesReceived { id }
      }
    }`),
    gql(`{
      agreements(first: 100, where: { client: "${addr}" }) {
        id state
      }
    }`),
    gql(`{
      agreements(first: 100, where: { provider: "${addr}" }) {
        id state
      }
    }`),
  ])

  const agent = agentData?.agent
  if (!agent) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allAgreements = [
    ...(clientAgreements?.agreements || []),
    ...(providerAgreements?.agreements || []),
  ]
  // Deduplicate by id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uniqueAgreements = Array.from(new Map(allAgreements.map((a: any) => [a.id, a])).values()) as any[]

  const handshakesSent: HandshakeRecord[] = (agent.handshakesSent || []).map((h: any) => ({
    id: h.id,
    hsType: parseInt(h.hsType),
    note: h.note || '',
    timestamp: parseInt(h.timestamp),
    counterpart: h.to,
    direction: 'sent' as const,
  }))

  const handshakesReceived: HandshakeRecord[] = (agent.handshakesReceived || []).map((h: any) => ({
    id: h.id,
    hsType: parseInt(h.hsType),
    note: h.note || '',
    timestamp: parseInt(h.timestamp),
    counterpart: h.from,
    direction: 'received' as const,
  }))

  return {
    id: agent.id,
    name: agent.name,
    serviceType: agent.serviceType,
    endpoint: agent.endpoint,
    active: agent.active,
    registeredAt: parseInt(agent.registeredAt),
    trustScore: agent.trustScore,
    capabilities: agent.capabilities || [],
    handshakesSent,
    handshakesReceived,
    connectionsCount: agent.connections?.length || 0,
    vouchesGivenCount: agent.vouchesGiven?.length || 0,
    vouchesReceivedCount: agent.vouchesReceived?.length || 0,
    agreements: {
      total: uniqueAgreements.length,
      fulfilled: uniqueAgreements.filter((a) => a.state === 'FULFILLED').length,
      active: uniqueAgreements.filter((a) => a.state === 'ACCEPTED').length,
      disputed: uniqueAgreements.filter((a) => a.state === 'DISPUTED').length,
    },
  }
}
