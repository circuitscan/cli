import {relative, dirname} from 'node:path';
import { isHex } from 'viem';
import * as chains from 'viem/chains';

import loadCircom from './src/loadCircom.js';
import {
  generateRandomString,
  fetchJson,
  delay,
  instanceSizes,
  prepareProvingKey,
  loadConfig,
} from './src/utils.js';
import {StatusLogger} from './src/StatusLogger.js';
import watchInstance from './src/watchInstance.js';
import {
  compileContract,
  deployContract,
  verifyOnEtherscan,
  verifyOnSourcify,
} from './src/deployer.js';

export async function verify(file, chainId, contractAddr, options) {
  options = await loadConfig(options);
  const chain = viemChain(chainId);
  if(!chain) throw new Error('INVALID_CHAIN');
  const {curCompilerURL} = await determineCompilerUrl(options);
  try {
    const compiled = await compileFile(file, options, { curCompilerURL });
    await verifyCircuit(compiled.pkgName, chain.id, contractAddr, options);
  } catch(error) {
    console.error(error);
    process.exit(1);
  }
  process.exit(0);
}

export async function deploy(file, chainId, options) {
  options = await loadConfig(options);
  const chain = viemChain(chainId);
  if(!chain) throw new Error('INVALID_CHAIN');
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if(!privateKey || !isHex(privateKey) || privateKey.length !== 66)
    throw new Error('INVALID_DEPLOYER_PRIVATE_KEY')
  const {curCompilerURL} = await determineCompilerUrl(options);
  try {
    const compiled = await compileFile(file, options, { curCompilerURL });
    const contractSource = await (await fetch(`${options.config.blobUrl}build/${compiled.pkgName}/verifier.sol`)).text();
    const solcOutput = compileContract(contractSource);
    const contractAddress = await deployContract(solcOutput, chain, privateKey);
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
    await verifyCircuit(compiled.pkgName, chain.id, contractAddress, options);
  } catch(error) {
    console.error(error);
    process.exit(1);
  }
  process.exit(0);
}

function viemChain(nameOrId) {
  if(isNaN(nameOrId)) {
    return chains[nameOrId];
  }
  for(let chain of chains) {
    if(chain.id === Number(nameOrId)) return chain;
  }
}

async function determineCompilerUrl(options) {
  let curCompilerURL = options.config.lambdaCompilerURL;
  if(options.instance) {
    curCompilerURL = options.config.ec2CompilerURL;
  }
  return {curCompilerURL};
}

async function resumeCompileFile(options) {
  const requestId = options.resume;
  if('instance' in options && !(options.instance in instanceSizes))
    throw new Error('INVALID_INSTANCE_SIZE');
  // status report during compilation
  const status = new StatusLogger(`${options.config.blobUrl}status/${requestId}.json`, 3000, Number(options.instance || 10));

  while(!status.lastData || !status.lastData.find(x => x.msg === 'Complete.')) {
    await delay(5000);
  }
  status.stop();
  return { pkgName: status.lastData[0].msg.slice(10, -3) };
}

async function compileFile(file, options, {curCompilerURL}) {
  if(options.resume) return resumeCompileFile(options);
  const loaded = loadCircom(file);
  const shortFile = Object.keys(loaded.files)[0];
  if(!loaded.files[shortFile].mainComponent) throw new Error('MISSING_MAIN_COMPONENT');

  // Remove main component since compilation server recreates it using circomkit
  loaded.files[shortFile].circomCode =
    loaded.files[shortFile].circomCode.replace(loaded.files[shortFile].mainComponent.full, '');

  // For privacy, only use the necessary amount of directory depth
  const files = Object.keys(loaded.files).reduce((out, cur) => {
    out[cur] = {
      code: fixImportPaths(loaded.files[cur].circomCode, dirname(cur), loaded.files[cur].imports),
    };
    return out;
  }, {});

  const requestId = generateRandomString(40);
  console.log(`# Request ID: ${requestId}`);
  if('instance' in options && !(options.instance in instanceSizes))
    throw new Error('INVALID_INSTANCE_SIZE');
  const instanceType = options.instance ? instanceSizes[options.instance] : undefined;
  // status report during compilation
  const status = new StatusLogger(`${options.config.blobUrl}status/${requestId}.json`, 3000, Number(options.instance || 10));
  const circomPath = options.circomVersion ? 'circom-' + options.circomVersion : options.config.defaultCircomPath;
  const circomVersion = circomPath.slice(8);

  const event = {
    payload: {
      requestId,
      instanceType,
      action: 'build',
      files,
      finalZkey: prepareProvingKey(options.provingKey),
      snarkjsVersion: options.snarkjsVersion,
      circomPath,
      protocol: options.protocol || (loaded.circomkit && loaded.circomkit.protocol) || 'groth16',
      prime: (loaded.circomkit && loaded.circomkit.prime) || 'bn128',
      circuit: {
        file: shortFile.slice(0, -7), // remove .circom
        version: circomVersion,
        template: loaded.files[shortFile].mainComponent.templateName,
        params: loaded.files[shortFile].mainComponent.args,
        pubs: loaded.files[shortFile].mainComponent.publicSignals,
      },
    },
  };
  console.log(`Found ${Object.keys(files).length} file(s):
    ${Object.keys(files).join('\n    ')}
`);

  const response = await fetch(curCompilerURL, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error('Network response was not ok: ' + body);
  }
  const data = await response.json();
  let body = 'body' in data ? JSON.parse(data.body) : data;
  if('errorType' in body) {
    throw new Error('Invalid compilation result');
  }

  if(data.status === 'ok' && instanceType) {
    console.log('# Instance started. Wait a few minutes for initialization...');
    // Other statuses will arrive from the StatusLogger
    const {stderr, stdout} = await watchInstance(options.config.blobUrl, requestId, 8000);
    console.error(stderr);
    console.log(stdout);
    const response = await fetch(`${options.config.blobUrl}instance-response/${requestId}.json`);
    try {
      const data = await response.json();
      body = JSON.parse(data.body);
    } catch(error) {
      throw new Error('Compilation was not successful.');
    }
  }
  status.stop();
  return body;
}

async function verifyCircuit(pkgName, chainId, contractAddr, options) {
  const event = {
    payload: {
      action: 'verifyCircom',
      pkgName,
      chainId,
      contract: contractAddr,
    },
  };
  console.log(`# Verifying circuit...`);

  const response = await fetch(options.config.serverURL, {
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
    throw new Error(`Verification error: ${body.errorMessage}`);
  }

  if(body && body.status === 'verified') {
    console.log(`# Completed successfully!`);
    console.log(`\nhttps://circuitscan.org/chain/${chainId}/address/${contractAddr}`);
  } else {
    console.log(`# Verification failed.`);
  }
  return body;
}

function fixImportPaths(code, path, imports) {
  for(let thisImport of Object.keys(imports)) {
    const rel = relative(path, imports[thisImport]);
    code = code.replaceAll(`include "${thisImport}"`, `include "${rel}"`);
  }
  return code;
}
