#!/usr/bin/env node
import {Command} from 'commander';

import {getPackageJson} from './src/utils.js';

import {loginCommand, stopInstanceCommand} from './src/circuitscan.js';
import circomCommands from './src/circom/index.js';
import circomMultiCommands from './src/circomMulti/index.js';
import noirCommands from './src/noir/index.js';

const program = new Command();

program
  .name('circuitscan')
  .description('CLI tool to verify verifier contracts by their circom sources')
  .version(getPackageJson().version);

loginCommand(program);
stopInstanceCommand(program);
// Each pipeline adds its commands
circomCommands(program);
circomMultiCommands(program);
noirCommands(program);

program.parse(process.argv);
