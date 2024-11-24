const { expectEvent, BN } = require("@openzeppelin/test-helpers");
const Web3 = require("web3").default; // Ensure correct import
const ColdChain = artifacts.require("ColdChain");

contract("ColdChain", (accounts) => {
    before(async () => {
        this.owner = accounts[0];
        this.VACCINE_BRANDS = {
            Pfizer: "Pfizer-BioNtech",
            Moderna: "Moderna",
            Janssen: "Johnson and Johnson's Janssen",
            Sputnik: "Sputnik V",
        };
        this.ModeEnums = {
            ISSUER: { val: "ISSUER", pos: 0 },
            PROVER: { val: "PROVER", pos: 1 },
            VERIFIER: { val: "VERIFIER", pos: 2 },
        };
        this.CertificateStatusEnums = {
          //{ MANUFACTURED, DELIVERING_INTERNATIONAL, STORED, DELIVERING_LOCAL, DELIVERED }
    
          manufactured: { val: "MANUFACTURED", pos: 0 },
          delivering1: { val: "DELIVERING_INTERNATIONAL", pos: 1 },
          stored: { val: "STORED", pos: 3 },
          delivering2: { val: "DELIVERING_LOCAL", pos: 4 },
          delivered: { val: "DELIVERED", pos: 5 },
        };
        this.defaultEntities = {
            manufacturerA: { id: accounts[1], mode: this.ModeEnums.PROVER.val },
            manufacturerB: { id: accounts[2], mode: this.ModeEnums.PROVER.val },
            inspector: { id: accounts[3], mode: this.ModeEnums.ISSUER.val },
            distributorglobal: { id: accounts[4], mode: this.ModeEnums.VERIFIER.val },
            distributorlocal: { id: accounts[5], mode: this.ModeEnums.VERIFIER.val },
            immunizer: { id: accounts[6], mode: this.ModeEnums.ISSUER.val },
            traveller: { id: accounts[7], mode: this.ModeEnums.PROVER.val },
            borderAgent: { id: accounts[8], mode: this.ModeEnums.VERIFIER.val },
        };

        this.defaultVaccineBatches = {
            0: { brand: this.VACCINE_BRANDS.Pfizer, manufacturer: this.defaultEntities.manufacturerA.id },
            1: { brand: this.VACCINE_BRANDS.Moderna, manufacturer: this.defaultEntities.manufacturerA.id },
            2: { brand: this.VACCINE_BRANDS.Janssen, manufacturer: this.defaultEntities.manufacturerB.id },
            3: { brand: this.VACCINE_BRANDS.Sputnik, manufacturer: this.defaultEntities.manufacturerB.id },
            4: { brand: this.VACCINE_BRANDS.Pfizer, manufacturer: this.defaultEntities.manufacturerB.id },
            5: { brand: this.VACCINE_BRANDS.Pfizer, manufacturer: this.defaultEntities.manufacturerA.id },
            6: { brand: this.VACCINE_BRANDS.Moderna, manufacturer: this.defaultEntities.manufacturerA.id },
            7: { brand: this.VACCINE_BRANDS.Moderna, manufacturer: this.defaultEntities.manufacturerB.id },
            8: { brand: this.VACCINE_BRANDS.Janssen, manufacturer: this.defaultEntities.manufacturerB.id },
            9: { brand: this.VACCINE_BRANDS.Sputnik, manufacturer: this.defaultEntities.manufacturerA.id },
        };

        this.ColdChainInstance = await ColdChain.deployed();
    });

    it("should add entities successfully", async () => {
        for (const entity in this.defaultEntities) {
            const { id, mode } = this.defaultEntities[entity];
            const result = await this.ColdChainInstance.addEntity(id, mode, { from: this.owner });

            // Check if the expected event was emitted
            expectEvent(result, "AddEntity", {
                entityId: id,
                entityMode: mode,
            });

            const retrievedEntity = await this.ColdChainInstance.entities.call(id);
            assert.equal(id, retrievedEntity.id, "mismatched ids");
            assert.equal(this.ModeEnums[mode].pos, Number(retrievedEntity.mode), "mismatched modes");
        }
    });

    it("should add vaccine batches successfully", async () => {
        for (let i = 0; i < Object.keys(this.defaultVaccineBatches).length; i++) {
            const { brand, manufacturer } = this.defaultVaccineBatches[i];
            const result = await this.ColdChainInstance.addVaccineBatch(brand, manufacturer, { from: this.owner });

            // Check if the expected event was emitted
            expectEvent(result, "AddVaccineBatch", {
                vaccineBatchId: String(i),
                manufacturer: manufacturer,
            });

            const retrievedVaccineBatch = await this.ColdChainInstance.vaccineBatches.call(i);
            assert.equal(i, retrievedVaccineBatch.id, "mismatched vaccine batch ids");
            assert.equal(brand, retrievedVaccineBatch.brand, "mismatched vaccine brands");
            assert.equal(undefined, retrievedVaccineBatch.certificateIds, "certificateIds should be undefined");
        }
    });

    it("should sign a message and store as a certificate from the issuer to the prover", async () => {
        const { inspector, manufacturerA } = this.defaultEntities;
        const vaccineBatchId = 0;

        // Construct the message
        const message = `Inspector (${inspector.id}) has certified vaccine batch #${vaccineBatchId} for Manufacturer (${manufacturerA.id}).`;

        // Sign the message using the inspector's account directly
        let signature;
        const accountToSign = inspector.id; // Use inspector's account
        try {
            signature = await web3.eth.sign(
                web3.utils.keccak256(message),
                accountToSign
            );
            console.log("Signature:", signature);
        } catch (error) {
            console.error("Signing error:", error);
            throw new Error("Signature could not be created.");
        }

        // Issue certificate with the signed message
        const result = await this.ColdChainInstance.issueCertificate(
            inspector.id,
            manufacturerA.id,
            vaccineBatchId,
            signature,
            0, // Set appropriate certificateStatus
            { from: this.owner }
        );

        // Verify the event
        expectEvent(result.receipt, "IssueCertificate", {
            issuer: inspector.id,
            prover: manufacturerA.id,
            certificateId: new BN(0),
        });
        const retrievedCertificate = await this.ColdChainInstance.certificates.call(0);
        assert.equal(retrievedCertificate.id.toString(), '0');
        assert.equal(retrievedCertificate.issuer.id, inspector.id);
        assert.equal(retrievedCertificate.prover.id, manufacturerA.id);
        assert.deepEqual(retrievedCertificate.signature, signature); // For byte arrays
        assert.equal(retrievedCertificate.certificateStatus.toString(), this.CertificateStatusEnums.manufactured.pos.toString());
        
    });
    it("should verify that certificate signature matches the issuer", async () => {
      const { inspector, manufacturerA } = this.defaultEntities;
      const vaccineBatchId = 0;
      const message = `Inspector (${inspector.id}) has certified vaccine batch #${vaccineBatchId} for Manufacturer (${manufacturerA.id}).`;
  
      // Retrieve the certificate to get its ID
      const certificate = await this.ColdChainInstance.certificates.call(0);
  
      // Log for debugging
      console.log("Certificate ID:", certificate.id);
  
      // Check if this.web3 is properly initialized
      if (!this.web3) {
          console.error("Web3 is not initialized.");
          return;
      }
  
      const signerMatches = await this.ColdChainInstance.isMatchingSignature(
          this.web3.utils.keccak256(message),
          certificate.id, // Ensure this is the correct certificate ID
          inspector.id,
          { from: this.owner }
      );
  
      // Assert that the signature matches
      assert.equal(signerMatches, true);
  });
  
  
});

