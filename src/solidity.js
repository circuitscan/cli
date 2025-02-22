import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import solc from 'solc';
import { Etherscan } from '@nomicfoundation/hardhat-verify/etherscan.js';
import { Sourcify } from '@nomicfoundation/hardhat-verify/sourcify.js';

import {delay, fetchWithRetry} from './utils.js';
import {findChain} from './etherscanChains.js';

export async function deployAndVerifyContractFromSource(contractSource, chain, privateKey, options) {
  const solcOutput = compileContract(contractSource);
  let contractAddress;
  if(options.browserWallet) {
    const response = await browserDeploy(solcOutput, options);
    contractAddress = response.address;
    chain = { id: response.chainId };
  } else {
    contractAddress = await deployContract(solcOutput, chain, privateKey);
  }
  let didVerifySolidity = false;
  try {
    // Will throw or return false if verification fails
    const success = await verifyOnEtherscan(chain, contractAddress, contractSource, solcOutput);
    didVerifySolidity |= success;
  } catch(error) {
    throw error;
  }
  try {
    const response = await verifyOnSourcify(chain, contractAddress, contractSource, solcOutput);
    didVerifySolidity |= response.isOk();
  } catch(error) {
    // Don't die if etherscan verifies but sourcify doesn't
    if(!didVerifySolidity) throw error;
    else console.log('# Sourcify verification failed but Etherscan verification succeeded, continuing...');
  }
  return {contractAddress, chain};
}

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

export async function browserDeploy(solcOutput, options) {
  const event = {
    payload: {
      action: 'storeSolcOutput',
      solcOutput,
    },
  };
  console.log(`# Uploading contract bytecode...`);

  const response = await fetchWithRetry(options.config.serverURL, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });
  if (!response.ok && response.status !== 400) {
    throw new Error('Network response was not ok');
  }
  const data = await response.json();
  const body = 'body' in data ? JSON.parse(data.body) : data;
  if('errorType' in body) {
    throw new Error(`Bytecode upload error: ${body.errorMessage}`);
  }

  if(body && body.status === 'ok') {
    console.log(`# Open the following page to deploy the verifier contract with your browser wallet:`);
    console.log(`\n${options.config.browserWalletURL}/${body.reference}`);
    // Wait for browser to complete its tranasction and report result
    const deployment = await new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const response = await fetchWithRetry(`${options.config.blobUrl}browser-deployed/${body.reference}.json`);
          if (!response.ok) {
            if (response.status === 404 || response.status === 403) {
              throw new NotFoundError;
            } else {
              console.log(response);
              throw new Error('Error while checking deployment status');
            }
          }
          const data = await response.json();
          clearInterval(interval);
          resolve(data);
        } catch(error) {
          if(!(error instanceof NotFoundError)) {
            clearInterval(interval);
            reject(error);
          }
        }
      }, 5000);
    });
    console.log('# Contract deployment success');
    return deployment;
  } else {
    console.log(`# Failed to upload bytecode.`);
    process.exit(1);
  }
}

class NotFoundError extends Error {}

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
    const errors = output.errors.filter(x => x.severity !== 'warning');
    if(errors.length) {
      // Compiler errors
      console.error('Solidity Verifier Compilation Error!');
      for(let i = 0; i<errors.length; i++) {
        console.error(errors[i].formattedMessage);
      }
      process.exit(1);
    }
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

function findContractName(soliditySource, returnAll) {
  const regex = /contract\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:is\s+[a-zA-Z_][a-zA-Z0-9_,\s]*)?\s*\{/g;
  const matches = [];

  for (const match of soliditySource.matchAll(regex)) {
    matches.push(match[1]);
  }

  // Return the last contract by default
  // Because noir outputs 2 contracts in the verifier file
  if(!returnAll && matches.length > 0) return matches[matches.length - 1];

  return matches.length > 0 ? matches : null;
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
