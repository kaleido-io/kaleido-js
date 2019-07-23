'use strict';


const EEAClient = require("web3-eea");
const Web3 = require('web3');
const axios = require('axios');
const solc = require('solc');
const join = require('path').join;
const fs = require('fs-extra');
const argv = require('yargs').argv;
const verbose = argv.verbose;

class PantheonNodeSigningHandler {
  constructor(url, contractName) {
    let rpcurl = `${url}:8555`;
    this.web3 = new EEAClient(new Web3(url), 2018);
    this.url = url;
    this.contractName = contractName;
    this.abi;
    this.bytecode;
    this.account;
  }

 async getContract(){
    this.account = await this.getAccount();
    let tsSrc = fs.statSync(join(__dirname, `../contracts/${this.contractName}.sol`));
    let tsBin;
    try {
        tsBin = fs.statSync(join(__dirname, `../contracts/${this.contractName}.bin`));
    } catch(err) {
        console.log("Compiled contract does not exist. Will be generated.");
    }
    let compiled;
    if (!tsBin || tsSrc.mtimeMs > tsBin.mtimeMs) {
        // source file has been modified since the last compile
        let data = fs.readFileSync(join(__dirname, `../contracts/${this.contractName}.sol`));
        compiled = solc.compile(data.toString(), 1);
        fs.writeFileSync(join(__dirname, `../contracts/${this.contractName}.bin`), JSON.stringify(compiled));
    } else {
        compiled = JSON.parse(fs.readFileSync(join(__dirname, `../contracts/${this.contractName}.bin`)).toString());
    }

    let contract = compiled.contracts[`:${this.contractName}`];
    this.abi = JSON.parse(contract.interface);
    this.bytecode = '0x' + contract.bytecode;
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

  async deployContract(privateFor,privateFrom) {
    await this.getContract();
    let rpcInstance = axios.create({
        baseURL: `${this.url}`,
      });
    let body ={
        "jsonrpc":"2.0",
        "method":"eea_sendTransaction",
        "params":[{
            "from": this.account,
            "data": this.bytecode,
            "privateFrom": privateFrom,
            "privateFor": [privateFor],
            "restriction": "restricted"
        }],
        "id":1
    };
    console.log('=> Deploying smart contract');
    try{
        let res = await rpcInstance.post('', body);
        if(verbose){
            console.log(`Received repsonse`,res.data);
        }
        let txHash = res.data.result;
        let txReceipt = await this.web3.eea.getTransactionReceipt(txHash);
        if(verbose){
            console.log(`Transaction receipt`,txReceipt);
        }
        console.log(`\tSmart contract deployed, ready to take calls at "${txReceipt.contractAddress}"`);
    }catch(error){
        console.error('\tFailed tooo deploy the smart contract. Error: ' + error);
        process.exit(1);
    }
  }

  async sendTransaction(contractAddress, newValue, privateFor,privateFrom) {
    await this.getContract();
    //const abi = theContract.options.jsonInterface;
    const func = this.abi.find(f => f.name === 'set');
    console.log(func);
    const callData = this.web3.eth.abi.encodeFunctionCall(func, ['' + newValue]);
    console.log(callData);

    let rpcInstance = axios.create({
        baseURL: `${this.url}`,
      });
    let body ={
        "jsonrpc":"2.0",
        "method":"eea_sendTransaction",
        "params":[{
            "from": this.account,
            "to": contractAddress,
            "data": callData,
            "privateFrom": privateFrom,
            "privateFor": [privateFor],
            "restriction": "restricted"
        }],
        "id":1
    };
    console.log('=> Setting state to new value');
    try{
        let res = await rpcInstance.post('', body);
        if(verbose){
            console.log(`Received repsonse`,res.data);
        }
        let txHash = res.data.result;
        let txReceipt = await this.web3.eea.getTransactionReceipt(txHash);
        if(verbose){
            console.log(`Transaction receipt`,txReceipt);
        }
        console.log(`\tNew value set to: ${newValue}`);
        console.log('\nDONE!\n');
    }catch(err){
        console.log(`Unexpected response`, err);
    }

  }

  async queryTransaction(contractAddress, privateFor, privateFrom) {

    console.log(`=> Calling smart contract at "${contractAddress}" for current state value`);
    await this.getContract();
    const func = this.abi.find(f => f.name === 'query');
    const callData = this.web3.eth.abi.encodeFunctionCall(func,[]);
    let rpcInstance = axios.create({
        baseURL: `${this.url}`,
      });
    let body ={
        "jsonrpc":"2.0",
        "method":"eea_sendTransaction",
        "params":[{
            "from": this.account,
            "to": contractAddress,
            "data": callData,
            "privateFrom": privateFrom,
            "privateFor": [privateFor],
            "restriction": "restricted"
        }],
        "id":1
    };
    try{
        let res = await rpcInstance.post('', body);
        if(verbose){
            console.log(`Received repsonse`,res.data);
        }
        let txHash = res.data.result;
        let txReceipt = await this.web3.eea.getTransactionReceipt(txHash);
        let value = txReceipt.output;
        console.log('\tSmart contract current state: %j', value);
        console.log('\nDONE!\n');
    }catch(err){
        console.log(`Unexpected response`, err);
    }
  }
}

module.exports = PantheonNodeSigningHandler;
