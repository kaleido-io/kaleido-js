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
const ws = argv.ws;
const query = argv.query;
const deploy = argv.deploy;
const set = argv.set;
const privateFor = argv.privateFor;
const privateFrom = argv.privateFrom;
const externallySign = argv.sign;
const azure = argv.azure;
const besu_private = argv.besu_private;
const privacy_groups = argv.privacy_groups;
const find = argv.find;
const create = argv.create;
const destroy = argv.destroy;

const addresses = argv.addresses;
// besu privacy group
const privacyGroupId = argv.privacyGroupId;
let contractName = 'simplestorage';

if (query) {
  if (besu_private) {
    getSigner().queryTransaction(contractAddress, privateFor, privateFrom, privacyGroupId);

  } else {
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
    if(besu_private) {
      getSigner().sendTransaction(contractAddress, newValue, privateFor, privateFrom, privacyGroupId);
    } else {
      getSigner().sendTransaction(contractAddress, newValue, privateFor, privateFrom);
    }
    listen();

} else if (deploy) {
    if(besu_private) {
      getSigner().deployContract(privateFor,privateFrom,privacyGroupId);
    } else {
      getSigner().deployContract(privateFor,privateFrom);
    }
} else if(besu_private && privacy_groups) {
  if(find)
    getSigner().getPrivacyGroups(addresses);
  if(create)
    getSigner().createPrivacyGroup(addresses);
  if(destroy)
    getSigner().deletePrivacyGroup(privacyGroupId);
}

function getSigner() {
  let Clazz;
  if (externallySign) {
    Clazz = require('./lib/ext-signing.js');
  } else if (azure) {
    Clazz = require('./lib/azure-signing.js');
  } else if(besu_private){
    Clazz = require('./lib/besu-node-signing.js');
  }else {
    Clazz = require('./lib/node-signing.js');
  }

  return new Clazz(url, contractName);
}

function listen() {
  if (ws) {
    let web3 = new Web3(new Web3.providers.WebsocketProvider(ws));
    let theContract = getContract(web3, contractName, contractAddress);
    theContract.once('DataStored', (err, event) => {
      if (err)
        console.error('Error subscribing to "DataStored" events', err);
      else
        console.log('Event published', event);
    });
  }
}