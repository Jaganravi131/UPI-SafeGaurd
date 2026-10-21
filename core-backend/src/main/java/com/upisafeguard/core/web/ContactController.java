package com.upisafeguard.core.web;

import com.upisafeguard.core.persistence.Contact;
import com.upisafeguard.core.persistence.ContactRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/v1/contacts")
public class ContactController {

    private final ContactRepository contactRepository;

    @Autowired
    public ContactController(ContactRepository contactRepository) {
        this.contactRepository = contactRepository;
    }

    @GetMapping("/search")
    public ResponseEntity<ContactSearchResponse> search(
            @RequestParam(required = false) String phone,
            @RequestParam(required = false) String upiId) {
        
        if (phone != null && !phone.isEmpty()) {
            Optional<Contact> contact = contactRepository.findByPhone(phone);
            if (contact.isPresent()) {
                Contact c = contact.get();
                return ResponseEntity.ok(new ContactSearchResponse(
                        true, "Contact found", c.getPhone(), c.getName(), c.getUpiId(),
                        c.getBank(), c.getTrustScore(), c.getIsVerified()
                ));
            }
            return ResponseEntity.ok(new ContactSearchResponse(false, "No contact found", null, null, null, null, 0, false));
        }
        
        if (upiId != null && !upiId.isEmpty()) {
            Optional<Contact> contact = contactRepository.findByUpiId(upiId);
            if (contact.isPresent()) {
                Contact c = contact.get();
                return ResponseEntity.ok(new ContactSearchResponse(
                        true, "Contact found", c.getPhone(), c.getName(), c.getUpiId(),
                        c.getBank(), c.getTrustScore(), c.getIsVerified()
                ));
            }
            return ResponseEntity.ok(new ContactSearchResponse(false, "No contact found", null, null, null, null, 0, false));
        }
        
        return ResponseEntity.badRequest().body(new ContactSearchResponse(false, "Provide phone or UPI ID", null, null, null, null, 0, false));
    }

    @GetMapping("/verify-upi/{upiId}")
    public ResponseEntity<UpiVerificationResponse> verifyUpi(@PathVariable String upiId) {
        // In real implementation, would check against NPCI or database
        // For now, return mock response
        return ResponseEntity.ok(new UpiVerificationResponse(
                true, "upi-id-here", "John Doe", "HDFC Bank", true, 85
        ));
    }

    @GetMapping("/all")
    public ResponseEntity<List<Contact>> getAllContacts() {
        return ResponseEntity.ok(contactRepository.findAll());
    }

    @GetMapping("/scammers")
    public ResponseEntity<List<Contact>> getScammers() {
        return ResponseEntity.ok(contactRepository.findByIsScammerTrue());
    }

    // DTOs
    public static class ContactSearchResponse {
        private boolean found;
        private String message;
        private String phone;
        private String name;
        private String upiId;
        private String bank;
        private int trustScore;
        private boolean verified;

        public ContactSearchResponse(boolean found, String message, String phone, String name, String upiId, String bank, int trustScore, boolean verified) {
            this.found = found;
            this.message = message;
            this.phone = phone;
            this.name = name;
            this.upiId = upiId;
            this.bank = bank;
            this.trustScore = trustScore;
            this.verified = verified;
        }

        public boolean isFound() { return found; }
        public String getMessage() { return message; }
        public String getPhone() { return phone; }
        public String getName() { return name; }
        public String getUpiId() { return upiId; }
        public String getBank() { return bank; }
        public int getTrustScore() { return trustScore; }
        public boolean isVerified() { return verified; }
    }

    public static class UpiVerificationResponse {
        private boolean valid;
        private String upiId;
        private String name;
        private String bank;
        private boolean isVerified;
        private int trustScore;

        public UpiVerificationResponse(boolean valid, String upiId, String name, String bank, boolean isVerified, int trustScore) {
            this.valid = valid;
            this.upiId = upiId;
            this.name = name;
            this.bank = bank;
            this.isVerified = isVerified;
            this.trustScore = trustScore;
        }

        public boolean isValid() { return valid; }
        public String getUpiId() { return upiId; }
        public String getName() { return name; }
        public String getBank() { return bank; }
        public boolean isVerified() { return isVerified; }
        public int getTrustScore() { return trustScore; }
    }
}