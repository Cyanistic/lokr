<div align="center">
<img src="client/public/lokr.png" height="256" width="196" alt-text="lokr-icon">

**Lokr - Secure and Private File Sharing for the Modern Web**

[Features](#features) •
[Getting Started](#getting-started) •
[Installation](#installation) •
[Storage](#storage) •
[Contributing](#contributing)

</div>

## Overview

Lokr is a state-of-the-art file sharing application designed with user privacy and security as top priorities. By leveraging robust end-to-end encryption and strict access controls, Lokr ensures that only authorized users can view or download files, protecting your sensitive data from unauthorized access.

## Features

Lokr is engineered to offer a secure and privacy-focused file-sharing experience. Below are the key features that make Lokr stand out:

### Secure File Upload & Storage
- **End-to-End Encryption:**  
  Every file uploaded to Lokr is completely encrypted from the moment it leaves your device until it reaches the recipient. This includes not only the file content but also any personally identifiable metadata, ensuring comprehensive data protection even if the server is compromised.

- **Dual Upload Options:**  
  - **Account-Based Uploads:**  
    Registered users can upload files into their personal accounts, which are organized into a virtual file hierarchy for easy management and retrieval.
  - **Anonymous Uploads:**  
    Users without an account can still benefit from Lokr by uploading files anonymously. These files are stored temporarily and can be accessed via a unique, secure link.

### Flexible File Sharing
- **Multiple Sharing Methods:**  
  Lokr provides versatile options for sharing files:
  - **Direct Sharing:**  
    Share files directly with other registered users using their username.
  - **Link Sharing:**  
    Generate a secure link that can be shared with anyone. Recipients can access the file through their browser without needing an account.

- **Granular Permission Controls:**  
  When sharing files, users have the ability to:
  - **Restrict Permissions:**  
    Choose whether recipients can only view or also edit the files.
  - **Time-Limited Access:**  
    Set expiration dates for shared links, ensuring that access is restricted to a specific timeframe.

### Advanced Account Security
- **Minimal Information Requirement:**  
  Registration with Lokr requires only a username and password, minimizing the amount of personal data required and preserving your anonymity.
  
- **Two-Factor Authentication (2FA):**  
  Enhance account security with Time-based One-Time Password (TOTP) codes. This extra layer of protection ensures that even if a password is compromised, unauthorized access remains blocked.

### Robust Technology & User Experience
- **High-Performance Backend:**  
  Lokr’s backend is built with Rust and SQLite, ensuring fast and secure processing of user authentication, encrypted file storage, and data management.

- **Modern & Interactive Frontend:**  
  The frontend is developed using React with TypeScript and enhanced with Material UI, resulting in a user-friendly and visually appealing interface for file management and profile customization.

### Strict Verification & Access Control
- **Stringent Access Controls:**  
  Only authorized users can download files, ensuring that sensitive data is accessible solely to those with the appropriate permissions.
  
- **Uncompromising Security Philosophy:**  
  Lokr's security model is designed with the understanding that the integrity of the system relies on protecting user credentials. Even if a password is compromised, robust encryption prevents attackers from decrypting and accessing user data.

Lokr combines state-of-the-art encryption, flexible sharing options, and a minimalist registration process to provide a secure, convenient, and private file sharing solution for the modern internet.

## Getting Started

You can start using **Lokr** right away by visiting the live instance **[lokr.cyanistic.com](https://lokr.cyanistic.com)**.

This instance is fully functional and allows you to:
- Upload and share files securely
- Register an account or use the anonymous upload option
- Explore the features described in this README

If you prefer to host your own private instance of Lokr, continue to the [Installation](#installation) section for setup instructions.
  
## Installation
To build project you must have [cargo](https://www.rust-lang.org/tools/install) and [node](https://nodejs.org/en) installed on your system.
1. Clone the repo locally
```sh
git clone https://github.com/Cyanistic/lokr.git
cd lokr
```
2. Build the backend with cargo
```sh
cd api
cargo b -r
```
3. Build the frontend with vite/npm
```sh
cd ../client
npm i
npm run build
```
4. Start up the backend server
```sh
cd ../api
cargo r -r
```
5. Visit `https://localhost:6969` in your browser

## Storage
All of the data of the application is stored inside the `lokr-api` folder inside the default data path for your platform. The chart below provides examples for where you should look based on your operating system.
| Platform | Value                                                            | Example                                                          |
| -------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Linux    | `$XDG_DATA_HOME` or `$HOME`/.local/share/lokr-api | /home/alice/.local/share/lokr-api                 |
| macOS    | `$HOME`/Library/Application Support/lokr-api      | /Users/Alice/Library/Application Support/lokr-api |
| Windows  | `{FOLDERID_RoamingAppData}`\lokr-api              | C:\Users\Alice\AppData\Roaming\lokr-api           |

## Contributing

We welcome contributions from the community! If you'd like to help improve Lokr, please follow these guidelines:

1. Fork the repository.
2. Create a feature branch:
```sh
git checkout -b feature/YourFeatureName
```
3. Commit your changes with clear descriptions.
4. Push your branch to GitHub:
```sh
git push origin feature/YourFeatureName
```
5. Open a pull request detailing your changes.


## License
This project is licensed under the AGPL-3.0 License. See the LICENSE file for details.
