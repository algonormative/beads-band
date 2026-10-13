# Records the terminal demo: vhs demo/demo.tape
# Needs a logged-in `claude` with beads-band installed and `br` on PATH.
# DEMO_DIR is a project with a beads queue (demo/setup.sh makes one);
# DEMO_SETTINGS optionally points at a settings file that turns other plugins off
# (and, if you have beads-band configured for another queue, sets beadsDir to "").
Output demo/terminal.gif
Require claude
Require br
Set Shell bash
Set FontSize 15
Set Width 1600
Set Height 900
Set Padding 24
Set Framerate 12
Set PlaybackSpeed 2
Set TypingSpeed 25ms
Set Theme "Catppuccin Mocha"

Hide
Type 'unset CLAUDE_CODE_CHILD_SESSION CLAUDECODE CLAUDE_CODE_ENTRYPOINT; export BD_ACTOR=demo; cd "$DEMO_DIR" && clear && claude ${DEMO_SETTINGS:+--settings "$DEMO_SETTINGS"} --strict-mcp-config --allowedTools "Bash(br:*)" 2>/dev/null'
Enter
Sleep 6s
# Answer the folder-trust question (its default is No) if it appears.
Down
Enter
Sleep 10s
Show

Sleep 3s
Screenshot demo/terminal-idle.png
Type "Pick the highest-priority ready beads task, claim it with br update <id> --claim, and tell me in one line what it is."
Sleep 500ms
Enter
Sleep 30s
Screenshot demo/terminal-claimed.png
Sleep 4s
Type "/exit"
Enter
Sleep 2s
