'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, createWalletClient, http, formatEther, getContract, custom, parseEther } from 'viem';
import { sepolia } from 'viem/chains';
import TokenBank_ABI from './contracts/TokenBank.json';

// TokenBank 合约地址
const TOKEN_BANK_ADDRESS = "0xc0dC660b5BA2D73bDf9bA531eE70063b63243edA";

export default function Home() {
  const [balance, setBalance] = useState<string>('0');
  const [tokenBalance, setTokenBalance] = useState<string>('0');
  const [depositBalance, setDepositBalance] = useState<string>('0');
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [address, setAddress] = useState<`0x${string}` | undefined>();
  const [isConnected, setIsConnected] = useState(false);
  const [chainId, setChainId] = useState<number | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState<string>('');8
  const [error, setError] = useState<string>('');

  // 链接sepolia测试网
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http('https://rpc.ankr.com/eth_sepolia/88e7c73b5e75bf690e7f89d547e38266e065dc5727718f156c9aece3e9e438e3'),
  });

  // 检查是否为正确的网络
  const isCorrectNetwork = chainId === sepolia.id;

  // 清除错误信息
  const clearError = () => setError('');

  // 连接钱包
  const connectWallet = async () => {
    setError('');
    
    if (typeof window === 'undefined') {
      setError('请在浏览器中运行此应用');
      return;
    }

    if (typeof window.ethereum === 'undefined') {
      setError('请安装 MetaMask 钱包');
      return;
    }

    try {
      setIsLoading(true);
      
      // 请求账户访问
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      if (!accounts || accounts.length === 0) {
        setError('未获取到账户信息');
        return;
      }

      // 获取网络ID
      const networkId = await window.ethereum.request({ 
        method: 'eth_chainId' 
      });
      
      const currentChainId = parseInt(networkId, 16);
      
      setAddress(accounts[0] as `0x${string}`);
      setChainId(currentChainId);
      setIsConnected(true);

      // 检查网络
      if (currentChainId !== sepolia.id) {
        setError(`请切换到 ${sepolia.name} 网络 (Chain ID: ${sepolia.id})`);
        
        // 尝试切换网络
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${sepolia.id.toString(16)}` }],
          });
        } catch (switchError: any) {
          // 如果网络不存在，尝试添加网络
          if (switchError.code === 4902) {
            try {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: `0x${sepolia.id.toString(16)}`,
                  chainName: sepolia.name,
                  rpcUrls: ['https://rpc.ankr.com/eth_sepolia/88e7c73b5e75bf690e7f89d547e38266e065dc5727718f156c9aece3e9e438e3'],
                  nativeCurrency: {
                    name: 'Sepolia ETH',
                    symbol: 'ETH',
                    decimals: 18,
                  },
                  blockExplorerUrls: ['https://sepolia.etherscan.io'],
                }],
              });
            } catch (addError) {
              console.error('添加网络失败:', addError);
              setError('无法添加 Sepolia 网络，请手动添加');
            }
          } else {
            console.error('切换网络失败:', switchError);
            setError('无法切换到 Sepolia 网络');
          }
        }
      }

      // 清除之前的事件监听器（避免重复注册）
      if (window.ethereum && typeof window.ethereum.removeAllListeners === 'function') {
        window.ethereum.removeAllListeners('accountsChanged');
        window.ethereum.removeAllListeners('chainChanged');
      }

      // 监听账户变化
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length === 0) {
          setIsConnected(false);
          setAddress(undefined);
          setError('钱包已断开连接');
        } else {
          setAddress(accounts[0] as `0x${string}`);
          clearError();
        }
      });

      // 监听网络变化
      window.ethereum.on('chainChanged', (chainId: string) => {
        const newChainId = parseInt(chainId, 16);
        setChainId(newChainId);
        
        if (newChainId !== sepolia.id) {
          setError(`请切换到 ${sepolia.name} 网络 (Chain ID: ${sepolia.id})`);
        } else {
          clearError();
        }
      });

    } catch (error: any) {
      console.error('连接钱包失败:', error);
      
      // 处理常见错误
      if (error.code === 4001) {
        setError('用户拒绝了连接请求');
      } else if (error.code === -32002) {
        setError('MetaMask 正在处理请求，请检查扩展程序');
      } else if (error.message?.includes('User rejected')) {
        setError('用户拒绝了连接请求');
      } else {
        setError(`连接失败: ${error.message || '未知错误'}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 断开连接
  const disconnectWallet = () => {
    setIsConnected(false);
    setAddress(undefined);
    setChainId(undefined);
    setError('');
    
    // 清除事件监听器
    if (window.ethereum && typeof window.ethereum.removeAllListeners === 'function') {
      window.ethereum.removeAllListeners('accountsChanged');
      window.ethereum.removeAllListeners('chainChanged');
    }
  };

  // 获取 Token 余额和存款余额
  const fetchBalances = async () => {
    if (!address) return;
    
    const tokenBankContract = getContract({
      address: TOKEN_BANK_ADDRESS,
      abi: TokenBank_ABI.abi,
      client: publicClient,
    });

    try {
      // 获取用户在TokenBank中的存款余额
      const depositBal = await tokenBankContract.read.balanceOf([address]) as bigint;
      setDepositBalance(formatEther(depositBal));
      
      // 获取Token合约地址
      const tokenAddress = await tokenBankContract.read.token() as `0x${string}`;
      
      // 获取用户的Token余额
      const tokenContract = getContract({
        address: tokenAddress,
        // 使用ERC20标准ABI中的balanceOf方法
        abi: [{
          "type": "function",
          "name": "balanceOf",
          "inputs": [{ "name": "owner", "type": "address" }],
          "outputs": [{ "name": "", "type": "uint256" }],
          "stateMutability": "view"
        }],
        client: publicClient,
      });
      
      const tokenBal = await tokenContract.read.balanceOf([address]) as bigint;
      console.log('tokenAddress地址:', tokenAddress);
      console.log('address余额:', address);
      setTokenBalance(formatEther(tokenBal));
    } catch (error) {
      console.error('获取余额失败:', error);
    }
  };

  // 存款
  const handleDeposit = async () => {
    if (!address || !depositAmount) return;
    setIsLoading(true);
    setTxHash('');
    
    try {
      if (!window.ethereum) {
        setError('MetaMask 未安装');
        return;
      }
      
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum),
      });

      // 首先需要批准TokenBank合约使用Token
      const tokenBankContract = getContract({
        address: TOKEN_BANK_ADDRESS,
        abi: TokenBank_ABI.abi,
        client: publicClient,
      });
      
      // 获取Token合约地址
      const tokenAddress = await tokenBankContract.read.token() as `0x${string}`;
      
      // 批准TokenBank使用Token
      const tokenContract = getContract({
        address: tokenAddress,
        // 使用ERC20标准ABI中的approve方法
        abi: [{
          "type": "function",
          "name": "approve",
          "inputs": [
            { "name": "spender", "type": "address" },
            { "name": "amount", "type": "uint256" }
          ],
          "outputs": [{ "name": "", "type": "bool" }],
          "stateMutability": "nonpayable"
        }],
        client: {
          public: publicClient,
          wallet: walletClient,
        },
      });
      
      const approveHash = await tokenContract.write.approve([
        TOKEN_BANK_ADDRESS,
        parseEther(depositAmount),
      ], { account: address });
      
      console.log('Approve hash:', approveHash);
      
      // 等待批准交易确认
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      
      // 然后调用存款方法
      const hash = await walletClient.writeContract({
        address: TOKEN_BANK_ADDRESS,
        abi: TokenBank_ABI.abi,
        functionName: 'deposit',
        args: [parseEther(depositAmount)],
        account: address 
      });
      
      console.log('Deposit hash:', hash);
      setTxHash(hash);
      
      // 等待交易确认后刷新余额
      await publicClient.waitForTransactionReceipt({ hash });
      fetchBalances();
      setDepositAmount('');
    } catch (error) {
      console.error('存款失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 取款
  const handleWithdraw = async () => {
    if (!address || !withdrawAmount) return;
    setIsLoading(true);
    setTxHash('');
    
    try {
      if (!window.ethereum) {
        setError('MetaMask 未安装');
        return;
      }
      
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum),
      });

      const hash = await walletClient.writeContract({
        address: TOKEN_BANK_ADDRESS,
        abi: TokenBank_ABI.abi,
        functionName: 'withdraw',
        args: [parseEther(withdrawAmount)],
        account: address
      });
      
      console.log('Withdraw hash:', hash);
      setTxHash(hash);
      
      // 等待交易确认后刷新余额
      await publicClient.waitForTransactionReceipt({ hash });
      fetchBalances();
      setWithdrawAmount('');
    } catch (error) {
      console.error('取款失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const fetchEthBalance = async () => {
      if (!address) return;
      
      const balance = await publicClient.getBalance({
        address: address,
      });

      setBalance(formatEther(balance));
    };

    if (address) {
      fetchEthBalance();
      fetchBalances();
    }
  }, [address]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-8">Token Bank Demo</h1>
      
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl">
        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}
        
        {!isConnected ? (
          <button
            onClick={connectWallet}
            disabled={isLoading}
            className={`w-full py-2 px-4 rounded transition-colors ${
              isLoading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-500 hover:bg-blue-600'
            } text-white`}
          >
            {isLoading ? '连接中...' : '连接 MetaMask'}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-gray-600">钱包地址:</p>
              <p className="font-mono break-all">{address}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-600">当前网络:</p>
              <p className={`font-mono ${isCorrectNetwork ? 'text-green-600' : 'text-red-600'}`}>
                {chainId === sepolia.id ? sepolia.name : `未知网络 (Chain ID: ${chainId})`}
                {!isCorrectNetwork && (
                  <span className="block text-sm text-red-500 mt-1">
                    ⚠️ 请切换到 {sepolia.name} 网络
                  </span>
                )}
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-600">ETH 余额:</p>
              <p className="font-mono">{balance} ETH</p>
            </div>
            
            {/* Token 余额显示 */}
            <div className="text-center">
              <p className="text-gray-600">Token 余额:</p>
              <p className="font-mono">{tokenBalance} Token</p>
            </div>
            
            {/* 存款余额显示 */}
            <div className="text-center">
              <p className="text-gray-600">存款余额:</p>
              <p className="font-mono">{depositBalance} Token</p>
            </div>
            
            {/* 存款表单 */}
            <div className="border p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-2">存款</h3>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="输入存款金额"
                  className="flex-1 border rounded p-2"
                  disabled={isLoading}
                />
                <button
                  onClick={handleDeposit}
                  disabled={isLoading || !depositAmount || !isCorrectNetwork}
                  className={`px-4 py-2 rounded ${
                    isLoading || !isCorrectNetwork
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-green-500 hover:bg-green-600'
                  } text-white`}
                >
                  {isLoading ? '处理中...' : !isCorrectNetwork ? '网络错误' : '存款'}
                </button>
              </div>
            </div>
            
            {/* 取款表单 */}
            <div className="border p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-2">取款</h3>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="输入取款金额"
                  className="flex-1 border rounded p-2"
                  disabled={isLoading}
                />
                <button
                  onClick={handleWithdraw}
                  disabled={isLoading || !withdrawAmount || !isCorrectNetwork}
                  className={`px-4 py-2 rounded ${
                    isLoading || !isCorrectNetwork
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-red-500 hover:bg-red-600'
                  } text-white`}
                >
                  {isLoading ? '处理中...' : !isCorrectNetwork ? '网络错误' : '取款'}
                </button>
              </div>
            </div>
            
            {/* 交易哈希显示 */}
            {txHash && (
              <div className="text-center">
                <p className="text-gray-600">交易哈希:</p>
                <p className="font-mono break-all text-blue-500">{txHash}</p>
              </div>
            )}
            
            <button
              onClick={disconnectWallet}
              className="w-full bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600 transition-colors"
            >
              断开连接
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
