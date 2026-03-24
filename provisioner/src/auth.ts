/**
 * EIP-191 signature verification using @noble/curves (secp256k1)
 * Recovers the signer address from a signed message and compares to walletAddress.
 */
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) throw new Error('Invalid hex string');
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Compute the EIP-191 personal sign hash:
 * keccak256("\x19Ethereum Signed Message:\n" + len(message) + message)
 */
function hashPersonalMessage(message: string): Uint8Array {
  const msgBytes = encodeUtf8(message);
  const prefix = encodeUtf8(`\x19Ethereum Signed Message:\n${msgBytes.length}`);
  const combined = new Uint8Array(prefix.length + msgBytes.length);
  combined.set(prefix, 0);
  combined.set(msgBytes, prefix.length);
  return keccak_256(combined);
}

/**
 * Recover the Ethereum address from an EIP-191 signed message.
 * signature: 0x-prefixed hex, 65 bytes (r + s + v)
 */
export function recoverAddress(message: string, signature: string): string {
  const sigBytes = hexToBytes(signature);
  if (sigBytes.length !== 65) throw new Error('Invalid signature length');

  const r = sigBytes.slice(0, 32);
  const s = sigBytes.slice(32, 64);
  let v = sigBytes[64];

  // Normalise v: Ethereum uses 27/28, secp256k1 recovery uses 0/1
  if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) throw new Error('Invalid recovery id');

  const msgHash = hashPersonalMessage(message);

  // Compact signature: r (32 bytes) | s (32 bytes)
  const compact = new Uint8Array(64);
  compact.set(r, 0);
  compact.set(s, 32);

  const pubKey = secp256k1.Signature.fromCompact(bytesToHex(compact))
    .addRecoveryBit(v)
    .recoverPublicKey(msgHash);

  // Derive Ethereum address: keccak256(pubKey uncompressed[1:])[12:]
  const uncompressed = pubKey.toRawBytes(false); // 65 bytes: 04 + x(32) + y(32)
  const pubKeyBody = uncompressed.slice(1); // drop 04 prefix
  const addrHash = keccak_256(pubKeyBody);
  const address = '0x' + bytesToHex(addrHash.slice(12));
  return address;
}

export function verifySignature(
  subdomain: string,
  timestamp: number,
  walletAddress: string,
  signature: string
): boolean {
  const message = `arc402-provision:${subdomain}:${timestamp}`;
  try {
    const recovered = recoverAddress(message, signature);
    return recovered.toLowerCase() === walletAddress.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Extended signature verification for smart wallet users.
 * Accepts the signature if:
 *  1. The recovered signer IS the walletAddress (EOA wallet), OR
 *  2. The recovered signer is an authorized machine key on walletAddress (smart wallet).
 *
 * This lets machine keys sign tunnel provisioning requests on behalf of their wallet.
 */
export async function verifySignatureWithMachineKey(
  subdomain: string,
  timestamp: number,
  walletAddress: string,
  signature: string,
  rpcUrl: string = 'https://mainnet.base.org'
): Promise<boolean> {
  const message = `arc402-provision:${subdomain}:${timestamp}`;
  let recovered: string;
  try {
    recovered = recoverAddress(message, signature);
  } catch {
    return false;
  }

  // Case 1: direct EOA match
  if (recovered.toLowerCase() === walletAddress.toLowerCase()) {
    return true;
  }

  // Case 2: recovered address is an authorized machine key on the smart wallet
  // Call authorizedMachineKeys(recoveredAddress) on walletAddress
  try {
    // selector for authorizedMachineKeys(address): keccak256("authorizedMachineKeys(address)")[0:4] = 0x41d5b23a
    const paddedAddr = recovered.slice(2).toLowerCase().padStart(64, '0');
    const callData = '0x41d5b23a' + paddedAddr;

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: walletAddress, data: callData }, 'latest'],
        id: 1,
      }),
    });

    if (!response.ok) {
      console.error(`[auth] RPC call failed: HTTP ${response.status} from ${rpcUrl}`);
      return false;
    }
    const result = await response.json() as { result?: string; error?: { message: string } };
    if (result.error) {
      console.error(`[auth] RPC error: ${result.error.message}`);
      return false;
    }
    const hex = result.result ?? '0x';
    // Returns bool — non-zero = true
    return hex !== '0x' && BigInt(hex) !== 0n;
  } catch (err) {
    console.error(`[auth] Machine key check threw: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
