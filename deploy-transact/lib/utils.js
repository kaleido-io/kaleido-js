'use strict';

const fs = require('fs-extra');
const join = require('path').join;
const solc = require('solc');

function getContract(web3, contractName, address, besu_private=false) {
  let tsSrc = fs.statSync(join(__dirname, `../contracts/${contractName}.sol`));
  let tsBin;

  try {
    tsBin = fs.statSync(join(__dirname, `../contracts/${contractName}.bin`));
  } catch(err) {
    console.log("Compiled contract does not exist. Will be generated.");
  }

  let compiled;
  if (!tsBin || tsSrc.mtimeMs > tsBin.mtimeMs) {
    // source file has been modified since the last compile
    let data = fs.readFileSync(join(__dirname, `../contracts/${contractName}.sol`));
    compiled = solc.compile(data.toString(), 1);
    fs.writeFileSync(join(__dirname, `../contracts/${contractName}.bin`), JSON.stringify(compiled));
  } else {
    compiled = JSON.parse(fs.readFileSync(join(__dirname, `../contracts/${contractName}.bin`)).toString());
  }

  let contract = compiled.contracts[`:${contractName}`];
  let abi = JSON.parse(contract.interface);
  let bytecode = '0x' + contract.bytecode;

  if(besu_private){
    return {"bytecode":bytecode,"abi":abi};
  }

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

async function estimateGas(contractOrMethod, defaultValue) {
  console.log('=> Estimating gas cost');
  let gas;
  try {
    gas = await contractOrMethod.estimateGas();
    console.log(`\t${gas} (to be inflated by 10%)`);
    gas += Math.ceil(gas * 0.1);
  } catch(err) {
    console.error(`\tFailed to estimate gas, defaulting to ${defaultValue}`, err);
    gas = defaultValue;
  }
  
  return gas;
}

module.exports = {
  getContract,
  estimateGas
};
