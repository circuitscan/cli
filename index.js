import {relative, dirname} from 'node:path';

import loadCircom from './src/loadCircom.js';
import {findChainByName} from './src/chains.js';
import {generateRandomString, fetchJson, delay, instanceSizes} from './src/utils.js';
import {StatusLogger} from './src/StatusLogger.js';

const defaultCircomPath = 'circom-v2.1.8';
// TODO create a cloudformation template for the pkg_association service
const serverURL = 'http://localhost:9000/2015-03-31/functions/function/invocations';
// Default running on AWS Lambda max 10GB ram
const circomCompilerURL = 'https://uvopzbfbfz5i5m4i3tsgq7rjeu0glwdl.lambda-url.us-west-2.on.aws/';
const statusURL = 'https://circuitscan-blobs.s3.us-west-002.backblazeb2.com/status/';
const stackStarterURL = 'https://fydvjclemuhxdzsv2treynl32q0rwtpp.lambda-url.us-west-2.on.aws/';

export async function verify(file, chainId, contractAddr, options) {
  if(isNaN(chainId)) {
    const chain = findChainByName(chainId);
    if(!chain) throw new Error('invalid_chain');
    chainId = chain.chain.id;
  }
  let curCompilerURL = circomCompilerURL;
  let stackId;
  if(options.localhost) {
    if(isNaN(options.localhost)) throw new Error('Invalid localhost port specified');
    curCompilerURL = `http://localhost:${options.localhost}/2015-03-31/functions/function/invocations`;
  } else if(options.instance) {
    stackId = await startInstance(options);
    curCompilerURL = `https://${stackId}.circuitscan.org/2015-03-31/functions/function/invocations`;
  }
  const compiled = await compileFile(file, options, { curCompilerURL });
  const verified = await verifyCircuit(compiled.pkgName, chainId, contractAddr, options);
  if(verified && verified.status === 'verified') {
    console.log(`# Completed successfully!`);
  } else {
    console.log(`# Verification failed.`);
  }
  if(stackId) {
    await stopInstance(stackId);
  }
}

async function startInstance(options) {
  if(!(options.instance in instanceSizes))
    throw new Error('Invalid instance size');
  const instanceType = instanceSizes[options.instance];
  // instance starting...
  console.log(`# Starting ${instanceType} instance...`);
  const startResult = await fetchJson(stackStarterURL, {
    action: 'start',
    params: { instanceType },
  });
  if(!('stackId' in startResult)) {
    console.error(startResult);
    throw new Error('Invalid response starting instance.');
  }
  console.log('# Waiting for instance to boot...');
  const stackId = startResult.stackId.match(
    /arn:aws:cloudformation:[^:]+:[^:]+:stack\/([^\/]+)/)[1];
  const publicHost = `https://${stackId}.circuitscan.org`;
  let statusResult;
  while(statusResult = await fetchJson(stackStarterURL, {
    action: 'status',
    params: { stackId },
  })) {
    if(statusResult.status === 'CREATE_COMPLETE') break;
    else if(statusResult.status !== 'CREATE_IN_PROGRESS')
      throw new Error('Instance failed to start.');
    process.stdout.write('.');
    await delay(5000);
  }
  console.log('# Waiting for service to be ready...');
  let serviceResult;
  while(true) {
    await delay(5000);
    process.stdout.write('.');
    try {
      serviceResult = await fetchJson(publicHost, {
        payload: {
          action: 'invalid',
        }
      });
      break;
    } catch(error) {
      if(error.cause && (error.cause.code !== 'ENOTFOUND')) throw error;
      if(!error.cause) break;
    }
  }

  return stackId;
}

async function stopInstance(stackId) {
  console.log(`# Stopping instance ${stackId}...`);
  const stopResult = await fetchJson(stackStarterURL, {
    action: 'stop',
    params: { stackId },
  });
  if(stopResult.message !== 'Stack deletion initiated') {
    console.log(stopResult);
    throw new Error('ERROR_WHILE_DELETING_STACK');
  }
}

async function compileFile(file, options, {curCompilerURL}) {
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
  // status report during compilation
  const status = new StatusLogger(`${statusURL}${requestId}.json`, 3000);

  const event = {
    payload: {
      requestId,
      action: 'build',
      files,
      // TODO support passing filename for base64 if small enough or temp upload otherwise
      finalZkey: options.provingKey,
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
    throw new Error('Network response was not ok');
  }
  const data = await response.json();
  const body = 'body' in data ? JSON.parse(data.body) : data;
  if('errorType' in body) {
    console.error(body.errorMessage);
    throw new Error('Invalid compilation result');
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
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  const data = await response.json();
  const body = 'body' in data ? JSON.parse(data.body) : data;
  if('errorType' in body) {
    throw new Error(`Verification error: ${body.errorMessage}`);
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
