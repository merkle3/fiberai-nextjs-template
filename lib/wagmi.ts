import { getDefaultConfig } from "connectkit";
import { createConfig } from "wagmi";
import { createFiberWebSocketTransport, fiberTestnet } from "./fiberChain";

export const wagmiConfig = createConfig(
  getDefaultConfig({
    appName: "FiberAI Template",
    walletConnectProjectId: "",
    chains: [fiberTestnet],
    transports: {
      [fiberTestnet.id]: createFiberWebSocketTransport(),
    },
    ssr: true,
  })
);
