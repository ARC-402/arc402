/**
 * ARC-402 Delivery Client
 *
 * When this agent receives a /delivery notification with a files_url, this
 * module fetches the manifest, downloads each file, verifies all keccak256
 * hashes, and verifies the root hash against the on-chain delivery hash.
 *
 * Flow:
 *   1. Receive POST /delivery { agreementId, deliverableHash, files_url }
 *   2. Fetch manifest from <files_url base>/manifest
 *   3. Download each file to local job dir
 *   4. Verify keccak256 of each file matches manifest
 *   5. Verify root hash matches on-chain deliverableHash
 *   6. Return verification result
 */
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import { ethers } from "ethers";
import { createJobDirectory } from "./job-lifecycle.js";
import type { DeliveryManifest, DeliveryFileEntry } from "./file-delivery.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VerificationResult {
  ok: boolean;
  agreementId: string;
  rootHashMatch: boolean;
  fileResults: Array<{
    name: string;
    hashMatch: boolean;
    expected: string;
    actual: string;
  }>;
  error?: string;
}

// ─── DeliveryClient ───────────────────────────────────────────────────────────

export class DeliveryClient {
  private readonly autoDownload: boolean;
  log: (entry: Record<string, unknown>) => void = () => {};

  constructor(opts: { autoDownload?: boolean } = {}) {
    this.autoDownload = opts.autoDownload ?? true;
  }

  /**
   * Handle an incoming delivery notification.
   * If auto_download is true, downloads and verifies the files.
   * Returns a VerificationResult.
   */
  async handleDeliveryNotification(params: {
    agreementId: string;
    deliverableHash: string; // on-chain hash from deliver()
    filesUrl?: string;       // e.g. https://provider.arc402.xyz/job/abc/files
  }): Promise<VerificationResult | null> {
    const { agreementId, deliverableHash, filesUrl } = params;

    if (!this.autoDownload) {
      this.log({ event: "delivery_client_skipped", agreement_id: agreementId, reason: "auto_download_disabled" });
      return null;
    }

    if (!filesUrl) {
      this.log({ event: "delivery_client_skipped", agreement_id: agreementId, reason: "no_files_url" });
      return null;
    }

    this.log({ event: "delivery_download_start", agreement_id: agreementId, files_url: filesUrl });

    try {
      // Derive manifest URL from files_url
      // files_url = https://host/job/abc/files  → manifest = https://host/job/abc/manifest
      const manifestUrl = this.deriveManifestUrl(filesUrl);

      // Fetch manifest
      const manifest = await this.fetchJson<DeliveryManifest>(manifestUrl);
      this.log({ event: "manifest_fetched", agreement_id: agreementId, file_count: manifest.files.length, root_hash: manifest.root_hash });

      // Create local job directory for client
      const jobDir = createJobDirectory(agreementId);

      // Download and verify each file
      const fileResults: VerificationResult["fileResults"] = [];
      let allFilesMatch = true;

      for (const fileEntry of manifest.files) {
        const fileUrl = `${filesUrl.replace(/\/$/, "")}/${encodeURIComponent(fileEntry.name)}`;
        const result = await this.downloadAndVerify(fileUrl, fileEntry, jobDir);
        fileResults.push(result);
        if (!result.hashMatch) allFilesMatch = false;
      }

      // Verify root hash
      const actualRootHash = this.computeRootHash(manifest.files.map(f => f.hash));
      const rootHashMatch = actualRootHash.toLowerCase() === deliverableHash.toLowerCase() &&
                           actualRootHash.toLowerCase() === manifest.root_hash.toLowerCase();

      const ok = allFilesMatch && rootHashMatch;

      const result: VerificationResult = {
        ok,
        agreementId,
        rootHashMatch,
        fileResults,
      };

      this.log({
        event: "delivery_verified",
        agreement_id: agreementId,
        ok,
        root_hash_match: rootHashMatch,
        files_verified: fileResults.length,
        files_ok: fileResults.filter(f => f.hashMatch).length,
      });

      return result;

    } catch (err) {
      const error = String(err instanceof Error ? err.message : err);
      this.log({ event: "delivery_verify_error", agreement_id: agreementId, error });
      return {
        ok: false,
        agreementId,
        rootHashMatch: false,
        fileResults: [],
        error,
      };
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private deriveManifestUrl(filesUrl: string): string {
    // Strip trailing slash
    const base = filesUrl.replace(/\/$/, "");
    // Replace /files at end with /manifest, or append /manifest
    if (base.endsWith("/files")) {
      return base.slice(0, -6) + "/manifest";
    }
    // Fallback: try stripping /files/ prefix from last segment
    const parts = base.split("/");
    const lastPart = parts[parts.length - 1];
    if (lastPart === "files") {
      parts[parts.length - 1] = "manifest";
      return parts.join("/");
    }
    return base + "/manifest";
  }

  private async downloadAndVerify(
    url: string,
    expected: DeliveryFileEntry,
    destDir: string
  ): Promise<VerificationResult["fileResults"][number]> {
    const data = await this.fetchBytes(url);
    const actual = ethers.keccak256(data);
    const hashMatch = actual.toLowerCase() === expected.hash.toLowerCase();

    if (hashMatch) {
      // Write to job dir
      const destPath = path.join(destDir, path.basename(expected.name));
      fs.writeFileSync(destPath, data);
    }

    return {
      name: expected.name,
      hashMatch,
      expected: expected.hash,
      actual,
    };
  }

  private computeRootHash(fileHashes: string[]): string {
    if (fileHashes.length === 0) {
      return ethers.keccak256(new Uint8Array(0));
    }
    const sorted = [...fileHashes].sort();
    const allBytes = Buffer.concat(sorted.map(h => Buffer.from(ethers.getBytes(h))));
    return ethers.keccak256(allBytes);
  }

  private fetchJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const mod = parsed.protocol === "https:" ? https : http;

      const req = mod.get(url, { headers: { "Accept": "application/json" } }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`fetch_manifest_failed: HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        let raw = "";
        res.on("data", (c: Buffer) => { raw += c.toString(); });
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw) as T);
          } catch {
            reject(new Error(`invalid_manifest_json from ${url}`));
          }
        });
      });

      req.on("error", (err) => reject(new Error(`network_error: ${err.message}`)));
      req.setTimeout(30_000, () => {
        req.destroy(new Error("fetch_timeout"));
      });
    });
  }

  private fetchBytes(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const mod = parsed.protocol === "https:" ? https : http;
      const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200MB hard cap for downloads

      const req = mod.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`fetch_file_failed: HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;

        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_FILE_BYTES) {
            req.destroy(new Error("file_too_large"));
            return;
          }
          chunks.push(chunk);
        });

        res.on("end", () => resolve(Buffer.concat(chunks)));
      });

      req.on("error", (err) => reject(new Error(`network_error: ${err.message}`)));
      req.setTimeout(120_000, () => {
        req.destroy(new Error("download_timeout"));
      });
    });
  }
}
