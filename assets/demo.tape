# Plan-Build-Run Demo GIF - VHS Tape File
# Install VHS: go install github.com/charmbracelet/vhs@latest
# Run: vhs assets/demo.tape
#
# This wraps demo-script.sh for VHS recording.
# For manual recording, just run: bash assets/demo-script.sh

Output assets/pbr-demo.gif

Set Theme "Catppuccin Mocha"
Set FontFamily "JetBrains Mono"
Set FontSize 15
Set Width 880
Set Height 540
Set Padding 16

Type "bash assets/demo-script.sh"
Enter
Sleep 45s
