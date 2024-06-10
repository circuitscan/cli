import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import solc from 'solc';

import {delay} from './utils.js';

export async function deployContract(output, chain, privateKey) {
  const walletClient = createWalletClient({
    chain,
    transport: http()
  });
  const publicClient = createPublicClient({
    chain,
    transport: http()
  });
  const account = privateKeyToAccount(privateKey);
  const hash = await walletClient.deployContract({
    abi: output.abi,
    account,
    bytecode: '0x' + output.bytecode,
  });
  console.log(`# Sent transaction ${hash}`);
  await delay(5000);
  const tx = await publicClient.waitForTransactionReceipt({
    hash,
  });
  console.log(`# Deployed to ${tx.contractAddress}`);
  return tx.contractAddress;
}

export async function checkEtherscanStatus(chain, guid) {
  const params = new URLSearchParams({
    module: 'contract',
    action: 'checkverifystatus',
    guid,
    apikey: chain.apiKey,
  });
  const response = await fetch(`${chain.apiUrl}?${params.toString()}`, {
    method: 'POST',
  });

  if (!response.ok) {
    console.log(response);
    throw new Error(`Error fetching status: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

export async function verifyOnEtherscan(chain, address, contractSource, solcVersion) {
  const params = new URLSearchParams({
    module: 'contract',
    action: 'verifysourcecode',
    apikey: chain.apiKey,
  });
  const body = new URLSearchParams({
    chainId: chain.chain.id,
    codeformat: 'solidity-standard-json-input',
    contractaddress: address,
    sourceCode: JSON.stringify(standardJson(contractSource)),
    contractname: "contracts/Verified.sol:" + findContractName(contractSource),
    compilerversion: 'v' + solcVersion.replace('.Emscripten.clang', '')
  });

  const response = await fetch(`${chain.apiUrl}?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString(),
  });

  if (!response.ok) {
    console.log(response);
    throw new Error(`Error verifying contract: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

export function compileContract(source) {
  const input = standardJson(source);
  const contractName = findContractName(source);
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const contract = output.contracts['contracts/Verified.sol'][contractName];

  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object,
    contractName,
    input,
    version: solc.version(),
  };
}


function findContractName(soliditySource) {
  const regex = /contract\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/;
  const match = soliditySource.match(regex);
  return match ? match[1] : null;
}

function standardJson(soliditySource) {
  return {
    "language": "Solidity",
    "sources": {
      "contracts/Verified.sol": {
        "content": soliditySource,
      }
    },
    "settings": {
      "optimizer": {
        "enabled": true,
        "runs": 200
      },
      "outputSelection": {
        "*": {
          "*": [
            "abi",
            "evm.bytecode",
            "evm.deployedBytecode",
            "evm.methodIdentifiers",
            "metadata"
          ],
          "": [
            "ast"
          ]
        }
      }
    }
  };
}
