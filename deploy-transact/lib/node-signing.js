'use strict';

const Web3 = require('web3');
const { getContract } = require('./utils.js');

class NodeSigningHandler {
  constructor(url, contractName, verbose) {
    this.web3 = new Web3(new Web3.providers.HttpProvider(url));
    this.url = url;
    this.contractName = contractName;
    this.verbose = verbose;
  }

  async getAccount() {
    console.log(`=> Connecting to target node: ${this.url}`);
    let accounts = await this.web3.eth.personal.getAccounts();
    if (!accounts || accounts.length === 0) {
      console.error("\tCan't find accounts in the target node");
      process.exit(1);
    }

    console.log(`\tFound account in the target node: ${accounts[0]}`);
    return accounts[0];
  }

  async deployContract(privateFor) {
    let theContract = getContract(this.web3, this.contractName);
    let account = await this.getAccount();

    let params = {
      from: account,
      gasPrice: 0,
      gas: 500000
    };

    if (privateFor) {
      params.privateFor = JSON.parse(privateFor);
    }

    console.log('=> Deploying smart contract');
    theContract.send(params)
    .on('receipt', (receipt) => {
      if (this.verbose)
        console.log(receipt);
    })
    .on('error', (err) => {
      console.error('\tFailed to deploy the smart contract. Error: ' + err);
      process.exit(1);
    })
    .then((newInstance) => {
      // smart contract deployed, ready to invoke it
      console.log(`\tSmart contract deployed, ready to take calls at "${newInstance._address}"`);
    });
  }

  async sendTransaction(contractAddress, newValue, privateFor) {
    let theContract = getContract(this.web3, this.contractName, contractAddress);
    let account = await this.getAccount();

    let params = {
      from: account,
      gas: 50000
    };

    if (privateFor) {
      params.privateFor = JSON.parse(privateFor);
    }

    console.log('=> Setting state to new value');
    await theContract.methods.set(newValue).send(params);

    console.log(`\tNew value set to: ${newValue}`);
    console.log('\nDONE!\n');
  }
}

module.exports = NodeSigningHandler;