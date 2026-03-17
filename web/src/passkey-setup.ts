/**
 * passkey-setup.ts
 * Registers a P256 passkey for the ARC402Wallet owner.
 * Called once via arc402 wallet setup --auth passkey
 *
 * Flow:
 *   1. Generate WebAuthn credential (P256 / ES256)
 *   2. Extract (x, y) from DER-encoded public key
 *   3. Return pubKeyX, pubKeyY + credentialId for daemon.toml
 */

export interface PasskeyRegistrationResult {
  credentialId: string;   // base64url — store in daemon.toml
  pubKeyX: string;        // hex bytes32
  pubKeyY: string;        // hex bytes32
}

/**
 * Parse a DER-encoded SPKI P256 public key and return (x, y) as hex bytes32.
 * DER structure for P256 SPKI:
 *   30 59 — SEQUENCE
 *   30 13 — SEQUENCE (algorithm)
 *   06 07 2a 86 48 ce 3d 02 01 — OID ecPublicKey
 *   06 08 2a 86 48 ce 3d 03 01 07 — OID P-256
 *   03 42 00 04 — BIT STRING, uncompressed point
 *   <32 bytes X> <32 bytes Y>
 */
function parseDerP256PublicKey(der: ArrayBuffer): { x: Uint8Array; y: Uint8Array } {
  const bytes = new Uint8Array(der);
  // Find the 0x04 uncompressed point marker
  // It appears at byte 27 in standard P256 SPKI DER
  let offset = -1;
  for (let i = 0; i < bytes.length - 65; i++) {
    if (bytes[i] === 0x04 && i > 20) {
      offset = i + 1;
      break;
    }
  }
  if (offset === -1) throw new Error("Could not find uncompressed point in DER");
  return {
    x: bytes.slice(offset, offset + 32),
    y: bytes.slice(offset + 32, offset + 64),
  };
}

function toHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function registerPasskey(walletAddress: string): Promise<PasskeyRegistrationResult> {
  const challenge = crypto.getRandomValues(new Uint8Array(32)) as unknown as ArrayBuffer;

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: "ARC-402",
        id: window.location.hostname === "localhost" ? "localhost" : "arc402.xyz",
      },
      user: {
        id: new TextEncoder().encode(walletAddress),
        name: walletAddress,
        displayName: `ARC-402 Wallet ${walletAddress.slice(0, 8)}`,
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256 = P256
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
    },
  }) as PublicKeyCredential;

  const response = credential.response as AuthenticatorAttestationResponse;
  const spki = response.getPublicKey();
  if (!spki) throw new Error("Could not extract public key from credential");

  const { x, y } = parseDerP256PublicKey(spki);

  return {
    credentialId: toBase64Url(credential.rawId),
    pubKeyX: toHex(x),
    pubKeyY: toHex(y),
  };
}

export async function signWithPasskey(
  challenge: Uint8Array,
  credentialId: string
): Promise<{ r: string; s: string; signature: string }> {
  // Decode credentialId from base64url
  const id = Uint8Array.from(
    atob(credentialId.replace(/-/g, "+").replace(/_/g, "/")),
    c => c.charCodeAt(0)
  );

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: challenge.buffer as ArrayBuffer,
      allowCredentials: [{ id: id.buffer as ArrayBuffer, type: "public-key" }],
      userVerification: "required",
      timeout: 60000,
    },
  }) as PublicKeyCredential;

  const response = assertion.response as AuthenticatorAssertionResponse;
  const sig = new Uint8Array(response.signature);

  // Parse DER-encoded signature: 30 <len> 02 <rlen> <r> 02 <slen> <s>
  let offset = 2; // skip 0x30 <len>
  offset++; // skip 0x02
  const rLen = sig[offset++];
  const r = sig.slice(offset, offset + rLen);
  offset += rLen;
  offset++; // skip 0x02
  const sLen = sig[offset++];
  const s = sig.slice(offset, offset + sLen);

  // Pad/trim to 32 bytes (DER may have leading 0x00 for sign)
  const rPad = new Uint8Array(32);
  const sPad = new Uint8Array(32);
  rPad.set(r.slice(-32), 32 - Math.min(r.length, 32));
  sPad.set(s.slice(-32), 32 - Math.min(s.length, 32));

  return {
    r: toHex(rPad),
    s: toHex(sPad),
    signature: toHex(new Uint8Array([...rPad, ...sPad])), // 64 bytes packed
  };
}
