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

> [!TIP]
> Close a running compiler job, then use `--resume` later complete verification or deployment. Alternatively, use `--resume` to duplicate a verifier, avoiding waiting for the circuit to compile again.

> [!TIP]
> Configuring the circuit field size prime value must be done using a `circomkit.json` file.

API Key precedence:

1. Command line argument `-a` or `--api-key`
2. `CIRCUITSCAN_API_KEY` environment variable
3. `~/.circuitscan` JSON user configuration `{ "apiKey": "xxx" }`

Chaind ID can be specified as the number or the name from [viem/chains](https://github.com/wevm/viem/blob/main/src/chains/index.ts)

### verify:circom

```
Usage: circuitscan verify:circom [options] <mainCircomFile> <chainId> <verifierContractAddress>

Verify verifier contracts by their circom sources. Can also specify chain by name.

Options:
  -p, --protocol <protocol>             Specify the protocol: groth16 (default), fflonk, plonk (overrides circomkit.json if available)
  -k, --proving-key <provingKey>        Specify the proving key filename or url (optional, for Groth16 trusted setups). Must be https hosted if >6 MB
  -t, --ptau <ptauSize>                   Force a specific Powers of Tau size (8-28 or url to download specific file)
  -v, --circom-version <circomVersion>  Specify the Circom version (e.g. "v2.1.8")
  -s, --snarkjs-version <snarkjsVersion>  Specify the SnarkJS version (e.g. "0.7.3")
  -i, --instance <memorySize>           Specify the memory (GB) of compiler instance: 4, 8, 16, 32, 64, 128, 256, 384, 512 (default: 4 for smallest circuits)
  -r, --resume <requestId>              In case of errors during compilation, reattach to a job and attempt a new verification. Overrides all other options.
  -c, --config <configUrl>              Specify a different configuration file (default: https://circuitscan.org/cli.json)
  -a, --api-key <apiKey>                  Specify your API Key as a command line argument
  -h, --help                            display help for command

```

Scans for dependent included sources for bundle. Includes paths in [`circomkit.json`](https://github.com/erhant/circomkit) if available.

Example using an already existing groth16 setup:

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

### deploy:circom

```
Usage: circuitscan deploy:circom [options] <mainCircomFile> <chainId>

Deploy verifier contract by their circom sources. Can also specify chain by name.

Options:
  -p, --protocol <protocol>             Specify the protocol: groth16 (default), fflonk, plonk (overrides circomkit.json if available)
  -k, --proving-key <provingKey>        Specify the proving key filename or url (optional, for Groth16 trusted setups). Must be https hosted if >6 MB
  -t, --ptau <ptauSize>                   Force a specific Powers of Tau size (8-28 or url to download specific file)
  -v, --circom-version <circomVersion>  Specify the Circom version (e.g. "v2.1.8")
  -s, --snarkjs-version <snarkjsVersion>  Specify the SnarkJS version (e.g. "0.7.3")
  -i, --instance <memorySize>           Specify the memory (GB) of compiler instance: 4, 8, 16, 32, 64, 128, 256, 384, 512 (default: 4 for smallest circuits)
  -r, --resume <requestId>              In case of errors during compilation, reattach to a job and attempt a new deploy. Overrides all other options.
  -c, --config <configUrl>              Specify a different configuration file (default: https://circuitscan.org/cli.json)
  -a, --api-key <apiKey>                  Specify your API Key as a command line argument
  -b, --browser-wallet                    Send transaction in browser instead of by passing private key env var (overrides passed chainId)
  -h, --help                            display help for command

```

> [!TIP]
> If there's a timeout error while waiting for a contract deployment transaction, wait for the transaction to be included on chain then use the `verify:circom` command passing the new contract address.
>
> The contract will have to be verified manually on Etherscan or Sourcify. Find the contract source at `https://circuitscan-artifacts.s3.us-west-2.amazonaws.com/build/<build-name-adjective-animal>/verifier.sol`

> [!IMPORTANT]
> `DEPLOYER_PRIVATE_KEY` environment variable is required unless using `-b` or `--browser-wallet`

Contracts are always verified on Sourcify. If you would also like to verify on Etherscan, a corresponding Etherscan API key is required:

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

## Additional Configuration

Env Var | Description
--------|---------------
`CIRCUITSCAN_CONFIG` | Instead of `--config`, the configuration URL can also be set by environment variable

## License

MIT
