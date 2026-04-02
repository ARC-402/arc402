import { ContractRunner, ethers } from "ethers";
import { readFile } from "fs/promises";
import nacl from "tweetnacl";
import { SERVICE_AGREEMENT_ABI } from "./contracts";

// ─── Deliverable Types ────────────────────────────────────────────────────────

export enum DeliverableType {
  text = "text",
  code = "code",
  data = "data",
  media = "media",
  api = "api",
  composite = "composite",
  null = "null",
}

export interface DeliverableManifestEntry {
  path: string;
  hash: string; // keccak256 hex
  size: number;
  type?: DeliverableType;
}

export interface DeliverableManifest {
  type: DeliverableType.composite;
  version: string;
  files: DeliverableManifestEntry[];
  metadata?: Record<string, unknown>;
}

// ─── Encrypted Deliverable ────────────────────────────────────────────────────

/**
 * The encrypted structure returned by encryptDeliverable.
 * encryptedBuffer contains the nonce (24 bytes) followed by the box ciphertext.
 * ephemeralPublicKey is the sender's one-time public key; the recipient needs it
 * along with their own private key to decrypt.
 */
export interface EncryptedDeliverable {
  encryptedBuffer: Buffer;
  ephemeralPublicKey: Uint8Array;
}

/**
 * Encrypt a buffer for a recipient using NaCl box (X25519-XSalsa20-Poly1305).
 * An ephemeral keypair is generated per call so encryptions are unlinkable.
 */
export async function encryptDeliverable(
  buffer: Buffer,
  recipientPublicKey: Uint8Array,
): Promise<EncryptedDeliverable> {
  const ephemeralKeyPair = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ciphertext = nacl.box(buffer, nonce, recipientPublicKey, ephemeralKeyPair.secretKey);
  const encryptedBuffer = Buffer.concat([Buffer.from(nonce), Buffer.from(ciphertext)]);
  return { encryptedBuffer, ephemeralPublicKey: ephemeralKeyPair.publicKey };
}

/**
 * Decrypt a buffer produced by encryptDeliverable.
 * secretKey is the recipient's NaCl box secret key (32 bytes).
 */
export async function decryptDeliverable(
  encryptedBuffer: Buffer,
  ephemeralPublicKey: Uint8Array,
  secretKey: Uint8Array,
): Promise<Buffer> {
  const nonce = encryptedBuffer.subarray(0, nacl.box.nonceLength);
  const ciphertext = encryptedBuffer.subarray(nacl.box.nonceLength);
  const plaintext = nacl.box.open(ciphertext, nonce, ephemeralPublicKey, secretKey);
  if (!plaintext) throw new Error("Decryption failed: invalid ciphertext or wrong keys");
  return Buffer.from(plaintext);
}

// ─── IPFS helpers ─────────────────────────────────────────────────────────────

export interface IPFSUploadOptions {
  /** IPFS HTTP API base URL. Defaults to https://ipfs.io/api/v0.
   *  Override with a pinning service endpoint (e.g. Infura, Pinata) for persistence. */
  apiEndpoint?: string;
}

export interface IPFSUploadResult {
  cid: string;
  uri: string; // ipfs://<cid>
}

// ─── Standalone functions ─────────────────────────────────────────────────────

/** Compute keccak256 over arbitrary bytes. Returns 0x-prefixed hex. */
export async function hashDeliverable(buffer: Buffer): Promise<string> {
  return ethers.keccak256(buffer);
}

/** Read a file and return its keccak256 hash. */
export async function hashDeliverableFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return hashDeliverable(buffer);
}

/**
 * Upload a buffer to IPFS via the HTTP API.
 * Returns the CID and an ipfs:// URI.
 *
 * The default endpoint (https://ipfs.io/api/v0) is a public gateway — it may
 * not persist content long-term. Pass a dedicated pinning service endpoint via
 * options.apiEndpoint for production use.
 */
export async function uploadToIPFS(buffer: Buffer, options?: IPFSUploadOptions): Promise<IPFSUploadResult> {
  const apiEndpoint = options?.apiEndpoint ?? "https://ipfs.io/api/v0";
  const form = new FormData();
  form.append("file", new Blob([buffer]));
  const response = await fetch(`${apiEndpoint}/add`, { method: "POST", body: form });
  if (!response.ok) throw new Error(`IPFS upload failed: ${response.status} ${response.statusText}`);
  const data = (await response.json()) as { Hash: string };
  const cid = data.Hash;
  return { cid, uri: `ipfs://${cid}` };
}

