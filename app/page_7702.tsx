'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, createWalletClient, http, getAddress, hexToBigInt, hexToNumber, formatEther, getContract, custom, parseEther, Hex, encodeFunctionData, stringToHex, toBytes, keccak256 } from 'viem';
import { signTypedData } from 'viem/actions';
import { sepolia } from 'viem/chains';
import TokenBank_ABI from './contracts/TokenBank.json';
import SimpleDelegateContract_ABI from './contracts/SimpleDelegateContract.json';
import ERC20_ABI from './contracts/ERC20.json';

// TokenBank 合约地址
// const TOKEN_BANK_ADDRESS = "0xD3375B8927db243335501EC0436c0283E71031B6";
// PermitTokenBank 合约地址
// const PERMIT_TOKEN_BANK_ADDRESS = "0x201Fc8A0607070D04e98eA68B559F4A7fD7aB4e8";
// Permit2TokenBank 合约地址
// const PERMIT2_TOKEN_BANK_ADDRESS = "0x87E973548E052DeFf9627f18d7eFDe563557cFF6";
// 新部署的Token 合约地址
const TOKEN_ADDRESS = "0x1a243f7191e7A4847cA3b1cC5Ca0122C1F48BD93";
// 新部署的TokenBank 合约地址
const TOKEN_BANK_ADDRESS = "0x749053271a455750e77c9C1e0c1e23234CC50843";
// 新部署的SimpleDelegateContract 合约地址
const DELEGATE_CONTRACT_ADDRESS = "0x32C0249bBa639b8Da96A97E5c996ca1b122862b1";


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
  const [txHash, setTxHash] = useState<string>('');
  // 新增状态：Delegate存款
  const [delegateDepositAmount, setDelegateDepositAmount] = useState<string>('');
  const [isDelegateLoading, setIsDelegateLoading] = useState(false);
  // EIP-7702状态
  const [eip7702DepositAmount, setEip7702DepositAmount] = useState<string>('');
  const [isEip7702Loading, setIsEip7702Loading] = useState(false);
  // Token状态
  const [mintAmount, setMintAmount] = useState<string>('100');
  const [isMinting, setIsMinting] = useState(false);
  const [ownerAddress, setOwnerAddress] = useState<string>('');
  const [ownerBalance, setOwnerBalance] = useState<string>('0');
  // 授权状态
  const [delegateAllowance, setDelegateAllowance] = useState<string>('0');
  const [approveAmount, setApproveAmount] = useState<string>('1000');
  const [isApproving, setIsApproving] = useState(false);

  // 链接sepolia测试网
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http('https://eth-sepolia.public.blastapi.io'),
  });

  // 连接钱包
  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      alert('请安装 MetaMask');
      return;
    }

    try {
      const [address] = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      
      setAddress(address as `0x${string}`);
      setChainId(Number(chainId));
      setIsConnected(true);

      // 监听账户变化
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length === 0) {
          setIsConnected(false);
          setAddress(undefined);
        } else {
          setAddress(accounts[0] as `0x${string}`);
        }
      });

      // 监听网络变化
      window.ethereum.on('chainChanged', (chainId: string) => {
        setChainId(Number(chainId));
      });
    } catch (error) {
      console.error('连接钱包失败:', error);
    }
  };

  // 断开连接
  const disconnectWallet = () => {
    setIsConnected(false);
    setAddress(undefined);
    setChainId(undefined);
  };

  // 获取 Token 余额和存款余额
  const fetchBalances = async () => {
    if (!address) return;
    
    const tokenBankContract = getContract({
      address: TOKEN_BANK_ADDRESS,
      abi: TokenBank_ABI,
      client: publicClient,
    });

    try {
      // 获取用户在TokenBank中的存款余额
      const depositBal = await tokenBankContract.read.balanceOf([address]) as bigint;
      setDepositBalance(formatEther(depositBal));
      
      // 获取Token合约地址
      const tokenAddress = await tokenBankContract.read.token() as `0x${string}`;
      console.log('TokenBank中配置的Token地址:', tokenAddress);
      console.log('预期的Token地址:', TOKEN_ADDRESS);
      console.log('地址是否匹配:', tokenAddress.toLowerCase() === TOKEN_ADDRESS.toLowerCase());
      
      // 直接使用我们知道的Token地址来查询余额
      const tokenContract = getContract({
        address: TOKEN_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        client: publicClient,
      });
      
      const tokenBal = await tokenContract.read.balanceOf([address]) as bigint;
      console.log('Token余额 (raw):', tokenBal);
      console.log('Token余额 (formatted):', formatEther(tokenBal));
      setTokenBalance(formatEther(tokenBal));
      
      // 也查询TokenBank配置的Token地址的余额（以防不一致）
      if (tokenAddress.toLowerCase() !== TOKEN_ADDRESS.toLowerCase()) {
        const bankTokenContract = getContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          client: publicClient,
        });
                 const bankTokenBal = await bankTokenContract.read.balanceOf([address]) as bigint;
         console.log('TokenBank配置的Token余额:', formatEther(bankTokenBal));
      }
    } catch (error) {
      console.error('获取余额失败:', error);
    }
  };

  // 存款
  const handleDeposit = async () => {
    if (!address || !depositAmount) return;
    
    // 检查Token余额
    const depositAmountBigInt = parseEther(depositAmount);
    const currentBalance = parseEther(tokenBalance);
    
    if (currentBalance < depositAmountBigInt) {
      alert(`Token余额不足！\n当前余额: ${tokenBalance} Token\n需要: ${depositAmount} Token\n\n请先使用上方的"获取测试Token"功能获取足够的Token。`);
      return;
    }
    
    setIsLoading(true);
    setTxHash('');
    
    try {
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum as any),
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
        abi: TokenBank_ABI,
        functionName: 'deposit',
        args: [parseEther(depositAmount)],
        account: address,
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
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum as any),
      });

      const hash = await walletClient.writeContract({
        address: TOKEN_BANK_ADDRESS,
        abi: TokenBank_ABI,
        functionName: 'withdraw',
        args: [parseEther(withdrawAmount)],
        account: address,
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

  // 获取Token函数 - 尝试多种方法
  const handleGetToken = async () => {
    if (!address || !mintAmount) return;
    setIsMinting(true);
    setTxHash('');
    
    try {
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum as any),
      });

      // 方法1: 尝试mint函数
      try {
        const tokenContract = getContract({
          address: TOKEN_ADDRESS,
          abi: [
            {
              "type": "function",
              "name": "mint",
              "inputs": [
                { "name": "to", "type": "address" },
                { "name": "amount", "type": "uint256" }
              ],
              "outputs": [],
              "stateMutability": "nonpayable"
            }
          ],
          client: {
            public: publicClient,
            wallet: walletClient,
          },
        });
        
        const hash = await tokenContract.write.mint([
          address,
          parseEther(mintAmount),
        ], { account: address });
        
        console.log('Mint hash:', hash);
        setTxHash(hash);
        
        await publicClient.waitForTransactionReceipt({ hash });
        fetchBalances();
        
        alert(`成功mint ${mintAmount} Token！\n交易哈希: ${hash}\n浏览器链接: https://sepolia.etherscan.io/tx/${hash}`);
        return;
      } catch (mintError) {
        console.log('Mint方法失败，尝试其他方法...', mintError);
      }

      // 方法2: 尝试faucet函数
      try {
        const tokenContract = getContract({
          address: TOKEN_ADDRESS,
          abi: [
            {
              "type": "function",
              "name": "faucet",
              "inputs": [],
              "outputs": [],
              "stateMutability": "nonpayable"
            }
          ],
          client: {
            public: publicClient,
            wallet: walletClient,
          },
        });
        
        const hash = await tokenContract.write.faucet({ account: address });
        
        console.log('Faucet hash:', hash);
        setTxHash(hash);
        
        await publicClient.waitForTransactionReceipt({ hash });
        fetchBalances();
        
        alert(`成功从水龙头获取Token！\n交易哈希: ${hash}\n浏览器链接: https://sepolia.etherscan.io/tx/${hash}`);
        return;
      } catch (faucetError) {
        console.log('Faucet方法失败，尝试其他方法...', faucetError);
      }

      // 方法3: 尝试claim函数
      try {
        const tokenContract = getContract({
          address: TOKEN_ADDRESS,
          abi: [
            {
              "type": "function",
              "name": "claim",
              "inputs": [],
              "outputs": [],
              "stateMutability": "nonpayable"
            }
          ],
          client: {
            public: publicClient,
            wallet: walletClient,
          },
        });
        
        const hash = await tokenContract.write.claim({ account: address });
        
        console.log('Claim hash:', hash);
        setTxHash(hash);
        
        await publicClient.waitForTransactionReceipt({ hash });
        fetchBalances();
        
        alert(`成功claim Token！\n交易哈希: ${hash}\n浏览器链接: https://sepolia.etherscan.io/tx/${hash}`);
        return;
      } catch (claimError) {
        console.log('Claim方法失败...', claimError);
      }

      // 如果所有方法都失败了
      throw new Error('所有获取Token的方法都失败了，该Token合约可能不支持公开获取Token功能');
      
    } catch (error) {
      console.error('获取Token失败:', error);
      alert(`获取Token失败: ${error instanceof Error ? error.message : '未知错误'}\n\n请尝试以下方法获取测试Token：\n1. 联系合约部署者\n2. 检查是否有专门的Token水龙头\n3. 从其他持有Token的账户转账`);
    } finally {
      setIsMinting(false);
    }
  };

  // EIP-7702 一键授权和存款函数
  const handleEip7702Deposit = async () => {
    if (!address || !eip7702DepositAmount) return;
    
    const depositAmountBigInt = parseEther(eip7702DepositAmount);
    const currentBalance = parseEther(tokenBalance);
    
    if (currentBalance < depositAmountBigInt) {
      alert(`Token余额不足！\n当前余额: ${tokenBalance} Token\n需要: ${eip7702DepositAmount} Token`);
      return;
    }
    
    setIsEip7702Loading(true);
    setTxHash('');
    
    try {
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum as any),
      });

      console.log('开始EIP-7702一键存款流程...');
      console.log('EOA地址:', address);
      console.log('Delegate合约地址:', DELEGATE_CONTRACT_ADDRESS);
      console.log('Token地址:', TOKEN_ADDRESS);
      console.log('TokenBank地址:', TOKEN_BANK_ADDRESS);
      console.log('存款金额:', eip7702DepositAmount);
      
      // 第1步：创建EIP-7702授权
      console.log('第1步：生成EIP-7702授权...');
      const authorization = await walletClient.signAuthorization({
        account: address,
        contractAddress: DELEGATE_CONTRACT_ADDRESS,
        executor: 'self'
      });
      
      console.log('EIP-7702授权生成成功:', authorization);
      
      // 第2步：准备批量调用数据
      const approveCalldata = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [TOKEN_BANK_ADDRESS, parseEther(eip7702DepositAmount)],
      });
      
      const depositCalldata = encodeFunctionData({
        abi: TokenBank_ABI as any,
        functionName: 'deposit',
        args: [parseEther(eip7702DepositAmount)],
      });

      const calls = [
        {
          to: TOKEN_ADDRESS,
          data: approveCalldata,
          value: BigInt(0),
        },
        {
          to: TOKEN_BANK_ADDRESS,
          data: depositCalldata,
          value: BigInt(0),
        },
      ];
      
      console.log('第2步：执行EIP-7702批量交易...');
      
      // 第3步：使用EIP-7702授权执行批量交易
      const hash = await walletClient.writeContract({
        address: address, // 使用EOA地址作为目标，因为它现在有了delegate代码
        abi: SimpleDelegateContract_ABI.abi,
        functionName: 'execute',
        args: [calls],
        account: address,
        authorizationList: [authorization],
      });
      
      console.log('EIP-7702批量交易哈希:', hash);
      setTxHash(hash);
      
      // 等待交易确认后刷新余额
      await publicClient.waitForTransactionReceipt({ hash });
      console.log('EIP-7702交易确认完成，刷新余额...');
      fetchBalances();
      setEip7702DepositAmount('');
      
      console.log('EIP-7702存款成功！');
    } catch (error) {
      console.error('EIP-7702存款失败:', error);
      alert(`EIP-7702存款失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsEip7702Loading(false);
    }
  };

  // 通过优化的 Delegate 合约进行一键授权和存款
  const handleDelegateDeposit = async () => {
    if (!address || !delegateDepositAmount) return;
    
    const depositAmountBigInt = parseEther(delegateDepositAmount);
    const currentBalance = parseEther(tokenBalance);
    
    if (currentBalance < depositAmountBigInt) {
      alert(`Token余额不足！\n当前余额: ${tokenBalance} Token\n需要: ${delegateDepositAmount} Token`);
      return;
    }
    
    setIsDelegateLoading(true);
    setTxHash('');
    
    try {
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum as any),
      });

      console.log('开始优化的 Delegate 合约一键存款流程...');
      console.log('EOA地址:', address);
      console.log('Delegate合约地址:', DELEGATE_CONTRACT_ADDRESS);
      console.log('Token地址:', TOKEN_ADDRESS);
      console.log('TokenBank地址:', TOKEN_BANK_ADDRESS);
      console.log('存款金额:', delegateDepositAmount);
      
      // 第1步：用户先授权给 Delegate 合约
      console.log('第1步：授权Token给Delegate合约...');
      const tokenContract = getContract({
        address: TOKEN_ADDRESS,
        abi: ERC20_ABI,
        client: {
          public: publicClient,
          wallet: walletClient,
        },
      });
      
      const approveHash = await tokenContract.write.approve([
        DELEGATE_CONTRACT_ADDRESS,  // 授权给 Delegate 合约
        parseEther(delegateDepositAmount),
      ], { account: address });
      
      console.log('授权交易哈希:', approveHash);
      
      // 等待授权交易确认
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      console.log('授权交易确认完成');
      
      // 第2步：调用 Delegate 合约的 approveAndDeposit 方法
      console.log('第2步：调用 approveAndDeposit 方法...');
      
              const hash = await walletClient.writeContract({
          address: DELEGATE_CONTRACT_ADDRESS,
          abi: SimpleDelegateContract_ABI.abi,
          functionName: 'approveAndDeposit',  // 使用 approveAndDeposit
          args: [
            TOKEN_ADDRESS,           // token address
            TOKEN_BANK_ADDRESS,      // tokenbank address  
            parseEther(delegateDepositAmount)  // amount
          ],
          account: address,
        });
      
      console.log('Delegate 批量存款交易哈希:', hash);
      setTxHash(hash);
      
      // 等待交易确认后刷新余额
      await publicClient.waitForTransactionReceipt({ hash });
      console.log('交易确认完成，刷新余额...');
      fetchBalances();
      setDelegateDepositAmount('');
      
      console.log('Delegate 存款成功！');
    } catch (error) {
      console.error('Delegate 存款失败:', error);
      alert(`Delegate 存款失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsDelegateLoading(false);
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
        {!isConnected ? (
          <button
            onClick={connectWallet}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 transition-colors"
          >
            连接 MetaMask
          </button>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-gray-600">钱包地址:</p>
              <p className="font-mono break-all">{address}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-600">当前网络:</p>
              <p className="font-mono">
                {sepolia.name} (Chain ID: {chainId})
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
              <button 
                onClick={fetchBalances}
                className="mt-1 text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300"
              >
                🔄 刷新余额
              </button>
            </div>
            
            {/* 合约信息 */}
            <div className="text-center bg-gray-50 p-3 rounded border">
              <p className="text-sm font-semibold text-gray-700 mb-2">📋 合约信息</p>
              <div className="text-xs text-left space-y-2">
                <div>
                  <p className="font-mono text-gray-600">钱包地址:</p>
                  <p className="font-mono text-xs break-all">{address}</p>
                </div>
                <div>
                  <p className="font-mono text-gray-600">Token合约:</p>
                  <p className="font-mono text-xs break-all">{TOKEN_ADDRESS}</p>
                </div>
                <div>
                  <p className="font-mono text-gray-600">TokenBank合约:</p>
                  <p className="font-mono text-xs break-all">{TOKEN_BANK_ADDRESS}</p>
                </div>
                <div>
                  <p className="font-mono text-gray-600">Delegate合约:</p>
                  <p className="font-mono text-xs break-all">{DELEGATE_CONTRACT_ADDRESS}</p>
                </div>
                <p className="text-gray-500 border-t pt-2">💡 新版本Delegate合约，支持一键授权和存款</p>
              </div>
            </div>
            
            {/* 存款余额显示 */}
            <div className="text-center">
              <p className="text-gray-600">存款余额:</p>
              <p className="font-mono">{depositBalance} Token</p>
            </div>

            {/* Token余额检查 */}
            <div className="border p-4 rounded-lg bg-yellow-50">
              <h3 className="text-lg font-semibold mb-2">Token余额检查</h3>
              <div className="space-y-2">
                <p className="text-sm text-gray-700">
                  根据合约源码，部署者应该拥有1亿个Token (100,000,000)
                </p>
                <div className="flex space-x-2">
                  <a 
                    href={`https://sepolia.etherscan.io/address/${TOKEN_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 text-center"
                  >
                    查看Token合约
                  </a>
                  <a 
                    href={`https://sepolia.etherscan.io/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 text-center"
                  >
                    查看钱包地址
                  </a>
                </div>
              </div>
              
              {/* 问题排查指南 */}
              <div className="mt-3 p-2 bg-blue-50 rounded border">
                <p className="text-xs font-semibold text-blue-800">🔍 问题排查:</p>
                <div className="text-xs text-blue-700 space-y-1 mt-1">
                  <p>1. 确认当前连接的钱包地址是否为Token合约的部署者</p>
                  <p>2. 检查TokenBank合约是否配置了正确的Token地址</p>
                  <p>3. 在Etherscan上直接查看Token余额</p>
                  <p>4. 检查网络是否为Sepolia测试网</p>
                </div>
              </div>
            </div>
            
            {/* 普通存款表单 */}
            <div className="border p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-2">普通存款</h3>
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
                  disabled={isLoading || !depositAmount}
                  className={`px-4 py-2 rounded ${isLoading ? 'bg-gray-400' : 'bg-green-500 hover:bg-green-600'} text-white`}
                >
                  {isLoading ? '处理中...' : '存款'}
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-2">需要两个交易：先授权，再存款</p>
            </div>
            
            {/* 真正的 EIP-7702 存款表单 */}
            <div className="border p-4 rounded-lg bg-purple-50">
              <h3 className="text-lg font-semibold mb-2">⚡ 真正的 EIP-7702 存款</h3>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={eip7702DepositAmount}
                  onChange={(e) => setEip7702DepositAmount(e.target.value)}
                  placeholder="输入存款金额"
                  className="flex-1 border rounded p-2"
                  disabled={isEip7702Loading}
                />
                <button
                  onClick={handleEip7702Deposit}
                  disabled={isEip7702Loading || !eip7702DepositAmount}
                  className={`px-4 py-2 rounded ${isEip7702Loading ? 'bg-gray-400' : 'bg-purple-500 hover:bg-purple-600'} text-white`}
                >
                  {isEip7702Loading ? '处理中...' : 'EIP-7702存款'}
                </button>
              </div>
              <div className="text-xs text-gray-600 mt-2 space-y-1">
                <p>⚡ <strong>真正的EIP-7702：EOA转换为智能账户</strong></p>
                <p>🔗 新合约: <span className="font-mono text-xs">{DELEGATE_CONTRACT_ADDRESS}</span></p>
                <p className="text-purple-700">💡 单次交易：授权EOA变身 + 执行批量操作</p>
                <p className="text-xs text-purple-600 border-t pt-1 mt-2">
                  📝 使用EIP-7702让你的EOA临时变成智能合约，实现真正的批量操作
                </p>
              </div>
            </div>

            {/* EIP-7702 优化的 Delegate 存款表单 */}
            <div className="border p-4 rounded-lg bg-orange-50">
              <h3 className="text-lg font-semibold mb-2">🚀 传统方式批量存款</h3>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={delegateDepositAmount}
                  onChange={(e) => setDelegateDepositAmount(e.target.value)}
                  placeholder="输入存款金额"
                  className="flex-1 border rounded p-2"
                  disabled={isDelegateLoading}
                />
                <button
                  onClick={handleDelegateDeposit}
                  disabled={isDelegateLoading || !delegateDepositAmount}
                  className={`px-4 py-2 rounded ${isDelegateLoading ? 'bg-gray-400' : 'bg-orange-500 hover:bg-orange-600'} text-white`}
                >
                  {isDelegateLoading ? '处理中...' : '批量存款'}
                </button>
              </div>
              <div className="text-xs text-gray-600 mt-2 space-y-1">
                <p>⚡ <strong>两步操作：授权 + EIP-7702 优化存款</strong></p>
                <p>🔗 Delegate合约: <span className="font-mono text-xs">{DELEGATE_CONTRACT_ADDRESS}</span></p>
                <p className="text-orange-700">💡 第1步：授权Token给Delegate | 第2步：Delegate调用优化的存款逻辑</p>
                <p className="text-xs text-orange-600 border-t pt-1 mt-2">
                  📝 使用为 EIP-7702 设计的合约结构，为未来的钱包集成做准备
                </p>
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
                  disabled={isLoading || !withdrawAmount}
                  className={`px-4 py-2 rounded ${isLoading ? 'bg-gray-400' : 'bg-red-500 hover:bg-red-600'} text-white`}
                >
                  {isLoading ? '处理中...' : '取款'}
                </button>
              </div>
            </div>
            
            {/* 交易结果显示 */}
            {txHash && (
              <div className="border p-4 rounded-lg bg-green-50">
                <h3 className="text-lg font-semibold mb-3 text-center text-green-800">🎉 EIP-7702 交易成功！</h3>
                <div className="space-y-3">
                  <div className="text-center">
                    <p className="text-gray-600 mb-1">交易哈希:</p>
                    <p className="font-mono break-all text-green-600 text-sm bg-white p-2 rounded border">
                      {txHash}
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <a 
                      href={`https://sepolia.etherscan.io/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block bg-green-500 text-white py-2 px-6 rounded hover:bg-green-600 transition-colors"
                    >
                      🔗 在 Sepolia Etherscan 上查看交易
                    </a>
                  </div>
                  
                  <div className="text-xs text-gray-600 text-center space-y-1">
                    <p>🚀 <strong>EIP-7702 一键授权和存款操作已完成</strong></p>
                    <p>📊 请刷新余额查看变化</p>
                    <p>🌐 网络: Sepolia 测试网</p>
                    <p className="text-green-700 font-semibold border-t pt-1">
                      ✨ 恭喜！你成功使用了最新的 EIP-7702 技术！
                    </p>
                  </div>
                </div>
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