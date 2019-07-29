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
const query = argv.query;
const deploy = argv.deploy;
const set = argv.set;
const privateFor = argv.privateFor;
const privateFrom = argv.privateFrom;
const externallySign = argv.sign;
const azure = argv.azure;
const pantheon_private = argv.pantheon_private;

let contractName = 'simplestorage';

if (query) {
  if(pantheon_private){
    getSigner().queryTransaction(contractAddress, privateFor, privateFrom);

  }else{
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
  }

} else if (set) {
    // must also pass in the contract address
    if (!contractAddress) {
      console.error('For querying smart contract states, you must pass in the contract address using the "--contract=" argument');
      process.exit(1);
    }

    let newValue = set;
    getSigner().sendTransaction(contractAddress, newValue, privateFor, privateFrom);

} else if (deploy) {
    getSigner().deployContract(privateFor,privateFrom);
}

function getSigner() {
  let Clazz;
  if (externallySign) {
    Clazz = require('./lib/ext-signing.js');
  } else if (azure) {
    Clazz = require('./lib/azure-signing.js');
  } else if(pantheon_private){
    Clazz = require('./lib/pantheon-node-signing.js');
  }else {
    Clazz = require('./lib/node-signing.js');
  }

  return new Clazz(url, contractName);
}
