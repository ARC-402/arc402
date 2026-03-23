"""File Delivery Layer — wraps daemon HTTP endpoints for content-addressed
file delivery with party-gated access (EIP-191 signatures).

Files are private by default. Only the keccak256 bundle hash is published
on-chain. Downloads require a valid EIP-191 signature from either the hirer
or the provider. Arbitrators receive a time-limited token for dispute access.

Daemon endpoints:
  POST /job/:id/upload          — upload a deliverable file
  GET  /job/:id/files           — list all delivered files
  GET  /job/:id/files/:name     — download a specific file
  GET  /job/:id/manifest        — fetch the delivery manifest
"""
from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from eth_account import Account
    from eth_account.signers.local import LocalAccount

DEFAULT_DAEMON_URL = "http://localhost:4402"


@dataclass
class DeliveryFile:
    name: str
    hash: str   # keccak256 hex
    size: int


@dataclass
class DeliveryManifest:
    agreement_id: str
    files: list[DeliveryFile]
    bundle_hash: str  # keccak256 of the full manifest — matches on-chain deliverableHash


def _sign_auth(agreement_id: int | str, account: "LocalAccount") -> str:
    """Sign the standard auth message for a job."""
    from eth_account.messages import encode_defunct
    message = encode_defunct(text=f"arc402:job:{agreement_id}")
    signed = account.sign_message(message)
    return signed.signature.hex()


class DeliveryClient:
    """Wraps the daemon file delivery HTTP endpoints."""

    def __init__(self, daemon_url: str = DEFAULT_DAEMON_URL):
        self.daemon_url = daemon_url.rstrip("/")

    def upload_deliverable(
        self,
        agreement_id: int | str,
        file_path: str | Path,
        account: "LocalAccount",
    ) -> DeliveryFile:
        """Upload a file as a deliverable for the agreement.

        Returns the file entry recorded by the daemon (name, keccak256 hash, size).
        Auth: EIP-191 signature from the provider's account.

        After uploading all files, commit the manifest bundle_hash on-chain via
        ServiceAgreementClient.commit_deliverable(). The CLI does this automatically
        when you run ``arc402 deliver <id>``.
        """
        signature = _sign_auth(agreement_id, account)
        file_path = Path(file_path)
        file_bytes = file_path.read_bytes()
        # multipart/form-data upload using urllib (no third-party deps)
        boundary = "arc402boundary"
        parts = []
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="address"\r\n\r\n'
            f'{account.address}\r\n'
        )
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="signature"\r\n\r\n'
            f'{signature}\r\n'
        )
        file_header = (
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'
            f'Content-Type: application/octet-stream\r\n\r\n'
        )
        body = (
            "".join(parts).encode("utf-8")
            + file_header.encode("utf-8")
            + file_bytes
            + f"\r\n--{boundary}--\r\n".encode("utf-8")
        )
        url = f"{self.daemon_url}/job/{agreement_id}/upload"
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
        return DeliveryFile(name=data["name"], hash=data["hash"], size=data["size"])

    def download_deliverable(
        self,
        agreement_id: int | str,
        file_name: str,
        output_dir: str | Path,
        account: "LocalAccount",
    ) -> Path:
        """Download a named file from the agreement's delivery.

        Writes the file to <output_dir>/<file_name> and returns the output path.
        Auth: EIP-191 signature from the hirer's or provider's account.
        """
        signature = _sign_auth(agreement_id, account)
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        encoded_name = urllib.parse.quote(file_name, safe="")
        url = f"{self.daemon_url}/job/{agreement_id}/files/{encoded_name}"
        req = urllib.request.Request(
            url,
            headers={
                "X-Arc402-Address": account.address,
                "X-Arc402-Signature": signature,
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            file_bytes = resp.read()
        out_path = output_dir / file_name
        out_path.write_bytes(file_bytes)
        return out_path

    def get_manifest(
        self,
        agreement_id: int | str,
        account: "LocalAccount",
    ) -> DeliveryManifest:
        """Fetch the delivery manifest for an agreement.

        Lists all delivered files with their keccak256 hashes and the overall
        bundle_hash (should equal the value committed on-chain).
        Auth: EIP-191 signature from the hirer's or provider's account.
        """
        signature = _sign_auth(agreement_id, account)
        url = f"{self.daemon_url}/job/{agreement_id}/manifest"
        req = urllib.request.Request(
            url,
            headers={
                "X-Arc402-Address": account.address,
                "X-Arc402-Signature": signature,
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        files = [DeliveryFile(name=f["name"], hash=f["hash"], size=f["size"]) for f in data["files"]]
        return DeliveryManifest(
            agreement_id=str(data["agreementId"]),
            files=files,
            bundle_hash=data["bundleHash"],
        )

    def verify_delivery(
        self,
        agreement_id: int | str,
        expected_bundle_hash: str,
        account: "LocalAccount",
        output_dir: str | Path,
    ) -> dict[str, Any]:
        """Download all files and verify keccak256 hashes against the manifest.

        Also checks that the manifest bundle_hash matches expected_bundle_hash
        (which should equal the value committed on-chain via commit_deliverable).

        Returns ``{"ok": True}`` when all hashes match, or
        ``{"ok": False, "mismatches": [...]}`` listing any files that failed.
        """
        from eth_hash.auto import keccak

        manifest = self.get_manifest(agreement_id, account)
        if manifest.bundle_hash.lower() != expected_bundle_hash.lower():
            return {
                "ok": False,
                "mismatches": [
                    f"bundleHash mismatch: expected {expected_bundle_hash}, got {manifest.bundle_hash}"
                ],
            }
        mismatches: list[str] = []
        for file in manifest.files:
            out_path = self.download_deliverable(agreement_id, file.name, output_dir, account)
            local_hash = "0x" + keccak(out_path.read_bytes()).hex()
            if local_hash.lower() != file.hash.lower():
                mismatches.append(f"{file.name}: expected {file.hash}, got {local_hash}")
        return {"ok": len(mismatches) == 0, "mismatches": mismatches}
