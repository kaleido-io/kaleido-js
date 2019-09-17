 pragma solidity >=0.5.2 <0.6.0;
/**
  * @title Simple Storage with events
  * @dev Read and write values to the chain
  */
contract SimpleEvents {
  int64 public storedNumber;
  string public storedMessage;

  event Changed (
    address indexed from,
    int64 indexed aNumber,
    string indexed indexedString,
    string aMessage
  );

  /**
    * @dev Constructor sets the default value
    * @param someNumber The initial value integer
    * @param someMessage The initial value string
    */
  constructor(int64 someNumber, string memory someMessage) public {
    set(someNumber,someMessage);
  }

  /**
    * @dev Set the value
    * @param someNumber The new value integer
    * @param someMessage The new value string
    */
  function set(int64 someNumber, string memory someMessage) public {
    storedNumber = someNumber;
    storedMessage = someMessage;
    emit Changed(msg.sender, someNumber, someMessage, someMessage);
  }

  /**
    * @dev Get the value
    */
  function get() public view returns (int64 someNumber, string memory someMessage) {
    return (storedNumber, storedMessage);
  }

}