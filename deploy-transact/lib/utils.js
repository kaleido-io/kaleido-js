'use strict';

const fs = require('fs-extra');
const join = require('path').join;

function getContract(web3, contractName, address) {
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

module.exports = {
  getContract
};