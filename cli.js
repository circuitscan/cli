#!/usr/bin/env node
import {Command} from 'commander';

import {verify, deploy} from './index.js';
import {
  instanceSizes,
  getPackageJson,
  formatBytes,
  MAX_POST_SIZE,
  DEFAULT_CONFIG,
} from './src/utils.js';

const program = new Command();

program
    .name('circuitscan')
    .description('CLI tool to verify verifier contracts by their circom sources')
    .version(getPackageJson().version);

program
    .command('verify <mainCircomFile> <chainId> <verifierContractAddress>')
    .description('Verify verifier contracts by their circom sources. Can also specify chain by name.')
    .option('-p, --protocol <protocol>', 'Specify the protocol: groth16 (default), fflonk, plonk (overrides circomkit.json if available)')
    .option('-k, --proving-key <provingKey>', `Specify the proving key filename or url (optional, for Groth16 trusted setups). Must be https hosted if >${formatBytes(MAX_POST_SIZE)}`)
    .option('-v, --circom-version <circomVersion>', 'Specify the Circom version (e.g. "v2.1.8")')
    .option('-i, --instance <memorySize>', `Specify the memory (GB) of compiler instance: ${Object.keys(instanceSizes).join(', ')} (default: 10GB lambda, faster init for small circuits)`)
    .option('-r, --resume <requestId>', 'In case of errors during compilation, reattach to a job and attempt a new deploy. Overrides all other options.')
    .option('-c, --config <configUrl>', `Specify a different configuration file (default: ${DEFAULT_CONFIG})`)
    .action(verify);

// TODO .option('-b, --browser-wallet', 'Send transaction in browser instead of by passing private key env var')
program
    .command('deploy <mainCircomFile> <chainId>')
    .description('Deploy verifier contract by their circom sources. Can also specify chain by name.')
    .option('-p, --protocol <protocol>', 'Specify the protocol: groth16 (default), fflonk, plonk (overrides circomkit.json if available)')
    .option('-k, --proving-key <provingKey>', `Specify the proving key filename or url (optional, for Groth16 trusted setups). Must be https hosted if >${formatBytes(MAX_POST_SIZE)}`)
    .option('-v, --circom-version <circomVersion>', 'Specify the Circom version (e.g. "v2.1.8")')
    .option('-i, --instance <memorySize>', `Specify the memory (GB) of compiler instance: ${Object.keys(instanceSizes).join(', ')} (default: 10GB lambda, faster init for small circuits)`)
    .option('-r, --resume <requestId>', 'In case of errors during compilation, reattach to a job and attempt a new deploy. Overrides all other options.')
    .option('-c, --config <configUrl>', `Specify a different configuration file (default: ${DEFAULT_CONFIG})`)
    .action(deploy);

program.parse(process.argv);
