// src/index.ts
import { dexService } from './DexService';

const token = '0x...'; // Replace with actual token

(async () => {
  const price = await dexService.getTokenPrice(token, 'uniswap');
  console.log(`Price of token on Uniswap: $${price}`);
})();
