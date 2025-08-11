#!/usr/bin/env python3
"""
Fleet Buddy - Python rumps version
Lightweight menu bar app for quickly executing common OSD development commands
"""

import rumps
import subprocess
import threading
import os
from datetime import datetime

class FleetBuddyApp(rumps.App):
    def __init__(self):
        super(FleetBuddyApp, self).__init__("🚀", title="Fleet Buddy")
        self.menu = [
            "🔗 Connect to Hive",
            "🔄 Refresh OCM Token", 
            "⚙️ Configure Test Environment",
            None,  # separator
            "🌐 Open Hive Console",
            "🔑 Get Red Hat Token",
            None,
            "📊 Check Status",
            "🛠️ Custom Command",
            None,
            "📋 Show Log",
            "⚙️ Settings"
        ]
        
        # Status variables
        self.hive_connected = False
        self.ocm_logged_in = False
        self.sshuttle_running = False
        
        # Configuration
        self.kubeconfig_path = "/Users/chlu/hive01ue1"
        
        # logs
        self.logs = []
        
        # Check Status when start
        self.check_all_status()
        
        # Settings定时器，每30secondcheck一次状态   
        self.status_timer = rumps.Timer(self.check_all_status, 30)
        self.status_timer.start()

    def log(self, message, level="INFO"):
        """Add day log"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {level}: {message}"
        self.logs.append(log_entry)
        # 只保留最近50条day志
        if len(self.logs) > 50:
            self.logs = self.logs[-50:]
        print(log_entry)

    def execute_command(self, command, background=False):
        """executeshellcommand"""
        try:
            if background:
                # 后台execute
                subprocess.Popen(command, shell=True, 
                               stdout=subprocess.DEVNULL, 
                               stderr=subprocess.DEVNULL)
                return True, "command has been started in the background"
            else:
                result = subprocess.run(command, shell=True, 
                                      capture_output=True, text=True, 
                                      timeout=30)
                return result.returncode == 0, result.stdout or result.stderr
        except subprocess.TimeoutExpired:
            return False, "commandexecutetimeout"
        except Exception as e:
            return False, str(e)

    def check_process_running(self, process_name):
        """Check Process running"""
        success, output = self.execute_command(f"pgrep -f {process_name}")
        return success and output.strip()

    def check_all_status(self, sender=None):
        """Check all services status"""
        # checksshuttle
        self.sshuttle_running = self.check_process_running("sshuttle")
        
        # checkOCM登录
        success, _ = self.execute_command("ocm whoami")
        self.ocm_logged_in = success
        
        # checkkubeconfig
        kubeconfig_exists = os.path.exists(self.kubeconfig_path)
        
        # 综合判断Hiveconnection状态
        self.hive_connected = self.sshuttle_running and self.ocm_logged_in
        
        # Updatemenu栏icon
        if self.hive_connected:
            self.title = "🟢"  # 绿色表示connection正常
        elif self.sshuttle_running or self.ocm_logged_in:
            self.title = "🟡"  # 黄色表示部分connection
        else:
            self.title = "🔴"  # 红色表示未connection

    @rumps.clicked("🔗 Connect to Hive")
    def connect_hive(self, sender):
        """Connect to Hive"""
        def connect():
            self.log("startConnect to Hive...")
            
            # Configuration路由
            success, output = self.execute_command("sudo route add -net 10.164.0.0/16 -interface en0")
            if success:
                self.log("Route ConfigurationSuccess")
            else:
                self.log(f"Route Configurationfailed: {output}", "ERROR")
                rumps.notification("Fleet Buddy", "Connection failed", "Route Configurationfailed")
                return
            
            # 启动sshuttle
            success, output = self.execute_command(
                "nohup sshuttle -r bastion.ci.int.devshift.net 10.164.0.0/16 > /dev/null 2>&1 &", 
                background=True
            )
            if success:
                self.log("Sshuttle tunnel has been started")
                rumps.notification("Fleet Buddy", "Connection successful", "Hiveconnection has been established")
            else:
                self.log(f"Sshuttle start failed: {output}", "ERROR")
                rumps.notification("Fleet Buddy", "Connection failed", "Sshuttle启动failed")
            
            # 延迟Check Status
            rumps.Timer(self.check_all_status, 3).start()
        
        # 在后台Threadexecute以避免阻塞UI
        threading.Thread(target=connect, daemon=True).start()

    @rumps.clicked("🔄 Refresh OCM Token")
    def refresh_token(self, sender):
        """Refresh OCM Token"""
        def refresh():
            self.log("Refresh OCM Token...")
            success, output = self.execute_command("ocm token")
            if success:
                self.log("OCM Token已Refresh")
                rumps.notification("Fleet Buddy", "Token已Refresh", "OCM TokenUpdateSuccess")
            else:
                self.log(f"Token refresh failed: {output}", "ERROR")
                rumps.notification("Fleet Buddy", "Refreshfailed", "OCM TokenUpdatefailed")
            
            self.check_all_status()
        
        threading.Thread(target=refresh, daemon=True).start()

    @rumps.clicked("⚙️ Configure Test Environment")
    def setup_test_env(self, sender):
        """Configure Test Environment"""
        def setup():
            self.log("Configure Test Environment...")
            
            commands = [
                'export SUPER_ADMIN_USER_TOKEN=$(ocm token)',
                f'export AWS_ACCOUNT_OPERATOR_KUBECONFIG=$(cat "{self.kubeconfig_path}")',
                'export OCM_ENV="integration"'
            ]
            
            all_success = True
            for cmd in commands:
                success, output = self.execute_command(cmd)
                if not success:
                    all_success = False
                    self.log(f"Command execution failed: {cmd} - {output}", "ERROR")
                    break
            
            if all_success:
                self.log("test environment Configurationfinish")
                rumps.notification("Fleet Buddy", "Configurationfinish", "test environment is ready")
            else:
                self.log("test environment Configuration failed", "ERROR")
                rumps.notification("Fleet Buddy", "Configurationfailed", "test environment Configuration failed")
        
        threading.Thread(target=setup, daemon=True).start()

    @rumps.clicked("🌐 Open Hive Console")
    def open_hive_console(self, sender):
        """Open Hive Console"""
        url = "https://console-openshift-console.apps.hive01ue1.f7i5.p1.openshiftapps.com/dashboards"
        self.execute_command(f"open {url}")
        self.log("Open Hive Console")

    @rumps.clicked("🔑 Get Red Hat Token")
    def open_redhat_token(self, sender):
        """openRed Hat Tokenpage"""
        url = "https://console.redhat.com/openshift/token"
        self.execute_command(f"open {url}")
        self.log("已openRed Hat Tokenpage")

    @rumps.clicked("📊 Check Status")
    def show_status(self, sender):
        """show当前状态"""
        self.check_all_status()
        
        status_text = f"""Fleet Buddy Status Report
        
