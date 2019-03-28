'use strict';

const argv = require('yargs').argv;
const Web3 = require('web3');
const Tx = require('ethereumjs-tx');
const solc = require('solc');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const request = require('request');


const contractAddress = argv.contract;
const url = argv.url;
const hdwalletUrl = argv.hdwalletUrl;
const hdwalletId = argv.hdwalletId;
const hdwalletAccountIndex = argv.hdwalletAccountIndex;
const verbose = argv.verbose;
const query = argv.query;
const deploy = argv.deploy;
const set = argv.set;
const privateFor = argv.privateFor;
const externallySign = argv.sign;
const chainId = argv.chainId;
const transferIn = argv['transfer-in'];
const transferOut = argv['transfer-out'];

console.log(`1. Connecting to target node: ${url}`);
let web3 = new Web3(new Web3.providers.HttpProvider(url));

let contractName = 'simplestorage';
function getContract(address) {
  let tsSrc = fs.statSync(`./contracts/${contractName}.sol`);
  let tsBin;

  try {
    tsBin = fs.statSync(`./contracts/${contractName}.bin`);
  } catch(err) {
    console.log("Compiled contract does not exist. Will be generated.");
  }

  let compiled;
  if (!tsBin || tsSrc.mtimeMs > tsBin.mtimeMs) {
    // source file has been modified since the last compile
    let data = fs.readFileSync(`./contracts/${contractName}.sol`);
    compiled = solc.compile(data.toString(), 1);
    fs.writeFileSync(`./contracts/${contractName}.bin`, JSON.stringify(compiled));
  } else {
    compiled = JSON.parse(fs.readFileSync(`./contracts/${contractName}.bin`).toString());
  }

  let contract = compiled.contracts[`:${contractName}`];
  let abi = JSON.parse(contract.interface);
  let bytecode = '0x' + contract.bytecode;

  let ret = new web3.eth.Contract(abi, address);
  if (!address) {
    // this is a new deployment, build the deploy object
    ret = ret.deploy({
      data: bytecode,
      arguments: [10]
    });
  }
  
  return ret;
}

if (query) {
  // must also pass in the contract address
  if (!contractAddress) {
    console.error('For querying smart contract states, you must pass in the contract address using the "--contract=" argument');
    process.exit(1);
  }

  console.log(`2. Calling smart contract at "${contractAddress}" for current state value`);
  let theContract = getContract(contractAddress);

  getAccount().then((account) => {
    return theContract.methods.query().call();
  })
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
  let theContract = getContract(contractAddress);

  if (externallySign) {
    const abi = theContract.options.jsonInterface;
    externallySignedTransaction(abi, contractAddress, newValue);
  } else {
    nodeSignedTransaction(theContract, newValue);
  }
} else if (transferIn) {
  // get ether from 
  if (!contractAddress) {
    console.error('For querying smart contract states, you must pass in the contract address using the "--contract=" argument');
    process.exit(1);
  }

  let newValue = set;
  let theContract = getContract(contractAddress);

  if (externallySign) {
    const abi = theContract.options.jsonInterface;
    externallySignedTransaction(abi, contractAddress, newValue);
  } else {
    nodeSignedTransaction(theContract, newValue);
  }
} else if (deploy) {
  let userAccount, sc;

  if (externallySign) {
    let theContract = getContract();
    let deployObj = theContract.encodeABI();
    console.log(`\tExternally signing the contract deploy`);
    getSigningAccount().then(async (newAccount) => {
      let nonce = await web3.eth.getTransactionCount(newAccount.address);

      let params = {
        from: newAccount,
        nonce: '0x' + nonce.toString(16),
        gasPrice: 0,
        gas: 700000,
        data: deployObj
      };

      if (chainId) params.chainId = chainId;

      let signedTx = new Tx(params);
      // hdwallet privateKey doesnt need the 0x removed
      let privateKey = Buffer.from(useHdwallet() ? newAccount.privateKey : newAccount.privateKey.slice(2), 'hex')
      signedTx.sign(privateKey);
      let serializedTx = signedTx.serialize();

      let payload = '0x' + serializedTx.toString('hex');
      console.log(`\n\tSigned payload: ${payload}\n`);
      web3.eth.sendSignedTransaction(payload)
      .on('receipt', (receipt) => {
        if (verbose)
          console.log(receipt);
      })
      .on('error', (err) => {
        console.error('Failed to deploy the smart contract. Error: ' + err);
        process.exit(1);
      })
      .then((newInstance) => {
        sc = newInstance;
        // smart contract deployed, ready to invoke it
        console.log(`\tSmart contract deployed, ready to take calls at "${newInstance.contractAddress}"`);
      });
    });
  } else {
    getAccount().then((account) => {
      userAccount = account;
      console.log(`\tFound account in the target node: ${account}`);

      let theContract = getContract();

      let params = {
        from: account,
        gasPrice: 0,
        gas: 500000
      };

      if (privateFor) {
        params.privateFor = JSON.parse(privateFor);
      }

      console.log('2. Deploying smart contract');
      theContract.send(params)
      .on('receipt', (receipt) => {
        if (verbose)
          console.log(receipt);
      })
      .on('error', (err) => {
        console.error('Failed to deploy the smart contract. Error: ' + err);
        process.exit(1);
      })
      .then((newInstance) => {
        sc = newInstance;
        // smart contract deployed, ready to invoke it
        console.log(`\tSmart contract deployed, ready to take calls at "${newInstance._address}"`);
      });
    });
  }
}

