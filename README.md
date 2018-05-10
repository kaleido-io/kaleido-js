# kaleido-samples
Various samples to demonstrate interacting with the Kaleido platform

## deploy-transact
A simple node.js command line program that demonstrates standard interactions with a Kaleido node ingress:
* deploy a smart contract
* submit a transaction to the smart contract
* query the smart contract for current value
* submit an externally signed transaction using the web3 wallet module
* deploy private smart contracts (if the target node is Quorum)
* submit private transactions (if the target node is Quorum)

## log-analyzers
A set of tools that parse Geth or Quorum logs to generate line charts for transaction rates and transaction pool status