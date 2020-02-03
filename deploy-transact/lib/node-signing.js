'use strict';

const Web3 = require('web3');
const { getContract, estimateGas } = require('./utils.js');
const argv = require('yargs').argv;
const verbose = argv.verbose;

class NodeSigningHandler {
  constructor(url, contractName) {
    this.web3 = new Web3(new Web3.providers.HttpProvider(url));
    this.url = url;
    this.contractName = contractName;
  }

  async getAccount() {
    console.log(`=> Connecting to target node: ${this.url}`);
    let accounts = await this.web3.eth.getAccounts();
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
      gas: await estimateGas(theContract, 500000)
    };

    if (privateFor) {
      params.privateFor = JSON.parse(privateFor);
    }

    console.log('=> Deploying smart contract');
    theContract.send(params)
    .on('receipt', (receipt) => {
      if (verbose)
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
      gas: await estimateGas(theContract.methods.set(newValue), 500000)
    };

    if (privateFor) {
      params.privateFor = JSON.parse(privateFor);
    }

    console.log('=> Setting state to new value');
    let receipt = await theContract.methods.set(newValue).send(params);
    if (verbose)
      console.log(receipt);

    console.log(`\tNew value set to: ${newValue}`);
    console.log('\nDONE!\n');
  }

  async getTransactionOutput(contractAddress, newValue) {
    let theContract = getContract(this.web3, this.contractName, contractAddress);
    let account = await this.getAccount();

    let params = {
      from: account,
      gas: await estimateGas(theContract.methods.set(newValue), 500000)
    };

    console.log('=> Setting state to new value');
    try {
      let output = await theContract.methods.set(newValue).call(params);
      console.log(`\teth_call output: ${JSON.stringify(output, null, 2)}`);
    } catch(err) {
      console.err(err);
    }

    console.log('\nDONE!\n');
  }
}

module.exports = NodeSigningHandler;