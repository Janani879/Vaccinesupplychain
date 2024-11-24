// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

library CryptoSuite {
    function SplitSignature(bytes memory sig) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        require(sig.length == 65, "Invalid signature length");

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        return (v, r, s);
    }
  
    function RecoverSigner(bytes32 message, bytes memory sig) internal pure returns (address) {
        (uint8 v, bytes32 r, bytes32 s) = SplitSignature(sig);
        bytes memory prefix = "\x19Ethereum signed message:\n32";
        bytes32 prefixedHash = keccak256(abi.encodePacked(prefix, message));
        return ecrecover(prefixedHash, v, r, s);
    }
}

contract ColdChain {
    enum Mode { ISSUER, PROVER, VERIFIER }
    enum CertificateStatus { MANUFACTURED, DELIVERING_INTERNATIONAL, STORED, DELIVERING_LOCAL, DELIVERED }

    struct Entity {
        address id;
        Mode mode;
        uint[] certificateIds;
    }

    struct Certificate {
        uint id;
        Entity issuer;
        Entity prover;
        bytes signature;
        CertificateStatus certificateStatus;
    }

    struct VaccineBatch {
        uint id;
        string brand;
        address manufacturer;
        uint[] certificateIds;
    }

    uint public constant MAXCERTIFICATIONS = 2;
    uint[] public certificateIds;
    uint[] public vaccineBatchIds;

    mapping(uint => VaccineBatch) public vaccineBatches;
    mapping(uint => Certificate) public certificates;
    mapping(address => Entity) public entities;

    event AddEntity(address indexed entityId, string entityMode);
    event AddVaccineBatch(uint indexed vaccineBatchId, address indexed manufacturer);
    event IssueCertificate(address indexed issuer, address indexed prover, uint certificateId);

    function addEntity(address _id, string memory _mode) public {
        Mode mode = unmarshalMode(_mode);
        uint[] memory _certificateIds = new uint[](MAXCERTIFICATIONS);
        Entity memory entity = Entity(_id, mode, _certificateIds);
        entities[_id] = entity;
        emit AddEntity(entity.id, _mode);
    }

    function unmarshalMode(string memory _mode) private pure returns (Mode mode) {
        bytes32 encodedMode = keccak256(abi.encodePacked(_mode));
        if (encodedMode == keccak256(abi.encodePacked("ISSUER"))) {
            return Mode.ISSUER;
        } else if (encodedMode == keccak256(abi.encodePacked("PROVER"))) {
            return Mode.PROVER;
        } else if (encodedMode == keccak256(abi.encodePacked("VERIFIER"))) {
            return Mode.VERIFIER;
        }
        revert("Received invalid entity mode");
    }

    function addVaccineBatch(string memory brand, address manufacturer) public returns (uint) {
        uint id = vaccineBatchIds.length;
        uint[] memory _certificateIds = new uint[](MAXCERTIFICATIONS);
        VaccineBatch memory batch = VaccineBatch(id, brand, manufacturer, _certificateIds);
        vaccineBatches[id] = batch;
        vaccineBatchIds.push(id);
        emit AddVaccineBatch(batch.id, batch.manufacturer);
        return id;
    }

    function issueCertificate(
        address _issuer, address _prover,
        uint vaccineBatchId, bytes memory signature, CertificateStatus certificateStatus
    ) public returns (uint) {
        Entity memory issuer = entities[_issuer];
        require(issuer.mode == Mode.ISSUER, "Issuer mode required");
        
        Entity memory prover = entities[_prover];
        require(prover.mode == Mode.PROVER, "Prover mode required");

        uint id = certificateIds.length;
        certificateIds.push(id);

        Certificate memory certificate = Certificate(id, issuer, prover, signature, certificateStatus);
        certificates[id] = certificate;
        
        emit IssueCertificate(_issuer, _prover, id);
        return id;
    }

    function isMatchingSignature(bytes32 message, uint id, address issuer) public view returns (bool) {
        Certificate memory cert = certificates[id];
        require(cert.issuer.id == issuer, "Issuer mismatch");
        address recoveredSigner = CryptoSuite.RecoverSigner(message, cert.signature);
        return recoveredSigner == cert.issuer.id;
    }
}


