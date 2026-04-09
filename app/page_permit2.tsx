'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, createWalletClient, http, formatEther, getContract, custom, parseEther, Hex, encodeFunctionData, stringToHex, toBytes } from 'viem';
import { signTypedData } from 'viem/actions';
import { sepolia } from 'viem/chains';
import TokenBank_ABI from './contracts/TokenBank.json';

// TokenBank 合约地址
// const TOKEN_BANK_ADDRESS = "0xD3375B8927db243335501EC0436c0283E71031B6";
// PermitTokenBank 合约地址
// const PERMIT_TOKEN_BANK_ADDRESS = "0x201Fc8A0607070D04e98eA68B559F4A7fD7aB4e8";
// Permit2TokenBank 合约地址
const PERMIT2_TOKEN_BANK_ADDRESS = "0x87E973548E052DeFf9627f18d7eFDe563557cFF6";

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
  // 状态
  const [permitDepositAmount, setPermitDepositAmount] = useState<string>('');
  const [isPermitLoading, setIsPermitLoading] = useState(false);
  // 新增状态：Permit2存款
  const [permit2DepositAmount, setPermit2DepositAmount] = useState<string>('');
  const [isPermit2Loading, setIsPermit2Loading] = useState(false);

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
      address: PERMIT2_TOKEN_BANK_ADDRESS,
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
      
      const tokenBal = await tokenContract.read.balanceOf([address]);
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
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum as any),
      });

      // 首先需要批准TokenBank合约使用Token
      const tokenBankContract = getContract({
        address: PERMIT2_TOKEN_BANK_ADDRESS,
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
        PERMIT2_TOKEN_BANK_ADDRESS,
        parseEther(depositAmount),
      ], { account: address });
      
      console.log('Approve hash:', approveHash);
      
      // 等待批准交易确认
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      
      // 然后调用存款方法
      const hash = await walletClient.writeContract({
        address: PERMIT2_TOKEN_BANK_ADDRESS,
        abi: TokenBank_ABI.abi,
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
        address: PERMIT2_TOKEN_BANK_ADDRESS,
        abi: TokenBank_ABI.abi,
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

  // 通过签名存款 (EIP-2612)
  const handlePermitDeposit = async () => {
    if (!address || !permitDepositAmount) return;
    setIsPermitLoading(true);
    setTxHash('');
    
    try {
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum as any),
      });

      // 获取PermitTokenBank合约
      const tokenBankContract = getContract({
        address: PERMIT2_TOKEN_BANK_ADDRESS,
        abi: TokenBank_ABI.abi,
        client: publicClient,
      });
      
      // 获取Token合约地址
      const tokenAddress = await tokenBankContract.read.token() as `0x${string}`;
      
      // 获取Token合约
      const tokenContract = getContract({
        address: tokenAddress,
        // 使用ERC20Permit标准ABI
        abi: [
          {
            "type": "function",
            "name": "nonces",
            "inputs": [{ "name": "owner", "type": "address" }],
            "outputs": [{ "name": "", "type": "uint256" }],
            "stateMutability": "view"
          },
          {
            "type": "function",
            "name": "DOMAIN_SEPARATOR",
            "inputs": [],
            "outputs": [{ "name": "", "type": "bytes32" }],
            "stateMutability": "view"
          }
        ],
        client: publicClient,
      });
      
      // 获取nonce
      const nonce = await tokenContract.read.nonces([address]);
      
      // 设置deadline为当前时间+1小时
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      
      // 准备签名数据
      const domain = {
        name: 'AndyToken', // 需要替换为实际的Token名称
        version: '1',
        chainId: sepolia.id,
        verifyingContract: tokenAddress,
      };
      
      const types = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      };
      
      const value = {
        owner: address,
        spender: PERMIT2_TOKEN_BANK_ADDRESS,
        value: parseEther(permitDepositAmount),
        nonce,
        deadline,
      };
      
      // 签名
      const signature = await signTypedData(walletClient, {
        account: address,
        domain,
        types,
        primaryType: 'Permit',
        message: value,
      });
      
      // 从签名中提取v, r, s
      // 使用 viem 的签名格式提取 r, s, v
      const r = signature.slice(0, 66) as Hex;
      const s = ('0x' + signature.slice(66, 130)) as Hex;
      const v = parseInt('0x' + signature.slice(130, 132), 16);
      
      // 调用permitDeposit方法
      const hash = await walletClient.writeContract({
        address: PERMIT2_TOKEN_BANK_ADDRESS,
        abi: TokenBank_ABI.abi,
        functionName: 'permitDeposit',
        args: [parseEther(permitDepositAmount), deadline, v, r, s],
        account: address,
      });
      
      console.log('Permit Deposit hash:', hash);
      setTxHash(hash);
      
      // 等待交易确认后刷新余额
      await publicClient.waitForTransactionReceipt({ hash });
      fetchBalances();
      setPermitDepositAmount('');
    } catch (error) {
      console.error('签名存款失败:', error);
    } finally {
      setIsPermitLoading(false);
    }
  };

  // 新增：通过Permit2存款
  const handlePermit2Deposit = async () => {
    if (!address || !permit2DepositAmount) return;
    setIsPermit2Loading(true);
    setTxHash('');
    
    try {
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum as any),
      });

      // 获取TokenBank合约
      const tokenBankContract = getContract({
        address: PERMIT2_TOKEN_BANK_ADDRESS,
        abi: TokenBank_ABI.abi,
        client: publicClient,
      });
      
      // 打印合约函数列表，确认可用的函数
      console.log('合约函数列表:', TokenBank_ABI.abi
        .filter(item => item.type === 'function')
        .map(fn => `${fn.name}(${fn.inputs?.map(input => `${input.type} ${input.name}`).join(', ')})`));
      
      // 检查合约是否有depositWithPermit2函数
      const depositWithPermit2Function = TokenBank_ABI.abi.find(
        item => item.type === 'function' && item.name === 'depositWithPermit2'
      );
      
      if (!depositWithPermit2Function) {
        console.error('合约中找不到depositWithPermit2函数！查找可能的替代函数...');
        // 打印所有函数名，帮助识别正确的函数
        const allFunctions = TokenBank_ABI.abi
          .filter(item => item.type === 'function')
          .map(fn => fn.name || 'unnamed');
        console.log('可用函数:', allFunctions);
        
        // 尝试查找名称相似的函数
        const similarFunctions = allFunctions.filter(name => 
          name.toLowerCase().includes('permit') && name.toLowerCase().includes('deposit')
        );
        
        if (similarFunctions.length > 0) {
          console.log('找到可能相关的函数:', similarFunctions);
          throw new Error(`合约中找不到depositWithPermit2函数！可能的替代函数: ${similarFunctions.join(', ')}`);
        } else {
          throw new Error('合约中找不到depositWithPermit2函数，也没有找到类似的函数！请检查ABI是否正确。');
        }
      }
      
      console.log('depositWithPermit2函数签名:', 
        `depositWithPermit2(${depositWithPermit2Function.inputs?.map(input => `${input.type} ${input.name}`).join(', ')})`);
      
      // 获取Token合约地址
      const tokenAddress = await tokenBankContract.read.token() as `0x${string}`;
      
      // 获取Permit2地址
      const permit2Address = await tokenBankContract.read.PERMIT2_ADDRESS() as `0x${string}`;
      
      console.log('Permit2 address:', permit2Address);
      console.log('Token address:', tokenAddress);
      
      // 首先需要批准Permit2合约使用Token
      const tokenContract = getContract({
        address: tokenAddress,
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
      
      console.log('Approving Permit2 to spend tokens...');
      // 授权Permit2代表用户转账
      const approveHash = await tokenContract.write.approve([
        permit2Address,
        parseEther(permit2DepositAmount),
      ], { account: address });
      
      console.log('Approve hash:', approveHash);
      
      // 等待批准交易确认
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      console.log('Approval confirmed');
      
      // 获取nonce - 随机生成一个nonce
      const nonce = BigInt(Math.floor(Math.random() * 1000000));
      
      // 设置deadline为当前时间+1小时
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      
      // 准备Permit2签名数据
      const domain = {
        name: 'Permit2',
        version: '1',
        chainId: sepolia.id,
        verifyingContract: permit2Address,
      };
      
      // 根据Permit2规范定义类型
      const types = {
        TokenPermissions: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' }
        ],
        PermitSingle: [
          { name: 'details', type: 'PermitDetails' },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' }
        ],
        PermitDetails: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'expiration', type: 'uint256' },
          { name: 'nonce', type: 'uint256' }
        ]
      };
      
      // 当前时间+1小时（秒）
      const expiration = BigInt(Math.floor(Date.now() / 1000) + 3600);
      
      // 构建签名消息
      const value = {
        details: {
          token: tokenAddress,
          amount: parseEther(permit2DepositAmount),
          expiration,
          nonce
        },
        spender: PERMIT2_TOKEN_BANK_ADDRESS,
        sigDeadline: deadline
      };
      
      console.log('Signing Permit2 message...');
      // 创建一个自定义stringify函数处理BigInt
      const customStringify = (obj: any) => {
        return JSON.stringify(obj, (_, value) => 
          typeof value === 'bigint' ? value.toString() : value
        );
      };
      console.log('Value to sign:', customStringify(value));
      
      // 签名
      const signature = await signTypedData(walletClient, {
        account: address,
        domain,
        types,
        primaryType: 'PermitSingle',
        message: value,
      });
      
      console.log('Signature:', signature);
      
      // 调用depositWithPermit2方法
      console.log('Calling depositWithPermit2 with args:', customStringify([
        parseEther(permit2DepositAmount), 
        nonce, 
        deadline, 
        signature
      ]));
      
      // 准备调用合约的参数
      // 检查合约中实际可能的函数名称
      let functionName = 'depositWithPermit2';
      
      // 如果找到了类似的函数替代
      const allPermitFunctions = TokenBank_ABI.abi
        .filter(item => item.type === 'function' && 
                item.name && 
                item.name.toLowerCase().includes('permit') && 
                item.name.toLowerCase().includes('deposit'))
        .map(fn => fn.name || 'unnamed');
        
      if (allPermitFunctions.length > 0 && !allPermitFunctions.includes('depositWithPermit2')) {
        // 如果没有找到exactMatch但有类似的函数，使用第一个类似的函数
        functionName = allPermitFunctions[0];
        console.log(`使用找到的替代函数: ${functionName} 代替 depositWithPermit2`);
      }
      
      const hash = await walletClient.writeContract({
        address: PERMIT2_TOKEN_BANK_ADDRESS,
        abi: TokenBank_ABI.abi,
        functionName: functionName,
        args: [parseEther(permit2DepositAmount), nonce, deadline, signature],
        account: address,
      });
      
      console.log('Permit2 Deposit hash:', hash);
      setTxHash(hash);
      
      // 等待交易确认后刷新余额
      await publicClient.waitForTransactionReceipt({ hash });
      fetchBalances();
      setPermit2DepositAmount('');
    } catch (error) {
      console.error('Permit2签名存款失败:', error);
      alert(`Permit2签名存款失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsPermit2Loading(false);
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
                  disabled={isLoading || !depositAmount}
                  className={`px-4 py-2 rounded ${isLoading ? 'bg-gray-400' : 'bg-green-500 hover:bg-green-600'} text-white`}
                >
                  {isLoading ? '处理中...' : '存款'}
                </button>
              </div>
            </div>
            
            {/* 签名存款表单 (EIP-2612) */}
            <div className="border p-4 rounded-lg bg-blue-50">
              <h3 className="text-lg font-semibold mb-2">通过签名存款 (EIP-2612)</h3>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={permitDepositAmount}
                  onChange={(e) => setPermitDepositAmount(e.target.value)}
                  placeholder="输入存款金额"
                  className="flex-1 border rounded p-2"
                  disabled={isPermitLoading}
                />
                <button
                  onClick={handlePermitDeposit}
                  disabled={isPermitLoading || !permitDepositAmount}
                  className={`px-4 py-2 rounded ${isPermitLoading ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'} text-white`}
                >
                  {isPermitLoading ? '处理中...' : '签名存款'}
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-2">无需预先授权，一步完成签名和存款</p>
            </div>
            
            {/* 新增：Permit2存款表单 */}
            <div className="border p-4 rounded-lg bg-purple-50">
              <h3 className="text-lg font-semibold mb-2">通过Permit2存款</h3>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={permit2DepositAmount}
                  onChange={(e) => setPermit2DepositAmount(e.target.value)}
                  placeholder="输入存款金额"
                  className="flex-1 border rounded p-2"
                  disabled={isPermit2Loading}
                />
                <button
                  onClick={handlePermit2Deposit}
                  disabled={isPermit2Loading || !permit2DepositAmount}
                  className={`px-4 py-2 rounded ${isPermit2Loading ? 'bg-gray-400' : 'bg-purple-500 hover:bg-purple-600'} text-white`}
                >
                  {isPermit2Loading ? '处理中...' : 'Permit2存款'}
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-2">使用Permit2协议，更通用和安全的授权方式</p>
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