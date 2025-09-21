// Auto-generated contract addresses - DO NOT EDIT MANUALLY
// Generated from deployment logs

export interface ContractAddresses {
  [key: string]: string;
}

export interface NetworkConfig {
  chainId: number;
  name: string;
}

export interface ContractConfig {
  network: NetworkConfig;
  contracts: ContractAddresses;
}

const config: ContractConfig = {
  network: {
    chainId: 100020,
    name: "FiberEVM Testnet",
  },
  contracts: {
    counter: "0x4d72f3ec633d3C0be481d4b448edF7f19D55BBAC",
  },
};

export default config;
export { config };