🔗 Hive connection: {'✅ connected' if self.hive_connected else '❌ not connected'}
🌐 Sshuttle: {'✅ running' if self.sshuttle_running else '❌ stopped'}
🔑 OCM login: {'✅ logged in' if self.ocm_logged_in else '❌ not logged in'}
📁 Kubeconfig: {'✅ exists' if os.path.exists(self.kubeconfig_path) else '❌ not exists'}

Configurationpath: {self.kubeconfig_path}
        """
        
        rumps.alert("Fleet Buddy Status", status_text)

    @rumps.clicked("🛠️ Custom Command")
    def custom_command(self, sender):
        """executeCustom Command"""
        response = rumps.Window(
            message="input the command to execute:",
            title="Custom Command",
            default_text="ocm login --use-auth-code --url=integration",
            cancel=True
        ).run()
        
        if response.clicked and response.text.strip():
            command = response.text.strip()
            
            def execute():
                self.log(f"executeCustom Command: {command}")
                success, output = self.execute_command(command)
                if success:
                    self.log(f"commandexecuteSuccess: {output}")
                    rumps.notification("Fleet Buddy", "commandSuccess", f"execute: {command}")
                else:
                    self.log(f"Command execution failed: {output}", "ERROR")
                    rumps.notification("Fleet Buddy", "command failed", f"execute failed: {command}")
            
            threading.Thread(target=execute, daemon=True).start()

    @rumps.clicked("📋 Show Log")
    def show_logs(self, sender):
        """show recent logs"""
        recent_logs = self.logs[-10:] if self.logs else ["No logs"]
        log_text = "\n".join(recent_logs)
        rumps.alert("Fleet Buddy Logs", log_text)

    @rumps.clicked("⚙️ Settings")
    def settings(self, sender):
        """Settings"""
        response = rumps.Window(
            message="Kubeconfig File path:",
            title="Fleet Buddy Settings",
            default_text=self.kubeconfig_path,
            cancel=True
        ).run()
        
        if response.clicked and response.text.strip():
            self.kubeconfig_path = response.text.strip()
            self.log(f"Kubeconfig path has been updated: {self.kubeconfig_path}")

if __name__ == "__main__":
    app = FleetBuddyApp()
    app.run()
