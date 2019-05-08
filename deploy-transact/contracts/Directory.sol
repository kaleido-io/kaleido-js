pragma solidity ^0.4.23;

contract Directory {
    // Logged when the owner of a node assigns a new owner to that node.
    event NewOwner(bytes32 indexed parentNode, bytes32 indexed nodeHash, address owner, string label, string proof);

    // Logged when the owner of a node creates a new owner as a subnode.
    event NewUser(bytes32 indexed userId, bytes32 indexed orgId, string name, address owner);

    // Logged when the owner of a node transfers ownership to a new account.
    event Transfer(bytes32 indexed nodeHash, address owner);

    // Logged when a new on-chain address is stored or a previous one is updated
    event NewAccountValue(bytes32 indexed parentNode, string name, address value, string version);

    // Logged when the accountsReverse array cannot be updated because account is already claimed by
    // an owner different than msg.sender
    event CannotOverwriteAccount(string errMessage, address account, address accountOwner, address messageSender);

    struct AccountValue {
      address value;
      string versionDescription;
    }

    struct Account {
      string fullPathName;
      string name;
      string parentName;
      mapping(uint => AccountValue) values; // versionIndex to address
      uint valuesCount;
      bool exists;
    }

    struct User {
      bytes32 org;
      address owner;
      address parentOwner;
      address profile;
      string name;
      bool exists;
    }

    struct Node {
      bytes32 parent;
      address owner;
      address profile;
      string label;
      string proof;
      bytes32[] usersIndex;
      bytes32[] childrenIndex;
      bool exists;
    }

    struct AccountReverseDetails {
      bytes32 parent; // parentNode namehash
      string name; // human readable name of account
      bool claimed;
    }

    bytes32[] nodesIndex;
    mapping(bytes32 => Node) nodes;

    bytes32[] usersIndex;
    mapping(bytes32 => User) users;

    uint accountsCount;
    mapping(bytes32 => mapping(bytes32 => Account)) accounts; // namehashes to Accounts
    mapping(address => AccountReverseDetails) accountsReverse; // addresses to namehashes

    address genericProfileContract;

    string contractVersion;

    // Permits modifications only by the owner of the specified node.
    modifier only_owner(bytes32 nodeHash) {
        require(nodes[nodeHash].owner == msg.sender, "Not authorized to edit this node in the directory tree");
        _;
    }

    /**
     * @dev Constructs a new Directory
     */
    constructor(address profile) public {
      genericProfileContract = profile;
      nodes[0x0].owner = msg.sender;
      nodes[0x0].profile = genericProfileContract;
      nodes[0x0].label = "";
      contractVersion = "2.0.0";
    }

/*******************************************************************************/
/************************ ACCOUNTS FUNCTIONS ***********************************/
/*******************************************************************************/

    function generateHash(string name) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(name));
    }

    /**
     * dev Sets value for given key as current value for caller
     * param key: namehash of human readable string
     * param _value: public key or other info
     */
    function setAccount(bytes32 parentNode, string name, address _value) public {
      bytes32 grandParent = nodes[parentNode].parent;
      require(nodes[parentNode].owner == msg.sender || nodes[grandParent].owner == msg.sender, "Not authorized to edit this account");

      setAccountVersion(parentNode, name, _value, "0");
    }

    /**
     * dev Sets value and versionDescription for given key for caller
     * param parentNode: namehash of human readable string
     * param name: human readable string of node name
     * param value: public key or other info
     * param versionDescription: versionDescription of the key
     */
    function setAccountVersion(bytes32 parentNode, string name, address value, string versionText) public {
        bytes32 grandParent = nodes[parentNode].parent;
        require(nodes[parentNode].owner == msg.sender || nodes[grandParent].owner == msg.sender, "Not authorized to edit this account");

        AccountValue memory val;
        val.value = value;
        val.versionDescription = versionText;

        bytes32 key = generateHash(name);
        Account storage acct = accounts[parentNode][key];
        acct.name = name;
        acct.parentName = nodes[parentNode].label;
        acct.values[acct.valuesCount] = val;
        acct.valuesCount++;

        if (!acct.exists) {
            accountsCount++;
            acct.exists = true;
        }

        emit NewAccountValue(parentNode, name, value, versionText);

        if (accountsReverse[value].claimed && nodes[accountsReverse[value].parent].owner != nodes[parentNode].owner) {
          emit CannotOverwriteAccount("Cannot overwrite account", value, nodes[parentNode].owner, msg.sender);
        } else {
          accountsReverse[value].parent = parentNode;
          accountsReverse[value].name = name;
          accountsReverse[value].claimed = true;
        }
    }

    function releaseAccount(bytes32 parentNode, address value) public {
        bytes32 grandParent = nodes[parentNode].parent;
        require(nodes[parentNode].owner == msg.sender || nodes[grandParent].owner == msg.sender, "Not authorized to edit this account");

        accountsReverse[value].claimed = false;
    }

    /**
     * dev Gets latest value (e.g. public key) for given namehash
     * param key: namehash of human readable string
     */
    function getLatestAccount(bytes32 parentNode, bytes32 key) view public returns (bytes32, string, string, address, string) {
      return getAccountVersion(parentNode, key, accounts[parentNode][key].valuesCount - 1);
    }

    function getLatestAccountByName(bytes32 parentNode, string name) view public returns (bytes32, string, string, address, string) {
        return getAccountVersion(parentNode, generateHash(name), accounts[parentNode][generateHash(name)].valuesCount - 1);
    }

    function getAccountVersionByName(bytes32 parentNode, string name, uint256 index) view public returns (bytes32, string, string, address, string) {
        return getAccountVersion(parentNode, generateHash(name), index);
    }

    /**
     * dev Gets value (e.g. public key) for given namehash at given index
     * param key: namehash of human readable string
     * param index: index to particular value within array
     */
    function getAccountVersion(bytes32 parentNode, bytes32 key, uint256 index) view public returns (bytes32, string, string, address, string) {
        require(accounts[parentNode][key].exists, "Key does not exist.");
        require(index >= 0 && index < accounts[parentNode][key].valuesCount, "Key index does not exist.");

        return (
          parentNode,
          accounts[parentNode][key].parentName,
          accounts[parentNode][key].name,
          accounts[parentNode][key].values[index].value,
          accounts[parentNode][key].values[index].versionDescription
        );
    }

    function accountLookup(address owner) public view returns (bytes32, string, string, address, string) {
        return getLatestAccountByName(accountsReverse[owner].parent, accountsReverse[owner].name);
    }

    function versionsByName(bytes32 parentNode, string name) view public returns (uint256) {
        return versionsByKey(parentNode, generateHash(name));
    }

    function versionsByKey(bytes32 parentNode, bytes32 key) view public returns (uint256) {
        return accounts[parentNode][key].valuesCount;
    }

    function existsByName(bytes32 parentNode, string name) view public returns (bool) {
        return existsByKey(parentNode, generateHash(name));
    }

    function existsByKey(bytes32 parentNode, bytes32 key) view public returns (bool) {
        return (accounts[parentNode][key].valuesCount > 0);
    }

    function getAccountCount(bytes32 parentNode, bytes32 key) view public returns (uint256) {
        return accounts[parentNode][key].valuesCount;
    }

    function getAccountByIndex(bytes32 parentNode, bytes32 key, uint256 index) view public returns (string, address, string) {
        require(index < accounts[parentNode][key].valuesCount, 'index out of range');
        return (
          accounts[parentNode][key].name,
          accounts[parentNode][key].values[index].value,
          accounts[parentNode][key].values[index].versionDescription
        );
    }