async function getAccount() {
  let accounts = await web3.eth.personal.getAccounts();
  if (!accounts || accounts.length === 0) {
    console.error("Can't find accounts in the target node");
    process.exit(1);
  }

  return accounts[0];
}

async function externallySignedTransaction(abi, contractAddress, newValue) {
  const newAccount = await getSigningAccount();
  const callData = web3.eth.abi.encodeFunctionCall(abi[1], ['' + newValue]); // 2nd function in the abi is the "set"
  let nonce = await web3.eth.getTransactionCount(newAccount.address);
  let tx = {
    from: newAccount.address,
    nonce: '0x' + nonce.toString(16),
    to: contractAddress,
    value: '0x0', // required eth transfer value, of course we don't deal with eth balances in private consortia
    data: callData,
    gas: 500000
  };

  if (chainId) tx.chainId = chainId;

  let signedTx = new Tx(tx);
  // hdwallet privateKey doesnt need the 0x removed
  let privateKey = Buffer.from(useHdwallet() ? newAccount.privateKey : newAccount.privateKey.slice(2), 'hex')
  signedTx.sign(privateKey);
  let serializedTx = signedTx.serialize();

  let payload = '0x' + serializedTx.toString('hex');
  console.log(`\n\tSigned payload: ${payload}\n`);
  web3.eth.sendSignedTransaction(payload)
  .on('receipt', (receipt) => {
    if (verbose)
      console.log(receipt);

    console.log(`\tSet new value to ${newValue}`);
    console.log('\nDONE!\n');
  })
  .on('error', (err) => {
    console.error('Failed to deploy the smart contract. Error: ' + err);
    process.exit(1);
  });
}

async function nodeSignedTransaction(theContract, newValue) {
  let account = await getAccount();
  console.log(`\tFound account in the target node: ${account}`);

  let params = {
    from: account,
    gas: 50000
  };

  if (privateFor) {
    params.privateFor = JSON.parse(privateFor);
  }

  console.log('2. Setting state to new value');
  await theContract.methods.set(newValue).send(params);

  console.log(`\tNew value set to: ${newValue}`);
  console.log('\nDONE!\n');
}

async function getSigningAccount() {
  if (useHdwallet()) {
    return await getHdwalletAccount()
  }
  return await getLocalAccount()
}

async function getLocalAccount() {
  // look inside the home folder for a previously saved local account
  let localAccountJSON = path.join(os.homedir(), '.web3keystore', 'local-account.json');
  await fs.ensureDir(path.join(os.homedir(), '.web3keystore'));

  let account;
  try {
    fs.statSync(localAccountJSON);
    const accountJSON = JSON.parse(fs.readFileSync(localAccountJSON).toString());
    account = web3.eth.accounts.decrypt(accountJSON, '');
  } catch(err) {
    console.log("Local account does not exist. Will be generated.");
    account = web3.eth.accounts.create();
    const accountJSON = web3.eth.accounts.encrypt(account.privateKey, '');
    fs.writeFileSync(localAccountJSON, JSON.stringify(accountJSON));
  }

  return account;
}

function getHdwalletAccount() {
  console.log('fetching hd wallet account to use')
  return new Promise(function (resolve, reject) {
    request(`${hdwalletUrl}/wallets/${hdwalletId}/accounts/${hdwalletAccountIndex}`, function (error, res, body) {
      if (!error && res.statusCode == 200) {
        resolve(JSON.parse(body));
      } else {
        reject(error);
      }
    });
  });
}

function useHdwallet() {
  return hdwalletId && hdwalletUrl && hdwalletAccountIndex >= 0
}

module.exports.getContract = getContract;
module.exports.web3 = web3;
module.exports.getAccount = getAccount;
