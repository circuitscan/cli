import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import solc from 'solc';
import { Etherscan } from '@nomicfoundation/hardhat-verify/etherscan.js';

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

export async function verifyOnEtherscan(chain, contractAddress, contractSource, solcOutput) {
  let verifyResult = null;
  let alreadyVerified = false;
  const etherscan = new Etherscan(chain.apiKey, chain.apiUrl, '');
  while(!verifyResult || verifyResult.isBytecodeMissingInNetworkError()) {
    await delay(5000);
    try {
      verifyResult = await etherscan.verify(
        contractAddress,
        JSON.stringify(standardJson(contractSource)),
        "contracts/Verified.sol:" + findContractName(contractSource),
        'v' + solcOutput.version.replace('.Emscripten.clang', ''),
        ''
      );
    } catch(error) {
      if(error.constructor.name === 'ContractAlreadyVerifiedError') {
        alreadyVerified = true;
      } else if(error.constructor.name !== 'ContractVerificationMissingBytecodeError') {
        throw error;
      }
    }
  }
  if(!alreadyVerified) {
    console.log(`# Waiting for verification on Etherscan...`);
    await delay(5000);
    const contractStatus = await etherscan.getVerificationStatus(verifyResult.message);
    console.log(`> ${contractStatus.message}`);
    if(contractStatus.isFailure()) throw new Error('CONTRACT_VERIFICATION_FAILURE');
  }
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
