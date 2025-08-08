#!/usr/bin/env python3
"""
Fleet Buddy - Python rumps版本
轻量级菜单栏应用，用于快速执行OSD开发常用命令
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
            "🔗 连接到Hive",
            "🔄 刷新OCM Token", 
            "⚙️ 配置测试环境",
            None,  # 分隔符
            "🌐 打开Hive控制台",
            "🔑 获取Red Hat Token",
            None,
            "📊 检查状态",
            "🛠️ 自定义命令",
            None,
            "📋 显示日志",
            "⚙️ 设置"
        ]
        
        # 状态变量
        self.hive_connected = False
        self.ocm_logged_in = False
        self.sshuttle_running = False
        
        # 配置
        self.kubeconfig_path = "/Users/chlu/hive01ue1"
        
        # 日志
        self.logs = []
        
        # 启动时检查状态
        self.check_all_status()
        
        # 设置定时器，每30秒检查一次状态
        self.status_timer = rumps.Timer(self.check_all_status, 30)
        self.status_timer.start()

    def log(self, message, level="INFO"):
        """添加日志"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {level}: {message}"
        self.logs.append(log_entry)
        # 只保留最近50条日志
        if len(self.logs) > 50:
            self.logs = self.logs[-50:]
        print(log_entry)

    def execute_command(self, command, background=False):
        """执行shell命令"""
        try:
            if background:
                # 后台执行
                subprocess.Popen(command, shell=True, 
                               stdout=subprocess.DEVNULL, 
                               stderr=subprocess.DEVNULL)
                return True, "命令已在后台启动"
            else:
                result = subprocess.run(command, shell=True, 
                                      capture_output=True, text=True, 
                                      timeout=30)
                return result.returncode == 0, result.stdout or result.stderr
        except subprocess.TimeoutExpired:
            return False, "命令执行超时"
        except Exception as e:
            return False, str(e)

    def check_process_running(self, process_name):
        """检查进程是否运行"""
        success, output = self.execute_command(f"pgrep -f {process_name}")
        return success and output.strip()

    def check_all_status(self, sender=None):
        """检查所有服务状态"""
        # 检查sshuttle
        self.sshuttle_running = self.check_process_running("sshuttle")
        
        # 检查OCM登录
        success, _ = self.execute_command("ocm whoami")
        self.ocm_logged_in = success
        
        # 检查kubeconfig
        kubeconfig_exists = os.path.exists(self.kubeconfig_path)
        
        # 综合判断Hive连接状态
        self.hive_connected = self.sshuttle_running and self.ocm_logged_in
        
        # 更新菜单栏图标
        if self.hive_connected:
            self.title = "🟢"  # 绿色表示连接正常
        elif self.sshuttle_running or self.ocm_logged_in:
            self.title = "🟡"  # 黄色表示部分连接
        else:
            self.title = "🔴"  # 红色表示未连接

    @rumps.clicked("🔗 连接到Hive")
    def connect_hive(self, sender):
        """连接到Hive"""
        def connect():
            self.log("开始连接到Hive...")
            
            # 配置路由
            success, output = self.execute_command("sudo route add -net 10.164.0.0/16 -interface en0")
            if success:
                self.log("路由配置成功")
            else:
                self.log(f"路由配置失败: {output}", "ERROR")
                rumps.notification("Fleet Buddy", "连接失败", "路由配置失败")
                return
            
            # 启动sshuttle
            success, output = self.execute_command(
                "nohup sshuttle -r bastion.ci.int.devshift.net 10.164.0.0/16 > /dev/null 2>&1 &", 
                background=True
            )
            if success:
                self.log("Sshuttle隧道已启动")
                rumps.notification("Fleet Buddy", "连接成功", "Hive连接已建立")
            else:
                self.log(f"Sshuttle启动失败: {output}", "ERROR")
                rumps.notification("Fleet Buddy", "连接失败", "Sshuttle启动失败")
            
            # 延迟检查状态
            rumps.Timer(self.check_all_status, 3).start()
        
        # 在后台线程执行以避免阻塞UI
        threading.Thread(target=connect, daemon=True).start()

    @rumps.clicked("🔄 刷新OCM Token")
    def refresh_token(self, sender):
        """刷新OCM Token"""
        def refresh():
            self.log("刷新OCM Token...")
            success, output = self.execute_command("ocm token")
            if success:
                self.log("OCM Token已刷新")
                rumps.notification("Fleet Buddy", "Token已刷新", "OCM Token更新成功")
            else:
                self.log(f"Token刷新失败: {output}", "ERROR")
                rumps.notification("Fleet Buddy", "刷新失败", "OCM Token更新失败")
            
            self.check_all_status()
        
        threading.Thread(target=refresh, daemon=True).start()

    @rumps.clicked("⚙️ 配置测试环境")
    def setup_test_env(self, sender):
        """配置测试环境"""
        def setup():
            self.log("配置测试环境...")
            
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
                    self.log(f"命令执行失败: {cmd} - {output}", "ERROR")
                    break
            
            if all_success:
                self.log("测试环境配置完成")
                rumps.notification("Fleet Buddy", "配置完成", "测试环境已就绪")
            else:
                self.log("测试环境配置失败", "ERROR")
                rumps.notification("Fleet Buddy", "配置失败", "测试环境配置出错")
        
        threading.Thread(target=setup, daemon=True).start()

    @rumps.clicked("🌐 打开Hive控制台")
    def open_hive_console(self, sender):
        """打开Hive控制台"""
        url = "https://console-openshift-console.apps.hive01ue1.f7i5.p1.openshiftapps.com/dashboards"
        self.execute_command(f"open {url}")
        self.log("已打开Hive控制台")

    @rumps.clicked("🔑 获取Red Hat Token")
    def open_redhat_token(self, sender):
        """打开Red Hat Token页面"""
        url = "https://console.redhat.com/openshift/token"
        self.execute_command(f"open {url}")
        self.log("已打开Red Hat Token页面")

    @rumps.clicked("📊 检查状态")
    def show_status(self, sender):
        """显示当前状态"""
        self.check_all_status()
        
        status_text = f"""Fleet Buddy 状态报告
        
🔗 Hive连接: {'✅ 已连接' if self.hive_connected else '❌ 未连接'}
🌐 Sshuttle: {'✅ 运行中' if self.sshuttle_running else '❌ 已停止'}
🔑 OCM登录: {'✅ 已登录' if self.ocm_logged_in else '❌ 未登录'}
📁 Kubeconfig: {'✅ 存在' if os.path.exists(self.kubeconfig_path) else '❌ 不存在'}

配置路径: {self.kubeconfig_path}
        """
        
        rumps.alert("Fleet Buddy 状态", status_text)

    @rumps.clicked("🛠️ 自定义命令")
    def custom_command(self, sender):
        """执行自定义命令"""
        response = rumps.Window(
            message="输入要执行的命令:",
            title="自定义命令",
            default_text="ocm login --use-auth-code --url=integration",
            cancel=True
        ).run()
        
        if response.clicked and response.text.strip():
            command = response.text.strip()
            
            def execute():
                self.log(f"执行自定义命令: {command}")
                success, output = self.execute_command(command)
                if success:
                    self.log(f"命令执行成功: {output}")
                    rumps.notification("Fleet Buddy", "命令成功", f"已执行: {command}")
                else:
                    self.log(f"命令执行失败: {output}", "ERROR")
                    rumps.notification("Fleet Buddy", "命令失败", f"执行失败: {command}")
            
            threading.Thread(target=execute, daemon=True).start()

    @rumps.clicked("📋 显示日志")
    def show_logs(self, sender):
        """显示最近的日志"""
        recent_logs = self.logs[-10:] if self.logs else ["暂无日志"]
        log_text = "\n".join(recent_logs)
        rumps.alert("Fleet Buddy 日志", log_text)

    @rumps.clicked("⚙️ 设置")
    def settings(self, sender):
        """设置"""
        response = rumps.Window(
            message="Kubeconfig文件路径:",
            title="Fleet Buddy 设置",
            default_text=self.kubeconfig_path,
            cancel=True
        ).run()
        
        if response.clicked and response.text.strip():
            self.kubeconfig_path = response.text.strip()
            self.log(f"Kubeconfig路径已更新: {self.kubeconfig_path}")

if __name__ == "__main__":
    app = FleetBuddyApp()
    app.run()
