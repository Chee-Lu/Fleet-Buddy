const { ipcRenderer } = window.require('electron');

class CommandService {
  static async execute(command) {
    try {
      const result = await ipcRenderer.invoke('execute-command', command);
      return result;
    } catch (error) {
      console.error('Command execution failed:', error);
      return { success: false, error: error.message };
    }
  }

  static async checkProcess(processName) {
    try {
      const result = await ipcRenderer.invoke('check-process', processName);
      return result;
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

  // 预定义的常用命令
  static async connectToHive() {
    const commands = [
      'sudo route add -net 10.164.0.0/16 -interface en0',
      'nohup sshuttle -r bastion.ci.int.devshift.net 10.164.0.0/16 > /dev/null 2>&1 &'
    ];

    const results = [];
    for (const cmd of commands) {
      const result = await this.execute(cmd);
      results.push(result);
      if (!result.success) {
        break;
      }
    }
    return results;
  }

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

  static async killSshuttle() {
    return await this.execute('pkill -f sshuttle');
  }
}

export default CommandService;
