// Web3 utilities for interacting with deployed contracts
import { config } from "./contract-addresses";

// Contract ABIs would typically be imported from artifacts
// Example Counter ABI for reference:
// const COUNTER_ABI = [
//   "function number() view returns (uint256)",
//   "function setNumber(uint256 newNumber)",
//   "function increment()"
// ] as const;

export class ContractService {
  private static instance: ContractService;

  public static getInstance(): ContractService {
    if (!ContractService.instance) {
      ContractService.instance = new ContractService();
    }
    return ContractService.instance;
  }

  // Get contract address by name
  getContractAddress(name: string): string | undefined {
    return config.contracts[name.toLowerCase()];
  }

  // Get all contract addresses
  getAllContractAddresses() {
    return config.contracts;
  }

  // Get network configuration
  getNetworkConfig() {
    return config.network;
  }

  // Example: Get Counter contract instance (would need web3 provider)
  // getCounterContract(provider: any) {
  //   const address = this.getContractAddress('counter');
  //   if (!address) throw new Error('Counter contract not deployed');
  //   return new provider.Contract(COUNTER_ABI, address);
  // }

  // Helper to check if we're on the correct network
  isCorrectNetwork(chainId: number): boolean {
    return chainId === config.network.chainId;
  }
}

// Export singleton instance
export const contractService = ContractService.getInstance();

// Export individual utilities for convenience
export const getContractAddress = (name: string) =>
  contractService.getContractAddress(name);
export const getAllContractAddresses = () =>
  contractService.getAllContractAddresses();
export const getNetworkConfig = () => contractService.getNetworkConfig();
export const isCorrectNetwork = (chainId: number) =>
  contractService.isCorrectNetwork(chainId);