/*******************************************************************************/
/********************** DIRECTORY TREE FUNCTIONS *******************************/
/*******************************************************************************/

    /**
     * @dev Transfers ownership of a node to a new address. May only be called by the current owner of the node.
     * @param nodeHash The node to transfer ownership of.
     * @param owner The address of the new owner.
     */
    function setNodeOwner(bytes32 nodeHash, address owner) public only_owner(nodeHash) {
        emit Transfer(nodeHash, owner);
        nodes[nodeHash].owner = owner;
    }

    /**
     * @dev Transfers ownership of an org keccak256(nodeHash, label) to a new address. May only be called by the owner of the parent node.
     * @param parentNode The parent node.
     * @param label The hash of the label specifying the subnode.
     * @param owner The address of the new owner.
     */
    function setNodeDetails(bytes32 parentNode, string label, string proof, address owner) public only_owner(parentNode) {
      setNodeDetailsEx(parentNode, label, proof, owner, genericProfileContract);
    }

    function setNodeDetailsEx(bytes32 parentNode, string label, string proof, address owner, address profile) public only_owner(parentNode) {
        bytes32 orgNode = keccak256(abi.encodePacked(parentNode, keccak256(abi.encodePacked(label))));
        emit NewOwner(parentNode, orgNode, owner, label, proof);

        nodes[orgNode].proof = proof;
        nodes[orgNode].label = string(abi.encodePacked(nodes[parentNode].label, "/", label));
        nodes[orgNode].owner = owner;
        nodes[orgNode].parent = parentNode;
        nodes[orgNode].profile = profile;

        users[orgNode].owner = owner;
        users[orgNode].org = parentNode;
        users[orgNode].name = label;
        users[orgNode].profile = profile;

        if (!nodes[orgNode].exists) {
          nodes[orgNode].exists = true;
          nodesIndex.push(orgNode);
          nodes[parentNode].childrenIndex.push(orgNode);
        }

        // Update accounts and accountsReverse arrays
        setAccount(orgNode, "admin", owner);
    }

    function setUserDetails(bytes32 nodeHash, string name, address owner) public {
      setUserDetailsEx(nodeHash, name, owner);
    }

    function setUserDetailsEx(bytes32 nodeHash, string name, address owner) public {
      bytes32 userId = keccak256(abi.encodePacked(nodeHash, keccak256(abi.encodePacked(name))));
      require(nodes[nodeHash].owner == msg.sender || users[userId].owner == msg.sender, "Not authorized to edit this user");

      emit NewUser(userId, nodeHash, name, owner);

      // set user
      users[userId].owner = owner;
      users[userId].parentOwner = msg.sender;
      users[userId].org = nodeHash;
      users[userId].name = name;

      // Update accounts and accountsReverse arrays
      setAccount(nodeHash, name, owner);

      // setup indices
      if (!users[userId].exists) {
        users[userId].exists = true;
        nodes[nodeHash].usersIndex.push(userId);
        usersIndex.push(userId);
      }
    }

    function nodeDetails(bytes32 nodeHash) public view returns (address, string, bytes32, string, uint256, uint256, address) {
      return (
        nodes[nodeHash].owner,
        nodes[nodeHash].label,
        nodes[nodeHash].parent,
        nodes[nodeHash].proof,
        nodes[nodeHash].usersIndex.length,
        nodes[nodeHash].childrenIndex.length,
        nodes[nodeHash].profile
      );
    }

    function nodeLabel(bytes32 nodeHash) public view returns (string) {
      return nodes[nodeHash].label;
    }

    function nodeOwner(bytes32 nodeHash) public view returns (address) {
      return nodes[nodeHash].owner;
    }

    function nodeProof(bytes32 nodeHash) public view returns (string) {
      return nodes[nodeHash].proof;
    }

    function user(bytes32 userId) public view returns (bytes32, bytes32, address, string) {
      return (
        userId,
        users[userId].org,
        users[userId].owner,
        users[userId].name
      );
    }

    function userOwner(bytes32 userId) public view returns (address) {
      return users[userId].owner;
    }

    function userProfile(bytes32 userId) public view returns (address) {
      return users[userId].profile;
    }

    function userName(bytes32 userId) public view returns (string) {
      return users[userId].name;
    }

    function nodeUsersCount(bytes32 nodeHash) public view returns (uint256) {
      return nodes[nodeHash].usersIndex.length;
    }

    function nodeChildrenCount(bytes32 nodeHash) public view returns (uint256) {
      return nodes[nodeHash].childrenIndex.length;
    }

    function nodeUser(bytes32 nodeHash, uint8 index) public view returns (bytes32, bytes32, address, string) {
      require(index < nodes[nodeHash].usersIndex.length);
      bytes32 userId = nodes[nodeHash].usersIndex[index];
      return user(userId);
    }

    function nodeChild(bytes32 parentNode, uint8 index) public view returns (bytes32, string) {
      require(index < nodes[parentNode].childrenIndex.length);
      bytes32 nodeId = nodes[parentNode].childrenIndex[index];
      return (
        nodeId,
        nodes[nodeId].label
      );
    }

    // functions to allow iteration over all nodes or paging through a
    // list of nodes
    function nodesCount() public view returns (uint256) {
      return nodesIndex.length;
    }

    function nodeKey(uint8 index) public view returns (bytes32) {
      require(index < nodesIndex.length);
      return nodesIndex[index];
    }

    function usersCount() public view returns (uint256) {
      return usersIndex.length;
    }

    function userKey(uint8 index) public view returns (bytes32) {
      require(index < usersIndex.length);
      return usersIndex[index];
    }

    function getContractVersion() public view returns (string) {
      return contractVersion;
    }

}