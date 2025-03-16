// src/DexService.ts
import Web3 from 'web3';
import { ethers } from 'ethers';

const DEX_ROUTER_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'address[]', name: 'path', type: 'address[]' }
    ],
    name: 'getAmountsOut',
    outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  }
];

const ERC20_ABI = [
  { constant: true, name: 'decimals', inputs: [], outputs: [{ name: '', type: 'uint8' }], type: 'function' }
];

const ROUTER_ADDRESSES = {
  uniswap: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  sushiswap: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
  pancakeswap: '0x10ED43C718714eb63d5aA57B78B54704E256024E'
} as const;

const DEX_NETWORK = {
  uniswap: 'ethereum',
  sushiswap: 'ethereum',
  pancakeswap: 'bsc'
} as const;

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const RATE_LIMIT = {
  maxRequests: 5,
  timeWindow: 1000,
  requests: new Map<string, number[]>()
};

export class DexService {
  private web3: Web3 | null = null;
  private provider: ethers.Provider | null = null;

  constructor() {
    console.log('DexService initialized');
  }

  private checkRateLimit(dex: string): boolean {
    const now = Date.now();
    const requests = RATE_LIMIT.requests.get(dex) || [];
    const validRequests = requests.filter(time => now - time < RATE_LIMIT.timeWindow);
    RATE_LIMIT.requests.set(dex, validRequests);
    if (validRequests.length < RATE_LIMIT.maxRequests) {
      RATE_LIMIT.requests.set(dex, [...validRequests, now]);
      return true;
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async initializeProvider(dex: keyof typeof ROUTER_ADDRESSES): Promise<void> {
    const network = DEX_NETWORK[dex];
    if (this.web3 && this.provider) return;

    let rpcUrl = network === 'ethereum' ?
      `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}` :
      'https://bsc-dataseed.binance.org/';

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
    console.log(`${network.toUpperCase()} provider initialized`);
  }

  private async getTokenDecimals(tokenAddress: string): Promise<number> {
    if (!this.web3) throw new Error('Web3 not initialized');
    const contract = new this.web3.eth.Contract(ERC20_ABI as any, tokenAddress);
    return Number(await contract.methods.decimals().call());
  }

  async getTokenPrice(tokenAddress: string, dex: keyof typeof ROUTER_ADDRESSES): Promise<string> {
    await this.initializeProvider(dex);
    let attempts = 0, maxAttempts = 5;

    while (attempts < maxAttempts) {
      if (!this.checkRateLimit(dex)) {
        console.log(`Rate limited for ${dex}`);
        await this.delay(RATE_LIMIT.timeWindow);
        attempts++;
        continue;
      }

      try {
        const router = new this.web3.eth.Contract(DEX_ROUTER_ABI as any, ROUTER_ADDRESSES[dex]);
        const path = tokenAddress === USDC ? [tokenAddress, WETH] : [tokenAddress, WETH, USDC];
        const amountIn = ethers.parseUnits('1', await this.getTokenDecimals(tokenAddress));
        const amounts = await router.methods.getAmountsOut(amountIn.toString(), path).call();
        const usdcDecimals = await this.getTokenDecimals(USDC);
        return ethers.formatUnits(amounts[path.length - 1], usdcDecimals);
      } catch (err: any) {
        console.error(err.message);
        await this.delay(RATE_LIMIT.timeWindow);
        attempts++;
      }
    }
    return "0";
  }
}

export const dexService = new DexService();
