pragma solidity ^0.4.17;

contract simplestorage {
   uint public storedData;

   function simplestorage(uint initVal) public {
      storedData = initVal;
   }

   function set(uint x) public {
      storedData = x;
   }

   function get() public constant returns (uint retVal) {
      return storedData;
   }

   function query() public constant returns (uint retVal) {
      return storedData;
   }
}
