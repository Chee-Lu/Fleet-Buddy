# 🚀 Fleet Buddy

OSD Fleet Manager Development Toolkit - Desktop application to streamline daily development workflows

## ✨ Features

- 🔗 **One-Click Hive Connection**: Automated route configuration and sshuttle tunneling
- ⚙️ **Test Environment Setup**: Automatic environment variable and kubeconfig configuration
- 🔄 **OCM Token Management**: Automatic OCM token refresh
- 📊 **Real-time Status Monitoring**: Display connection and process status
- 🛠️ **Custom Commands**: Execute arbitrary shell commands
- 📝 **Operation Logs**: Record all operations and results

## 🚀 Quick Start

We provide two versions for you to choose from:

### Option 1: Electron Full Version (Recommended for complete functionality)

**Features:**
- 🖥️ Complete desktop GUI interface
- 📋 Menu bar quick access
- 📊 Real-time status monitoring
- 📝 Detailed logging

**Installation & Running:**
```bash
# Install dependencies
npm install

# Run in development mode
npm run electron-dev

# Build standalone application
npm run electron-pack
```

### Option 2: Python rumps Lightweight Version (Recommended for rapid prototyping)

**Features:**
- 📋 Pure menu bar application
- ⚡ Ultra-fast startup with minimal resource usage
- 🎯 Focus on core functionality
- 🔔 System notifications

**Installation & Running:**
```bash
# Install Python dependencies
./setup_rumps.sh

# Run menu bar application
python3 fleet_buddy_rumps.py
```

### Hybrid Usage (Best Experience)

You can run both versions simultaneously:
- **Electron version**: For detailed configuration and status viewing
- **rumps version**: For daily quick operations

## 🔧 Main Functions

### 1. Hive Connection
- Automatic network route configuration (`sudo route add -net 10.164.0.0/16 -interface en0`)
- Start sshuttle tunnel (`sshuttle -r bastion.ci.int.devshift.net 10.164.0.0/16`)
- Provide Hive console links

### 2. Test Environment Configuration
- Set `SUPER_ADMIN_USER_TOKEN`
- Configure `AWS_ACCOUNT_OPERATOR_KUBECONFIG`
- Set `OCM_ENV="integration"`

### 3. OCM Management
- Automatic OCM login (`ocm login --use-auth-code --url=integration`)
- Refresh token (`ocm token`)
- Check login status

### 4. Status Monitoring
- Real-time Hive connection status display
- Monitor sshuttle processes
- Check OCM login status
- Verify kubeconfig files

## 📁 Project Structure

```
Fleet-Buddy/
├── public/
│   ├── electron.js          # Electron main process
│   └── index.html          # HTML template
├── src/
│   ├── App.js              # Main application component
│   ├── index.js            # React entry point
│   ├── index.css           # Global styles
│   └── services/
│       └── CommandService.js # Command execution service
├── package.json
└── README.md
```

## 🛠️ Tech Stack

- **Electron**: Desktop application framework
- **React**: Frontend UI framework
- **Material-UI**: UI component library
- **Node.js**: Backend command execution

## ⚠️ Important Notes

1. **Permission Requirements**: Some commands require sudo privileges
2. **Network Configuration**: Ensure access to Red Hat internal network
3. **Dependencies**: Pre-install required tools like `ocm`, `sshuttle`, etc.
4. **Kubeconfig**: Ensure correct kubeconfig file path

## 🔗 Related Links

- [Red Hat Console Token](https://console.redhat.com/openshift/token)
- [Hive Console](https://console-openshift-console.apps.hive01ue1.f7i5.p1.openshiftapps.com/dashboards)

## 🤝 Contributing

Issues and Pull Requests are welcome to improve this tool!

---

*Crafted with ❤️ for the OSD Fleet Manager development team*
