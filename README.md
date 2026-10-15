Act as a senior frontend developer and professional UI/UX designer. Update my existing open-source project **FISOMOVIE PLAYER** with a polished, user-friendly donation section.

**GitHub:** https://github.com/fiso420/fisomovie-player

### 1. Donation section design
Create a premium “Buy Me a Coffee ☕” section using the existing website design:
- iOS-inspired Liquid Glass UI.
- Dark and light theme compatibility.
- Responsive layout for mobile, tablet, and desktop.
- Attractive coffee icon, subtle animations, and clean typography.
- A friendly message thanking users for supporting open-source development.
- Make donations completely optional. Never restrict player features.

### 2. WebMoney wallet information
Use the following public wallet information from my wallet screenshot:

- Payment service: WebMoney
- Wallet type shown: WMT
- Wallet number: `T668356659070`
- WMID: `625444252474`

Use the WMT wallet number as the proposed receiving identifier only after verifying that it supports incoming payments. Do not use the WMID as a substitute for the wallet number.

### 3. Donation interaction
- Add a “Donate with WebMoney” button only when a verified payment destination or official payment URL is configured.
- If WebMoney provides a supported payment URL, use the real URL rather than inventing one.
- Add a Copy Wallet Number button if the receiving method supports manual transfers.
- Display a confirmation message when the wallet number is copied.
- If a QR code or payment link is available, display it only after its authenticity and destination are verified.
- Never claim a donation was received unless payment confirmation is implemented.
- Never ask visitors for passwords, verification codes, private keys, or sensitive account information.

### 4. Configuration
Create a clearly documented configuration object:

const DONATION_CONFIG = {
  provider: "WebMoney",
  walletType: "WMT",
  walletNumber: "T668356659070",
  wmid: "625444252474",
  paymentUrl: "",
  enabled: false
};

Keep the donation section disabled until I verify the wallet's incoming-payment instructions and configure a valid payment method. Do not invent a payment URL.

### 5. README update
Update `README.md` with:
- Project overview and actual features.
- A Support the Project section.
- WebMoney donation instructions.
- A note that donations are optional.
- Installation and deployment instructions.
- Troubleshooting and contribution guidelines.

Do not invent a license, features, payment confirmation, donation statistics, or supported payment capabilities.

### 6. Code quality
Inspect the existing repository before modifying anything. Preserve working player functionality and existing project architecture. Use the appropriate files for the current stack. Implement secure clipboard handling, accessible controls, mobile responsiveness, and useful error messages.

Provide the complete updated code, list the changed files, and explain how to deploy the result on Vercel or Netlify.

Do not claim that the donation system is operational until the receiving method has been verified and tested.
