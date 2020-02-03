'use strict';

const EEAClient = require("web3-eea");
const Web3 = require('web3');
const axios = require('axios');
const solc = require('solc');
const join = require('path').join;
const fs = require('fs-extra');
const argv = require('yargs').argv;
const verbose = argv.verbose;
const { getContract }= require('./utils.js');
const NodeSigning = require('./node-signing.js');

class PantheonNodeSigningHandler extends NodeSigning{
  constructor(url, contractName) {
    super(url,contractName);
    this.web3 = new EEAClient(new Web3(url), 2018);
    this.abi;
    this.bytecode;
    this.account;
  }

  async deployContract(privateFor,privateFrom) {
    this.account = await this.getAccount();
    let contractDetails = await getContract(null,this.contractName,null,true);
    this.abi = contractDetails.abi;
    this.bytecode = contractDetails.bytecode;
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
            "privateFor": privateFor.split(','),
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
        let txReceipt = await this.web3.priv.getTransactionReceipt(txHash, privateFrom);
        if(verbose){
            console.log(`Transaction receipt`,txReceipt);
        }
        console.log(`\tSmart contract deployed, ready to take calls at "${txReceipt.contractAddress}"`);
    }catch(error){
        console.error('\tFailed to deploy the smart contract. Error: ' + error);
        process.exit(1);
    }
  }

  async sendTransaction(contractAddress, newValue, privateFor,privateFrom) {
    this.account = await this.getAccount();
    let contractDetails = await getContract(null,this.contractName,null,true);
    this.abi = contractDetails.abi;
    this.bytecode = contractDetails.bytecode;
    const func = this.abi.find(f => f.name === 'set');
    const callData = this.web3.eth.abi.encodeFunctionCall(func, ['' + newValue]);

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
            "privateFor": privateFor.split(','),
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
        let txReceipt = await this.web3.priv.getTransactionReceipt(txHash, privateFrom);
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
    this.account = await this.getAccount();
    let contractDetails = await getContract(null,this.contractName,null,true);
    this.abi = contractDetails.abi;
    this.bytecode = contractDetails.bytecode;
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
            "privateFor": privateFor.split(','),
            "restriction": "restricted"
        }],
        "id":1
    };
    console.log(`=> Calling smart contract at "${contractAddress}" for current state value`);
    try{
        let res = await rpcInstance.post('', body);
        if(verbose){
            console.log(`Received repsonse`,res.data);
        }
        let txHash = res.data.result;
        let txReceipt = await this.web3.priv.getTransactionReceipt(txHash, privateFrom);
        let value = txReceipt.output;
        console.log('\tSmart contract current state: %j', value);
        console.log('\nDONE!\n');
    }catch(err){
        console.log(`Unexpected response`, err);
    }
  }
}

module.exports = PantheonNodeSigningHandler;
