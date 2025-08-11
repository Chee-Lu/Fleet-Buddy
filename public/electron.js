const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

let mainWindow;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false
    },
    icon: path.join(__dirname, 'icon.png'),
    titleBarStyle: 'default', // Use default title bar, ensure draggable
    title: '🚀 Fleet Buddy - OSD Toolset',
    show: false // Initially hidden, controlled via menu bar
  });

  const isDev = !app.isPackaged;
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    // 开发模式下canopen开发者工具
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }

  // window准备好后show
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // close到托盘而不isexit
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // createTray icon（使用简单的emojiicon）
  const icon = nativeImage.createFromNamedImage('NSComputer');
  tray = new Tray(icon);
  
  // 托盘hint
  tray.setToolTip('Fleet Buddy - OSD Toolset');
  
  // createTray menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🚀 Fleet Buddy',
      enabled: false
    },
    { type: 'separator' },
    {
      label: '📊 show主界面',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: '🔗 快速connectionHive',
      click: async () => {
        const result = await executeCommand('sudo route add -net 10.164.0.0/16 -interface en0 && nohup sshuttle -r bastion.ci.int.devshift.net 10.164.0.0/16 > /dev/null 2>&1 &');
        showNotification('Hiveconnection', result.success ? 'connectionsuccessful！' : 'connectionfailed');
      }
    },
    {
      label: '🔄 refreshOCM Token',
      click: async () => {
        const result = await executeCommand('ocm token');
        showNotification('OCM Token', result.success ? 'Token已refresh' : 'refreshfailed');
      }
    },
    {
      label: '⚙️ configuretest环境',
      click: async () => {
        const commands = [
          'export SUPER_ADMIN_USER_TOKEN=$(ocm token)',
          'export AWS_ACCOUNT_OPERATOR_KUBECONFIG=$(cat "/Users/chlu/hive01ue1")',
          'export OCM_ENV="integration"'
        ];
        let success = true;
        for (const cmd of commands) {
          const result = await executeCommand(cmd);
          if (!result.success) {
            success = false;
            break;
          }
        }
        showNotification('test环境', success ? 'configurefinish！' : 'configurefailed');
      }
    },
    { type: 'separator' },
    {
      label: '🌐 openHive控制台',
      click: () => {
        require('electron').shell.openExternal('https://console-openshift-console.apps.hive01ue1.f7i5.p1.openshiftapps.com/dashboards');
      }
    },
    {
      label: '🔑 获取Red Hat Token',
      click: () => {
        require('electron').shell.openExternal('https://console.redhat.com/openshift/token');
      }
    },
    { type: 'separator' },
    {
      label: '🚪 exit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // 点击Tray iconshow/hide主window
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });
}

// Execute command的辅助function
async function executeCommand(command) {
  return new Promise((resolve) => {
    exec(command, { shell: '/bin/zsh' }, (error, stdout, stderr) => {
      resolve({ 
        success: !error, 
        stdout: stdout || '', 
        stderr: stderr || '',
        error: error ? error.message : null
      });
    });
  });
}

