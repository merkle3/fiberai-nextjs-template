import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

function extractAddressesFromLog(logFilePath) {
  const logContent = readFileSync(logFilePath, 'utf8');

  // Extract addresses from the "== Logs ==" section
  const logsMatch = logContent.match(/== Logs ==([\s\S]*?)## Setting up/);
  if (!logsMatch) {
    console.error('Could not find logs section in deployment log');
    return {};
  }

  const logs = logsMatch[1];
  const addresses = {};

  // Match patterns like "Counter deployed at: 0x..."
  const addressRegex = /(\w+) deployed at: (0x[a-fA-F0-9]{40})/g;
  let match;

  while ((match = addressRegex.exec(logs)) !== null) {
    const [, contractName, address] = match;
    addresses[contractName.toLowerCase()] = address;
  }

  return addresses;
}

function generateConfigFile(addresses, outputPath) {
  const config = {
    // Add network information if needed
    network: {
      chainId: 100020, // FiberEVM testnet
      name: 'FiberEVM Testnet'
    },
    contracts: addresses
  };

  // Create TypeScript-friendly output
  const tsContent = `// Auto-generated contract addresses - DO NOT EDIT MANUALLY
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

const config: ContractConfig = ${JSON.stringify(config, null, 2)};

export default config;
export { config };
`;

  writeFileSync(outputPath, tsContent);
  console.log(`Generated contract config at: ${outputPath}`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node extract-addresses.js <log-file> [output-file]');
    console.error('Example: node extract-addresses.js all_deployment.log');
    process.exit(1);
  }

  const logFile = args[0];
  const outputFile = args[1] || 'lib/contract-addresses.ts';

  if (!existsSync(logFile)) {
    console.error(`Log file not found: ${logFile}`);
    process.exit(1);
  }

  const addresses = extractAddressesFromLog(logFile);

  if (Object.keys(addresses).length === 0) {
    console.error('No contract addresses found in log file');
    process.exit(1);
  }

  console.log('Extracted addresses:', addresses);

  // Ensure output directory exists
  const outputDir = dirname(outputFile);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  generateConfigFile(addresses, outputFile);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { extractAddressesFromLog, generateConfigFile };
