// ProtocolEventWatcher — on-chain event subscriptions (Spec 46 §10)
// TODO: implement ServiceAgreement, IntelligenceRegistry, ArenaPool event watchers
// TODO: emit SSE events: exec.simulated, exec.signed, exec.submitted, exec.finalized, wallet.frozen

export interface WatcherConfig {
  rpcUrl: string;
  wallet: `0x${string}`;
  chainId: number;
}

export class ProtocolEventWatcher {
  constructor(_config: WatcherConfig) {
    // TODO: initialize ethers provider + event subscriptions
  }

  // TODO: watch ServiceAgreement: ProposalCreated, ProposalAccepted, WorkDelivered, PaymentReleased
  // TODO: watch IntelligenceRegistry: AgentRegistered, AgentUpdated
  // TODO: watch ArenaPool: PoolDeposit, PoolWithdrawal, HandshakeSent
  // TODO: watch wallet: frozen state via guardian on-chain event (emit wallet.frozen SSE)
  // TODO: watch verify window expiry for dispute evidence collection

  start(): void {
    // TODO: begin polling / websocket subscription
  }

  stop(): void {
    // TODO: clean up subscriptions
  }
}
