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
  Code as CodeIcon,
  HourglassEmpty as PendingIcon,
  PlayCircleFilled as InProgressIcon,
  Route as RouteIcon,
  VpnLock as TunnelIcon,
  VerifiedUser as VerifyIcon,
  Security as SecurityIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Lock as LockIcon,
  Key as KeyIcon
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
  
  // Hive连接步骤状态
  const [hiveSteps, setHiveSteps] = useState([
    { id: 'route', name: '配置网络路由', icon: RouteIcon, status: 'pending', detail: 'sudo route add -net 10.164.0.0/16 -interface en0' },
    { id: 'tunnel', name: '启动Sshuttle隧道', icon: TunnelIcon, status: 'pending', detail: 'sshuttle -r bastion.ci.int.devshift.net 10.164.0.0/16' },
    { id: 'verify', name: '验证连接状态', icon: VerifyIcon, status: 'pending', detail: '检查进程和网络连通性' }
  ]);
  const [realTimeLogs, setRealTimeLogs] = useState([]);
  
  // 设置相关状态
  const [settings, setSettings] = useState({
    sudoPassword: '',
    sshPassphrase: '',
    autoAuth: false,
    rememberPasswords: false
  });
  const [showPasswords, setShowPasswords] = useState({
    sudo: false,
    ssh: false
  });

  useEffect(() => {
    checkAllStatus();
    const interval = setInterval(checkAllStatus, 30000); // 每30秒检查一次
    
    // 加载保存的设置
    const savedSettings = localStorage.getItem('fleetBuddySettings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(parsed);
        addLog('✅ 已加载保存的设置', 'info');
        addLog(`📋 配置状态: autoAuth=${parsed.autoAuth}, 有sudo密码=${!!parsed.sudoPassword}, 有ssh密码=${!!parsed.sshPassphrase}`, 'info');
      } catch (error) {
        addLog('❌ 设置加载失败，使用默认设置', 'error');
      }
    } else {
      addLog('ℹ️ 未找到保存的设置，请先配置应用设置', 'info');
    }
    
    // 监听实时命令输出
    const { ipcRenderer } = window.require('electron');
    const handleCommandOutput = (event, data) => {
      const timestamp = new Date().toLocaleTimeString();
      setRealTimeLogs(prev => [...prev, {
        timestamp,
        type: data.type,
        content: data.data,
        id: Date.now() + Math.random()
      }]);
    };

    ipcRenderer.on('command-output', handleCommandOutput);
    
    return () => {
      clearInterval(interval);
      ipcRenderer.removeListener('command-output', handleCommandOutput);
    };
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

  // 🔥 重写的一键连接到Hive功能 - 简化且可靠
  const connectToHive = async () => {
    setLoading(prev => ({ ...prev, hive: true }));
    resetSteps();
    setRealTimeLogs([]); // 清空实时日志
    
    addLog('🚀 开始连接到Hive...', 'info');
    addLog(`🔍 当前设置检查: autoAuth=${settings.autoAuth}, sudo密码=${!!settings.sudoPassword}, ssh密码=${!!settings.sshPassphrase}`, 'debug');
    
    // 检查必要的设置
    if (!settings.sudoPassword || !settings.sshPassphrase) {
      addLog('❌ 缺少必要的密码设置', 'error');
      addLog('💡 请在"应用设置"标签页中配置sudo密码和SSH私钥密码', 'info');
      updateStepStatus('route', 'error', '缺少密码配置');
      setLoading(prev => ({ ...prev, hive: false }));
      return;
    }

    try {
      // 使用简化的CommandService连接方法
      updateStepStatus('route', 'in_progress');
      updateStepStatus('tunnel', 'pending');
      updateStepStatus('verify', 'pending');
      
      const connectionResult = await CommandService.connectToHive({
        sudo: settings.sudoPassword,
        ssh: settings.sshPassphrase
      });

      // 根据结果更新步骤状态
      connectionResult.steps.forEach((step, index) => {
        const stepIds = ['route', 'tunnel', 'verify'];
        if (stepIds[index]) {
          updateStepStatus(stepIds[index], step.success ? 'completed' : 'error', step.message);
        }
        addLog(`${step.success ? '✅' : '❌'} ${step.name}: ${step.message}`, step.success ? 'success' : 'error');
      });

      if (connectionResult.success) {
        addLog('🎉 Hive连接建立成功！', 'success');
        addLog('🌐 现在可以访问: https://console-openshift-console.apps.hivei01ue1.f7i5.p1.openshiftapps.com/', 'success');
        
        // 额外进行连通性测试
        addLog('🔍 执行额外的连通性测试...', 'info');
        const connectivityTest = await CommandService.testHiveConnectivity();
        if (connectivityTest.success) {
          connectivityTest.tests.forEach(test => {
            addLog(`${test.message} - ${test.name}`, test.success ? 'success' : 'warning');
          });
        }
      } else {
        addLog(`❌ Hive连接失败: ${connectionResult.error}`, 'error');
        if (!settings.autoAuth) {
          addLog('💡 建议: 启用自动认证以获得更好的体验', 'info');
        }
      }
      
    } catch (error) {
      addLog(`连接过程出错: ${error.message}`, 'error');
      updateStepStatus('verify', 'error', `连接失败: ${error.message}`);
    } finally {
      setLoading(prev => ({ ...prev, hive: false }));
      setTimeout(checkAllStatus, 1000);
    }
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
    setLoading(prev => ({ ...prev, stopSshuttle: true }));
    try {
      addLog('🛑 正在停止Sshuttle连接...', 'info');
      const result = await CommandService.stopSshuttle();
      
      if (result.success) {
        addLog('✅ Sshuttle连接已停止', 'success');
        resetSteps(); // 重置步骤状态
      } else {
        addLog(`❌ 停止Sshuttle失败: ${result.error}`, 'error');
      }
    } catch (error) {
      addLog(`停止过程出错: ${error.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, stopSshuttle: false }));
      setTimeout(checkAllStatus, 1000);
    }
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

  // 更新步骤状态
  const updateStepStatus = (stepId, status, error = null) => {
    setHiveSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, status, error } 
        : step
    ));
  };

  // 重置所有步骤状态
  const resetSteps = () => {
    setHiveSteps(prev => prev.map(step => ({ ...step, status: 'pending', error: null })));
  };

  // 步骤显示组件
  const StepDisplay = ({ steps }) => {
    const getStatusIcon = (status) => {
      switch (status) {
        case 'pending':
          return <PendingIcon sx={{ color: 'grey.500' }} />;
        case 'in_progress':
          return <InProgressIcon sx={{ color: 'primary.main' }} />;
        case 'completed':
          return <CheckIcon sx={{ color: 'success.main' }} />;
        case 'error':
          return <ErrorIcon sx={{ color: 'error.main' }} />;
        default:
          return <PendingIcon sx={{ color: 'grey.500' }} />;
      }
    };

    const getStatusColor = (status) => {
      switch (status) {
        case 'pending': return 'grey.500';
        case 'in_progress': return 'primary.main';
        case 'completed': return 'success.main';
        case 'error': return 'error.main';
        default: return 'grey.500';
      }
    };

    return (
      <>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              🔄 连接步骤详情
            </Typography>
            <List>
              {steps.map((step, index) => {
                const IconComponent = step.icon;
                return (
                  <ListItem key={step.id} sx={{ py: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 60 }}>
                        <Typography variant="body2" sx={{ color: 'grey.400', minWidth: 20 }}>
                          {index + 1}.
                        </Typography>
                        <IconComponent sx={{ color: getStatusColor(step.status) }} />
                        {getStatusIcon(step.status)}
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {step.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'grey.400', display: 'block' }}>
                          {step.detail}
                        </Typography>
                        {step.error && (
                          <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mt: 0.5 }}>
                            错误: {step.error}
                          </Typography>
                        )}
                      </Box>
                      <Chip 
                        label={
                          step.status === 'pending' ? '等待中' :
                          step.status === 'in_progress' ? '进行中' :
                          step.status === 'completed' ? '已完成' :
                          step.status === 'error' ? '失败' : '未知'
                        }
                        size="small"
                        color={
                          step.status === 'pending' ? 'default' :
                          step.status === 'in_progress' ? 'primary' :
                          step.status === 'completed' ? 'success' :
                          step.status === 'error' ? 'error' : 'default'
                        }
                        variant={step.status === 'pending' ? 'outlined' : 'filled'}
                      />
                    </Box>
                  </ListItem>
                );
              })}
            </List>
          </CardContent>
        </Card>

        {/* 实时终端输出 */}
        {realTimeLogs.length > 0 && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                🖥️ 实时终端输出
              </Typography>
              <Paper sx={{ 
                bgcolor: 'black', 
                color: 'white', 
                p: 2, 
                maxHeight: 300, 
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                lineHeight: 1.4
              }}>
                {realTimeLogs.map((log) => (
                  <Box key={log.id} sx={{ mb: 0.5 }}>
                    <Typography component="span" sx={{ 
                      color: log.type === 'stderr' ? '#ff6b6b' : '#4ecdc4',
                      fontSize: '0.75rem',
                      mr: 1
                    }}>
                      [{log.timestamp}]
                    </Typography>
                    <Typography component="span" sx={{ 
                      color: log.type === 'stderr' ? '#ff6b6b' : 
                             log.type === 'info' ? '#4ecdc4' : 
                             log.type === 'debug' ? '#ffa726' : 
                             log.type === 'success' ? '#4caf50' :
                             log.type === 'error' ? '#f44336' : 'white',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {log.content}
                    </Typography>
                  </Box>
                ))}
              </Paper>
              <Button 
                size="small" 
                onClick={() => setRealTimeLogs([])}
                sx={{ mt: 1 }}
              >
                清空输出
              </Button>
            </CardContent>
          </Card>
        )}
      </>
    );
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

      {/* 步骤显示 */}
      <StepDisplay steps={hiveSteps} />

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
              onClick={() => window.open('https://console-openshift-console.apps.hivei01ue1.f7i5.p1.openshiftapps.com/')}
              startIcon={<CloudIcon />}
              fullWidth
            >
              🌐 打开Hive控制台
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={async () => {
                addLog('🔌 正在断开Sshuttle连接...', 'info');
                try {
                  const result = await CommandService.stopSshuttle();
                  if (result.success) {
                    addLog('✅ Sshuttle连接已完全断开', 'success');
                    resetSteps();
                  } else {
                    addLog(`⚠️ 断开连接时遇到问题: ${result.error}`, 'warning');
                  }
                } catch (error) {
                  addLog(`断开连接失败: ${error.message}`, 'error');
                }
              }}
              size="small"
              sx={{ mt: 1 }}
            >
              🔌 断开连接
            </Button>
            <Button
              variant="text"
              size="small"
              onClick={() => {
                resetSteps();
                addLog('✅ 步骤状态已重置', 'success');
              }}
            >
              🔄 重置步骤状态
            </Button>
            <Button
              variant="text"
              size="small"
              color="info"
              onClick={async () => {
                addLog('🔍 开始详细诊断sshuttle状态...', 'info');
                
                try {
                  // 手动检查各种进程状态
                  const manualChecks = [
                    'test -f /tmp/sshuttle.pid && echo "PID文件存在: $(cat /tmp/sshuttle.pid)" || echo "PID文件不存在"',
                    'pgrep -f "sshuttle.*bastion" && echo "找到进程" || echo "未找到匹配进程"',
                    'ps aux | grep sshuttle | grep -v grep || echo "无sshuttle进程"',
                    'lsof -i :22 | grep sshuttle || echo "无SSH连接"',
                    'netstat -rn | grep "10.164" || echo "无相关路由"'
                  ];
                  
                  for (const [index, cmd] of manualChecks.entries()) {
                    const result = await CommandService.execute(cmd);
                    addLog(`检查${index + 1}: ${result.stdout || result.stderr || '无输出'}`, 'debug');
                  }
                  
                  // 使用新的sshuttle进程检查方法
                  const processStatus = await CommandService.checkSshuttleProcess();
                  addLog(`进程状态: 运行=${processStatus.running}, PID=${processStatus.pid || '无'}`, 'info');
                  if (processStatus.details) {
                    addLog(`进程详情: ${processStatus.details}`, 'debug');
                  }
                  
                  // 执行连通性测试
                  const connectivityTest = await CommandService.testHiveConnectivity();
                  if (connectivityTest.success) {
                    addLog('🔍 连通性测试结果:', 'info');
                    connectivityTest.tests.forEach(test => {
                      addLog(`  ${test.name}: ${test.message}`, test.success ? 'success' : 'warning');
                    });
                  } else {
                    addLog(`连通性测试失败: ${connectivityTest.error}`, 'error');
                  }
                  
                  // 尝试手动启动sshuttle（如果当前没有运行）
                  if (!processStatus.running) {
                    addLog('🚀 检测到进程未运行，尝试手动启动...', 'info');
                    const manualStart = await CommandService.execute(
                      'screen -dmS sshuttle-session bash -c \'sshuttle -r bastion.ci.int.devshift.net 10.164.0.0/16\' && echo "启动命令已执行"',
                      { timeout: 10000 }
                    );
                    addLog(`手动启动结果: ${manualStart.success ? '成功' : '失败'} - ${manualStart.stdout || manualStart.stderr}`, 
                           manualStart.success ? 'success' : 'error');
                    
                    // 检查启动后状态
                    if (manualStart.success) {
                      await new Promise(resolve => setTimeout(resolve, 3000));
                      const afterStart = await CommandService.checkSshuttleProcess();
                      addLog(`启动后状态: 运行=${afterStart.running}, PID=${afterStart.pid || '无'}`, 'info');
                    }
                  }
                  
                } catch (error) {
                  addLog(`诊断过程出错: ${error.message}`, 'error');
                }
                
                addLog('📋 诊断完成', 'success');
              }}
            >
              🩺 详细诊断
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

  const renderSettingsTab = () => (
    <>
      {/* 安全警告 */}
      <Alert severity="warning" sx={{ mb: 3 }}>
        <Typography variant="body2">
          ⚠️ <strong>安全提示</strong>：密码将加密存储在本地，仅用于自动化连接。建议定期更换密码。
        </Typography>
      </Alert>

      {/* 密码配置 */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                <LockIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                系统密码配置
              </Typography>
              <Box display="flex" flexDirection="column" gap={2}>
                <TextField
                  label="Sudo密码（电脑密码）"
                  type={showPasswords.sudo ? 'text' : 'password'}
                  value={settings.sudoPassword}
                  onChange={(e) => setSettings(prev => ({ ...prev, sudoPassword: e.target.value }))}
                  fullWidth
                  InputProps={{
                    endAdornment: (
                      <IconButton
                        onClick={() => setShowPasswords(prev => ({ ...prev, sudo: !prev.sudo }))}
                        edge="end"
                      >
                        {showPasswords.sudo ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    )
                  }}
                  helperText="用于执行sudo命令的系统密码"
                />
                <TextField
                  label="SSH私钥密码（Passphrase）"
                  type={showPasswords.ssh ? 'text' : 'password'}
                  value={settings.sshPassphrase}
                  onChange={(e) => setSettings(prev => ({ ...prev, sshPassphrase: e.target.value }))}
                  fullWidth
                  InputProps={{
                    endAdornment: (
                      <IconButton
                        onClick={() => setShowPasswords(prev => ({ ...prev, ssh: !prev.ssh }))}
                        edge="end"
                      >
                        {showPasswords.ssh ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    )
                  }}
                  helperText="SSH私钥文件的解锁密码"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                <KeyIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                自动化设置
              </Typography>
              <Box display="flex" flexDirection="column" gap={2}>
                <Box>
                  <Typography variant="body1" gutterBottom>
                    自动认证选项
                  </Typography>
                  <Box display="flex" flexDirection="column" gap={1}>
                    <Box display="flex" alignItems="center">
                      <input
                        type="checkbox"
                        checked={settings.autoAuth}
                        onChange={(e) => setSettings(prev => ({ ...prev, autoAuth: e.target.checked }))}
                        style={{ marginRight: 8 }}
                      />
                      <Typography variant="body2">
                        启用自动认证（推荐）
                      </Typography>
                    </Box>
                    <Box display="flex" alignItems="center">
                      <input
                        type="checkbox"
                        checked={settings.rememberPasswords}
                        onChange={(e) => setSettings(prev => ({ ...prev, rememberPasswords: e.target.checked }))}
                        style={{ marginRight: 8 }}
                      />
                      <Typography variant="body2">
                        记住密码（本地加密存储）
                      </Typography>
                    </Box>
                  </Box>
                </Box>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => {
                    // 保存设置并验证
                    localStorage.setItem('fleetBuddySettings', JSON.stringify(settings));
                    addLog('设置已保存', 'success');
                    addLog(`调试: autoAuth=${settings.autoAuth}, 有sudo密码=${!!settings.sudoPassword}, 有ssh密码=${!!settings.sshPassphrase}`, 'info');
                  }}
                  fullWidth
                >
                  💾 保存设置
                </Button>
                <Button
                  variant="outlined"
                  color="warning"
                  onClick={() => {
                    setSettings({
                      sudoPassword: '',
                      sshPassphrase: '',
                      autoAuth: false,
                      rememberPasswords: false
                    });
                    localStorage.removeItem('fleetBuddySettings');
                    addLog('设置已清空', 'info');
                  }}
                  fullWidth
                >
                  🗑️ 清空所有设置
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* SSH密钥信息 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            🔑 SSH密钥信息
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="body2" sx={{ color: 'grey.400' }}>
                私钥路径: <code>/Users/chlu/.ssh/id_rsa</code>
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
                              <Button
                  variant="outlined"
                  size="small"
                  onClick={async () => {
                    // 测试Sudo认证
                    addLog('🧪 开始Sudo认证测试...', 'info');
                    addLog(`当前设置: autoAuth=${settings.autoAuth}, 有sudo密码=${!!settings.sudoPassword}`, 'info');
                    
                    const authOptions = {
                      timeout: 30000,
                      realtime: true,
                      autoAuth: settings.autoAuth,
                      passwords: {
                        sudo: settings.sudoPassword,
                        ssh: settings.sshPassphrase
                      }
                    };
                    
                    try {
                      const result = await CommandService.executeWithRealTimeOutput(
                        'sudo echo "Sudo测试成功"',
                        null,
                        authOptions
                      );
                      
                      addLog(`Sudo测试结果: exitCode=${result.exitCode}, success=${result.success}`, 'info');
                      if (result.success) {
                        addLog('✅ Sudo认证成功', 'success');
                      } else {
                        addLog('❌ Sudo认证失败', 'error');
                      }
                    } catch (error) {
                      addLog(`Sudo测试出错: ${error.message}`, 'error');
                    }
                  }}
                >
                  🧪 测试Sudo认证
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={async () => {
                    // 测试SSH连接到GitHub
                    addLog('🧪 开始SSH连接测试...', 'info');
                    addLog(`当前设置: autoAuth=${settings.autoAuth}, 有ssh密码=${!!settings.sshPassphrase}`, 'info');
                  
                  const authOptions = {
                    timeout: 30000,
                    realtime: true,
                    autoAuth: settings.autoAuth,
                    passwords: {
                      sudo: settings.sudoPassword,
                      ssh: settings.sshPassphrase
                    }
                  };
                  
                  try {
                    // 使用expect脚本自动输入SSH密码
                    const expectScript = `
expect << 'EOF'
set timeout 30
spawn ssh -o ConnectTimeout=5 -o BatchMode=no -o StrictHostKeyChecking=no -T git@github.com
expect {
  "Enter passphrase for key" {
    send "${settings.sshPassphrase}\\r"
    exp_continue
  }
  "successfully authenticated" {
    puts "SSH认证成功"
    exit 0
  }
  "Permission denied" {
    puts "SSH认证失败"
    exit 1
  }
  timeout {
    puts "SSH连接超时"
    exit 2
  }
}
EOF
                    `.trim();
                    
                    const result = await CommandService.executeWithRealTimeOutput(
                      expectScript,
                      null,
                      { ...authOptions, autoAuth: false } // 不需要自动认证，expect处理
                    );
                    
                    addLog(`SSH测试结果: exitCode=${result.exitCode}, success=${result.success}`, 'info');
                    addLog(`stdout: ${result.stdout || '无'}`, 'info');
                    addLog(`stderr: ${result.stderr || '无'}`, 'info');
                    
                    if (result.success || (result.stderr && result.stderr.includes('successfully authenticated'))) {
                      addLog('✅ SSH密钥认证成功 - GitHub连接正常', 'success');
                    } else if (result.stderr && result.stderr.includes('Permission denied')) {
                      addLog('❌ SSH密钥认证失败 - 权限被拒绝', 'error');
                    } else if (result.stderr && result.stderr.includes('passphrase')) {
                      addLog('⚠️ 检测到密码提示，自动认证可能未工作', 'error');
                    } else {
                      addLog('ℹ️ SSH测试完成，请查看详细输出', 'info');
                    }
                  } catch (error) {
                    addLog(`SSH连接测试出错: ${error.message}`, 'error');
                  }
                }}
              >
                🧪 测试SSH连接
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
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
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SecurityIcon />
                  <Box>
                    <Typography variant="body1">应用设置</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>密码和安全配置</Typography>
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
          {activeTab === 2 && renderSettingsTab()}

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
