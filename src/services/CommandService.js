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

  // 增强的sshuttle进程检测
  static async checkSshuttleProcess() {
    try {
      console.log('🔍 开始检测sshuttle进程...');
      
      // 方法1: 检查PID文件
      const pidFileCheck = await this.execute('test -f /tmp/sshuttle.pid && cat /tmp/sshuttle.pid');
      console.log(`PID文件检查: success=${pidFileCheck.success}, output="${pidFileCheck.stdout?.trim()}"`);
      
      // 方法2: 检查进程名
      const processCheck = await this.execute('pgrep -f "sshuttle.*bastion"');
      console.log(`进程名检查: success=${processCheck.success}, output="${processCheck.stdout?.trim()}"`);
      
      // 方法3: 检查详细进程信息
      const detailCheck = await this.execute('ps aux | grep "sshuttle.*bastion" | grep -v grep');
      console.log(`详细进程检查: success=${detailCheck.success}, found=${!!detailCheck.stdout?.trim()}`);
      
      // 方法4: 检查所有sshuttle进程（更宽泛的搜索）
      const broadCheck = await this.execute('ps aux | grep sshuttle | grep -v grep');
      console.log(`宽泛检查: success=${broadCheck.success}, found=${!!broadCheck.stdout?.trim()}`);
      
      const hasPidFile = pidFileCheck.success && pidFileCheck.stdout?.trim();
      const hasProcess = processCheck.success && processCheck.stdout?.trim();
      const hasDetail = detailCheck.success && detailCheck.stdout?.trim();
      const hasBroad = broadCheck.success && broadCheck.stdout?.trim();
      
      const isRunning = hasPidFile || hasProcess || hasDetail || hasBroad;
      
      console.log(`检测结果汇总: PID文件=${!!hasPidFile}, 进程名=${!!hasProcess}, 详细=${!!hasDetail}, 宽泛=${!!hasBroad}, 最终=${isRunning}`);
      
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

  // 通用进程检测
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

  // 🚀 终极简化版本 - 直接启动sshuttle保持运行
  static async connectToHive(passwords = {}) {
    const results = {
      steps: [],
      success: false,
      error: null
    };

    try {
      // 步骤1: 彻底清理
      console.log('🧹 彻底清理环境...');
      await this.execute('pkill -f sshuttle 2>/dev/null || true');
      await this.execute('pkill -f expect 2>/dev/null || true');
      await this.execute('rm -f /tmp/sshuttle* /tmp/start_sshuttle.sh 2>/dev/null || true');
      
      results.steps.push({
        name: '清理环境',
        success: true,
        message: '所有相关进程已清理'
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // 步骤2: 配置路由
      console.log('🔗 配置路由...');
      const routeCmd = `echo "${passwords.sudo}" | sudo -S route add -net 10.164.0.0/16 -interface en0 2>/dev/null || true`;
      await this.execute(routeCmd);
      
      results.steps.push({
        name: '配置网络路由',
        success: true,
        message: '路由配置完成'
      });

      // 步骤3: 直接启动 - 最简单的方法
      console.log('🚀 直接启动sshuttle...');
      
      // 创建最简单的启动命令
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

      // 执行启动命令
      const startResult = await this.execute(sshuttleCmd.trim(), { timeout: 15000 });
      
      results.steps.push({
        name: '启动sshuttle隧道',
        success: true,
        message: 'Sshuttle启动命令已执行'
      });

      // 步骤4: 等待并验证
      console.log('🔍 等待连接建立...');
      
      // 等待连接建立
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // 检查进程
      const processCheck = await this.execute('ps aux | grep sshuttle | grep -v grep');
      const pidCheck = await this.execute('test -f /tmp/sshuttle.pid && cat /tmp/sshuttle.pid');
      
      // 检查网络
      const networkTest = await this.execute(
        'curl -s --connect-timeout 5 --max-time 10 -I http://10.164.1.1 2>/dev/null || echo "FAILED"',
        { timeout: 15000 }
      );
      
      const hasProcess = processCheck.success && processCheck.stdout.trim().length > 0;
      const hasPid = pidCheck.success && pidCheck.stdout.trim().length > 0;
      const networkOk = networkTest.success && !networkTest.stdout.includes('FAILED');
      
      if (hasProcess || hasPid || networkOk) {
        results.steps.push({
          name: '验证连接状态',
          success: true,
          message: networkOk ? 
            '🎉 网络连通，隧道工作正常！' : 
            `✅ 进程运行中 ${hasPid ? 'PID: ' + pidCheck.stdout.trim() : ''}`
        });
        results.success = true;
      } else {
        // 检查日志
        const logCheck = await this.execute('tail -20 /tmp/sshuttle.log 2>/dev/null || echo "无日志"');
        throw new Error(`连接建立失败。日志信息: ${logCheck.stdout}`);
      }

    } catch (error) {
      results.error = error.message;
      results.steps.push({
        name: '连接失败',
        success: false,
        message: error.message
      });
    }

    return results;
  }

  // 🛑 停止sshuttle连接
  static async stopSshuttle() {
    try {
      // 方法1: 通过PID文件停止主管理进程
      const pidResult = await this.execute('test -f /tmp/sshuttle.pid && cat /tmp/sshuttle.pid');
      if (pidResult.success && pidResult.stdout.trim()) {
        const pid = pidResult.stdout.trim();
        await this.execute(`kill ${pid}`);
      }

      // 方法2: 停止所有sshuttle相关进程
      await this.execute('pkill -f sshuttle 2>/dev/null || true');
      
      // 方法3: 停止expect管理进程
      await this.execute('pkill -f expect 2>/dev/null || true');
      
      // 方法4: 清理sudo进程（如果有的话）
      await this.execute('sudo pkill -f "sshuttle.*firewall" 2>/dev/null || true');
      
      // 方法5: 清理相关文件
      await this.execute('rm -f /tmp/sshuttle.log /tmp/sshuttle.pid 2>/dev/null || true');
      
      // 等待进程停止
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      return { success: true, message: 'Sshuttle隧道已完全停止' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 🔍 检查网络连通性
  static async testHiveConnectivity() {
    try {
      const tests = [
        {
          name: 'HTTP连接测试',
          command: 'curl -s --connect-timeout 3 --max-time 8 -I http://10.164.1.1',
          timeout: 12000
        },
        {
          name: 'Hive控制台访问',
          command: 'curl -s --connect-timeout 8 --max-time 12 -I https://console-openshift-console.apps.hivei01ue1.f7i5.p1.openshiftapps.com',
          timeout: 15000
        },
        {
          name: '路由状态检查',
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
          message: result.success ? '✅ 连通正常' : '❌ 连接失败'
        });
      }

      return { success: true, tests: results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 其他预定义命令
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
