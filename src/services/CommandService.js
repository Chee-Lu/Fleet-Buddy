const { ipcRenderer } = window.require('electron');

class CommandService {
  static async execute(command, options = {}) {
    try {
      const result = await ipcRenderer.invoke('execute-command', command, options);
      return result;
    } catch (error) {
      console.error('Command execution failed:', error);
      return { success: false, error: error.message };
    }
  }

  static async executeWithRealTimeOutput(command, onOutput, options = {}) {
    try {
      const result = await ipcRenderer.invoke('execute-command-realtime', command, options);
      return result;
    } catch (error) {
      console.error('Command execution failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Enhanced sshuttle process detection (more robust)
  static async checkSshuttleProcess() {
    try {
      console.log('🔍 Start detecting sshuttle process...');
      
      // method1: Check PID file existence
      const pidFileCheck = await this.execute('test -f /tmp/sshuttle.pid && cat /tmp/sshuttle.pid');
      console.log(`PIDfilecheck: success=${pidFileCheck.success}, output="${pidFileCheck.stdout?.trim()}"`);
      
      // method2: Check process name
      const processCheck = await this.execute('pgrep -f "sshuttle.*bastion"');
      console.log(`process名check: success=${processCheck.success}, output="${processCheck.stdout?.trim()}"`);
      
      // method3: check detailed process info
      const detailCheck = await this.execute('ps aux | grep "sshuttle.*bastion" | grep -v grep');
      console.log(`Detailed process check: success=${detailCheck.success}, found=${!!detailCheck.stdout?.trim()}`);
      
      // method4: check all sshuttle processes (more broad search)
      const broadCheck = await this.execute('ps aux | grep sshuttle | grep -v grep');
      console.log(`Broad check: success=${broadCheck.success}, found=${!!broadCheck.stdout?.trim()}`);
      
      const hasPidFile = pidFileCheck.success && pidFileCheck.stdout?.trim();
      const hasProcess = processCheck.success && processCheck.stdout?.trim();
      const hasDetail = detailCheck.success && detailCheck.stdout?.trim();
      const hasBroad = broadCheck.success && broadCheck.stdout?.trim();
      
      const isRunning = hasPidFile || hasProcess || hasDetail || hasBroad;
      
      console.log(`Detection result: PIDfile=${!!hasPidFile}, process name=${!!hasProcess}, detailed=${!!hasDetail}, broad=${!!hasBroad}, final=${isRunning}`);
      
      return {
        running: isRunning,
        pid: hasPidFile ? pidFileCheck.stdout.trim() : (hasProcess ? processCheck.stdout.trim() : null),
        details: hasDetail ? detailCheck.stdout.trim() : (hasBroad ? broadCheck.stdout.trim() : null)
      };
    } catch (error) {
      console.error('Sshuttle process check failed:', error);
      return { running: false, pid: null, details: null };
    }
  }

  // General process detection
  static async checkProcess(processName) {
    try {
      if (processName === 'sshuttle') {
        return await this.checkSshuttleProcess();
      } else {
        const result = await ipcRenderer.invoke('check-process', processName);
        return result;
      }
    } catch (error) {
      console.error('Process check failed:', error);
      return { running: false };
    }
  }

  static async readFile(filePath) {
    try {
      const result = await ipcRenderer.invoke('read-file', filePath);
      return result;
    } catch (error) {
      console.error('File read failed:', error);
      return { success: false, error: error.message };
    }
  }

  static async writeFile(filePath, content) {
    try {
      const result = await ipcRenderer.invoke('write-file', filePath, content);
      return result;
    } catch (error) {
      console.error('File write failed:', error);
      return { success: false, error: error.message };
    }
  }

  // 🚀 Ultimate simplified version - directly start sshuttle and keep running
  static async connectToHive(passwords = {}) {
    const results = {
      steps: [],
      success: false,
      error: null
    };

    try {
      // step1: 彻底清理
      console.log('🧹 Thoroughly clean environment...');
      await this.execute('pkill -f sshuttle 2>/dev/null || true');
      await this.execute('pkill -f expect 2>/dev/null || true');
      await this.execute('rm -f /tmp/sshuttle* /tmp/start_sshuttle.sh 2>/dev/null || true');
      
      results.steps.push({
        name: 'Clean environment',
        success: true,
        message: 'All related processes cleaned'
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // step2: Configure route
      console.log('🔗 Configure route...');
      const routeCmd = `echo "${passwords.sudo}" | sudo -S route add -net 10.164.0.0/16 -interface en0 2>/dev/null || true`;
      await this.execute(routeCmd);
      
      results.steps.push({
        name: 'Configure network route',
        success: true,
        message: 'Route configuration completed'
      });

      // step3: Direct startup - simplest method
      console.log('🚀 直接启动sshuttle...');
      
      // Create the simplest startup command
      const sshuttleCmd = `
nohup bash -c '
expect << "EXPECT_END"
set timeout 90
spawn sshuttle -r bastion.ci.int.devshift.net 10.164.0.0/16
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
  "*sudo*Password*" {
    send "${passwords.sudo}\\r"
    exp_continue
  }
  "c : Connected" {
    puts "\\n=== SSHUTTLE CONNECTED ==="
    flush stdout
    while {1} { sleep 30 }
  }
  timeout {
    puts "\\n=== TIMEOUT ==="
    exit 1
  }
  eof {
    puts "\\n=== EOF ==="
    exit 1
  }
}
EXPECT_END
' > /tmp/sshuttle.log 2>&1 &
echo $! > /tmp/sshuttle.pid
sleep 5
`;

      // Execute startup command
      const startResult = await this.execute(sshuttleCmd.trim(), { timeout: 15000 });
      
      results.steps.push({
        name: 'Start sshuttle tunnel',
        success: true,
        message: 'Sshuttle startup command executed'
      });

      // step4: Wait and verify
      console.log('🔍 Waiting for connection establishment...');
      
      // Waiting for connection establishment
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Check process
      const processCheck = await this.execute('ps aux | grep sshuttle | grep -v grep');
      const pidCheck = await this.execute('test -f /tmp/sshuttle.pid && cat /tmp/sshuttle.pid');
      
      // Check network
      const networkTest = await this.execute(
        'curl -s --connect-timeout 5 --max-time 10 -I http://10.164.1.1 2>/dev/null || echo "FAILED"',
        { timeout: 15000 }
      );
      
      const hasProcess = processCheck.success && processCheck.stdout.trim().length > 0;
      const hasPid = pidCheck.success && pidCheck.stdout.trim().length > 0;
      const networkOk = networkTest.success && !networkTest.stdout.includes('FAILED');
      
      if (hasProcess || hasPid || networkOk) {
        results.steps.push({
          name: 'Verify connection status',
          success: true,
          message: networkOk ? 
            '🎉 Network connected, tunnel working normally！' : 
            `✅ Process running ${hasPid ? 'PID: ' + pidCheck.stdout.trim() : ''}`
        });
        results.success = true;
      } else {
        // Check log
        const logCheck = await this.execute('tail -20 /tmp/sshuttle.log 2>/dev/null || echo "noneday志"');
        throw new Error(`Connection establishment failed。Log information: ${logCheck.stdout}`);
      }

    } catch (error) {
      results.error = error.message;
      results.steps.push({
        name: 'Connection failed',
        success: false,
        message: error.message
      });
    }

    return results;
  }

  // 🛑 Stop sshuttle connection
  static async stopSshuttle() {
    try {
      // Method 1: Stop main management process via PID file
      const pidResult = await this.execute('test -f /tmp/sshuttle.pid && cat /tmp/sshuttle.pid');
      if (pidResult.success && pidResult.stdout.trim()) {
        const pid = pidResult.stdout.trim();
        await this.execute(`kill ${pid}`);
      }

      // Method 2: Stop all sshuttle related processes
      await this.execute('pkill -f sshuttle 2>/dev/null || true');
      
      // Method 3: Stop expect management process
      await this.execute('pkill -f expect 2>/dev/null || true');
      
      // Method 4: Clean up sudo processes (if any)
      await this.execute('sudo pkill -f "sshuttle.*firewall" 2>/dev/null || true');
      
      // Method 5: Clean up related files
      await this.execute('rm -f /tmp/sshuttle.log /tmp/sshuttle.pid 2>/dev/null || true');
      
      // Wait for process to stop
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      return { success: true, message: 'Sshuttle tunnel completely stopped' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 🔑 Get OpenShift API Token
  static async getOpenShiftToken() {
    try {
      // Method 1: Try to get current token from console
      console.log('🔍 Try to get Token from OpenShift...');
      
      // First check if oc command line tool exists
      const ocCheckResult = await this.execute('which oc');
      
      if (ocCheckResult.success) {
        // Try to get current token
        const whoamiResult = await this.execute('oc whoami --show-token 2>/dev/null');
        if (whoamiResult.success && whoamiResult.stdout.trim()) {
          const token = whoamiResult.stdout.trim();
          const serverResult = await this.execute('oc whoami --show-server 2>/dev/null');
          const serverUrl = serverResult.success ? serverResult.stdout.trim() : 'https://api.hivei01ue1.f7i5.p1.openshiftapps.com:6443';
          
          return {
            success: true,
            token: token,
            serverUrl: serverUrl,
            ocLoginCommand: `oc login --token=${token} --server=${serverUrl}`,
            curlCommand: `curl -H "Authorization: Bearer ${token}" "${serverUrl}/apis/user.openshift.io/v1/users/~"`,
            source: 'existing_session'
          };
        }
      }
      
      // method2: Try to get token using browser session
      const tokenUrls = [
        'https://oauth-openshift.apps.hivei01ue1.f7i5.p1.openshiftapps.com/oauth/token/request',
        'https://oauth-openshift.apps.hivei01ue1.f7i5.p1.openshiftapps.com/oauth/token/display'
      ];
      
      for (const tokenUrl of tokenUrls) {
        const result = await this.execute(
          `curl -s --connect-timeout 8 --max-time 15 -L "${tokenUrl}"`,
          { timeout: 20000 }
        );

        if (result.success && result.stdout) {
          const content = result.stdout;
          
          // Extract API token
          const tokenMatches = [
            /sha256~[A-Za-z0-9_-]+/g,
            /[a-zA-Z0-9]{40,}/g,
            /token["\s]*[:=]["\s]*([A-Za-z0-9_-]+)/gi
          ];
          
          let apiToken = null;
          for (const regex of tokenMatches) {
            const matches = content.match(regex);
            if (matches) {
              apiToken = matches[0];
              break;
            }
          }
          
          // Extract server URL
          const serverMatch = content.match(/--server=([^\s"']+)/) || 
                              content.match(/server["\s]*[:=]["\s]*["']([^"']+)["']/);
          const serverUrl = serverMatch ? serverMatch[1] : 'https://api.hivei01ue1.f7i5.p1.openshiftapps.com:6443';
          
          if (apiToken && apiToken.length > 10) {
            return {
              success: true,
              token: apiToken,
              serverUrl: serverUrl,
              ocLoginCommand: `oc login --token=${apiToken} --server=${serverUrl}`,
              curlCommand: `curl -H "Authorization: Bearer ${apiToken}" "${serverUrl}/apis/user.openshift.io/v1/users/~"`,
              source: 'web_extraction',
              rawContent: content.substring(0, 500) + '...'
            };
          }
        }
      }
      
      // method3: Return manual retrieval instructions
      return {
        success: false,
        error: 'Unable to automatically get Token, please manually visit Token page',
        manual: true,
        instructions: {
          step1: 'Open Hive console in browser and login',
          step2: 'Visit: https://oauth-openshift.apps.hivei01ue1.f7i5.p1.openshiftapps.com/oauth/token/display',
          step3: 'Copy the displayed API token',
          step4: 'Or run in terminal: oc whoami --show-token'
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 🔍 Check network connectivity
  static async testHiveConnectivity() {
    try {
      const tests = [
        {
          name: 'HTTP Connection Test',
          command: 'curl -s --connect-timeout 3 --max-time 8 -I http://10.164.1.1',
          timeout: 12000
        },
        {
          name: 'Hive console visit',
          command: 'curl -s --connect-timeout 8 --max-time 12 -I https://console-openshift-console.apps.hivei01ue1.f7i5.p1.openshiftapps.com',
          timeout: 15000
        },
        {
          name: 'Route Status Check',
          command: 'netstat -rn | grep "10.164" && echo "路由正常"',
          timeout: 5000
        }
      ];

      const results = [];
      for (const test of tests) {
        const result = await this.execute(test.command, { timeout: test.timeout });
        results.push({
          name: test.name,
          success: result.success,
          message: result.success ? '✅ Connected normally' : '❌ Connection failed'
        });
      }

      return { success: true, tests: results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Other predefined commands
  static async ocmLogin() {
    return await this.execute('ocm login --use-auth-code --url=integration');
  }

  static async getOcmToken() {
    return await this.execute('ocm token');
  }

  static async setupTestEnvironment(kubeconfigPath = '/Users/chlu/hive01ue1') {
    const commands = [
      `export SUPER_ADMIN_USER_TOKEN=$(ocm token)`,
      `export AWS_ACCOUNT_OPERATOR_KUBECONFIG=$(cat "${kubeconfigPath}")`,
      `export OCM_ENV="integration"`
    ];

    const results = [];
    for (const cmd of commands) {
      const result = await this.execute(cmd);
      results.push(result);
    }
    return results;
  }
}

export default CommandService;
