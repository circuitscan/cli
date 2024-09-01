import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import solc from 'solc';
import { Etherscan } from '@nomicfoundation/hardhat-verify/etherscan.js';
import { Sourcify } from '@nomicfoundation/hardhat-verify/sourcify.js';

import {delay} from './utils.js';
import {findChain} from './chains.js';

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

export async function verifyOnSourcify(chain, contractAddress, contractSource, solcOutput) {
  const sourcify = new Sourcify(chain.id, 'https://sourcify.dev/server');
  return await sourcify.verify(contractAddress, {
    'verifier.sol': contractSource,
    'metadata.json': solcOutput.metadata,
  });
}

export async function verifyOnEtherscan(chain, contractAddress, contractSource, solcOutput) {
  let verifyResult = null;
  let alreadyVerified = false;
  const etherscanChain = findChain(chain.id);
  if(!etherscanChain) {
    console.log('# Chain not supported by Etherscan');
    return false;
  }
  if(!etherscanChain.apiKey) {
    console.log(`# ${etherscanChain.apiKeyEnvVar} missing, skipping Etherscan verification`);
    return false;
  }
  const etherscan = new Etherscan(etherscanChain.apiKey, etherscanChain.apiUrl, '');
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
  return true;
}

export function compileContract(source) {
  const input = standardJson(source);
  const contractName = findContractName(source);
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if(output.errors) {
    // Compiler errors
    console.error('Solidity Verifier Compilation Error!');
    for(let i = 0; i<output.errors.length; i++) {
      console.error(output.errors[i].formattedMessage);
    }
    process.exit(1);
  }
  const contract = output.contracts['contracts/Verified.sol'][contractName];

  return {
    abi: contract.abi,
    metadata: contract.metadata,
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
