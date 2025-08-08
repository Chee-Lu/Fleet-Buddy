#!/bin/bash

echo "🚀 Fleet Buddy - 设置Python rumps环境"
echo "======================================"

# 检查Python版本
echo "检查Python版本..."
python3 --version

# 安装rumps
echo "安装rumps库..."
pip3 install rumps

# 检查安装
echo "验证安装..."
python3 -c "import rumps; print('✅ rumps安装成功!')"

echo "======================================"
echo "🎉 安装完成！"
echo ""
echo "运行方式："
echo "  python3 fleet_buddy_rumps.py"
echo ""
echo "注意："
echo "  1. 首次运行可能需要授权访问权限"
echo "  2. 某些命令需要sudo权限"
echo "  3. 确保已安装ocm和sshuttle工具"

