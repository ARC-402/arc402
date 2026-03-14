import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface Arc402Config {
  network: "base-mainnet" | "base-sepolia";
  rpcUrl: string;
  privateKey?: string;
  guardianPrivateKey?: string;
  guardianAddress?: string;
  walletConnectProjectId?: string;
  ownerAddress?: string;
  agentRegistryAddress?: string;
  agentRegistryV2Address?: string;
  serviceAgreementAddress?: string;
  disputeArbitrationAddress?: string;
  disputeModuleAddress?: string;
  trustRegistryAddress: string;
  trustRegistryV2Address?: string;
  intentAttestationAddress?: string;
  settlementCoordinatorAddress?: string;
  sessionChannelsAddress?: string;
  reputationOracleAddress?: string;
  sponsorshipAttestationAddress?: string;
  capabilityRegistryAddress?: string;
  governanceAddress?: string;
  agreementTreeAddress?: string;
  policyEngineAddress?: string;
  walletFactoryAddress?: string;
  walletContractAddress?: string;
  watchtowerRegistryAddress?: string;
  governedTokenWhitelistAddress?: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".arc402");
const CONFIG_PATH = process.env.ARC402_CONFIG || path.join(CONFIG_DIR, "config.json");

export const getConfigPath = () => CONFIG_PATH;

export function loadConfig(): Arc402Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`No config found at ${CONFIG_PATH}. Run \`arc402 config init\` to set up your configuration.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as Arc402Config;
}

export function saveConfig(config: Arc402Config): void {
  const configDir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export const configExists = () => fs.existsSync(CONFIG_PATH);

export const NETWORK_DEFAULTS: Record<string, Partial<Arc402Config> & { usdcAddress: string }> = {
  "base-mainnet": {
    rpcUrl: "https://mainnet.base.org",
    trustRegistryAddress: "0x0000000000000000000000000000000000000000",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  "base-sepolia": {
    rpcUrl: "https://sepolia.base.org",
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    // Testnet deployments — Base Sepolia (chain 84532)
    policyEngineAddress: "0x44102e70c2A366632d98Fe40d892a2501fC7fFF2",
    trustRegistryAddress: "0x1D38Cf67686820D970C146ED1CC98fc83613f02B",    // v1
    trustRegistryV2Address: "0xfCc2CDC42654e05Dad5F6734cE5caFf3dAE0E94F",  // SA-dedicated = TrustRegistryV2
    intentAttestationAddress: "0x942c807Cc6E0240A061e074b61345618aBadc457",
    settlementCoordinatorAddress: "0x52b565797975781f069368Df40d6633b2aD03390",
    agentRegistryAddress: "0x638C7d106a2B7beC9ef4e0eA7d64ed8ab656A7e6",   // ARC402Registry
    walletFactoryAddress: "0xD560C22aD5372Aa830ee5ffBFa4a5D9f528e7B87",
    agentRegistryV2Address: "0x07D526f8A8e148570509aFa249EFF295045A0cc9", // AgentRegistry
    sponsorshipAttestationAddress: "0xc0d927745AcF8DEeE551BE11A12c97c492DDC989",
    serviceAgreementAddress: "0xa214d30906a934358f451514da1ba732ad79f158",
    sessionChannelsAddress: "0x21340f81f5ddc9c213ff2ac45f0f34fb2449386d",
    disputeModuleAddress: "0xcacf606374e29bbc573620affd7f9f739d25317f",
    reputationOracleAddress: "0x410e650113fd163389C956BC7fC51c5642617187",
    // New contracts deployed 2026-03-14 (8 missing, post-audit)
    governanceAddress: "0x504b3D73A8dFbcAB9551d8a11Bb0B07C90C4c926",             // ARC402Governance
    guardianAddress: "0x5c1D2cD6B9B291b436BF1b109A711F0E477EB6fe",               // ARC402Guardian
    walletContractAddress: "0xc77854f9091A25eD1f35EA24E9bdFb64d0850E45",         // ARC402Wallet instance
    agreementTreeAddress: "0x8F46F31FcEbd60f526308AD20e4a008887709720",          // AgreementTree
    capabilityRegistryAddress: "0x6a413e74b65828A014dD8DA61861Bf9E1b6372D2",    // CapabilityRegistry
    disputeArbitrationAddress: "0x62FB9E6f6366B75FDe1D78a870D0B1D7334e2a4e",    // DisputeArbitration
    governedTokenWhitelistAddress: "0x64C15CA701167C7c901a8a5575a5232b37CAF213", // GovernedTokenWhitelist
    watchtowerRegistryAddress: "0x70c4E53E3A916eB8A695630f129B943af9C61C57",    // WatchtowerRegistry
  },
};

export const getUsdcAddress = (config: Arc402Config) => NETWORK_DEFAULTS[config.network]?.usdcAddress ?? "";
