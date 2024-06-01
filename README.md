# Circuitscan CLI

Deploy and verify your circuits to Circuitscan with a simple command.

> [!NOTE]
> Very much still under construction!
>
> Supports circom 2.0.8-2.1.8, snarkjs 0.6.11-0.7.4


## Installation

```sh
npm install -g circuitscan
```

## Usage

### verify

```
Usage: circuitscan verify [options] <mainCircomFile> <chainId> <verifierContractAddress>

Verify verifier contracts by their circom sources. Can also specify chain by name.

Options:
  -p, --protocol <protocol>             Specify the protocol: groth16 (default), fflonk, plonk (overrides circomkit.json if available)
  -k, --proving-key <provingKey>        Specify the proving key url (optional, for Groth16 trusted setups)
  -v, --circom-version <circomVersion>  Specify the Circom version (e.g. "v2.1.8")
  -i, --instance <memorySize>           Specify the memory (GB) of compiler instance: 4 for testing (default: 10GB lambda, faster init for small circuits)
  -l, --localhost <localPort>           Use a circom compiler container running on a specific port
  -h, --help                            display help for command

```

Scans for dependent included sources for bundle. Includes paths in [`circomkit.json`](https://github.com/erhant/circomkit) if available.

Example using an already existing groth16 setup:

> [!NOTE]
> [TODO: must be hosted on public https server](https://github.com/circuitscan/cli/blob/main/index.js#L131)

```
$ circuitscan verify -k https://circuitscan-blobs.clonk.me/test-semaphore.zkey ~/semaphore/packages/circuits/src/main/semaphore.circom sepolia 0x73885e40715F6D77C4Ab2863756e4ee523f3be15
Found 15 file(s):
    packages/circuits/src/main/semaphore.circom
    packages/circuits/src/semaphore.circom
    node_modules/circomlib/circuits/babyjub.circom
    node_modules/circomlib/circuits/bitify.circom
    node_modules/circomlib/circuits/comparators.circom
    node_modules/circomlib/circuits/binsum.circom
    node_modules/circomlib/circuits/aliascheck.circom
    node_modules/circomlib/circuits/compconstant.circom
    node_modules/circomlib/circuits/escalarmulfix.circom
    node_modules/circomlib/circuits/mux3.circom
    node_modules/circomlib/circuits/montgomery.circom
    node_modules/circomlib/circuits/poseidon.circom
    node_modules/circomlib/circuits/poseidon_constants.circom
    node_modules/@zk-kit/circuits/circom/binary-merkle-root.circom
    node_modules/circomlib/circuits/mux1.circom

> Compiling semaphore-hidden-purple-chicken...
> Downloading PTAU... @ 1.5922s
> Downloading finalZkey... @ 4.6542s
> Verifying finalZkey... @ 4.9471s
> Exporting verification key and solidity verifier... @ 13.7048s
> Storing build artifacts... @ 13.7297s
# Verifying circuit...
# Completed successfully!
```

### deploy

NYI!

## License

MIT
