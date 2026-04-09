interface Window {
  ethereum?: {
    request: (args: { method: string; params?: any[] }) => Promise<any>;
    on: (event: string, callback: (params: any) => void) => void;
    removeListener: (event: string, callback: (params: any) => void) => void;
    removeAllListeners?: (event: string) => void;
    isMetaMask?: boolean;
    isConnected?: () => boolean;
    chainId?: string;
    selectedAddress?: string;
  };
} 