// showsystem通知
function showNotification(title, body) {
  new Notification(title, {
    body: body,
    icon: path.join(__dirname, 'icon.png')
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', (e) => {
  // 在macOS上，保持application在托盘中running
  if (process.platform !== 'darwin') {
    app.quit();
  }
  e.preventDefault();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Prevent accidental app exit
app.on('before-quit', () => {
  isQuitting = true;
});

// 🌐 Open external links
ipcMain.handle('open-external', async (event, url) => {
  try {
    // Force open in default browser
    await shell.openExternal(url, { activate: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC处理器 - Execute command
ipcMain.handle('execute-command', async (event, command, options = {}) => {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 30000; // 默认30secondTimeout
    
    const child = exec(command, { 
      shell: '/bin/zsh',
      timeout: timeout
    }, (error, stdout, stderr) => {
      if (error) {
        if (error.code === 'ETIMEDOUT') {
          resolve({ success: false, error: `commandexecuteTimeout (${timeout/1000}second)`, stderr });
        } else {
          resolve({ success: false, error: error.message, stderr });
        }
      } else {
        resolve({ success: true, stdout, stderr });
      }
    });

    // 实时output
    if (options.realtime && mainWindow) {
      child.stdout?.on('data', (data) => {
        mainWindow.webContents.send('command-output', { type: 'stdout', data: data.toString() });
      });
      
      child.stderr?.on('data', (data) => {
        mainWindow.webContents.send('command-output', { type: 'stderr', data: data.toString() });
      });
    }
  });
});

// IPC处理器 - 实时Execute command（support自动密码input）
ipcMain.handle('execute-command-realtime', async (event, command, options = {}) => {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 30000;
    const passwords = options.passwords || {};
    let output = '';
    let errorOutput = '';
    
    // 🔥 Improved sshuttle support, using nohup background execution
    if (options.autoAuth && command.includes('sshuttle') && passwords.ssh && passwords.sudo) {
      const { spawn } = require('child_process');
      
      // Use expect script to handle both SSH password and sudo password
      const cleanCommand = command.replace(/'/g, "\\'");
      const expectScript = `
expect << 'EOF'
set timeout ${Math.floor(timeout/1000)}
spawn /bin/zsh -c {${cleanCommand}}
expect {
  "Are you sure you want to continue connecting" {
    send "yes\\r"
    exp_continue
  }
  "Enter passphrase for key" {
    send "${passwords.ssh}\\r"
    exp_continue
  }
  "Password:" {
    send "${passwords.sudo}\\r"
    exp_continue
  }
  "\\[local sudo\\] Password:" {
    send "${passwords.sudo}\\r"
    exp_continue
  }
  "c : Connected" {
    puts "Sshuttle tunnel established"
    exit 0
  }
  "Connected to server" {
    puts "Sshuttle connection successful"
    exit 0
  }
  timeout {
    puts "Connection timeout"
    exit 1
  }
  eof {
    puts "Process completed"
    exit 0
  }
}
EOF
      `.trim();
      
      const child = spawn('/bin/bash', ['-c', expectScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TERM: 'xterm-256color' }
      });

      // 处理output
      child.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        if (mainWindow) {
          mainWindow.webContents.send('command-output', { type: 'stdout', data: text });
        }
      });
      
      child.stderr?.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        if (mainWindow) {
          mainWindow.webContents.send('command-output', { type: 'stderr', data: text });
        }
      });

      // settingsTimeout
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ success: false, error: `commandexecuteTimeout (${timeout/1000}second)`, stderr: errorOutput });
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ 
          success: code === 0 || code === null, // daemonprocessmay在后台running
          stdout: output, 
          stderr: errorOutput,
          exitCode: code
        });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({ success: false, error: error.message, stderr: errorOutput });
      });
      
      return;
    }
    
    // 对于sudocommand，使用-S标志和stdin直接提供密码
    if (options.autoAuth && passwords.sudo && command.includes('sudo') && !command.includes('sshuttle')) {
      const { spawn } = require('child_process');
      
      // 将sudocommand转换为使用-S标志
      const modifiedCommand = command.replace('sudo ', 'sudo -S ');
      
      const child = spawn('/bin/zsh', ['-c', modifiedCommand], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      // 立即向stdinwrite密码
      child.stdin.write(passwords.sudo + '\n');
      child.stdin.end();

      // 处理output
      child.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        if (mainWindow) {
          mainWindow.webContents.send('command-output', { type: 'stdout', data: text });
        }
      });
      
      child.stderr?.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        if (mainWindow) {
          mainWindow.webContents.send('command-output', { type: 'stderr', data: text });
        }
      });

      // settingsTimeout
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ success: false, error: `commandexecuteTimeout (${timeout/1000}second)`, stderr: errorOutput });
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ 
          success: code === 0, 
          stdout: output, 
          stderr: errorOutput,
          exitCode: code
        });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({ success: false, error: error.message, stderr: errorOutput });
      });
      
      return;
    }
    
    // 对于其他command，使用普通method
    const { spawn } = require('child_process');
    const child = spawn('/bin/zsh', ['-c', command], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    // 处理stdout
    child.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;
      if (mainWindow) {
        mainWindow.webContents.send('command-output', { type: 'stdout', data: text });
      }
    });
    
    // 处理stderr
    child.stderr?.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      if (mainWindow) {
        mainWindow.webContents.send('command-output', { type: 'stderr', data: text });
      }
    });

    // settingsTimeout
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ success: false, error: `commandexecuteTimeout (${timeout/1000}second)`, stderr: errorOutput });
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ 
        success: code === 0, 
        stdout: output, 
        stderr: errorOutput,
        exitCode: code
      });
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ success: false, error: error.message, stderr: errorOutput });
    });
  });
});

// IPC处理器 - Check process status
ipcMain.handle('check-process', async (event, processName) => {
  return new Promise((resolve, reject) => {
    exec(`pgrep -f "${processName}"`, (error, stdout, stderr) => {
      resolve({ running: !error && stdout.trim() !== '' });
    });
  });
});

// IPC处理器 - readfile
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC处理器 - writefile
ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
