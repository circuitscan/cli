#!/usr/bin/env node
import {Command} from 'commander';

import {verify} from './index.js';

const program = new Command();

program
    .name('circuitscan')
    .description('CLI tool to verify verifier contracts by their circom sources')
    .version('0.0.1');

program
    .command('verify <mainCircomFile> <chainId> <verifierContractAddress>')
    .description('Verify verifier contracts by their circom sources. Can also specify chain by name.')
    .option('-p, --protocol <protocol>', 'Specify the protocol: groth16 (default), fflonk, plonk (overrides circomkit.json if available)')
    .option('-k, --proving-key <provingKey>', 'Specify the proving key url (i.e. for Groth16 trusted setups)')
    .option('-v, --circom-version <circomVersion>', 'Specify the Circom version (e.g. "v2.1.8")')
    .action(verify);

// TODO command to deploy a circuit verifier, verify its contract and circuit

program.parse(process.argv);
