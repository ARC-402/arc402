'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { ARC402_WALLET_ABI, POLICY_ENGINE_ABI } from '@/lib/abi'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SignParams {
  action: string
  wallet: string
  chain: string
  nonce: string
  created: string
  sig: string
  agentAddress: string
  category?: string
  amount?: string
  guardian?: string
  newOwner?: string
}

interface TxRequest {
  to: string
  data: string
  value?: string
}

type AppState = 'loading' | 'confirm' | 'done' | 'error'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const POLICY_ENGINE: Record<string, string> = {
  '8453': process.env.NEXT_PUBLIC_POLICY_ENGINE_MAINNET ?? '',
  '84532': process.env.NEXT_PUBLIC_POLICY_ENGINE_TESTNET ?? '0x44102e70c2A366632d98Fe40d892a2501fC7fFF2',
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function networkName(chain: string) {
  if (chain === '8453') return 'Base Mainnet'
  if (chain === '84532') return 'Base Sepolia'
  return `Chain ${chain}`
}

function getActionMeta(params: SignParams) {
  switch (params.action) {
    case 'freeze': return { icon: '🔒', text: 'FREEZE your agent wallet' }
    case 'unfreeze': return { icon: '🔓', text: 'UNFREEZE your agent wallet' }
    case 'set-policy': return {
      icon: '📋',
      text: `Update spending limit: ${params.category ?? '?'} → ${params.amount ? ethers.formatEther(params.amount) + ' ETH' : '?'}`,
    }
    case 'set-guardian': return { icon: '🛡️', text: 'Update emergency guardian address' }
    case 'transfer-ownership': return {
      icon: '🔑',
      text: `Transfer wallet ownership to ${params.newOwner ? shortAddr(params.newOwner) : '?'}`,
    }
    default: return { icon: '❓', text: `Unknown action: ${params.action}` }
  }
}

function verifyRequest(params: SignParams): { ok: boolean; reason?: string } {
  const nowSec = Math.floor(Date.now() / 1000)
  const createdSec = Number(params.created)
  if (Number.isNaN(createdSec)) return { ok: false, reason: 'Invalid created timestamp' }
  if (nowSec - createdSec > 1800) return { ok: false, reason: 'This signing link has expired (30 minute limit)' }
  const message = `${params.action}:${params.wallet}:${params.chain}:${params.nonce}:${params.created}`
  try {
    const recovered = ethers.verifyMessage(message, params.sig)
    if (recovered.toLowerCase() !== params.agentAddress.toLowerCase()) {
      return { ok: false, reason: 'Invalid or tampered signing request' }
    }
  } catch {
    return { ok: false, reason: 'Signature verification failed' }
  }
  return { ok: true }
}

function buildTransaction(params: SignParams): TxRequest {
  const walletIface = new ethers.Interface(ARC402_WALLET_ABI)
  const policyIface = new ethers.Interface(POLICY_ENGINE_ABI)
  const policyAddr = POLICY_ENGINE[params.chain] ?? ''

  switch (params.action) {
    case 'freeze':
      return { to: params.wallet, data: walletIface.encodeFunctionData('freeze', []) }
    case 'unfreeze':
      return { to: params.wallet, data: walletIface.encodeFunctionData('unfreeze', []) }
    case 'set-policy':
      if (!policyAddr) throw new Error(`No PolicyEngine address for chain ${params.chain}`)
      return {
        to: policyAddr,
        data: policyIface.encodeFunctionData('setSpendLimit', [params.wallet, params.category ?? '', params.amount ?? '0']),
      }
    case 'set-guardian':
      if (!policyAddr) throw new Error(`No PolicyEngine address for chain ${params.chain}`)
      return {
        to: policyAddr,
        data: policyIface.encodeFunctionData('setGuardian', [params.wallet, params.guardian ?? ethers.ZeroAddress]),
      }
    case 'transfer-ownership':
      return {
        to: params.wallet,
        data: walletIface.encodeFunctionData('transferOwnership', [params.newOwner ?? ethers.ZeroAddress]),
      }
    default:
      throw new Error(`Unknown action: ${params.action}`)
  }
}

async function sendViaCoinbase(tx: TxRequest): Promise<string> {
  const { CoinbaseWalletSDK } = await import('@coinbase/wallet-sdk')
  const sdk = new CoinbaseWalletSDK({ appName: 'ARC-402' })
  const provider = sdk.makeWeb3Provider()
  await provider.request({ method: 'eth_requestAccounts' })
  const accounts = (await provider.request({ method: 'eth_accounts' })) as string[]
  return (await provider.request({
    method: 'eth_sendTransaction',
    params: [{ from: accounts[0], to: tx.to, data: tx.data, value: tx.value ?? '0x0' }],
  })) as string
}

async function sendViaWalletConnect(tx: TxRequest, chain: string): Promise<string> {
  const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID
  if (!projectId) throw new Error('WalletConnect project ID not configured')
  const { EthereumProvider } = await import('@walletconnect/ethereum-provider')
  const provider = await EthereumProvider.init({
    projectId,
    chains: [Number(chain)],
    showQrModal: true,
    metadata: { name: 'ARC-402', description: 'ARC-402 Protocol', url: 'https://arc402.xyz', icons: [] },
  })
  await provider.connect()
  if (!provider.accounts.length) throw new Error('No accounts connected')
  return (await provider.request({
    method: 'eth_sendTransaction',
    params: [{ from: provider.accounts[0], to: tx.to, data: tx.data, value: tx.value ?? '0x0' }],
  })) as string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SignPageContent() {
  const searchParams = useSearchParams()
  const [state, setState] = useState<AppState>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [confirmStatus, setConfirmStatus] = useState('')
  const [confirmStatusError, setConfirmStatusError] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [params, setParams] = useState<SignParams | null>(null)
  const [tx, setTx] = useState<TxRequest | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const required = ['action', 'wallet', 'chain', 'nonce', 'created', 'sig', 'agentAddress']
    for (const key of required) {
      if (!searchParams.get(key)) {
        setErrorMsg('Missing required parameters. This link appears to be malformed.')
        setState('error')
        return
      }
    }
    const p: SignParams = {
      action: searchParams.get('action')!,
      wallet: searchParams.get('wallet')!,
      chain: searchParams.get('chain')!,
      nonce: searchParams.get('nonce')!,
      created: searchParams.get('created')!,
      sig: searchParams.get('sig')!,
      agentAddress: searchParams.get('agentAddress')!,
      category: searchParams.get('category') ?? undefined,
      amount: searchParams.get('amount') ?? undefined,
      guardian: searchParams.get('guardian') ?? undefined,
      newOwner: searchParams.get('newOwner') ?? undefined,
    }
    const { ok, reason } = verifyRequest(p)
    if (!ok) { setErrorMsg(reason ?? 'Invalid request'); setState('error'); return }
    try {
      setTx(buildTransaction(p))
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setState('error')
      return
    }
    setParams(p)
    setState('confirm')
  }, [searchParams])

  const handleSend = async (sender: () => Promise<string>) => {
    setBusy(true)
    setConfirmStatus('Waiting for wallet approval…')
    setConfirmStatusError(false)
    try {
      const hash = await sender()
      setTxHash(hash)
      setState('done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setConfirmStatus(msg.length > 120 ? msg.slice(0, 117) + '…' : msg)
      setConfirmStatusError(true)
      setBusy(false)
    }
  }

  const meta = params ? getActionMeta(params) : null
  const basescanBase = params?.chain === '8453'
    ? 'https://basescan.org/tx/'
    : 'https://sepolia.basescan.org/tx/'

  return (
    <div className="app">
      <div className="header"><h1>ARC-402 Protocol</h1></div>

      {state === 'loading' && (
        <div className="card">
          <div className="status"><span className="spinner" />Verifying request…</div>
        </div>
      )}

      {state === 'confirm' && params && meta && (
        <>
          <div className="card">
            <div className="action-icon">{meta.icon}</div>
            <div className="action-label">
              <div className="verb">You are being asked to</div>
              <div className="action-text">{meta.text}</div>
            </div>
            <div className="divider" />
            <div className="details">
              <div className="detail-row">
                <span className="label">Wallet</span>
                <span className="value">{shortAddr(params.wallet)}</span>
              </div>
              <div className="detail-row">
                <span className="label">Network</span>
                <span className="value">{networkName(params.chain)}</span>
              </div>
            </div>
          </div>
          <div className="wallet-options">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => handleSend(() => sendViaCoinbase(tx!))}
            >
              Connect Wallet to Approve
            </button>
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => handleSend(() => sendViaWalletConnect(tx!, params.chain))}
            >
              Use WalletConnect instead
            </button>
          </div>
          {confirmStatus && (
            <div className={`status${confirmStatusError ? ' error' : ''}`}>{confirmStatus}</div>
          )}
        </>
      )}

      {state === 'done' && (
        <div className="card">
          <div className="confirm-icon">✓</div>
          <div className="action-label">
            <div className="action-text" style={{ fontSize: 16 }}>Transaction submitted</div>
          </div>
          <a className="tx-link" href={basescanBase + txHash} target="_blank" rel="noopener noreferrer">
            View on Basescan →
          </a>
        </div>
      )}

      {state === 'error' && (
        <div className="card">
          <div className="status error">{errorMsg}</div>
        </div>
      )}
    </div>
  )
}
