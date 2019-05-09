'use strict';

const Tx = require('ethereumjs-tx');
const Web3 = require('web3');
const request = require('request');
const ExternalSigning = require('./ext-signing.js');

var KeyVault = require('azure-keyvault');
var AuthenticationContext = require('adal-node').AuthenticationContext;

const argv = require('yargs').argv;
const serviceName = argv.servicename;
const keyName = argv.keyname;
const keyVersion = argv.keyversion;
 
class AzureKeyVaultSigning extends ExternalSigning {
  constructor(url, contractName) {
    super(url, contractName);

    this.clientId = process.env.CLIENT_ID;
    this.clientSecret = process.env.CLIENT_SECRET;
    this.directoryId = process.env.DIRECTORY_ID;

    if (!this.clientId) {
      throw new Error('Missing environment variable "CLIENT_ID"');
    }

    if (!this.clientSecret) {
      throw new Error('Missing environment variable "CLIENT_SECRET"');
    }

    if (!this.directoryId) {
      throw new Error('Missing environment variable "DIRECTORY_ID"');
    }

    // Authenticator - retrieves the access token
    let self = this;
    this.authenticator = function (challenge, callback) {     
      // Create a new authentication context.
      var context = new AuthenticationContext(challenge.authorization);
      
      // Use the context to acquire an authentication token.
      return context.acquireTokenWithClientCredentials(challenge.resource, self.clientId, self.clientSecret, function (err, tokenResponse) {
        if (err) throw err;
        // Calculate the value to be set in the request's Authorization header and resume the call.
        var authorizationValue = tokenResponse.tokenType + ' ' + tokenResponse.accessToken;
     
        return callback(null, authorizationValue);
      });
    };

    let creds = new KeyVault.KeyVaultCredentials(this.authenticator);
    this.client = new KeyVault.KeyVaultClient(creds);
  }

  async getAccount() {
    // must be built from the raw EC public key parameters retrieved from the key vault
    // reference: blog by Tomislav Markovski
    // https://tomislav.tech/2018-01-31-ethereum-keyvault-generating-keys/
    let keyObject;
    try {
      keyObject = await this.client.getKey(`https://${serviceName}.vault.azure.net`, keyName, keyVersion);
    } catch(err) {
      throw new Error('Failed to retrieve the signing key from Azure', err);
    }

    let input = Buffer.concat([keyObject.key.x, keyObject.key.y]).toString('hex');
    let hash = this.web3.utils.keccak256('0x' + input);
    return {
      address: '0x' + hash.slice(26)
    };
  }

  async signTx(signedTx) {
    // signature on the tx is over the hash of the tx
    let hash = signedTx.hash(false);
    // now ask Azure to sign the hash
    let res;

    // reference: blog by Tomislav Markovski
    // https://tomislav.tech/2018-02-05-ethereum-keyvault-signing-transactions/
    try {
      // The output of this will be a 64 byte array. The first 32 are the value for R and the rest is S. 
      res = await this.client.sign(`https://${serviceName}.vault.azure.net`, keyName, keyVersion, 'ECDSA256', Buffer.from(hash));
    } catch(err) {
      throw new Error('Failed to get signature from the signing service', err);
    }

    // standard ethereum signature object has "r", "s" and "v"
    let sig = {
      r: res.result.slice(0, 32),
      s: res.result.slice(32)
    }

    // find the recovery ID by trying the possible values (0, 1, 2, 3) with "recover"
    let account = await this.getAccount();
    console.log(`\tRetrieved account from Azure key vault: ${account.address}`);
    let recoverId;
    for (let i of [0, 1, 2, 3]) {
      let recovered = this.web3.eth.accounts.recover({
        messageHash: '0x' + hash.toString('hex'),
        v: '0x' + (i + 27).toString(16),
        r: '0x' + sig.r.toString('hex'),
        s: '0x' + sig.s.toString('hex')
      });

      if (recovered.toLowerCase() === account.address.toLowerCase()) {
        recoverId = i;
        break;
      }
    }

    sig.v = recoverId + 27;

    if (signedTx._chainId > 0) {
      sig.v += signedTx._chainId * 2 + 8;
    }
    Object.assign(signedTx, sig);

    return signedTx;
  }
}

module.exports = AzureKeyVaultSigning;
