import os
import sys
import subprocess

def show_toast(title, message):
    # Escape single quotes for PowerShell
    title_escaped = title.replace("'", "''")
    message_escaped = message.replace("'", "''")
    
    ps_command = f"""
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    $Template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $RawXml = [xml]$Template.GetXml()
    $RawXml.GetElementsByTagName('text')[0].AppendChild($RawXml.CreateTextNode('{title_escaped}')) | Out-Null
    $RawXml.GetElementsByTagName('text')[1].AppendChild($RawXml.CreateTextNode('{message_escaped}')) | Out-Null
    $Xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $Xml.LoadXml($RawXml.OuterXml)
    $Toast = [Windows.UI.Notifications.ToastNotification]::new($Xml)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Windows PowerShell').Show($Toast)
    """
    try:
        # Run PowerShell command
        subprocess.run(["powershell", "-Command", ps_command], capture_output=True, text=True, check=True)
    except Exception as e:
        # Fallback to popup
        show_popup(title, message)

def show_popup(title, message):
    title_escaped = title.replace("'", "''")
    message_escaped = message.replace("'", "''")
    ps_command = f"""
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('{message_escaped}', '{title_escaped}', 'OK', 'Information')
    """
    try:
        subprocess.Popen(["powershell", "-Command", ps_command], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        print(f"Failed to show popup: {e}")

if __name__ == "__main__":
    if len(sys.argv) >= 3:
        show_toast(sys.argv[1], sys.argv[2])
    elif len(sys.argv) == 2:
        show_toast("AXIOS CLI", sys.argv[1])
    else:
        show_toast("AXIOS CLI", "AXIOS CLI 알림 시스템이 시작되었습니다.")
