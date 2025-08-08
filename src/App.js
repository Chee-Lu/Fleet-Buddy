import React, { useState, useEffect } from 'react';
import {
  Container,
  Grid,
  Card,
  CardContent,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Chip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  Drawer,
  Divider
} from '@mui/material';
import {
  Cloud as CloudIcon,
  Terminal as TerminalIcon,
  Settings as SettingsIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Code as CodeIcon
} from '@mui/icons-material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CommandService from './services/CommandService';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#667eea',
    },
    secondary: {
      main: '#764ba2',
    },
    background: {
      default: 'transparent',
      paper: 'rgba(255, 255, 255, 0.1)',
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        },
      },
    },
  },
});

const App = () => {
  const [status, setStatus] = useState({
    hiveConnected: false,
    sshuttleRunning: false,
    ocmLoggedIn: false,
    hiveKubeconfig: false
  });
  const [loading, setLoading] = useState({});
  const [logs, setLogs] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentCommand, setCurrentCommand] = useState('');
  const [hiveKubeconfigPath, setHiveKubeconfigPath] = useState('/Users/chlu/hive01ue1');
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    checkAllStatus();
    const interval = setInterval(checkAllStatus, 30000); // 每30秒检查一次
    return () => clearInterval(interval);
  }, []);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const checkAllStatus = async () => {
    try {
      // 检查sshuttle进程
      const sshuttleStatus = await CommandService.checkProcess('sshuttle');
      
      // 检查OCM登录状态
      const ocmResult = await CommandService.execute('ocm whoami');
      
      // 检查kubeconfig文件
      const kubeconfigResult = await CommandService.readFile(hiveKubeconfigPath);
      
      setStatus({
        sshuttleRunning: sshuttleStatus.running,
        ocmLoggedIn: ocmResult.success,
        hiveKubeconfig: kubeconfigResult.success,
        hiveConnected: sshuttleStatus.running && ocmResult.success
      });
    } catch (error) {
      console.error('检查状态失败:', error);
    }
  };

  const executeWithLoading = async (key, command, successMessage) => {
    setLoading(prev => ({ ...prev, [key]: true }));
    try {
      const result = await CommandService.execute(command);
      if (result.success) {
        addLog(successMessage, 'success');
      } else {
        addLog(`错误: ${result.error || result.stderr}`, 'error');
      }
      return result;
    } catch (error) {
      addLog(`执行失败: ${error.message}`, 'error');
      return { success: false, error: error.message };
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
      setTimeout(checkAllStatus, 1000);
    }
  };

  const connectToHive = async () => {
    const commands = [
      'sudo route add -net 10.164.0.0/16 -interface en0',
      'nohup sshuttle -r bastion.ci.int.devshift.net 10.164.0.0/16 > /dev/null 2>&1 &'
    ];
    
    for (const cmd of commands) {
      const result = await executeWithLoading('hive', cmd, '正在连接到Hive...');
      if (!result.success) break;
    }
    
    addLog('Hive连接完成！现在可以访问: https://console-openshift-console.apps.hive01ue1.f7i5.p1.openshiftapps.com/dashboards', 'success');
  };

  const setupTestEnvironment = async () => {
    const commands = [
      `export SUPER_ADMIN_USER_TOKEN=$(ocm token)`,
      `export AWS_ACCOUNT_OPERATOR_KUBECONFIG=$(cat "${hiveKubeconfigPath}")`,
      `export OCM_ENV="integration"`
    ];
    
    for (const cmd of commands) {
      await executeWithLoading('testEnv', cmd, '测试环境配置中...');
    }
    
    addLog('测试环境配置完成！', 'success');
  };

  const refreshOcmToken = async () => {
    const result = await executeWithLoading('ocmToken', 'ocm token', 'OCM Token已刷新');
    if (result.success) {
      addLog(`新Token: ${result.stdout.trim()}`, 'info');
    }
  };

  const stopSshuttle = async () => {
    await executeWithLoading('stopSshuttle', 'pkill -f sshuttle', 'Sshuttle进程已停止');
  };

  const openCustomCommand = () => {
    setDialogOpen(true);
  };

  const executeCustomCommand = async () => {
    if (currentCommand.trim()) {
      const result = await CommandService.execute(currentCommand);
      addLog(`执行命令: ${currentCommand}`, 'info');
      if (result.success) {
        addLog(`输出: ${result.stdout}`, 'success');
      } else {
        addLog(`错误: ${result.error || result.stderr}`, 'error');
      }
    }
    setDialogOpen(false);
    setCurrentCommand('');
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const renderHiveTab = () => (
    <>
      {/* Hive连接状态 */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                <CloudIcon color={status.hiveConnected ? 'success' : 'disabled'} />
                <Typography variant="h6">Hive连接状态</Typography>
                {status.hiveConnected ? <CheckIcon color="success" /> : <ErrorIcon color="error" />}
              </Box>
              <Chip 
                label={status.hiveConnected ? '已连接' : '未连接'} 
                color={status.hiveConnected ? 'success' : 'error'} 
                size="small" 
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                <TerminalIcon color={status.sshuttleRunning ? 'success' : 'disabled'} />
                <Typography variant="h6">Sshuttle隧道</Typography>
                {status.sshuttleRunning ? <CheckIcon color="success" /> : <ErrorIcon color="error" />}
              </Box>
              <Chip 
                label={status.sshuttleRunning ? '运行中' : '已停止'} 
                color={status.sshuttleRunning ? 'success' : 'error'} 
                size="small" 
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Hive操作 */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom>🔗 Hive连接操作</Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            <Button
              variant="contained"
              size="large"
              onClick={connectToHive}
              disabled={loading.hive}
              startIcon={loading.hive ? <CircularProgress size={20} /> : <CloudIcon />}
              fullWidth
            >
              {loading.hive ? '连接中...' : '一键连接到Hive'}
            </Button>
            <Button
              variant="outlined"
              onClick={stopSshuttle}
              disabled={loading.stopSshuttle || !status.sshuttleRunning}
              startIcon={loading.stopSshuttle ? <CircularProgress size={20} /> : <StopIcon />}
              fullWidth
            >
              {loading.stopSshuttle ? '停止中...' : '停止Sshuttle'}
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              onClick={() => window.open('https://console-openshift-console.apps.hive01ue1.f7i5.p1.openshiftapps.com/dashboards')}
              startIcon={<CloudIcon />}
              fullWidth
            >
              🌐 打开Hive控制台
            </Button>
          </Box>
        </CardContent>
      </Card>
    </>
  );

  const renderBackendTestTab = () => (
    <>
      {/* Backend测试状态 */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                <SettingsIcon color={status.ocmLoggedIn ? 'success' : 'disabled'} />
                <Typography variant="h6">OCM登录</Typography>
                {status.ocmLoggedIn ? <CheckIcon color="success" /> : <ErrorIcon color="error" />}
              </Box>
              <Chip 
                label={status.ocmLoggedIn ? '已登录' : '未登录'} 
                color={status.ocmLoggedIn ? 'success' : 'error'} 
                size="small" 
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                <CodeIcon color={status.hiveKubeconfig ? 'success' : 'disabled'} />
                <Typography variant="h6">Kubeconfig</Typography>
                {status.hiveKubeconfig ? <CheckIcon color="success" /> : <ErrorIcon color="error" />}
              </Box>
              <Chip 
                label={status.hiveKubeconfig ? '可用' : '不可用'} 
                color={status.hiveKubeconfig ? 'success' : 'error'} 
                size="small" 
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Backend测试操作 */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>⚙️ 环境配置</Typography>
              <Box display="flex" flexDirection="column" gap={2}>
                <Button
                  variant="contained"
                  size="large"
                  onClick={setupTestEnvironment}
                  disabled={loading.testEnv}
                  startIcon={loading.testEnv ? <CircularProgress size={20} /> : <SettingsIcon />}
                  fullWidth
                >
                  {loading.testEnv ? '配置中...' : '配置测试环境'}
                </Button>
                <Button
                  variant="outlined"
                  onClick={refreshOcmToken}
                  disabled={loading.ocmToken}
                  startIcon={loading.ocmToken ? <CircularProgress size={20} /> : <RefreshIcon />}
                  fullWidth
                >
                  {loading.ocmToken ? '刷新中...' : '刷新OCM Token'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>📁 配置管理</Typography>
              <Box display="flex" flexDirection="column" gap={2}>
                <TextField
                  label="Hive Kubeconfig路径"
                  value={hiveKubeconfigPath}
                  onChange={(e) => setHiveKubeconfigPath(e.target.value)}
                  fullWidth
                  size="small"
                />
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={() => window.open('https://console.redhat.com/openshift/token')}
                  startIcon={<CodeIcon />}
                  fullWidth
                >
                  🔑 获取Red Hat Token
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  );

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        {/* 左侧导航栏 */}
        <Box sx={{ 
          width: 280, 
          bgcolor: 'rgba(0,0,0,0.3)', 
          backdropFilter: 'blur(10px)',
          borderRight: '1px solid rgba(255,255,255,0.1)'
        }}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h5" sx={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>
              🚀 Fleet Buddy
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', mt: 1 }}>
              OSD工具集
            </Typography>
          </Box>
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
          <Tabs
            orientation="vertical"
            value={activeTab}
            onChange={handleTabChange}
            sx={{
              '& .MuiTab-root': {
                color: 'rgba(255,255,255,0.7)',
                alignItems: 'flex-start',
                textAlign: 'left',
                minHeight: 60,
                '&.Mui-selected': {
                  color: 'white',
                  bgcolor: 'rgba(255,255,255,0.1)'
                }
              }
            }}
          >
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CloudIcon />
                  <Box>
                    <Typography variant="body1">Hive连接</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>网络连接和隧道</Typography>
                  </Box>
                </Box>
              }
            />
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SettingsIcon />
                  <Box>
                    <Typography variant="body1">Backend Test</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>环境配置和测试</Typography>
                  </Box>
                </Box>
              }
            />
          </Tabs>
        </Box>

        {/* 主内容区域 */}
        <Box sx={{ flex: 1, p: 3 }}>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3, textAlign: 'center' }}>
            💡 提示：关闭窗口后应用会保持在菜单栏运行，右键菜单栏图标可快速访问功能
          </Typography>

          {activeTab === 0 && renderHiveTab()}
          {activeTab === 1 && renderBackendTestTab()}

          {/* 通用操作 */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h5" gutterBottom>🛠️ 自定义操作</Typography>
                  <Box display="flex" gap={2}>
                    <Button
                      variant="contained"
                      onClick={openCustomCommand}
                      startIcon={<TerminalIcon />}
                      fullWidth
                    >
                      执行自定义命令
                    </Button>
                    <Tooltip title="刷新状态">
                      <IconButton onClick={checkAllStatus} color="primary">
                        <RefreshIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

        {/* 日志面板 */}
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>📝 操作日志</Typography>
            <Paper sx={{ maxHeight: 300, overflow: 'auto', bgcolor: 'rgba(0,0,0,0.3)' }}>
              <List dense>
                {logs.slice(-10).map((log, index) => (
                  <ListItem key={index}>
                    <ListItemText
                      primary={log.message}
                      secondary={log.timestamp}
                      sx={{
                        color: log.type === 'success' ? 'lightgreen' : 
                               log.type === 'error' ? 'lightcoral' : 'white'
                      }}
                    />
                  </ListItem>
                ))}
                {logs.length === 0 && (
                  <ListItem>
                    <ListItemText primary="暂无日志..." sx={{ color: 'rgba(255,255,255,0.5)' }} />
                  </ListItem>
                )}
              </List>
            </Paper>
          </CardContent>
        </Card>

        {/* 自定义命令对话框 */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>执行自定义命令</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="命令"
              type="text"
              fullWidth
              variant="outlined"
              value={currentCommand}
              onChange={(e) => setCurrentCommand(e.target.value)}
              placeholder="例如: ocm login --use-auth-code --url=integration"
              multiline
              rows={3}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={executeCustomCommand} variant="contained">执行</Button>
          </DialogActions>
        </Dialog>
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default App;
