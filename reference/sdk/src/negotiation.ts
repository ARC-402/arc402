import { ethers } from "ethers";
import { NegotiationAccept, NegotiationCounter, NegotiationMessage, NegotiationProposal, NegotiationReject } from "./types";

export function createNegotiationProposal(input: Omit<NegotiationProposal, "type" | "nonce"> & { nonce?: string }): NegotiationProposal {
  return { type: "PROPOSE", nonce: input.nonce ?? ethers.hexlify(ethers.randomBytes(16)), ...input };
}
export function createNegotiationCounter(input: Omit<NegotiationCounter, "type">): NegotiationCounter { return { type: "COUNTER", ...input }; }
export function createNegotiationAccept(input: Omit<NegotiationAccept, "type">): NegotiationAccept { return { type: "ACCEPT", ...input }; }
export function createNegotiationReject(input: Omit<NegotiationReject, "type">): NegotiationReject { return { type: "REJECT", ...input }; }
export function parseNegotiationMessage(json: string): NegotiationMessage { return JSON.parse(json) as NegotiationMessage; }
