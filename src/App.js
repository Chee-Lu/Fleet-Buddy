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
  VpnKey as VpnKeyIcon,
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
  
  // Hive connection step states
  const [hiveSteps, setHiveSteps] = useState([
    { id: 'route', name: 'Configure Network Route', icon: RouteIcon, status: 'pending', detail: 'sudo route add -net 10.164.0.0/16 -interface en0' },
    { id: 'tunnel', name: 'Start Sshuttle Tunnel', icon: TunnelIcon, status: 'pending', detail: 'sshuttle -r bastion.ci.int.devshift.net 10.164.0.0/16' },
    { id: 'verify', name: 'Verify Connection Status', icon: VerifyIcon, status: 'pending', detail: 'Check process and network connectivity' }
  ]);
  const [realTimeLogs, setRealTimeLogs] = useState([]);
  
  // Settings related states
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
    const interval = setInterval(checkAllStatus, 30000); // Check every 30 seconds
    
    // Load saved settings
    const savedSettings = localStorage.getItem('fleetBuddySettings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(parsed);
        addLog('✅ Load saved settings', 'info');
        addLog(`📋 Configuration status: autoAuth=${parsed.autoAuth}, 有sudo password=${!!parsed.sudoPassword}, 有ssh password=${!!parsed.sshPassphrase}`, 'info');
      } catch (error) {
        addLog('❌ Settings loading failed, using default settings', 'error');
      }
    } else {
      addLog('ℹ️ No saved settings found, please configure App Settings first', 'info');
    }
    
    // Listen for real-time command output
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
      // Check sshuttle process
      const sshuttleStatus = await CommandService.checkProcess('sshuttle');
      
      // Check OCM login status
      const ocmResult = await CommandService.execute('ocm whoami');
      
      // Check kubeconfig file
      const kubeconfigResult = await CommandService.readFile(hiveKubeconfigPath);
      
      setStatus({
        sshuttleRunning: sshuttleStatus.running,
        ocmLoggedIn: ocmResult.success,
        hiveKubeconfig: kubeconfigResult.success,
        hiveConnected: sshuttleStatus.running && ocmResult.success
      });
    } catch (error) {
      console.error('Check status failed:', error);
    }
  };

  const executeWithLoading = async (key, command, successMessage) => {
    setLoading(prev => ({ ...prev, [key]: true }));
    try {
      const result = await CommandService.execute(command);
      if (result.success) {
        addLog(successMessage, 'success');
      } else {
        addLog(`Error: ${result.error || result.stderr}`, 'error');
      }
      return result;
    } catch (error) {
      addLog(`Execute failed: ${error.message}`, 'error');
      return { success: false, error: error.message };
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
      setTimeout(checkAllStatus, 1000);
    }
  };

  // 🔥 Redesigned One-Click Connect to Hive functionality - simplified and reliable
  const connectToHive = async () => {
    setLoading(prev => ({ ...prev, hive: true }));
    resetSteps();
    setRealTimeLogs([]); // Clear real-time logs
    
    addLog('🚀 Starting connection to Hive...', 'info');
    addLog(`🔍 Current settings check: autoAuth=${settings.autoAuth}, sudo password=${!!settings.sudoPassword}, ssh password=${!!settings.sshPassphrase}`, 'debug');
    
    // Check required settings
    if (!settings.sudoPassword || !settings.sshPassphrase) {
      addLog('❌ Missing required password settings', 'error');
      addLog('💡 Please configure sudo password and SSH private key password in the "App Settings" tab', 'info');
      updateStepStatus('route', 'error', 'Missing password configuration');
      setLoading(prev => ({ ...prev, hive: false }));
      return;
    }

    try {
      // Use simplified CommandService connection method
      updateStepStatus('route', 'in_progress');
      updateStepStatus('tunnel', 'pending');
      updateStepStatus('verify', 'pending');
      
      const connectionResult = await CommandService.connectToHive({
        sudo: settings.sudoPassword,
        ssh: settings.sshPassphrase
      });

      // Update step status based on result
      connectionResult.steps.forEach((step, index) => {
        const stepIds = ['route', 'tunnel', 'verify'];
        if (stepIds[index]) {
          updateStepStatus(stepIds[index], step.success ? 'completed' : 'error', step.message);
        }
        addLog(`${step.success ? '✅' : '❌'} ${step.name}: ${step.message}`, step.success ? 'success' : 'error');
      });

      if (connectionResult.success) {
        addLog('🎉 Hive Connection established successfully!', 'success');
        addLog('🌐 Now you can access: https://console-openshift-console.apps.hivei01ue1.f7i5.p1.openshiftapps.com/', 'success');
        
        // Extra connectivity test
        addLog('🔍 Execute extra connectivity test...', 'info');
        const connectivityTest = await CommandService.testHiveConnectivity();
        if (connectivityTest.success) {
          connectivityTest.tests.forEach(test => {
            addLog(`${test.message} - ${test.name}`, test.success ? 'success' : 'warning');
          });
        }
      } else {
        addLog(`❌ Hive Connection failed: ${connectionResult.error}`, 'error');
        if (!settings.autoAuth) {
          addLog('💡Suggestion: Enable auto-auth for better experience', 'info');
        }
      }
      
    } catch (error) {
      addLog(`Connection process error: ${error.message}`, 'error');
      updateStepStatus('verify', 'error', `Connection failed: ${error.message}`);
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
      await executeWithLoading('testEnv', cmd, 'Testing environment configuration...');
    }
    
    addLog('Testing environment configuration completed!', 'success');
  };

  const refreshOcmToken = async () => {
    const result = await executeWithLoading('ocmToken', 'ocm token', 'OCM Token已刷新');
    if (result.success) {
      addLog(`New Token: ${result.stdout.trim()}`, 'info');
    }
  };

  const stopSshuttle = async () => {
    setLoading(prev => ({ ...prev, stopSshuttle: true }));
    try {
      addLog('🛑 Stopping Sshuttle connection...', 'info');
      const result = await CommandService.stopSshuttle();
      
      if (result.success) {
        addLog('✅ Sshuttle connection stopped', 'success');
        resetSteps(); // Reset step status
      } else {
        addLog(`❌ Failed to stop Sshuttle: ${result.error}`, 'error');
      }
    } catch (error) {
      addLog(`Error during stop process: ${error.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, stopSshuttle: false }));
      setTimeout(checkAllStatus, 1000);
    }
  };

  // 🌐 Open links in external browser
  const openExternal = async (url) => {
    try {
      if (window.require) {
        // Electron environment
        const { ipcRenderer } = window.require('electron');
        await ipcRenderer.invoke('open-external', url);
      } else {
        // Browser environment
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Failed to open external URL:', error);
      // Fallback solution
      window.open(url, '_blank');
    }
  };

  // 🔑 API Token status
  const [apiTokenData, setApiTokenData] = useState(null);

  // 🔑 Get OpenShift API Token
  const getApiToken = async () => {
    setLoading(prev => ({ ...prev, getToken: true }));
    try {
      addLog('🔑 Getting OpenShift API Token...', 'info');
      const result = await CommandService.getOpenShiftToken();
      
      if (result.success) {
        addLog('✅ API Token retrieved successfully！', 'success');
        addLog(`🔑 Source: ${result.source === 'existing_session' ? 'existing session' : 'web extraction'}`, 'info');
        
        // Update Token data to UI
        setApiTokenData(result);
        
        // Copy oc login command to clipboard
        try {
          await navigator.clipboard.writeText(result.ocLoginCommand);
          addLog('📋 oc login command copied to clipboard', 'success');
        } catch (clipboardError) {
          addLog('⚠️ Unable to copy to clipboard automatically, please copy manually', 'warning');
        }
        
        return result;
      } else {
        if (result.manual) {
          addLog('📘 Manual token retrieval required', 'warning');
          addLog('1️⃣ Login to Hive console in browser', 'info');
          addLog('2️⃣ Visit token page to get API token', 'info');
          addLog('3️⃣ Or run in terminal: oc whoami --show-token', 'info');
        } else {
          addLog(`❌ Failed to get token: ${result.error}`, 'error');
        }
        setApiTokenData(null);
        return null;
      }
    } catch (error) {
      addLog(`Error during token retrieval process: ${error.message}`, 'error');
      setApiTokenData(null);
      return null;
    } finally {
      setLoading(prev => ({ ...prev, getToken: false }));
    }
  };

  const openCustomCommand = () => {
    setDialogOpen(true);
  };

  const executeCustomCommand = async () => {
    if (currentCommand.trim()) {
      const result = await CommandService.execute(currentCommand);
      addLog(`Execute command: ${currentCommand}`, 'info');
      if (result.success) {
        addLog(`Output: ${result.stdout}`, 'success');
      } else {
        addLog(`Error: ${result.error || result.stderr}`, 'error');
      }
    }
    setDialogOpen(false);
    setCurrentCommand('');
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  // Update step status
  const updateStepStatus = (stepId, status, error = null) => {
    setHiveSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, status, error } 
        : step
    ));
  };

  // Reset all step status
  const resetSteps = () => {
    setHiveSteps(prev => prev.map(step => ({ ...step, status: 'pending', error: null })));
  };

  // Step display component
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
              🔄 Connection step details
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
                            Error: {step.error}
                          </Typography>
                        )}
                      </Box>
                      <Chip 
                        label={
                          step.status === 'pending' ? 'Pending' :
                          step.status === 'in_progress' ? 'In Progress' :
                          step.status === 'completed' ? 'Completed' :
                          step.status === 'error' ? 'Failed' : 'Unknown'
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

        {/* Real-time terminal output */}
        {realTimeLogs.length > 0 && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                🖥️ Real-time terminal output
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
                Clear output
              </Button>
            </CardContent>
          </Card>
        )}
      </>
    );
  };

  const renderHiveTab = () => (
    <>
      {/* HiveConnection Status */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                <CloudIcon color={status.hiveConnected ? 'success' : 'disabled'} />
                <Typography variant="h6">HiveConnection Status</Typography>
                {status.hiveConnected ? <CheckIcon color="success" /> : <ErrorIcon color="error" />}
              </Box>
              <Chip 
                label={status.hiveConnected ? 'Connected' : 'Disconnected'} 
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
                <Typography variant="h6">Sshuttle Tunnel</Typography>
                {status.sshuttleRunning ? <CheckIcon color="success" /> : <ErrorIcon color="error" />}
              </Box>
              <Chip 
                label={status.sshuttleRunning ? 'Running' : 'Stopped'} 
                color={status.sshuttleRunning ? 'success' : 'error'} 
                size="small" 
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Step display */}
      <StepDisplay steps={hiveSteps} />

      {/* Hive operations */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom>🔗 Hive Connection操作</Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            <Button
              variant="contained"
              size="large"
              onClick={connectToHive}
              disabled={loading.hive}
              startIcon={loading.hive ? <CircularProgress size={20} /> : <CloudIcon />}
              fullWidth
            >
              {loading.hive ? 'Connecting...' : 'One-Click Connect to Hive'}
            </Button>
            <Button
              variant="outlined"
              onClick={stopSshuttle}
              disabled={loading.stopSshuttle || !status.sshuttleRunning}
              startIcon={loading.stopSshuttle ? <CircularProgress size={20} /> : <StopIcon />}
              fullWidth
            >
              {loading.stopSshuttle ? 'Stopping...' : 'Stop Sshuttle'}
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              onClick={() => openExternal('https://console-openshift-console.apps.hivei01ue1.f7i5.p1.openshiftapps.com/')}
              startIcon={<CloudIcon />}
              fullWidth
            >
              🌐 Open Hive Console
            </Button>

            <Button
              variant="outlined"
              color="error"
              onClick={async () => {
                addLog('🔌 Disconnecting Sshuttle connection...', 'info');
                try {
                  const result = await CommandService.stopSshuttle();
                  if (result.success) {
                    addLog('✅ Sshuttle connection completely disconnected', 'success');
                    resetSteps();
                  } else {
                    addLog(`⚠️ Disconnect problem: ${result.error}`, 'warning');
                  }
                } catch (error) {
                  addLog(`Disconnect failed: ${error.message}`, 'error');
                }
              }}
              size="small"
              sx={{ mt: 1 }}
            >
              🔌 Disconnect
            </Button>
            <Button
              variant="text"
              size="small"
              onClick={() => {
                resetSteps();
                addLog('✅ Step status reset', 'success');
              }}
            >
              🔄 Reset step status
            </Button>
            <Button
              variant="text"
              size="small"
              color="info"
              onClick={async () => {
                addLog('🔍 Start Detailed Diagnostics...', 'info');
                
                try {
                  // 手动检查各种Process Status
                  const manualChecks = [
                    'test -f /tmp/sshuttle.pid && echo "PID file exists: $(cat /tmp/sshuttle.pid)" || echo "PID file does not exist"',
                    'pgrep -f "sshuttle.*bastion" && echo "Process found" || echo "No matching process found"',
                    'ps aux | grep sshuttle | grep -v grep || echo "No sshuttle process"',
                    'lsof -i :22 | grep sshuttle || echo "No SSH connection"',
                    'netstat -rn | grep "10.164" || echo "No related route"'
                  ];
                  
                  for (const [index, cmd] of manualChecks.entries()) {
                    const result = await CommandService.execute(cmd);
                    addLog(`Check ${index + 1}: ${result.stdout || result.stderr || 'No output'}`, 'debug');
                  }
                  
                  // Use new sshuttle process check method
                  const processStatus = await CommandService.checkSshuttleProcess();
                  addLog(`Process Status: Running=${processStatus.running}, PID=${processStatus.pid || 'No PID'}`, 'info');
                  if (processStatus.details) {
                    addLog(`Process details: ${processStatus.details}`, 'debug');
                  }
                  
                  // Execute connectivity test
                  const connectivityTest = await CommandService.testHiveConnectivity();
                  if (connectivityTest.success) {
                    addLog('🔍 Connectivity test result:', 'info');
                    connectivityTest.tests.forEach(test => {
                      addLog(`  ${test.name}: ${test.message}`, test.success ? 'success' : 'warning');
                    });
                  } else {
                    addLog(`Connectivity test failed: ${connectivityTest.error}`, 'error');
                  }
                  
                  // Try to manually start sshuttle (if not running)
                  if (!processStatus.running) {
                    addLog('🚀 Process not running, trying to manually start...', 'info');
                    const manualStart = await CommandService.execute(
                      'screen -dmS sshuttle-session bash -c \'sshuttle -r bastion.ci.int.devshift.net 10.164.0.0/16\' && echo "启动命令已Execute"',
                      { timeout: 10000 }
                    );
                    addLog(`Manual start result: ${manualStart.success ? 'Success' : 'Failed'} - ${manualStart.stdout || manualStart.stderr}`, 
                           manualStart.success ? 'success' : 'error');
                    
                    // Check after start status
                    if (manualStart.success) {
                      await new Promise(resolve => setTimeout(resolve, 3000));
                      const afterStart = await CommandService.checkSshuttleProcess();
                      addLog(`After start status: Running=${afterStart.running}, PID=${afterStart.pid || 'No PID'}`, 'info');
                    }
                  }
                  
                } catch (error) {
                  addLog(`Diagnostics process error: ${error.message}`, 'error');
                }
                
                addLog('📋 Diagnostics completed', 'success');
              }}
            >
              🩺 Detailed Diagnostics
            </Button>
          </Box>
        </CardContent>
      </Card>
    </>
  );

  const renderBackendTestTab = () => (
    <>
      {/* Backend test status */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                <SettingsIcon color={status.ocmLoggedIn ? 'success' : 'disabled'} />
                <Typography variant="h6">OCM Login</Typography>
                {status.ocmLoggedIn ? <CheckIcon color="success" /> : <ErrorIcon color="error" />}
              </Box>
              <Chip 
                label={status.ocmLoggedIn ? 'Logged In' : 'Not Logged In'} 
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
                label={status.hiveKubeconfig ? 'Available' : 'Not Available'} 
                color={status.hiveKubeconfig ? 'success' : 'error'} 
                size="small" 
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Backend test operations */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>⚙️ Environment Configuration</Typography>
              <Box display="flex" flexDirection="column" gap={2}>
                <Button
                  variant="contained"
                  size="large"
                  onClick={setupTestEnvironment}
                  disabled={loading.testEnv}
                  startIcon={loading.testEnv ? <CircularProgress size={20} /> : <SettingsIcon />}
                  fullWidth
                >
                  {loading.testEnv ? 'Configuring...' : 'Configure Test Environment'}
                </Button>
                <Button
                  variant="outlined"
                  onClick={refreshOcmToken}
                  disabled={loading.ocmToken}
                  startIcon={loading.ocmToken ? <CircularProgress size={20} /> : <RefreshIcon />}
                  fullWidth
                >
                  {loading.ocmToken ? 'Refreshing...' : 'Refresh OCM Token'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>📁 Configuration Management</Typography>
              <Box display="flex" flexDirection="column" gap={2}>
                <TextField
                  label="Hive Kubeconfig Path"
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
                  🔑 Get Red Hat Token
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
      {/* Security Warning */}
      <Alert severity="warning" sx={{ mb: 3 }}>
        <Typography variant="body2">
          ⚠️ <strong>Security Warning</strong>：Passwords are encrypted and stored locally, only used for automated connections. It is recommended to change passwords regularly.
        </Typography>
      </Alert>

      {/* Password configuration */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                <LockIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                System Password Configuration
              </Typography>
              <Box display="flex" flexDirection="column" gap={2}>
                <TextField
                  label="Sudo Password (Computer Password)"
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
                  helperText="System password used to execute sudo command"
                />
                <TextField
                  label="SSH Private Key Password（Passphrase）"
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
                  helperText="SSH private key file unlock password"
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
                Automation Settings
              </Typography>
              <Box display="flex" flexDirection="column" gap={2}>
                <Box>
                  <Typography variant="body1" gutterBottom>
                    Auto authentication options
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
                        Enable auto authentication (recommended)
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
                        Remember passwords (local encrypted storage)
                      </Typography>
                    </Box>
                  </Box>
                </Box>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => {
                    // Save settings and verify
                    localStorage.setItem('fleetBuddySettings', JSON.stringify(settings));
                    addLog('Settings saved', 'success');
                    addLog(`Debug: autoAuth=${settings.autoAuth}, has sudo password=${!!settings.sudoPassword}, has ssh password=${!!settings.sshPassphrase}`, 'info');
                  }}
                  fullWidth
                >
                  💾 Save settings
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
                    addLog('Settings cleared', 'info');
                  }}
                  fullWidth
                >
                  🗑️ Clear all settings
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* SSH Key Information */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            🔑 SSH Key Information
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="body2" sx={{ color: 'grey.400' }}>
                Private Key Path: <code>/Users/chlu/.ssh/id_rsa</code>
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
                              <Button
                  variant="outlined"
                  size="small"
                  onClick={async () => {
                    // Test Sudo authentication
                    addLog('🧪 Start Sudo authentication test...', 'info');
                    addLog(`Current settings: autoAuth=${settings.autoAuth}, has sudo password=${!!settings.sudoPassword}`, 'info');
                    
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
                        'sudo echo "Sudo test success"',
                        null,
                        authOptions
                      );
                      
                      addLog(`Sudo test result: exitCode=${result.exitCode}, success=${result.success}`, 'info');
                      if (result.success) {
                        addLog('✅ Sudo authentication success', 'success');
                      } else {
                        addLog('❌ Sudo authentication failed', 'error');
                      }
                    } catch (error) {
                      addLog(`Sudo test error: ${error.message}`, 'error');
                    }
                  }}
                >
                  🧪 Test Sudo authentication
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={async () => {
                    // Test SSH connection to GitHub
                    addLog('🧪 Start SSH connection test...', 'info');
                    addLog(`Current settings: autoAuth=${settings.autoAuth}, has ssh password=${!!settings.sshPassphrase}`, 'info');
                  
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
                    // Use expect script to automatically input SSH password
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
    puts "SSH authentication success"
    exit 0
  }
  "Permission denied" {
    puts "SSH authentication failed"
    exit 1
  }
  timeout {
    puts "SSH connection timeout"
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
                    
                    addLog(`SSH test result: exitCode=${result.exitCode}, success=${result.success}`, 'info');
                    addLog(`stdout: ${result.stdout || 'No output'}`, 'info');
                    addLog(`stderr: ${result.stderr || 'No output'}`, 'info');
                    
                    if (result.success || (result.stderr && result.stderr.includes('successfully authenticated'))) {
                      addLog('✅ SSH key authentication success - GitHub connection normal', 'success');
                    } else if (result.stderr && result.stderr.includes('Permission denied')) {
                      addLog('❌ SSH key authentication failed - Permission denied', 'error');
                    } else if (result.stderr && result.stderr.includes('passphrase')) {
                      addLog('⚠️ Password prompt detected, automatic authentication may not be working', 'error');
                    } else {
                      addLog('ℹ️ SSH test completed, please check detailed output', 'info');
                    }
                  } catch (error) {
                    addLog(`SSH connection test error: ${error.message}`, 'error');
                  }
                }}
              >
                🧪 Test SSH connection
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
              OSD Toolset
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
                    <Typography variant="body1">Hive Connection</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>Network connection and tunnel</Typography>
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
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>Environment configuration and test</Typography>
                  </Box>
                </Box>
              }
            />
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SecurityIcon />
                  <Box>
                    <Typography variant="body1">App Settings</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>Password and security configuration</Typography>
                  </Box>
                </Box>
              }
            />
          </Tabs>
        </Box>

        {/* 主内容区域 */}
        <Box sx={{ flex: 1, p: 3 }}>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3, textAlign: 'center' }}>
            💡 Tip: After closing the window, the application will remain running in the menu bar, and the right-click menu bar icon can quickly access the function
          </Typography>

          {activeTab === 0 && renderHiveTab()}
          {activeTab === 1 && renderBackendTestTab()}
          {activeTab === 2 && renderSettingsTab()}

          {/* API Token section */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h5">🔑 OpenShift API Token</Typography>
                    <Box display="flex" gap={1}>
                      <Button
                        variant="contained"
                        color="info"
                        onClick={getApiToken}
                        disabled={loading.getToken || !status.sshuttleRunning}
                        startIcon={loading.getToken ? <CircularProgress size={20} /> : <VpnKeyIcon />}
                        size="small"
                      >
                        {loading.getToken ? 'Getting...' : 'Get Token'}
                      </Button>
                      <Tooltip title="Refresh Status">
                        <IconButton onClick={checkAllStatus} color="primary" size="small">
                          <RefreshIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                  
                  {!apiTokenData ? (
                    <Box textAlign="center" py={3}>
                      <Typography variant="body1" color="textSecondary">
                        {!status.sshuttleRunning ? 
                          '⚠️ Please connect the sshuttle tunnel first, then click "Get Token"' : 
                          'Click the "Get Token" button to get the OpenShift API Token'}
                      </Typography>
                    </Box>
                  ) : (
                    <Box>
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                          <Paper elevation={1} sx={{ p: 2, backgroundColor: '#f5f5f5' }}>
                            <Typography variant="subtitle2" gutterBottom color="primary">
                              🔑 API Token
                            </Typography>
                            <Typography 
                              variant="body2" 
                              fontFamily="monospace" 
                              sx={{ 
                                wordBreak: 'break-all', 
                                cursor: 'pointer',
                                '&:hover': { backgroundColor: '#e0e0e0' }
                              }}
                              onClick={() => navigator.clipboard.writeText(apiTokenData.token)}
                              title="Click to copy"
                            >
                              {apiTokenData.token}
                            </Typography>
                          </Paper>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Paper elevation={1} sx={{ p: 2, backgroundColor: '#f5f5f5' }}>
                            <Typography variant="subtitle2" gutterBottom color="primary">
                              🌐 Server URL
                            </Typography>
                            <Typography 
                              variant="body2" 
                              fontFamily="monospace"
                              sx={{ 
                                wordBreak: 'break-all',
                                cursor: 'pointer',
                                '&:hover': { backgroundColor: '#e0e0e0' }
                              }}
                              onClick={() => navigator.clipboard.writeText(apiTokenData.serverUrl)}
                              title="Click to copy"
                            >
                              {apiTokenData.serverUrl}
                            </Typography>
                          </Paper>
                        </Grid>
                        <Grid item xs={12}>
                          <Paper elevation={1} sx={{ p: 2, backgroundColor: '#e8f5e8' }}>
                            <Typography variant="subtitle2" gutterBottom color="success.main">
                              📋 oc login Command (Copied to clipboard)
                            </Typography>
                            <Typography 
                              variant="body2" 
                              fontFamily="monospace"
                              sx={{ 
                                wordBreak: 'break-all',
                                cursor: 'pointer',
                                '&:hover': { backgroundColor: '#d0edce' }
                              }}
                              onClick={() => navigator.clipboard.writeText(apiTokenData.ocLoginCommand)}
                              title="Click to copy"
                            >
                              {apiTokenData.ocLoginCommand}
                            </Typography>
                          </Paper>
                        </Grid>
                        <Grid item xs={12}>
                          <Paper elevation={1} sx={{ p: 2, backgroundColor: '#fff3cd' }}>
                            <Typography variant="subtitle2" gutterBottom color="warning.main">
                              📋 curl Command
                            </Typography>
                            <Typography 
                              variant="body2" 
                              fontFamily="monospace"
                              sx={{ 
                                wordBreak: 'break-all',
                                cursor: 'pointer',
                                '&:hover': { backgroundColor: '#ffeaa7' }
                              }}
                              onClick={() => navigator.clipboard.writeText(apiTokenData.curlCommand)}
                              title="Click to copy"
                            >
                              {apiTokenData.curlCommand}
                            </Typography>
                          </Paper>
                        </Grid>
                      </Grid>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>

        {/* Log panel */}
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>📝 Operation Log</Typography>
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
                    <ListItemText primary="No logs..." sx={{ color: 'rgba(255,255,255,0.5)' }} />
                  </ListItem>
                )}
              </List>
            </Paper>
          </CardContent>
        </Card>

        {/* Custom command dialog */}
        {/* <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>Execute Custom Command</DialogTitle>
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
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={executeCustomCommand} variant="contained">Execute</Button>
          </DialogActions>
        </Dialog> */}
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default App;
