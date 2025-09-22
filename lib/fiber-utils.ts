import {
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  decodeFunctionResult,
  encodeFunctionData,
  hexToString,
  parseEther,
  type PrivateKeyAccount,
} from "viem";
import {
  createFiberTransport,
  createFiberWebSocketTransport,
  fiberTestnet,
} from "./fiberChain";

interface WriteContractResult {
  hash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}`;
  value: `0x${string}`;
  gas_used: number;
  logs: Array<unknown>; // You might want to define a more specific type for logs if needed
  status: boolean;
  output: `0x${string}`;
  reject_reason: string | null;
  weiSpent?: bigint;
}

/**
 * Generic Fiber Chain Utilities class
 * Provides core blockchain interaction functionality without app-specific logic
 */
export class FiberUtils {
  private static instance: FiberUtils;
  public publicClient;
  public walletClient;
  private webSocketTransport: any = null; // Store reference for cleanup

  // Shared preconfs WebSocket connection
  private preconfsWebSocket: WebSocket | null = null;
  private preconfsConnected: boolean = false;
  private preconfsCallbacks: Set<(event: any) => void> = new Set();

  // Transaction queue for sequential processing
  private transactionQueue: Array<{
    params: {
      address: `0x${string}`;
      abi?: any;
      functionName: string;
      args?: readonly unknown[];
      account: PrivateKeyAccount;
      gas?: bigint;
      gasPrice?: bigint;
      nonce?: number;
      value?: bigint;
    };
    resolve: (value: WriteContractResult) => void;
    reject: (error: unknown) => void;
  }> = [];
  private isProcessingQueue: boolean = false;

  private constructor() {
    this.webSocketTransport = createFiberWebSocketTransport();

    this.publicClient = createPublicClient({
      chain: fiberTestnet,
      transport: this.webSocketTransport,
    });

    this.walletClient = createWalletClient({
      chain: fiberTestnet,
      transport: this.webSocketTransport, // Use WebSocket transport for better performance
    });
  }

  static getInstance(): FiberUtils {
    if (!FiberUtils.instance) {
      FiberUtils.instance = new FiberUtils();
    }
    return FiberUtils.instance;
  }

  /**
   * Generic contract read method for any contract on Fiber chain
   */
  async readContract<T = any>({
    address,
    abi,
    functionName,
    args = [],
    gas = BigInt(600000),
    gasPrice = BigInt(1),
  }: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    gas?: bigint;
    gasPrice?: bigint;
  }): Promise<T> {
    try {
      // Encode the function call
      const data = encodeFunctionData({
        abi: abi as any,
        functionName: functionName as any,
        args: args as any,
      });

      // Make the eth_call with explicit gas
      const result = await this.publicClient.call({
        to: address,
        data,
        gas,
        gasPrice,
      });

      if (!result.data) {
        throw new Error("No data returned from contract call");
      }

      // Decode the result
      const decoded = decodeFunctionResult({
        abi: abi as any,
        functionName: functionName as any,
        data: result.data,
      });

      return decoded as T;
    } catch (error) {
      console.error(`Failed to call ${functionName} on ${address}:`, error);
      throw error;
    }
  }

  /**
   * Process the transaction queue sequentially (FIFO)
   */
  private async processTransactionQueue(): Promise<void> {
    if (this.isProcessingQueue || this.transactionQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.transactionQueue.length > 0) {
      const queueItem = this.transactionQueue.shift();
      if (!queueItem) break;

      try {
        const result = await this.executeTransaction(queueItem.params);
        queueItem.resolve(result);
      } catch (error) {
        queueItem.reject(error);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Execute a single transaction (internal method)
   */
  private async executeTransaction({
    address,
    abi,
    functionName,
    args,
    account,
    gas,
    gasPrice,
    value = BigInt(0),
    nonce,
  }: {
    address: `0x${string}`;
    abi?: any;
    functionName: string;
    args?: readonly unknown[];
    account: PrivateKeyAccount;
    gas?: bigint;
    gasPrice?: bigint;
    nonce?: number;
    value?: bigint;
  }): Promise<WriteContractResult> {
    gasPrice = gasPrice || (await this.publicClient.getGasPrice());

    const result = (await this.walletClient.writeContract({
      address: address,
      abi: abi,
      functionName: functionName as any,
      args: args as any,
      account: account,
      gas: gas,
      nonce: nonce,
      value: value,
      gasPrice: gasPrice,
    })) as unknown as WriteContractResult;

    result.weiSpent = BigInt(result.gas_used) * gasPrice;

    return result;
  }

  /**
   * Unified contract write method for Fiber chain with FIFO queue processing
   */
  async writeContract<
    TFunctionName extends string,
    TArgs extends readonly unknown[] = readonly []
  >({
    address,
    abi,
    functionName,
    args,
    account,
    gas = BigInt(600000),
    gasPrice = BigInt(1),
    value = BigInt(0),
    nonce,
  }: {
    address: `0x${string}`;
    abi: any;
    functionName: TFunctionName;
    args?: TArgs;
    account: PrivateKeyAccount;
    gas?: bigint;
    gasPrice?: bigint;
    nonce?: number; // If not provided, will be fetched automatically
    value?: bigint; // For payable functions
  }): Promise<WriteContractResult> {
    return new Promise((resolve, reject) => {
      // Add transaction to queue
      this.transactionQueue.push({
        params: {
          address,
          abi,
          functionName,
          args,
          account,
          gas,
          gasPrice,
          value,
          nonce,
        },
        resolve,
        reject,
      });

      // Start processing queue
      this.processTransactionQueue().catch((error) => {
        console.error("Error processing transaction queue:", error);
      });
    });
  }

  /**
   * Utility method to decode Solidity error messages from transaction output
   */
  static decodeSolidityError(output: string): string | null {
    try {
      if (!output || !output.startsWith("0x")) {
        return null;
      }

      // 1) Try to decode standard Error(string)
      if (output.startsWith("0x08c379a0")) {
        try {
          const standardErrorAbi = [
            {
              type: "error",
              name: "Error",
              inputs: [{ name: "message", type: "string" }],
            },
          ] as const;
          const decoded = decodeErrorResult({
            abi: standardErrorAbi as any,
            data: output as `0x${string}`,
          });
          const message = (decoded as any).args?.[0];
          if (typeof message === "string") return message;
        } catch {
          // fallback to manual decoding if decodeErrorResult fails for some reason
          const errorData = output.slice(10); // remove 0x + 4-byte selector (8 hex)
          // skip 32-byte offset (64 hex) and read 32-byte length (next 64 hex)
          const lengthHex = errorData.slice(64, 128);
          const length = parseInt(lengthHex, 16);
          const messageHex = errorData.slice(128, 128 + length * 2);
          return hexToString(`0x${messageHex}`);
        }
      }

      // 2) Decode standard Panic(uint256)
      if (output.startsWith("0x4e487b71")) {
        try {
          const panicAbi = [
            {
              type: "error",
              name: "Panic",
              inputs: [{ name: "code", type: "uint256" }],
            },
          ] as const;
          const decoded = decodeErrorResult({
            abi: panicAbi as any,
            data: output as `0x${string}`,
          });
          const code = (decoded as any).args?.[0];
          return `Panic(${
            typeof code === "bigint" ? code.toString() : String(code)
          })`;
        } catch {
          // If decoding fails, just return generic panic
          return "Panic";
        }
      }

      // 3) If still unknown, return selector for debugging
      const selector = output.slice(0, 10);
      return `Unknown error (${selector})`;
    } catch (error) {
      console.warn("Failed to decode Solidity error:", error);
      return null;
    }
  }

  /**
   * Initialize shared preconfs WebSocket connection
   */
  private initializePreconfsConnection(): void {
    // Check if already connected or in the process of connecting
    if (
      this.preconfsWebSocket &&
      (this.preconfsConnected ||
        this.preconfsWebSocket.readyState === WebSocket.CONNECTING ||
        this.preconfsWebSocket.readyState === WebSocket.OPEN)
    ) {
      return; // Already connected or connecting
    }

    // Clean up any existing connection that might be in a bad state
    if (this.preconfsWebSocket) {
      try {
        this.preconfsWebSocket.close();
      } catch (error) {
        console.warn("Error closing existing WebSocket:", error);
      }
      this.preconfsWebSocket = null;
      this.preconfsConnected = false;
    }

    const wsUrl = fiberTestnet.rpcUrls.default.webSocket[0];
    this.preconfsWebSocket = new WebSocket(wsUrl);

    this.preconfsWebSocket.onopen = () => {
      console.log("Shared preconfs WebSocket connected");
      this.preconfsConnected = true;

      // Check if WebSocket is still open and ready before sending
      if (
        this.preconfsWebSocket &&
        this.preconfsWebSocket.readyState === WebSocket.OPEN
      ) {
        try {
          this.preconfsWebSocket.send(
            JSON.stringify({
              id: 1,
              jsonrpc: "2.0",
              method: "fiber_subscribePreconfs",
              params: [],
            })
          );
        } catch (error) {
          console.error("Error sending preconfs subscription:", error);
        }
      }
    };

    this.preconfsWebSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.params?.result?.logs) {
          data.params.result.logs.forEach((log: any) => {
            const contractAddress = log.address.toLowerCase();

            // Process events from any contract
            try {
              // For generic preconfs, we don't decode here - let consumers handle it
              const readableEvent = {
                subscription: data.params.subscription,
                contractAddress: log.address,
                topics: log.topics,
                data: log.data,
                raw: log,
              };

              // Call all registered preconfs callbacks
              this.preconfsCallbacks.forEach((callback) => {
                try {
                  callback(readableEvent);
                } catch (error) {
                  console.error("Error in preconfs callback:", error);
                }
              });
            } catch (decodeError) {
              console.error(
                "Error processing preconf log:",
                decodeError,
                "for contract:",
                contractAddress
              );
            }
          });
        }
      } catch (error) {
        console.error("Error parsing preconf event:", error);
      }
    };

    this.preconfsWebSocket.onerror = (error) => {
      console.error("Shared preconfs WebSocket error:", error);
      this.preconfsConnected = false;
    };

    this.preconfsWebSocket.onclose = () => {
      console.log("Shared preconfs WebSocket connection closed");
      this.preconfsConnected = false;
      this.preconfsWebSocket = null;
    };
  }

  /**
   * Subscribe to preconfs events using the shared connection
   */
  subscribeToPreconfs(callback: (event: any) => void): () => void {
    // Initialize shared connection if not already done or connecting
    if (
      !this.preconfsWebSocket ||
      (this.preconfsWebSocket.readyState !== WebSocket.CONNECTING &&
        this.preconfsWebSocket.readyState !== WebSocket.OPEN)
    ) {
      this.initializePreconfsConnection();
    }

    // Add callback to the set
    this.preconfsCallbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.preconfsCallbacks.delete(callback);

      // Close shared connection if no more callbacks
      if (this.preconfsCallbacks.size === 0 && this.preconfsWebSocket) {
        this.preconfsWebSocket.close();
        this.preconfsWebSocket = null;
        this.preconfsConnected = false;
      }
    };
  }

  /**
   * Send FBR to an address
   */
  async sendFBR({
    to,
    value,
    account,
    nonce,
    gasPrice,
  }: {
    to: `0x${string}`;
    value: string;
    account: PrivateKeyAccount;
    nonce?: number;
    gasPrice?: bigint;
  }): Promise<`0x${string}`> {
    try {
      if (!nonce) {
        nonce = await this.publicClient.getTransactionCount({
          address: account.address,
        });
      }

      const hash = await this.walletClient.sendTransaction({
        account: account,
        to: to,
        value: parseEther(value),
        nonce,
        gasPrice,
        chain: fiberTestnet,
      });

      return hash;
    } catch (error) {
      console.error("Failed to send transaction:", error);
      throw error;
    }
  }

  /**
   * Check if contract is deployed at the address
   */
  async isContractDeployed(address: `0x${string}`): Promise<boolean> {
    try {
      const code = await this.publicClient.getCode({
        address: address,
      });
      return code !== undefined && code !== "0x";
    } catch (error) {
      console.error("Failed to check contract deployment:", error);
      return false;
    }
  }

  /**
   * Test network connectivity
   */
  async testNetworkConnectivity(): Promise<boolean> {
    try {
      const blockNumber = await this.publicClient.getBlockNumber();
      console.log("Current block number:", blockNumber);
      return true;
    } catch (error) {
      console.error("Network connectivity test failed:", error);
      return false;
    }
  }

  /**
   * Get balance of an address in ETH
   */
  async getBalance(address: `0x${string}`): Promise<string> {
    try {
      const balance = await this.publicClient.getBalance({
        address: address,
      });

      // Convert from wei to ETH and format to 4 decimal places
      const ethBalance = Number(balance) / 1e18;
      return ethBalance.toFixed(4);
    } catch (error) {
      console.error("Failed to get balance:", error);
      return "0.0000";
    }
  }

  /**
   * Get transaction count (nonce) for an address
   */
  async getNonce(address: `0x${string}`): Promise<number> {
    return this.publicClient.getTransactionCount({
      address: address,
    });
  }

  /**
   * Clean up all connections and resources
   */
  cleanup(): void {
    // Clear transaction queue and reject any pending transactions
    this.transactionQueue.forEach((item) => {
      item.reject(new Error("Service cleanup: Transaction cancelled"));
    });
    this.transactionQueue = [];
    this.isProcessingQueue = false;

    // Close shared preconfs WebSocket connection
    if (this.preconfsWebSocket) {
      console.log("Closing shared preconfs WebSocket connection");
      this.preconfsWebSocket.close();
      this.preconfsWebSocket = null;
      this.preconfsConnected = false;
    }
    this.preconfsCallbacks.clear();

    // Close WebSocket transport connection
    if (
      this.webSocketTransport &&
      typeof this.webSocketTransport.close === "function"
    ) {
      console.log("Closing Fiber WebSocket transport connection");
      this.webSocketTransport.close();
    }
  }

  /**
   * Switch wallet client to use HTTP transport (fallback)
   */
  switchToHttpTransport(): void {
    const fiberTransport = createFiberTransport();

    // Close existing WebSocket connection
    if (
      this.webSocketTransport &&
      typeof this.webSocketTransport.close === "function"
    ) {
      this.webSocketTransport.close();
    }

    this.walletClient = createWalletClient({
      chain: fiberTestnet,
      transport: fiberTransport,
    });

    console.log("Switched wallet client to HTTP transport");
  }

  /**
   * Switch wallet client to use WebSocket transport
   */
  switchToWebSocketTransport(): void {
    // Close existing WebSocket connection
    if (
      this.webSocketTransport &&
      typeof this.webSocketTransport.close === "function"
    ) {
      this.webSocketTransport.close();
    }

    this.webSocketTransport = createFiberWebSocketTransport();

    this.walletClient = createWalletClient({
      chain: fiberTestnet,
      transport: this.webSocketTransport,
    });

    console.log("Switched wallet client to WebSocket transport");
  }

  /**
   * Check if WebSocket transport is connected
   */
  isWebSocketConnected(): boolean {
    return (
      this.webSocketTransport &&
      typeof this.webSocketTransport.close === "function"
    );
  }

  /**
   * Get current transport type
   */
  getCurrentTransportType(): "http" | "websocket" | "unknown" {
    if (
      this.webSocketTransport &&
      typeof this.webSocketTransport.close === "function"
    ) {
      return "websocket";
    }
    // If no WebSocket transport, assume HTTP (fallback)
    return "http";
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<bigint> {
    return this.publicClient.getBlockNumber();
  }

  /**
   * Get gas price
   */
  async getGasPrice(): Promise<bigint> {
    return this.publicClient.getGasPrice();
  }
}

export const fiberUtils = FiberUtils.getInstance();
