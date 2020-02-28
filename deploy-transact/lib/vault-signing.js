'use strict';

const join = require('path').join;
const Web3 = require('web3');
const request = require('request-promise-native');

const { getContract } = require('./utils.js');

const argv = require('yargs').argv;
const verbose = argv.verbose;
const chainId = argv.chainId;
const vaultUrl = argv.vaultUrl;
const vaultToken = argv.vaultToken;
const pluginPath = argv.pluginPath || 'ethereum';

class VaultSigningHandler {
  constructor(url, contractName) {
    this.web3 = new Web3(new Web3.providers.HttpProvider(url));
    this.url = url;
    this.contractName = contractName;
  }

  async getAccount() {
    console.log('=> Fetching HashiCorp Vault accounts to use');
    try {
      let result = await request({
        method: 'LIST',
        url: `${vaultUrl}/v1/${pluginPath}/accounts`,
        headers: {
          "Authorization": `Bearer ${vaultToken}`
        }
      });
      let json = JSON.parse(result);
      let keys = json.data.keys;
      
      let promises = [];
      keys.forEach(key => {
        let promise = request({
          url: `${vaultUrl}/v1/${pluginPath}/accounts/${key}`,
          headers: {
            "Authorization": `Bearer ${vaultToken}`
          }
        })
        .then(result => {
          return { key, result };
        });

        promises.push(promise);
      });

      let results = await Promise.all(promises);
      let accounts = results.map(r => {
        let json = JSON.parse(r.result);
        return { key: r.key, address: json.data.address };
      });
      console.log(`\tFound ${accounts.length} accounts, using the first account (${accounts[0]}) to sign the transaction`)
      return accounts[0];
    } catch (err) {
      console.error('\tFailed to find accounts in HashiCorp Vault');
      throw err;
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

    callData = callData.indexOf('0x') === 0 ? callData.slice(2) : callData;

    let defaultGas = 50000;
    if (!contractAddress) {
      defaultGas = 500000;
    }

    let tx = {
      data: callData,
      nonce: '0x' + nonce.toString(16),
      gasPrice: 0
    };

    if (!contractAddress) {
      console.log(`=> Deploying the contract`);
      let gasLimit = await this.estimateGas({data: callData}, defaultGas);
      tx.gas = gasLimit;
    } else {
      console.log(`=> Externally signing the transaction`);
      let gasLimit = await this.estimateGas({data: callData, to: contractAddress}, defaultGas);
      tx.gas = gasLimit;
      tx.to = contractAddress;
    }

    let payload = await this.signTx(tx, account);

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

  async signTx(jsonBody, account) {
    try {
      let result = await request({
        method: 'POST',
        url: `${vaultUrl}/v1/${pluginPath}/accounts/${account.key}/sign`,
        headers: {
          "Authorization": `Bearer ${vaultToken}`
        },
        json: jsonBody
      });

      return result.data.signed_transaction;
    } catch(err) {
      console.error('Failed to call vault to sign the transaction', err);
      throw err;
    }
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

module.exports = VaultSigningHandler;
