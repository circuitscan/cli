import {readFileSync} from 'node:fs';
import {relative, dirname} from 'node:path';

import {isHex} from 'viem';

import {
  formatBytes,
  instanceSizes,
  loadConfig,
  viemChain,
  MAX_POST_SIZE,
  DEFAULT_CONFIG,
} from '../utils.js';
import {deployAndVerifyContractFromSource} from '../solidity.js';
import {
  invokeRemoteMachine,
  verifyCircuit,
} from '../circuitscan.js';
import loadSources from './loadSources.js';

export default function(program) {
  program
    .command('verify:circom <mainCircomFile> <chainId> <verifierContractAddress>')
    .description('Verify verifier contracts by their circom sources. Can also specify chain by name.')
    .option('-p, --protocol <protocol>', 'Specify the protocol: groth16 (default), fflonk, plonk (overrides circomkit.json if available)')
    .option('-k, --proving-key <provingKey>', `Specify the proving key filename or url (optional, for Groth16 trusted setups). Must be https hosted if >${formatBytes(MAX_POST_SIZE)}`)
    .option('-t, --ptau <ptauSize>', 'Force a specific Powers of Tau size (8-28 or url to download specific file)')
    .option('-v, --circom-version <circomVersion>', 'Specify the Circom version (e.g. "v2.1.8")')
    .option('-s, --snarkjs-version <snarkjsVersion>', 'Specify the SnarkJS version (e.g. "0.7.3")')
    .option('-i, --instance <memorySize>', `Specify the memory (GB) of compiler instance: ${Object.keys(instanceSizes).join(', ')} (default: 10GB lambda, faster init for small circuits)`)
    .option('-r, --resume <requestId>', 'In case of errors during compilation, reattach to a job and attempt a new deploy. Overrides all other options.')
    .option('-c, --config <configUrl>', `Specify a different configuration file (default: ${DEFAULT_CONFIG})`)
    .option('-a, --api-key <apiKey>', `Specify your API Key as a command line argument`)
    .action(verify);

  program
    .command('deploy:circom <mainCircomFile> [chainId]')
    .description('Deploy verifier contract by their circom sources. Can also specify chain by name.')
    .option('-p, --protocol <protocol>', 'Specify the protocol: groth16 (default), fflonk, plonk (overrides circomkit.json if available)')
    .option('-k, --proving-key <provingKey>', `Specify the proving key filename or url (optional, for Groth16 trusted setups). Must be https hosted if >${formatBytes(MAX_POST_SIZE)}`)
    .option('-t, --ptau <ptauSize>', 'Force a specific Powers of Tau size (8-28 or url to download specific file)')
    .option('-v, --circom-version <circomVersion>', 'Specify the Circom version (e.g. "v2.1.8")')
    .option('-s, --snarkjs-version <snarkjsVersion>', 'Specify the SnarkJS version (e.g. "0.7.3")')
    .option('-i, --instance <memorySize>', `Specify the memory (GB) of compiler instance: ${Object.keys(instanceSizes).join(', ')} (default: 10GB lambda, faster init for small circuits)`)
    .option('-r, --resume <requestId>', 'In case of errors during compilation, reattach to a job and attempt a new deploy. Overrides all other options.')
    .option('-c, --config <configUrl>', `Specify a different configuration file (default: ${DEFAULT_CONFIG})`)
    .option('-a, --api-key <apiKey>', `Specify your API Key as a command line argument`)
    .option('-b, --browser-wallet', 'Send transaction in browser instead of by passing private key env var (overrides chainId argument)')
    .action(deploy);
}

async function verify(file, chainId, contractAddr, options) {
  options = await loadConfig(options);
  const chain = viemChain(chainId);
  if(!chain) throw new Error('INVALID_CHAIN');
  try {
    const compiled = await compileFile(file, options);
    await verifyCircuit(compiled.pkgName, chain.id, contractAddr, options);
  } catch(error) {
    console.error(error);
    process.exit(1);
  }
  process.exit(0);
}

async function deploy(file, chainId, options) {
  options = await loadConfig(options);
  let chain = viemChain(chainId);
  if(!options.browserWallet && !chain) throw new Error('INVALID_CHAIN');
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if(!options.browserWallet && (!privateKey || !isHex(privateKey) || privateKey.length !== 66))
    throw new Error('INVALID_DEPLOYER_PRIVATE_KEY')
  try {
    const compiled = await compileFile(file, options);
    const contractSource = await (await fetch(`${options.config.blobUrl}build/${compiled.pkgName}/verifier.sol`)).text();
    const deployResult = await deployAndVerifyContractFromSource(contractSource, chain, privateKey, options);
    await verifyCircuit(
      compiled.pkgName,
      deployResult.chain.id,
      deployResult.contractAddress,
      options,
    );
  } catch(error) {
    console.error(error);
    process.exit(1);
  }
  process.exit(0);
}

async function compileFile(file, options) {
  const loaded = loadSources(file);
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

  const circomPath = options.circomVersion ? 'circom-' + options.circomVersion : options.config.defaultCircomPath;
  const circomVersion = circomPath.slice(8);

  const payload = {
    pipeline: 'circom',
    files,
    finalZkey: prepareProvingKey(options.provingKey),
    snarkjsVersion: options.snarkjsVersion,
    circomPath,
    optimization: (loaded.circomkit && loaded.circomkit.optimization),
    protocol: options.protocol || (loaded.circomkit && loaded.circomkit.protocol) || 'groth16',
    ptauSize: options.ptau || undefined,
    prime: (loaded.circomkit && loaded.circomkit.prime) || 'bn128',
    circuit: {
      file: shortFile.slice(0, -7), // remove .circom
      version: circomVersion,
      template: loaded.files[shortFile].mainComponent.templateName,
      params: loaded.files[shortFile].mainComponent.args,
      pubs: loaded.files[shortFile].mainComponent.publicSignals,
    },
  };
  console.log(`Found ${Object.keys(files).length} file(s):
    ${Object.keys(files).join('\n    ')}
`);
  return invokeRemoteMachine(payload, options);
}

function prepareProvingKey(input) {
  // Not specified
  if(!input) return undefined;
  // Externally hosted
  if(typeof input === 'string' && input.startsWith('https')) return input;
  const output = readFileSync(input).toString('base64');
  if(output.length > MAX_POST_SIZE)
    throw new Error(`Proving key too large for inline upload. (Max ${formatBytes(MAX_POST_SIZE)}) Host on https server instead.`);

  // Send inline
  return output;
}

function fixImportPaths(code, path, imports) {
  for(let thisImport of Object.keys(imports)) {
    const rel = relative(path, imports[thisImport]);
    code = code.replaceAll(`include "${thisImport}"`, `include "${rel}"`);
  }
  return code;
}
