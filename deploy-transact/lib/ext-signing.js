'use strict';

const join = require('path').join;
const fs = require('fs-extra');
const Tx = require('ethereumjs-tx');
const Web3 = require('web3');
const os = require('os');
const request = require('request');

const { getContract } = require('./utils.js');

const argv = require('yargs').argv;
const verbose = argv.verbose;
const chainId = argv.chainId;
const hdwalletUrl = argv.hdwalletUrl;
const hdwalletId = argv.hdwalletId;
const hdwalletAccountIndex = argv.hdwalletAccountIndex;

class ExternalSigningHandler {
  constructor(url, contractName) {
    this.web3 = new Web3(new Web3.providers.HttpProvider(url));
    this.url = url;
    this.contractName = contractName;
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
        const accountJSON = this.web3.eth.accounts.encrypt(account.privateKey, '');
        fs.writeFileSync(localAccountJSON, JSON.stringify(accountJSON));
      }

      console.log(`\tFound account in the keystore: ${account.address}`);
      return account;
    }
  }

  async deployContract(privateFor) {
    if (privateFor)
      throw new Error('Private transactions are not supported with external signing');

    let theContract = getContract(this.web3, this.contractName);
    let callData = theContract.encodeABI();

    let callback = (newInstance) => {
      // smart contract deployed, ready to invoke it
      console.log(`\tSmart contract deployed, ready to take calls at "${newInstance.contractAddress}"`);
    };

    await this._sendTransaction(null, callData, callback);
  }

  async sendTransaction(contractAddress, newValue, privateFor) {
    if (privateFor)
      throw new Error('Private transactions are not supported with external signing');

    let theContract = getContract(this.web3, this.contractName, contractAddress);
    const abi = theContract.options.jsonInterface;
    const func = abi.find(f => f.name === 'set');
    const callData = this.web3.eth.abi.encodeFunctionCall(func, ['' + newValue]); // 2nd function in the abi is the "set"

    let callback = (receipt) => {
      if (receipt.status) {
        console.log(`\tSet new value to ${newValue}`);
        console.log('\nDONE!\n');
      } else {
        console.err('\tTransaction failed');
      }
    };

    await this._sendTransaction(contractAddress, callData, callback);
  }

  async _sendTransaction(contractAddress, callData, callback) {
    const account = await this.getAccount();
    let nonce = await this.web3.eth.getTransactionCount(account.address);

    let params = {
      data: callData
    };

    let defaultGas = 50000;
    if (contractAddress) {
      params.to = contractAddress;
      defaultGas = 500000;
    }

    params.gas = await this.estimateGas(params, defaultGas);

    params.nonce = '0x' + nonce.toString(16);
    params.gasPrice = 0;

    if (chainId)
      params.chainId = chainId;

    let signedTx = new Tx(params);

    console.log(`=> Externally signing the contract deploy`);

    signedTx = await this.signTx(signedTx, account);
    let serializedTx = signedTx.serialize();

    let payload = '0x' + serializedTx.toString('hex');
    console.log(`\tSigned payload: ${payload}\n`);

    this.web3.eth.sendSignedTransaction(payload)
    .on('receipt', (receipt) => {
      if (verbose)
        console.log(receipt);
    })
    .on('error', (err) => {
      console.error('Failed to execute the transaction. Error: ' + err);
      process.exit(1);
    })
    .then(callback);
  }

  signTx(signedTx, account) {
    let privateKey = Buffer.from(this.isHDWallet() ? account.privateKey : account.privateKey.slice(2), 'hex');
    signedTx.sign(privateKey);
    return Promise.resolve(signedTx);
  }

  async estimateGas(param, defaultValue) {
    let gas;
    try {
      console.log('=> Estimating gas cost');
      gas = await this.web3.eth.estimateGas(param);
      console.log(`\t${gas} (to be inflated by 10%)`);
      gas += Math.ceil(gas * 0.1);
    } catch(err) {
      console.error(`\tFailed to estimate gas, defaulting to ${defaultValue}`, err);
      gas = defaultValue;
    }
    
    return gas;
  }
}

module.exports = ExternalSigningHandler;
