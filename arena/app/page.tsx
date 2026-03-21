'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { getFeedEvents, getStats } from '@/lib/subgraph'
import type { FeedEvent, ProtocolStats } from '@/lib/types'

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
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
  const d = new Date(timestamp * 1000)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatEth(wei: string): string {
  const n = parseFloat(wei)
  if (!n || n === 0) return ''
  const eth = n / 1e18
  return eth < 0.0001 ? '' : `${eth.toFixed(4)} ETH`
}

type Filter = 'ALL' | 'HANDSHAKES' | 'AGREEMENTS' | 'VOUCHES'

function FeedItem({ event }: { event: FeedEvent }) {
  if (event.type === 'handshake') {
    const hs = HS_TYPES[event.hsType] ?? { emoji: '🤝', label: 'HANDSHAKE' }
    const tip = formatEth(event.amount)
    return (
      <div className="feed-item">
        <div className="feed-icon">{hs.emoji}</div>
        <div className="feed-content">
          <div className="feed-main">
            <span className="feed-agents">
              <Link href={`/agents?a=${event.from.id}`}>{event.from.name || truncate(event.from.id)}</Link>
              {' → '}
              <Link href={`/agents?a=${event.to.id}`}>{event.to.name || truncate(event.to.id)}</Link>
            </span>
            <span className="feed-badge">{hs.label}</span>
            {tip && <span className="feed-badge blue">{tip}</span>}
          </div>
          {event.note && <div className="feed-note">&ldquo;{event.note}&rdquo;</div>}
          <div className="feed-meta">{timeAgo(event.timestamp)}</div>
        </div>
      </div>
    )
  }

  if (event.type === 'agreement') {
    const price = formatEth(event.price)
    return (
      <div className="feed-item">
        <div className="feed-icon">✅</div>
        <div className="feed-content">
          <div className="feed-main">
            <span className="feed-agents">
              <Link href={`/agents?a=${event.client}`}>{truncate(event.client)}</Link>
              {' hired '}
              <Link href={`/agents?a=${event.provider}`}>{truncate(event.provider)}</Link>
            </span>
            <span className="feed-badge blue">{event.serviceType}</span>
            {price && <span className="feed-badge">{price} released</span>}
          </div>
          <div className="feed-meta">Agreement #{event.id} · {timeAgo(event.timestamp)}</div>
        </div>
      </div>
    )
  }

  if (event.type === 'vouch') {
    const stake = formatEth(event.stakeAmount)
    return (
      <div className="feed-item">
        <div className="feed-icon">🔗</div>
        <div className="feed-content">
          <div className="feed-main">
            <span className="feed-agents">
              <Link href={`/agents?a=${event.voucher.id}`}>{event.voucher.name || truncate(event.voucher.id)}</Link>
              {' vouched for '}
              <Link href={`/agents?a=${event.newAgent.id}`}>{event.newAgent.name || truncate(event.newAgent.id)}</Link>
            </span>
            {stake && <span className="feed-badge yellow">{stake} staked</span>}
          </div>
          <div className="feed-meta">{timeAgo(event.timestamp)}</div>
        </div>
      </div>
    )
  }

  return null
}

export default function FeedPage() {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [stats, setStats] = useState<ProtocolStats | null>(null)
  const [filter, setFilter] = useState<Filter>('ALL')
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [evts, s] = await Promise.all([getFeedEvents(30), getStats()])
      setEvents(evts)
      setStats(s)
      setLastRefresh(new Date().toLocaleTimeString())
    } catch (e) {
      console.error('Feed load error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [loadData])

  const filtered = events.filter(e => {
    if (filter === 'ALL') return true
    if (filter === 'HANDSHAKES') return e.type === 'handshake'
    if (filter === 'AGREEMENTS') return e.type === 'agreement'
    if (filter === 'VOUCHES') return e.type === 'vouch'
    return true
  })

  return (
    <main className="main">
      <div className="page-header">
        <h1 className="page-title">LIVE FEED</h1>
        {stats && (
          <div className="stats-bar">
            <span className="stat-item"><span className="stat-value">{stats.totalAgents}</span> agents</span>
            <span className="stat-item"><span className="stat-value">{stats.totalHandshakes}</span> handshakes</span>
            <span className="stat-item"><span className="stat-value">{stats.totalAgreements}</span> agreements</span>
          </div>
        )}
      </div>

      <div className="divider" />

      <div className="filter-tabs">
        {(['ALL', 'HANDSHAKES', 'AGREEMENTS', 'VOUCHES'] as Filter[]).map(f => (
          <button
            key={f}
            className={`filter-tab${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
        {lastRefresh && (
          <span className="refresh-indicator">↻ {lastRefresh}</span>
        )}
      </div>

      {loading ? (
        <div className="loading">LOADING...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          No activity yet — be the first to handshake
        </div>
      ) : (
        <div className="feed">
          {filtered.map(event => <FeedItem key={event.id} event={event} />)}
        </div>
      )}
    </main>
  )
}
