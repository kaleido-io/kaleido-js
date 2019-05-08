'use strict';

const argv = require('yargs').argv;
const Web3 = require('web3');
const solc = require('solc');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { getContract } = require('./lib/utils.js');

const contractAddress = argv.contract;
const url = argv.url;
const verbose = argv.verbose;
const query = argv.query;
const deploy = argv.deploy;
const set = argv.set;
const privateFor = argv.privateFor;
const externallySign = argv.sign;

let contractName = 'simplestorage';

const NodeSigner = require('./lib/node-signing.js');
const nodeSigner = new NodeSigner(url, contractName, verbose);

const ExternalSigner = require('./lib/ext-signing.js');
const extSigner = new ExternalSigner(url, contractName, verbose);

if (query) {
  // must also pass in the contract address
  if (!contractAddress) {
    console.error('For querying smart contract states, you must pass in the contract address using the "--contract=" argument');
    process.exit(1);
  }

  console.log(`=> Calling smart contract at "${contractAddress}" for current state value`);
  let web3 = new Web3(new Web3.providers.HttpProvider(url));
  let theContract = getContract(web3, contractName, contractAddress);

  theContract.methods.query().call()
  .then((value) => {
    console.log('\tSmart contract current state: %j', value);
    console.log('\nDONE!\n');
  });
} else if (set) {
  // must also pass in the contract address
  if (!contractAddress) {
    console.error('For querying smart contract states, you must pass in the contract address using the "--contract=" argument');
    process.exit(1);
  }

  let newValue = set;

  if (externallySign) {
    extSigner.sendTransaction(contractAddress, newValue, privateFor);
  } else {
    nodeSigner.sendTransaction(contractAddress, newValue, privateFor);
  }
} else if (deploy) {
  if (externallySign) {
    extSigner.deployContract(privateFor);
  } else {
    nodeSigner.deployContract(privateFor);
  }
}

