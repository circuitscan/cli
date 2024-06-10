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

```
Usage: circuitscan deploy [options] <mainCircomFile> <chainId>

Deploy verifier contract by their circom sources. Can also specify chain by name.

Options:
  -p, --protocol <protocol>             Specify the protocol: groth16 (default), fflonk, plonk (overrides circomkit.json if available)
  -k, --proving-key <provingKey>        Specify the proving key url (optional, for Groth16 trusted setups)
  -v, --circom-version <circomVersion>  Specify the Circom version (e.g. "v2.1.8")
  -i, --instance <memorySize>           Specify the memory (GB) of compiler instance: 4 for testing (default: 10GB lambda, faster init for small circuits)
  -l, --localhost <localPort>           Use a circom compiler container running on a specific port
  -h, --help                            display help for command

```

> [!IMPORTANT]
> `DEPLOYER_PRIVATE_KEY` environment variable and a corresponding Etherscan API key is required

| name         | apiKeyEnvVar              |
|--------------|---------------------------|
| holesky      | ETHERSCAN_API_KEY         |
| sepolia      | ETHERSCAN_API_KEY         |
| mainnet      | ETHERSCAN_API_KEY         |
| optimism     | OPTIMISM_ETHERSCAN_API_KEY|
| polygon      | POLYGON_ETHERSCAN_API_KEY |
| fantom       | FANTOM_ETHERSCAN_API_KEY  |
| arbitrum     | ARBITRUM_ETHERSCAN_API_KEY|
| arbitrumNova | ARBITRUM_NOVA_ETHERSCAN_API_KEY|
| gnosis       | GNOSIS_ETHERSCAN_API_KEY  |
| celo         | CELO_ETHERSCAN_API_KEY    |
| base         | BASE_ETHERSCAN_API_KEY    |

Example usage using `.env` for configuration:

```
$ dotenv run circuitscan deploy circuits/multiplier.circom polygon
Found 1 file(s):
    multiplier.circom

> Compiling multiplier-worried-aqua-roundworm...
> Downloading PTAU... @ 0.0207s
> Groth16 setup with random entropy... @ 0.0211s
> Exporting verification key and solidity verifier... @ 0.0676s
> Storing build artifacts... @ 0.0860s
# Sent transaction 0x5b208fa766f744840fcf3827b7f2573f2ab1ec03c200c294dd6c73c98c6108f2
# Deployed to 0x269e831b930f4c1ec7eee28aa53e5756b0f96d0c
# Waiting for verification on Etherscan...
> Pass - Verified
# Verifying circuit...
# Completed successfully!

https://circuitscan.org/chain/137/address/0x269e831b930f4c1ec7eee28aa53e5756b0f96d0c
```

## License

MIT
