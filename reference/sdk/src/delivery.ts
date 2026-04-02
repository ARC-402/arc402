/**
 * File Delivery Layer — wraps daemon HTTP endpoints for content-addressed
 * file delivery with party-gated access (EIP-191 signatures).
 *
 * Files are private by default. Only the keccak256 bundle hash is published
 * on-chain. Downloads require a valid EIP-191 signature from either the hirer
 * or the provider. Arbitrators receive a time-limited token for dispute access.
 *
 * Daemon endpoints:
 *   POST /job/:id/upload          — upload a deliverable file
 *   GET  /job/:id/files           — list all delivered files
 *   GET  /job/:id/files/:name     — download a specific file
 *   GET  /job/:id/manifest        — fetch the delivery manifest
 */
import { ethers } from "ethers";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export const DEFAULT_DAEMON_URL = "http://localhost:4402";

export interface DeliveryFile {
  name: string;
  hash: string;  // keccak256 hex
  size: number;
}

export interface DeliveryManifest {
  agreementId: string;
  files: DeliveryFile[];
  bundleHash: string;  // keccak256 of the full manifest — matches on-chain deliverableHash
}

export interface DeliveryClientOptions {
  /** Daemon base URL. Defaults to http://localhost:4402. */
  daemonUrl?: string;
}

export class DeliveryClient {
  private daemonUrl: string;

  constructor(options?: DeliveryClientOptions) {
    this.daemonUrl = (options?.daemonUrl ?? DEFAULT_DAEMON_URL).replace(/\/$/, "");
  }

  /** Sign the standard auth message for a job. Used for upload and download. */
  private async signAuth(agreementId: bigint | string, signer: ethers.Signer): Promise<string> {
    return signer.signMessage(`arc402:job:${agreementId}`);
  }

  /**
   * Upload a file as a deliverable for the agreement.
   * Returns the file entry recorded by the daemon (name, keccak256 hash, size).
   * Auth: EIP-191 signature from the provider's signer.
   *
   * After uploading all files, commit the manifest bundleHash on-chain via
   * ServiceAgreementClient.commitDeliverable(). The CLI does this automatically
   * when you run `arc402 deliver <id>`.
   */
  async uploadDeliverable(
    agreementId: bigint | string,
    filePath: string,
    signer: ethers.Signer,
  ): Promise<DeliveryFile> {
    const signature = await this.signAuth(agreementId, signer);
    const address = await signer.getAddress();
    const filename = path.basename(filePath);
    const fileBuffer = await readFile(filePath);
    const form = new FormData();
    form.append("file", new Blob([fileBuffer]), filename);
    form.append("address", address);
    form.append("signature", signature);
    const res = await fetch(`${this.daemonUrl}/job/${agreementId}/upload`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
    return (await res.json()) as DeliveryFile;
  }

  /**
   * Download a named file from the agreement's delivery.
   * Writes the file to <outputDir>/<name> and returns the output path.
   * Auth: EIP-191 signature from the hirer's or provider's signer.
   */
  async downloadDeliverable(
    agreementId: bigint | string,
    fileName: string,
    outputDir: string,
    signer: ethers.Signer,
  ): Promise<string> {
    const signature = await this.signAuth(agreementId, signer);
    const address = await signer.getAddress();
    const res = await fetch(
      `${this.daemonUrl}/job/${agreementId}/files/${encodeURIComponent(fileName)}`,
      { headers: { "X-Arc402-Address": address, "X-Arc402-Signature": signature } },
    );
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await mkdir(outputDir, { recursive: true });
    const outPath = path.join(outputDir, fileName);
    await writeFile(outPath, buffer);
    return outPath;
  }

  /**
   * Fetch the delivery manifest for an agreement.
   * Lists all delivered files with their keccak256 hashes and the overall bundleHash.
   * Auth: EIP-191 signature from the hirer's or provider's signer.
   */
  async getManifest(agreementId: bigint | string, signer: ethers.Signer): Promise<DeliveryManifest> {
    const signature = await this.signAuth(agreementId, signer);
    const address = await signer.getAddress();
    const res = await fetch(
      `${this.daemonUrl}/job/${agreementId}/manifest`,
      { headers: { "X-Arc402-Address": address, "X-Arc402-Signature": signature } },
    );
    if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status} ${res.statusText}`);
    return (await res.json()) as DeliveryManifest;
  }

  /**
   * Download all files and verify their keccak256 hashes against the manifest.
   * Also checks that the manifest bundleHash matches the expectedBundleHash
   * (which should equal the value committed on-chain via commitDeliverable).
   *
   * Returns { ok: true } when all hashes match, or
   * { ok: false, mismatches: [...] } listing any files that failed.
   */
  async verifyDelivery(
    agreementId: bigint | string,
    expectedBundleHash: string,
    signer: ethers.Signer,
    outputDir: string,
  ): Promise<{ ok: boolean; mismatches: string[] }> {
    const manifest = await this.getManifest(agreementId, signer);
    if (manifest.bundleHash.toLowerCase() !== expectedBundleHash.toLowerCase()) {
      return {
        ok: false,
        mismatches: [`bundleHash mismatch: expected ${expectedBundleHash}, got ${manifest.bundleHash}`],
      };
    }
    const mismatches: string[] = [];
    for (const file of manifest.files) {
      const outPath = await this.downloadDeliverable(agreementId, file.name, outputDir, signer);
      const buffer = await readFile(outPath);
      const localHash = ethers.keccak256(buffer);
      if (localHash.toLowerCase() !== file.hash.toLowerCase()) {
        mismatches.push(`${file.name}: expected ${file.hash}, got ${localHash}`);
      }
    }
    return { ok: mismatches.length === 0, mismatches };
  }
}
