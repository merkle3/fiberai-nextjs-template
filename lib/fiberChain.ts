import { custom, defineChain, type Transport } from "viem";

// Define Fiber EVM Testnet
export const fiberTestnet = defineChain({
  id: 100020,
  name: "Fiber EVM Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "FBR",
    symbol: "FBR",
  },
  rpcUrls: {
    default: {
      http: ["https://testnet.fiberevm.com"],
      webSocket: ["wss://testnet.fiberevm.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Fiber Explorer",
      url: "http://scan.fiberevm.com/",
    },
  },
  testnet: true,
});

// Custom transport that maps eth_sendRawTransaction to fiber_sendRawTransaction
export const createFiberTransport = (): Transport => {
  const url = fiberTestnet.rpcUrls.default.http[0];
  return custom({
    request: async ({ method, params }) => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method:
            method === "eth_sendRawTransaction"
              ? "fiber_sendRawTransaction"
              : method,
          params,
          id: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || "RPC error");
      }

      return data.result;
    },
  });
};

// Improved WebSocket transport with better wagmi integration
export const createFiberWebSocketTransport = (): Transport & {
  close: () => void;
} => {
  const url = fiberTestnet.rpcUrls.default.webSocket[0];
  let ws: WebSocket | null = null;
  let requestId = 1;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  const reconnectDelay = 1000;

  const pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  const connect = (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        resolve(ws);
        return;
      }

      if (ws && ws.readyState === WebSocket.CONNECTING) {
        // Wait for connection to complete
        const checkConnection = () => {
          if (ws?.readyState === WebSocket.OPEN) {
            resolve(ws);
          } else if (
            ws?.readyState === WebSocket.CLOSED ||
            ws?.readyState === WebSocket.CLOSING
          ) {
            reject(new Error("WebSocket connection failed"));
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
        return;
      }

      ws = new WebSocket(url);

      ws.onopen = () => {
        console.log("Fiber WebSocket transport connected to:", url);
        reconnectAttempts = 0;
        resolve(ws!);
      };

      ws.onerror = (error) => {
        console.error("Fiber WebSocket transport error:", error);
        reject(new Error("WebSocket connection failed"));
      };

      ws.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);

          // Handle subscription notifications (no id)
          if (response.id === undefined && response.method) {
            // This is a subscription notification, ignore for now
            return;
          }

          const request = pendingRequests.get(response.id);
          if (request) {
            pendingRequests.delete(response.id);

            if (response.error) {
              request.reject(new Error(response.error.message || "RPC error"));
            } else {
              request.resolve(response.result);
            }
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onclose = (event) => {
        console.log(
          "Fiber WebSocket transport connection closed",
          event.code,
          event.reason
        );
        ws = null;

        // Reject all pending requests
        for (const [id, request] of pendingRequests.entries()) {
          request.reject(new Error("WebSocket connection closed"));
          pendingRequests.delete(id);
        }

        // Auto-reconnect logic for certain close codes
        if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(
            `Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`
          );
          setTimeout(() => {
            connect().catch(console.error);
          }, reconnectDelay * reconnectAttempts);
        }
      };
    });
  };

  const close = () => {
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING)
    ) {
      ws.close(1000, "Transport closed");
    }
    ws = null;
    reconnectAttempts = maxReconnectAttempts; // Prevent auto-reconnect

    // Clear all pending requests
    for (const [id, request] of pendingRequests.entries()) {
      request.reject(new Error("WebSocket transport closed"));
      pendingRequests.delete(id);
    }
  };

  const transport = custom({
    request: async ({ method, params }) => {
      try {
        const socket = await connect();

        return new Promise((resolve, reject) => {
          const id = requestId++;

          // Store the request handlers
          pendingRequests.set(id, { resolve, reject });

          // Map eth_sendRawTransaction to fiber_sendRawTransaction
          const mappedMethod =
            method === "eth_sendRawTransaction"
              ? "fiber_sendRawTransaction"
              : method;

          const message = JSON.stringify({
            jsonrpc: "2.0",
            method: mappedMethod,
            params,
            id,
          });

          if (socket.readyState === WebSocket.OPEN) {
            socket.send(message);
          } else {
            pendingRequests.delete(id);
            reject(new Error("WebSocket is not open"));
          }

          // Set a timeout for the request
          const timeout = setTimeout(() => {
            if (pendingRequests.has(id)) {
              pendingRequests.delete(id);
              reject(new Error(`Request timeout for method: ${method}`));
            }
          }, 30000); // 30 second timeout

          // Clear timeout when request completes
          const originalResolve = resolve;
          const originalReject = reject;

          pendingRequests.set(id, {
            resolve: (value) => {
              clearTimeout(timeout);
              originalResolve(value);
            },
            reject: (error) => {
              clearTimeout(timeout);
              originalReject(error);
            },
          });
        });
      } catch (error) {
        throw new Error(`WebSocket connection failed: ${error}`);
      }
    },
  });

  // Add close method to the transport
  return Object.assign(transport, { close });
};