/**
 * Encrypt a buffer with the recipient's public key, then upload the packed
 * ciphertext to IPFS.  The IPFS blob format is:
 *   magic "ARC1" (4 bytes) | ephemeral public key (32 bytes) | nonce (24 bytes) | ciphertext
 * This self-contained layout lets the recipient recover all decryption inputs
 * from the CID alone (plus their own private key).
 */
export async function uploadEncryptedIPFS(
  buffer: Buffer,
  recipientPublicKey: Uint8Array,
  options?: IPFSUploadOptions,
): Promise<IPFSUploadResult> {
  const { encryptedBuffer, ephemeralPublicKey } = await encryptDeliverable(buffer, recipientPublicKey);
  const MAGIC = Buffer.from("ARC1");
  const packed = Buffer.concat([MAGIC, Buffer.from(ephemeralPublicKey), encryptedBuffer]);
  return uploadToIPFS(packed, options);
}

// ─── DeliverableClient ────────────────────────────────────────────────────────

export class DeliverableClient {
  private contract: ethers.Contract;

  constructor(address: string, runner: ContractRunner) {
    this.contract = new ethers.Contract(address, SERVICE_AGREEMENT_ABI, runner);
  }

  /** Compute keccak256 over a buffer. Returns 0x-prefixed hex. */
  async hashDeliverable(buffer: Buffer): Promise<string> {
    return hashDeliverable(buffer);
  }

  /** Read a file and return its keccak256 hash. */
  async hashDeliverableFile(filePath: string): Promise<string> {
    return hashDeliverableFile(filePath);
  }

  /**
   * Commit a deliverable hash on-chain via ServiceAgreement.commitDeliverable().
   * metadataURI is accepted for caller convenience but is not forwarded to the
   * contract (the current ABI takes only agreementId + hash).
   */
  async commitDeliverable(
    agreementId: bigint,
    hash: string,
    metadataURI: string,
    signer?: ContractRunner,
  ): Promise<ethers.TransactionReceipt | null> {
    const contract = signer ? this.contract.connect(signer) : this.contract;
    const tx = await (contract as any).commitDeliverable(agreementId, hash);
    return tx.wait();
  }

  /**
   * Fetch the on-chain committed hash and compare it against a local buffer.
   * Does NOT release escrow — call ServiceAgreementClient.verifyDeliverable()
   * separately once satisfied.
   */
  async verifyDeliverable(
    agreementId: bigint,
    localBuffer: Buffer,
    signer?: ContractRunner,
  ): Promise<{ match: boolean; onChainHash: string; localHash: string }> {
    const contract = signer ? this.contract.connect(signer) : this.contract;
    const agreement = await (contract as any).getAgreement(agreementId);
    const onChainHash = agreement.deliverableHash as string;
    const localHash = await hashDeliverable(localBuffer);
    const match = onChainHash.toLowerCase() === localHash.toLowerCase();
    return { match, onChainHash, localHash };
  }

  /** Upload a buffer to IPFS. See uploadToIPFS for endpoint notes. */
  async uploadToIPFS(buffer: Buffer, options?: IPFSUploadOptions): Promise<IPFSUploadResult> {
    return uploadToIPFS(buffer, options);
  }

  /**
   * Upload buffer to IPFS then commit the hash + URI in one call.
   * Returns the committed hash, IPFS URI, and the on-chain transaction receipt.
   */
  async commitDeliverableIPFS(
    agreementId: bigint,
    buffer: Buffer,
    options?: IPFSUploadOptions,
    signer?: ContractRunner,
  ): Promise<{ hash: string; uri: string; receipt: ethers.TransactionReceipt }> {
    const [hash, { uri }] = await Promise.all([hashDeliverable(buffer), uploadToIPFS(buffer, options)]);
    const receipt = await this.commitDeliverable(agreementId, hash, uri, signer);
    return { hash, uri, receipt };
  }

  /**
   * Encrypt buffer for recipientPublicKey, upload the ciphertext to IPFS, then
   * commit the plaintext hash on-chain.  The on-chain hash covers plaintext so
   * the client can verify integrity after decryption.
   */
  async commitDeliverableIPFSEncrypted(
    agreementId: bigint,
    buffer: Buffer,
    recipientPublicKey: Uint8Array,
    options?: IPFSUploadOptions,
    signer?: ContractRunner,
  ): Promise<{ hash: string; uri: string; receipt: ethers.TransactionReceipt }> {
    const [hash, { uri }] = await Promise.all([
      hashDeliverable(buffer),
      uploadEncryptedIPFS(buffer, recipientPublicKey, options),
    ]);
    const receipt = await this.commitDeliverable(agreementId, hash, uri, signer);
    return { hash, uri, receipt };
  }
}
