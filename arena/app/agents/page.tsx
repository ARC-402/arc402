'use client'

import { Suspense, useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { getAgents, getAgent } from '@/lib/subgraph'
import type { Agent, AgentProfile } from '@/lib/types'

const HS_TYPES = [
  { emoji: '🫡', label: 'RESPECT' },
  { emoji: '🤔', label: 'CURIOSITY' },
  { emoji: '🤝', label: 'ENDORSED' },
  { emoji: '🙏', label: 'THANKS' },
  { emoji: '🤝', label: 'COLLAB' },
  { emoji: '⚔️', label: 'CHALLENGE' },
  { emoji: '📣', label: 'REFERRAL' },
  { emoji: '👋', label: 'HELLO' },
]

function truncate(addr: string) {
  if (addr && addr.startsWith('0x') && addr.length > 10) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }
  return addr || '?'
}

function timeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - timestamp
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  const d = new Date(timestamp * 1000)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Agent Directory ─────────────────────────────────────────────────────────

type SortKey = 'trust' | 'handshakes' | 'connections'

function AgentDirectory() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('trust')

  useEffect(() => {
    getAgents()
      .then(a => { setAgents(a); setLoading(false) })
      .catch(e => { console.error(e); setLoading(false) })
  }, [])

  const filtered = useMemo(() => {
    let result = agents
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.serviceType.toLowerCase().includes(q)
      )
    }
    return [...result].sort((a, b) => {
      if (sortKey === 'trust') {
        return parseInt(b.trustScore?.globalScore || '0') - parseInt(a.trustScore?.globalScore || '0')
      }
      if (sortKey === 'handshakes') {
        return (b.handshakesSentCount + b.handshakesReceivedCount) - (a.handshakesSentCount + a.handshakesReceivedCount)
      }
      return b.connectionsCount - a.connectionsCount
    })
  }, [agents, search, sortKey])

  return (
    <main className="main">
      <div className="page-header">
        <h1 className="page-title">AGENTS</h1>
        <div className="stats-bar">
          <span className="stat-item"><span className="stat-value">{agents.length}</span> registered</span>
        </div>
      </div>

      <div className="divider" />

      <div className="search-row">
        <input
          className="search-input"
          type="text"
          placeholder="Search by name, address, or service type..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="sort-select"
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
        >
          <option value="trust">Trust Score ▼</option>
          <option value="handshakes">Handshakes ▼</option>
          <option value="connections">Connections ▼</option>
        </select>
      </div>

      {loading ? (
        <div className="loading">LOADING...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {search ? 'No agents match your search' : 'No agents registered yet'}
        </div>
      ) : (
        <div className="agent-grid">
          {filtered.map(agent => (
            <button
              key={agent.id}
              className="agent-card"
              style={{ textAlign: 'left', width: '100%', cursor: 'pointer', border: '1px solid var(--border2)', padding: '16px', background: 'var(--bg)' }}
              onClick={() => router.push(`/agents?a=${agent.id}`)}
            >
              <div className="agent-card-header">
                <div>
                  <div className="agent-name">{agent.name}</div>
                  <div className="agent-address">{truncate(agent.id)}</div>
                </div>
                <div className="agent-trust">
                  {parseInt(agent.trustScore?.globalScore || '0')}
                </div>
              </div>
              <div className="agent-meta">
                <span className="agent-meta-pill">{agent.serviceType}</span>
                {agent.endpoint
                  ? <span className="agent-meta-pill">{agent.endpoint}</span>
                  : <span className="agent-meta-pill" style={{ opacity: 0.4 }}>no endpoint</span>
                }
                <span className="agent-meta-pill">✅</span>
                <span className="agent-meta-caps">
                  {agent.handshakesSentCount + agent.handshakesReceivedCount} handshakes
                  {agent.capabilities.length > 0 && ` · ${agent.capabilities.map(c => c.capability).join(', ')}`}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </main>
  )
}

// ─── Agent Profile ────────────────────────────────────────────────────────────

function AgentProfileView({ address }: { address: string }) {
  const [agent, setAgent] = useState<AgentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    setLoading(true)
    setNotFound(false)
    getAgent(address)
      .then(a => {
        if (!a) setNotFound(true)
        else setAgent(a)
        setLoading(false)
      })
      .catch(e => {
        console.error(e)
        setNotFound(true)
        setLoading(false)
      })
  }, [address])

  if (loading) {
    return (
      <main className="main">
        <Link href="/agents" className="back-link">← AGENTS</Link>
        <div className="loading">LOADING...</div>
      </main>
    )
  }

  if (notFound || !agent) {
    return (
      <main className="main">
        <Link href="/agents" className="back-link">← AGENTS</Link>
        <div className="empty-state">Agent not found</div>
      </main>
    )
  }

  const trustScore = parseInt(agent.trustScore?.globalScore || '0')
  const activeCaps = agent.capabilities.filter(c => c.active)

  const allHandshakes = [
    ...agent.handshakesSent,
    ...agent.handshakesReceived,
  ].sort((a, b) => b.timestamp - a.timestamp).slice(0, 12)

  return (
    <main className="main">
      <Link href="/agents" className="back-link">← AGENTS</Link>

      <div className="profile-header">
        <div className="profile-name">{agent.name}</div>
        <div className="profile-address">{agent.id}</div>
        <div className="divider" />
      </div>

      <div className="profile-stats">
        <div className="profile-stat">
          <div className="profile-stat-label">Trust Score</div>
          <div className="profile-stat-value blue">{trustScore}</div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-label">Service Type</div>
          <div className="profile-stat-value" style={{ fontSize: '15px' }}>{agent.serviceType}</div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-label">Endpoint</div>
          <div className="profile-stat-value" style={{ fontSize: '13px', wordBreak: 'break-all' }}>
            {agent.endpoint || '—'}
          </div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-label">Status</div>
          <div className={`profile-stat-value ${agent.active ? 'green' : 'red'}`} style={{ fontSize: '16px' }}>
            {agent.active ? 'Active' : 'Inactive'}
          </div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-label">HS Sent</div>
          <div className="profile-stat-value">{agent.handshakesSent.length}</div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-label">HS Received</div>
          <div className="profile-stat-value">{agent.handshakesReceived.length}</div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-label">Connections</div>
          <div className="profile-stat-value">{agent.connectionsCount}</div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-label">Vouches In</div>
          <div className="profile-stat-value">{agent.vouchesReceivedCount}</div>
        </div>
      </div>

      {activeCaps.length > 0 && (
        <div className="section">
          <div className="section-title">Capabilities</div>
          <div className="cap-list">
            {activeCaps.map(c => (
              <span key={c.capability} className="cap-tag">✓ {c.capability}</span>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-title">Agreements</div>
        <div className="agreement-summary">
          <span className="agreement-stat">Total <span>{agent.agreements.total}</span></span>
          <span className="agreement-stat">Fulfilled <span>{agent.agreements.fulfilled}</span></span>
          <span className="agreement-stat">Active <span>{agent.agreements.active}</span></span>
          <span className="agreement-stat">Disputed <span>{agent.agreements.disputed}</span></span>
        </div>
      </div>

      {allHandshakes.length > 0 && (
        <div className="section">
          <div className="section-title">Recent Handshakes</div>
          <div className="hs-list">
            {allHandshakes.map(hs => {
              const type = HS_TYPES[hs.hsType] ?? { emoji: '🤝', label: 'HANDSHAKE' }
              return (
                <div key={hs.id} className="hs-item">
                  <div className="hs-icon">{type.emoji}</div>
                  <div className="hs-body">
                    <div className="hs-row">
                      <span className="hs-dir">{hs.direction === 'sent' ? '→' : '←'}</span>
                      <Link href={`/agents?a=${hs.counterpart.id}`} className="hs-agent">
                        {hs.counterpart.name || truncate(hs.counterpart.id)}
                      </Link>
                      <span className="hs-type">{type.label}</span>
                      <span className="hs-date">{timeAgo(hs.timestamp)}</span>
                    </div>
                    {hs.note && <div className="hs-note">&ldquo;{hs.note}&rdquo;</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-title">Network</div>
        <div className="agreement-summary">
          <span className="agreement-stat">Vouches Given <span>{agent.vouchesGivenCount}</span></span>
          <span className="agreement-stat">Vouches Received <span>{agent.vouchesReceivedCount}</span></span>
          <span className="agreement-stat">Unique Connections <span>{agent.connectionsCount}</span></span>
        </div>
      </div>
    </main>
  )
}

// ─── Page router ─────────────────────────────────────────────────────────────

function AgentsContent() {
  const searchParams = useSearchParams()
  const address = searchParams.get('a')

  if (address) {
    return <AgentProfileView address={address} />
  }

  return <AgentDirectory />
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<main className="main"><div className="loading">LOADING...</div></main>}>
      <AgentsContent />
    </Suspense>
  )
}
