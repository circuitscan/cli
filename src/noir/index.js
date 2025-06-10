import {readdirSync, statSync, readFileSync} from 'node:fs';
import {join, extname, resolve} from 'node:path';

import {isHex} from 'viem';

import {
  fetchWithRetry,
  instanceSizes,
  loadConfig,
  viemChain,
  DEFAULT_CONFIG,
} from '../utils.js';
import {deployAndVerifyContractFromSource} from '../solidity.js';

import {
  invokeRemoteMachine,
  verifyCircuit,
} from '../circuitscan.js';

const DEFAULT_NARGO = "0.33.0";
const VERSIONS = {
  "1.0.0-beta.3": "0.84.0",
  "0.34.0": "0.55.0",
  "0.33.0": "0.47.1",
  "0.32.0": "0.46.1",
  "0.31.0": "0.41.0",
};

export default function(program) {
  program
    .command('verify:noir <chainId> <verifierContractAddress> [packageDir]')
    .description('Verify verifier contracts by their noir sources. Can also specify chain by name.')
    .option('-v, --nargo-version <version>', 'Specify nargo version')
    .option('-i, --instance <memorySize>', `Specify the memory (GB) of compiler instance: ${Object.keys(instanceSizes).join(', ')} (default: 4 for smallest circuits)`)
    .option('-r, --resume <requestId>', 'In case of errors during compilation, reattach to a job and attempt a new deploy. Overrides all other options.')
    .option('-c, --config <configUrl>', `Specify a different configuration file (default: ${DEFAULT_CONFIG})`)
    .option('-a, --api-key <apiKey>', `Specify your API Key as a command line argument`)
    .action(verify);

  program
    .command('deploy:noir <chainId> [packageDir]')
    .description('Deploy verifier contracts by their noir sources. Can also specify chain by name.')
    .option('-v, --nargo-version <version>', 'Specify nargo version')
    .option('-i, --instance <memorySize>', `Specify the memory (GB) of compiler instance: ${Object.keys(instanceSizes).join(', ')} (default: 4 for smallest circuits)`)
    .option('-r, --resume <requestId>', 'In case of errors during compilation, reattach to a job and attempt a new deploy. Overrides all other options.')
    .option('-c, --config <configUrl>', `Specify a different configuration file (default: ${DEFAULT_CONFIG})`)
    .option('-a, --api-key <apiKey>', `Specify your API Key as a command line argument`)
    .option('-b, --browser-wallet', 'Send transaction in browser instead of by passing private key env var (overrides chainId argument)')
    .action(deploy);
}

async function verify(chainId, contractAddr, packageDir, options) {
  options = await loadConfig(options);
  const chain = viemChain(chainId);
  if(!chain) throw new Error('INVALID_CHAIN');
  const compiled = await compileFile(packageDir, options);
  await verifyCircuit(
    'verifyNoir',
    compiled.pkgName,
    chain.id,
    contractAddr,
    options,
  );
}

async function deploy(chainId, packageDir, options) {
  options = await loadConfig(options);
  const chain = viemChain(chainId);
  if(!options.browserWallet && !chain) throw new Error('INVALID_CHAIN');
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if(!options.browserWallet && (!privateKey || !isHex(privateKey) || privateKey.length !== 66))
    throw new Error('INVALID_DEPLOYER_PRIVATE_KEY')
  const compiled = await compileFile(packageDir, options);
  const contractSource = await (await fetchWithRetry(`${options.config.blobUrl}build/${compiled.pkgName}/verifier.sol`)).text();
  const deployResult = await deployAndVerifyContractFromSource(contractSource, chain, privateKey, options);
  await verifyCircuit(
    'verifyNoir',
    compiled.pkgName,
    deployResult.chain.id,
    deployResult.contractAddress,
    options,
  );
}

async function compileFile(packageDir, options) {
  packageDir = resolve(packageDir || '.');
  const fileList = listFilesWithExtension(packageDir, '.nr').map(x => resolve(x).slice(packageDir.length + 1));
  const files = fileList.map(filename => {
    return {
      filename,
      content: readFileSync(join(packageDir, filename), 'utf8'),
    };
  });
  const nargoToml = readFileSync(join(packageDir, 'Nargo.toml'), 'utf8');
  const nargoVersion = options.nargoVersion || DEFAULT_NARGO;
  if(!VERSIONS.hasOwnProperty(nargoVersion))
    throw new Error('INVALID_NARGO_VERSION');
  const payload = {
    pipeline: 'noir',
    files,
    nargoToml,
    nargoVersion,
    bbupVersion: VERSIONS[nargoVersion],
  };
  const compiled = await invokeRemoteMachine(payload, options);
  if('errorMessage' in compiled) {
    throw new Error(compiled.errorMessage);
  }
  return compiled;
}

function listFilesWithExtension(dirPath, extension, fileList = []) {
  const files = readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = join(dirPath, file);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      listFilesWithExtension(fullPath, extension, fileList);
    } else if (extname(fullPath) === extension) {
      fileList.push(fullPath);
    }
  });

  return fileList;
}
