'use strict';

const argv = require('yargs').argv;
const Web3 = require('web3');
const Tx = require('ethereumjs-tx');
const solc = require('solc');
const fs = require('fs');

const contractAddress = argv.contract;
const url = argv.url;
const verbose = argv.verbose;
const query = argv.query;
const deploy = argv.deploy;
const set = argv.set;
const privateFor = argv.privateFor;
const externallySign = argv.sign;

console.log(`1. Connecting to target node: ${url}`);
let web3 = new Web3(new Web3.providers.HttpProvider(url));

let contractName = 'simplestorage';
function getContract(address) {
  let tsSrc = fs.statSync(`./${contractName}.sol`);
  let tsBin;

  try {
    tsBin = fs.statSync(`./${contractName}.bin`);
  } catch(err) {
    console.log("Compiled contract does not exist. Will be generated.");
  }

  let compiled;
  if (!tsBin || tsSrc.mtimeMs > tsBin.mtimeMs) {
    // source file has been modified since the last compile
    let data = fs.readFileSync(`./${contractName}.sol`);
    compiled = solc.compile(data.toString(), 1);
    fs.writeFileSync(`./${contractName}.bin`, JSON.stringify(compiled));
  } else {
    compiled = JSON.parse(fs.readFileSync(`./${contractName}.bin`).toString());
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
    return theContract.methods.get().call();
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
} else if (deploy) {
  let userAccount, sc;

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

async function getAccount() {
  let accounts = await web3.eth.personal.getAccounts();
  if (!accounts || accounts.length === 0) {
    console.error("Can't find accounts in the target node");
    process.exit(1);
  }

  return accounts[0];
}

async function externallySignedTransaction(abi, contractAddress, newValue) {
  const newAccount = web3.eth.accounts.create();
  const callData = web3.eth.abi.encodeFunctionCall(abi[1], ['' + newValue]); // 2nd function in the abi is the "set"
  let tx = {
    from: newAccount.address,
    to: contractAddress,
    value: '0x0', // required eth transfer value, of course we don't deal with eth balances in private consortia
    data: callData,
    gas: 500000
  };

  let signedTx = new Tx(tx);
  signedTx.sign(Buffer.from(newAccount.privateKey.slice(2), 'hex'));
  let serializedTx = signedTx.serialize();

  let payload = '0x' + serializedTx.toString('hex');
  console.log(`\n\tSigned payload: ${payload}\n`);
  await web3.eth.sendSignedTransaction(payload);

  console.log(`\tSet new value to ${newValue}`);
  console.log('\nDONE!\n');
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

module.exports.getContract = getContract;
module.exports.web3 = web3;
module.exports.getAccount = getAccount;
