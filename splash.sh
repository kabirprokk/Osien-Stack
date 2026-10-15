#!/bin/bash
# OSIEN DOPAMINE SPLASH v2 — <30ms. Greets by time of day, shows mission + health.
SOUL="$HOME/.config/opencode/memory/OSIEN_SOUL.md"
C1='\033[38;5;178m'; C2='\033[38;5;103m'; C3='\033[38;5;223m'; G='\033[38;5;108m'; R='\033[38;5;137m'; B='\033[1m'; D='\033[0m'
H=$(date +%H)
if [ "$H" -lt 5 ]; then GR="🌙 late-night forge"; elif [ "$H" -lt 12 ]; then GR="☀️ good morning, builder"; elif [ "$H" -lt 18 ]; then GR="🔥 good afternoon, shipper"; else GR="⚡ good evening, closer"; fi
printf "${B}${C1}   ___  ___ ___ ___ _  _ ${D}\n"
printf "${B}${C2}  / _ \/ __|_ _| __| \| |${D}\n"
printf "${B}${C1} | (_) \__ \| || _|| .\` |${D}\n"
printf "${B}${C2}  \___/|___/___|___|_|\_|  ⚡${D}\n"
N=$(grep -cE "^ *- (\[|20)" "$SOUL" 2>/dev/null); N=${N:-0}
LAST=$(grep "^ *- \\[" "$SOUL" 2>/dev/null | tail -n 1 | cut -c1-110)
FREE=$(df -h / 2>/dev/null | awk 'NR==2{print $4}')
QUOTES=("Ship it. ⚡" "One task. Full focus. 🔥" "Fast is a feature. 🚀" "Done > perfect. ✅" "You build worlds. 🌍" "Small step. Big streak. 💪")
R=${QUOTES[$RANDOM % ${#QUOTES[@]}]}
printf "  ${C3}$GR${D} — ${B}$R${D}\n"
printf "  ${G}🔥 streak $N ${D}· 💾 free $FREE · ${C2}oo = go · /soul = memory · /forge = build${D}\n"
[ -n "$LAST" ] && printf "  ${D}↳ $LAST${D}\n"
PROJ=$(head -n 1 "$HOME/.config/opencode/memory/.last-project" 2>/dev/null)
[ -n "$PROJ" ] && printf "  \033[38;5;137m▓▓\033[38;5;178m▓▓\033[38;5;223m▓▓\033[38;5;103m▓▓\033[0m  \033[1m📁 $PROJ\033[0m\n"
printf "\n"
