'use strict';

const join = require('path').join;
const fs = require('fs-extra');
const Tx = require('ethereumjs-tx');
const Web3 = require('web3');
const os = require('os');
const request = require('request');

const { getContract } = require('./utils.js');

const argv = require('yargs').argv;
const chainId = argv.chainId;
const hdwalletUrl = argv.hdwalletUrl;
const hdwalletId = argv.hdwalletId;
const hdwalletAccountIndex = argv.hdwalletAccountIndex;

class ExternalSigningHandler {
  constructor(url, contractName, verbose) {
    this.web3 = new Web3(new Web3.providers.HttpProvider(url));
    this.url = url;
    this.contractName = contractName;
    this.verbose = verbose;
  }

  isHDWallet() {
    return hdwalletId && hdwalletUrl && hdwalletAccountIndex >= 0;
  }

  async getAccount() {
    if (this.isHDWallet()) {
      console.log('=> Fetching hd wallet account to use')
      try {
        let result = await request(`${hdwalletUrl}/wallets/${hdwalletId}/accounts/${hdwalletAccountIndex}`);
        return JSON.parse(result);
      } catch (err) {
        console.err('\tFailed to find accounts in HD Wallet');
        throw err;
      }
    } else {
      // look inside the home folder for a previously saved local account
      let localAccountJSON = join(os.homedir(), '.web3keystore', 'local-account.json');
      await fs.ensureDir(join(os.homedir(), '.web3keystore'));

      let account;
      try {
        console.log(`=> Loading local account from keystore ${localAccountJSON}`);
        fs.statSync(localAccountJSON);
        const accountJSON = JSON.parse(fs.readFileSync(localAccountJSON).toString());
        account = this.web3.eth.accounts.decrypt(accountJSON, '');
      } catch(err) {
        console.log("\tLocal account does not exist. Will be generated.");
        account = this.web3.eth.accounts.create();
        const accountJSON = web3.eth.accounts.encrypt(account.privateKey, '');
        fs.writeFileSync(localAccountJSON, JSON.stringify(accountJSON));
      }

      console.log(`\tFound account in the keystore: ${account.address}`);
      return account;
    }
  }

  async deployContract(privateFor) {
    let theContract = getContract(this.web3, this.contractName);
    let deployObj = theContract.encodeABI();

    let account = await this.getAccount();
    let nonce = await this.web3.eth.getTransactionCount(account.address);

    let params = {
      from: account,
      nonce: '0x' + nonce.toString(16),
      gasPrice: 0,
      gas: 700000,
      data: deployObj
    };

    if (chainId) params.chainId = chainId;

    let signedTx = new Tx(params);

    console.log(`=> Externally signing the contract deploy`);

    let privateKey = Buffer.from(this.isHDWallet() ? account.privateKey : account.privateKey.slice(2), 'hex');
    signedTx.sign(privateKey);
    let serializedTx = signedTx.serialize();

    let payload = '0x' + serializedTx.toString('hex');
    console.log(`\tSigned payload: ${payload}\n`);
    this.web3.eth.sendSignedTransaction(payload)
    .on('receipt', (receipt) => {
      if (this.verbose)
        console.log(receipt);
    })
    .on('error', (err) => {
      console.error('Failed to deploy the smart contract. Error: ' + err);
      process.exit(1);
    })
    .then((newInstance) => {
      // smart contract deployed, ready to invoke it
      console.log(`\tSmart contract deployed, ready to take calls at "${newInstance.contractAddress}"`);
    });
  }

  async sendTransaction(contractAddress, newValue, privateFor) {
    const account = await this.getAccount();
    let theContract = getContract(this.web3, this.contractName, contractAddress);

    const abi = theContract.options.jsonInterface;
    const callData = this.web3.eth.abi.encodeFunctionCall(abi[1], ['' + newValue]); // 2nd function in the abi is the "set"
    let nonce = await this.web3.eth.getTransactionCount(account.address);
    let tx = {
      from: account.address,
      nonce: '0x' + nonce.toString(16),
      to: contractAddress,
      value: '0x0', // required eth transfer value, of course we don't deal with eth balances in private consortia
      data: callData,
      gas: 500000
    };

    if (chainId) tx.chainId = chainId;

    let signedTx = new Tx(tx);

    console.log(`=> Externally signing the transaction`);

    let privateKey = Buffer.from(this.isHDWallet() ? account.privateKey : account.privateKey.slice(2), 'hex');
    signedTx.sign(privateKey);
    let serializedTx = signedTx.serialize();

    let payload = '0x' + serializedTx.toString('hex');
    console.log(`\tSigned payload: ${payload}\n`);

    this.web3.eth.sendSignedTransaction(payload)
    .on('receipt', (receipt) => {
      if (this.verbose)
        console.log(receipt);

      console.log(`\tSet new value to ${newValue}`);
      console.log('\nDONE!\n');
    })
    .on('error', (err) => {
      console.error('Failed to deploy the smart contract. Error: ' + err);
      process.exit(1);
    });
  }
}

module.exports = ExternalSigningHandler;
