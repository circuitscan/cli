import {relative, dirname} from 'node:path';
import { isHex } from 'viem';

import loadCircom from './src/loadCircom.js';
import {findChain} from './src/chains.js';
import {
  generateRandomString,
  fetchJson,
  delay,
  instanceSizes,
  prepareProvingKey,
} from './src/utils.js';
import {StatusLogger} from './src/StatusLogger.js';
import {
  compileContract,
  deployContract,
  verifyOnEtherscan,
  checkEtherscanStatus,
} from './src/deployer.js';

const defaultCircomPath = 'circom-v2.1.8';
const serverURL = 'https://rekwakezbjsulha5ypzpjk3c7u0rfcgp.lambda-url.us-west-2.on.aws/';
// Default running on AWS Lambda max 10GB ram
const lambdaCompilerURL = 'https://uvopzbfbfz5i5m4i3tsgq7rjeu0glwdl.lambda-url.us-west-2.on.aws/';
const ec2CompilerURL = 'https://yps4edoigeexpc2hzhvswru3b40mfbal.lambda-url.us-west-2.on.aws/';
const blobUrl = 'https://circuitscan-blob.s3.us-west-2.amazonaws.com/';

export async function verify(file, chainId, contractAddr, options) {
  const chain = findChain(chainId);
  if(!chain) throw new Error('INVALID_CHAIN');
  const {curCompilerURL} = await determineCompilerUrl(options);
  try {
    const compiled = await compileFile(file, options, { curCompilerURL });
    await verifyCircuit(compiled.pkgName, chain.chain.id, contractAddr, options);
  } catch(error) {
    console.error(error);
  }
}

export async function deploy(file, chainId, options) {
  const chain = findChain(chainId);
  if(!chain) throw new Error('INVALID_CHAIN');
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if(!privateKey || !isHex(privateKey) || privateKey.length !== 66)
    throw new Error('INVALID_DEPLOYER_PRIVATE_KEY')
  if(!(chain.apiKeyEnvVar in process.env))
    throw new Error('MISSING_' + chain.apiKeyEnvVar);
  const {curCompilerURL} = await determineCompilerUrl(options);
  try {
    const compiled = await compileFile(file, options, { curCompilerURL });
    const contractSource = await (await fetch(`${blobUrl}build/${compiled.pkgName}/verifier.sol`)).text();
    const solcOutput = compileContract(contractSource);
    const contractAddress = await deployContract(solcOutput, chain.chain, privateKey);
    let verifyResult = false;
    while(!verifyResult || verifyResult.result.startsWith('Unable to locate ContractCode')) {
      await delay(5000);
      verifyResult = await verifyOnEtherscan(chain, contractAddress, contractSource, solcOutput.version);
    }
    if(!verifyResult.status === '1') throw new Error('UNABLE_TO_VERIFY_CONTRACT');
    let contractStatus = {};
    console.log(`# Waiting for verification on Etherscan...`);
    while(['Already Verified', 'Pass - Verified'].indexOf(contractStatus.result) === -1) {
      await delay(5000);
      contractStatus = await checkEtherscanStatus(chain, verifyResult.result);
      console.log(`> ${contractStatus.result}`);
    }
    await verifyCircuit(compiled.pkgName, chain.chain.id, contractAddress, options);
  } catch(error) {
    console.error(error);
  }
}

async function determineCompilerUrl(options) {
  let curCompilerURL = lambdaCompilerURL;
  if(options.instance) {
    curCompilerURL = ec2CompilerURL;
  }
  return {curCompilerURL};
}

async function resumeCompileFile(options) {
  const requestId = options.resume;
  if('instance' in options && !(options.instance in instanceSizes))
    throw new Error('INVALID_INSTANCE_SIZE');
  // status report during compilation
  const status = new StatusLogger(`${blobUrl}status/${requestId}.json`, 3000, Number(options.instance || 10));

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
  const status = new StatusLogger(`${blobUrl}status/${requestId}.json`, 3000, Number(options.instance || 10));

  const event = {
    payload: {
      requestId,
      instanceType,
      action: 'build',
      files,
      finalZkey: prepareProvingKey(options.provingKey),
      // TODO support custom snarkjs version
      snarkjsVersion: undefined,
      circomPath: options.circomVersion ? 'circom-' + options.circomVersion : defaultCircomPath,
      protocol: options.protocol || (loaded.circomkit && loaded.circomkit.protocol) || 'groth16',
      circuit: {
        file: shortFile.slice(0, -7), // remove .circom
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
    while(!status.lastData || !status.lastData.find(x => x.msg === 'Complete.')) {
      await delay(5000);
    }
    const response = await fetch(`${blobUrl}instance-response/${requestId}.json`);
    const data = await response.json();
    body = JSON.parse(data.body);
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

  const response = await fetch(serverURL, {
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
