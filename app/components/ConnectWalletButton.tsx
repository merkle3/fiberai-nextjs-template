"use client";

import { useAccount } from "wagmi";
import { ConnectKitButton } from "connectkit";

export function ConnectWalletButton() {
  const { address, isConnected } = useAccount();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <ConnectKitButton />
        {isConnected && address && (
          <div className="text-sm">
            <p className="text-gray-600 dark:text-gray-400">
              Connected Address:
            </p>
            <code className="bg-black/[.05] dark:bg-white/[.06] font-mono text-sm px-2 py-1 rounded">
              {address}
            </code>
          </div>
        )}
      </div>
    </div>
  );
}
