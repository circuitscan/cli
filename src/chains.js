import {
  holesky,
  sepolia,
  mainnet,
  optimism,
  polygon,
  polygonZkEvmCardona,
  fantom,
  arbitrum,
  arbitrumNova,
  gnosis,
  celo,
  base,
} from 'viem/chains';

export function findChain(chainId) {
  if(isNaN(chainId)) {
    return findChainByName(chainId);
  }
  for(let chain of chains) {
    if(Number(chainId) === chain.chain.id) return chain;
  }
}

function findChainByName(name) {
  for(let chain of chains) {
    if(name === chain.name) return chain;
  }
}

export const chains = [
  {
    name: 'holesky',
    chain: holesky,
    apiUrl: 'https://api-holesky.etherscan.io/api',
    apiKey: process.env.ETHERSCAN_API_KEY,
    apiKeyEnvVar: 'ETHERSCAN_API_KEY'
  },
  {
    name: 'sepolia',
    chain: sepolia,
    apiUrl: 'https://api-sepolia.etherscan.io/api',
    apiKey: process.env.ETHERSCAN_API_KEY,
    apiKeyEnvVar: 'ETHERSCAN_API_KEY'
  },
  {
    name: 'mainnet',
    chain: mainnet,
    apiUrl: 'https://api.etherscan.io/api',
    apiKey: process.env.ETHERSCAN_API_KEY,
    apiKeyEnvVar: 'ETHERSCAN_API_KEY'
  },
  {
    name: 'optimism',
    chain: optimism,
    apiUrl: 'https://api-optimistic.etherscan.io/api',
    apiKey: process.env.OPTIMISM_ETHERSCAN_API_KEY,
    apiKeyEnvVar: 'OPTIMISM_ETHERSCAN_API_KEY'
  },
  {
    name: 'polygon',
    chain: polygon,
    apiUrl: 'https://api.polygonscan.com/api',
    apiKey: process.env.POLYGON_ETHERSCAN_API_KEY,
    apiKeyEnvVar: 'POLYGON_ETHERSCAN_API_KEY'
  },
  {
    name: 'polygonZkEvmCardona',
    chain: polygonZkEvmCardona,
    apiUrl: 'https://api-cardona-zkevm.polygonscan.com/api',
    apiKey: process.env.POLYGON_ZKEVM_ETHERSCAN_API_KEY,
    apiKeyEnvVar: 'POLYGON_ZKEVM_ETHERSCAN_API_KEY'
  },
  {
    name: 'fantom',
    chain: fantom,
    apiUrl: 'https://api.ftmscan.com/api',
    apiKey: process.env.FANTOM_ETHERSCAN_API_KEY,
    apiKeyEnvVar: 'FANTOM_ETHERSCAN_API_KEY'
  },
  {
    name: 'arbitrum',
    chain: arbitrum,
    apiUrl: 'https://api.arbiscan.io/api',
    apiKey: process.env.ARBITRUM_ETHERSCAN_API_KEY,
    apiKeyEnvVar: 'ARBITRUM_ETHERSCAN_API_KEY'
  },
  {
    name: 'arbitrumNova',
    chain: arbitrumNova,
    apiUrl: 'https://api.arbiscan.io/api',
    apiKey: process.env.ARBITRUM_NOVA_ETHERSCAN_API_KEY,
    apiKeyEnvVar: 'ARBITRUM_NOVA_ETHERSCAN_API_KEY'
  },
  {
    name: 'gnosis',
    chain: gnosis,
    apiUrl: 'https://api.gnosisscan.io/api',
    apiKey: process.env.GNOSIS_ETHERSCAN_API_KEY,
    apiKeyEnvVar: 'GNOSIS_ETHERSCAN_API_KEY'
  },
  {
    name: 'celo',
    chain: celo,
    apiUrl: 'https://api.celoscan.io/api',
    apiKey: process.env.CELO_ETHERSCAN_API_KEY,
    apiKeyEnvVar: 'CELO_ETHERSCAN_API_KEY'
  },
  {
    name: 'base',
    chain: base,
    apiUrl: 'https://api.basescan.org/api',
    apiKey: process.env.BASE_ETHERSCAN_API_KEY,
    apiKeyEnvVar: 'BASE_ETHERSCAN_API_KEY'
  },
];

